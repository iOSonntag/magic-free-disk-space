import { release } from 'node:os';

/** The version of Windows, such as `10.0.26100`; `null` when it cannot be read. Never throws. */
export async function loadSystemVersion(): Promise<string | null> {
  try {
    const version = release();

    return version === '' ? null : version;
  } catch {
    return null;
  }
}
