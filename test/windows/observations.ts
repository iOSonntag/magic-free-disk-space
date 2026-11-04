import { lstat } from 'node:fs/promises';
import { parseAbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { WIN32_PATH_RULES } from '../../src/platform/win32/loadEnvironment.js';
import { loadFileAttributes } from '../../src/platform/win32/win32Api.js';

/** A thrown error as its raw fields, such as `code=EPERM errno=-4048 syscall=rm`. */
export const describeThrownError = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return `threw ${String(error)}`;
  }

  const fields = ['code', 'errno', 'syscall']
    .filter((field) => field in error)
    .map((field) => `${field}=${String(Reflect.get(error, field))}`);

  if (fields.length === 0) {
    return `threw ${error.name}: ${error.message}`;
  }

  return `failed ${fields.join(' ')}`;
};

/** The observation the call returns, or the error it threw described as one; never throws. */
export const observeSafely = async (observe: () => Promise<string> | string): Promise<string> => {
  try {
    return await observe();
  } catch (error) {
    return describeThrownError(error);
  }
};

/** What `lstat` reports of the path's kind, such as `isSymbolicLink=false isDirectory=true isFile=false`. */
export const loadLstatText = async (path: string): Promise<string> => {
  const stats = await lstat(path);

  return `isSymbolicLink=${stats.isSymbolicLink()} isDirectory=${stats.isDirectory()} isFile=${stats.isFile()}`;
};

/** An HRESULT or a set of attribute bits as unsigned hex of 8 digits. */
export function formatHex(value: number): string {
  return `0x${(value >>> 0).toString(16).padStart(8, '0')}`;
}

/** The attributes win32Api.ts reads for the path, in hex, or the call and the code it failed with. */
export function loadAttributesText(path: string): string {
  const absolutePath = parseAbsolutePath({ rules: WIN32_PATH_RULES, text: path });

  if (absolutePath.kind === 'failed') {
    return `no drive path: ${absolutePath.failure}`;
  }

  const attributes = loadFileAttributes({ path: absolutePath.value });

  if (attributes.kind === 'failed') {
    return `${attributes.failure.call} failed with ${attributes.failure.code}`;
  }

  return formatHex(attributes.value);
}

/** Each nonblank line of a probe's stdout, parsed as JSON, or as it came when it is no JSON. */
export function parseProbeLines(stdout: string): unknown[] {
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      try {
        const parsed: unknown = JSON.parse(line);

        return parsed;
      } catch {
        return line;
      }
    });
}
