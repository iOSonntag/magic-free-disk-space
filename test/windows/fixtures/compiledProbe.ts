import { dlopen, FFIType, toArrayBuffer } from 'bun:ffi';
import { lstat, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildLongPathSegments } from '../longPath.js';
import { describeThrownError, observeSafely } from '../observations.js';
import { loadFileAttributes, loadRtlAreLongPathsEnabled } from '../win32Bindings.js';

// Compiled by bunWindowsFacts.test.ts the way the bridge is. Echoes every stdin line to stdout as
// it came, then, once stdin ends, writes one JSON line per finding, so a crash in a later finding
// leaves the earlier ones on stdout.
//   compiledProbe.exe <folder for the long path>

const RT_MANIFEST = 24;
const MANIFEST_RESOURCE_ID = 1;
const MANIFEST_RELEVANT_LINE =
  /longPathAware|activeCodePage|requestedExecutionLevel|supportedOS|dpiAware|assemblyIdentity/i;
const MANIFEST_RELEVANT_TEXT_MAX_LENGTH = 1500;

const writeFinding = (finding: string, observations: Record<string, unknown>): void => {
  process.stdout.write(`${JSON.stringify({ finding: finding, ...observations })}\n`);
};

const echoStdinLines = async (): Promise<number> => {
  let echoedLineCount = 0;

  // A blank line is no input line; Bun's stdin reader also yields one when the input ends.
  for await (const line of console) {
    if (line === '') {
      continue;
    }

    process.stdout.write(`${line}\n`);
    echoedLineCount += 1;
  }

  return echoedLineCount;
};

const observeLongPathInsideProbe = async (folder: string): Promise<void> => {
  const longFolder = join(folder, ...buildLongPathSegments());
  const longFile = join(longFolder, 'file.txt');

  writeFinding('long path in the compiled probe', {
    rtlAreLongPathsEnabled: await observeSafely(() => String(loadRtlAreLongPathsEnabled())),
    pathLength: longFile.length,
    mkdir: await observeSafely(async () => {
      await mkdir(longFolder, { recursive: true });

      return 'ok';
    }),
    writeFile: await observeSafely(async () => {
      await writeFile(longFile, 'long path');

      return 'ok';
    }),
    lstat: await observeSafely(async () => {
      const stats = await lstat(longFile);

      return `ok isFile=${stats.isFile()}`;
    }),
    getFileAttributesUnprefixed: await observeSafely(() => {
      const reading = loadFileAttributes(longFile);

      return `${reading.attributesHex} lastError=${reading.lastError}`;
    }),
    rm: await observeSafely(async () => {
      await rm(longFolder, { recursive: true });

      return 'ok';
    }),
  });
};

const loadOwnManifestText = (): string => {
  const kernel32 = dlopen('kernel32.dll', {
    FindResourceW: { args: [FFIType.ptr, FFIType.u64, FFIType.u64], returns: FFIType.ptr },
    LoadResource: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.ptr },
    LockResource: { args: [FFIType.ptr], returns: FFIType.ptr },
    SizeofResource: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.u32 },
    GetLastError: { args: [], returns: FFIType.u32 },
  });
  const resource = kernel32.symbols.FindResourceW(null, MANIFEST_RESOURCE_ID, RT_MANIFEST);

  if (resource === null || resource === 0n) {
    throw new Error(
      `FindResourceW found no manifest, lastError=${kernel32.symbols.GetLastError()}`,
    );
  }

  const sizeBytes = kernel32.symbols.SizeofResource(null, resource);
  const loaded = kernel32.symbols.LoadResource(null, resource);
  const locked = loaded === null ? null : kernel32.symbols.LockResource(loaded);

  if (locked === null || locked === 0n) {
    throw new Error(`LoadResource or LockResource failed, sizeBytes=${sizeBytes}`);
  }

  return new TextDecoder().decode(toArrayBuffer(locked, 0, sizeBytes));
};

const observeOwnManifest = (): void => {
  try {
    const manifest = loadOwnManifestText();
    const longPathAware = /<(?:\w+:)?longPathAware[^>]*>([^<]*)</i.exec(manifest);
    const relevantLines = manifest
      .split(/\r?\n|(?=<)/)
      .map((line) => line.trim())
      .filter((line) => MANIFEST_RELEVANT_LINE.test(line))
      .join('\n')
      .slice(0, MANIFEST_RELEVANT_TEXT_MAX_LENGTH);

    writeFinding('manifest', {
      textLength: manifest.length,
      longPathAware: longPathAware?.[1] ?? 'absent',
      relevantLines: relevantLines,
    });
  } catch (error) {
    writeFinding('manifest', { error: describeThrownError(error) });
  }
};

const longPathFolder = process.argv[2];

const echoedLineCount = await echoStdinLines();

writeFinding('stdin', { echoedLineCount: echoedLineCount });

if (longPathFolder === undefined) {
  writeFinding('long path in the compiled probe', { error: 'no folder argument' });
} else {
  await observeLongPathInsideProbe(longPathFolder);
}

observeOwnManifest();
