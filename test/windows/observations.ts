import { lstat } from 'node:fs/promises';

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

/** A GitHub notice workflow command with the message escaped as the runner requires. */
export const formatNoticeCommand = (params: { title: string; message: string }): string => {
  const escapedMessage = params.message
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');

  return `::notice title=${params.title}::${escapedMessage}`;
};

/** Each JSON line of a probe's stdout as `key: value` lines; any other line as `stdout: …`. */
export const formatProbeOutputLines = (stdout: string): string[] => {
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim() !== '');

  return lines.flatMap((line) => {
    const parsed = parseJsonObject(line);

    if (parsed === null) {
      return [`stdout: ${line}`];
    }

    return Object.entries(parsed).map(([key, value]) => {
      return `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`;
    });
  });
};

/** The line parsed as a JSON object, or `null` when it is no JSON object. */
export const parseJsonObject = (line: string): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(line);

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    // A non-null, non-array object, which JSON.parse only yields as a plain record.
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};
