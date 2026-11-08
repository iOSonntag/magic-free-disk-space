import { lstat, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildLongPathSegments } from '../longPath.js';
import { loadAttributesText, observeSafely } from '../observations.js';

// Compiled by bunWindowsFacts.test.ts the way the bridge is. Echoes every stdin line to stdout as
// it came, then, once stdin ends, writes one JSON line per finding, so a crash in a later finding
// leaves the earlier ones on stdout.
//   compiledProbe.exe <folder for the long path>

function writeFinding(finding: string, observations: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ finding: finding, ...observations })}\n`);
}

async function echoStdinLines(): Promise<number> {
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
}

async function observeLongPathInsideProbe(folder: string): Promise<void> {
  const longFolder = join(folder, ...buildLongPathSegments());
  const longFile = join(longFolder, 'file.txt');

  writeFinding('long path in the compiled probe', {
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
    // bun:ffi in a compiled executable, through the bindings the bridge uses.
    attributes: await observeSafely(() => loadAttributesText(longFile)),
    rm: await observeSafely(async () => {
      await rm(longFolder, { recursive: true });

      return 'ok';
    }),
  });
}

const longPathFolder = process.argv[2];

const echoedLineCount = await echoStdinLines();

writeFinding('stdin', { echoedLineCount: echoedLineCount });

if (longPathFolder === undefined) {
  writeFinding('long path in the compiled probe', { error: 'no folder argument' });
} else {
  await observeLongPathInsideProbe(longPathFolder);
}
