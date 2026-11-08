import { formatSystemCallFailure } from '../../system/systemCallFailure.js';
import type { Win32CallFailure } from './win32Api.js';

/**
 * The `GetLastError` codes that Bun's file calls report by a POSIX name, so the deletion reads a
 * failed attribute call as it reads a failed removal: not found, access denied, a sharing
 * violation, and a lock violation.
 */
const ERROR_CODE_NAMES = new Map<number, string>([
  [2, 'ENOENT'],
  [3, 'ENOENT'],
  [5, 'EPERM'],
  [32, 'EBUSY'],
  [33, 'EBUSY'],
]);

/**
 * The failed call of an entry as the code the deletion reads: a POSIX name where Bun has one,
 * else the call with its code, as every failed call of the system reads.
 */
export function formatEntryCallFailure(params: { failure: Win32CallFailure }): string {
  return (
    ERROR_CODE_NAMES.get(params.failure.code) ??
    formatSystemCallFailure({ failure: params.failure })
  );
}
