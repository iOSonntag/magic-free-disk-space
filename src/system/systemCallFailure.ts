/**
 * A call of the operating system that failed, by its name, with the code it failed with: an error
 * code, such as Windows' `GetLastError`, or an HRESULT.
 */
export type SystemCallFailure = { call: string; code: number };

/**
 * The code as `0x` and eight upper-case hex digits, as Windows writes both an HRESULT and an error
 * code: `0x80070005`, `0x00000005`. A negative code reads as its 32 bits.
 */
export function formatSystemCallCode(params: { code: number }): string {
  return `0x${(params.code >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

/** The failure as one line, such as `SHEmptyRecycleBinW failed with 0x80070005`. */
export function formatSystemCallFailure(params: { failure: SystemCallFailure }): string {
  return `${params.failure.call} failed with ${formatSystemCallCode({ code: params.failure.code })}`;
}
