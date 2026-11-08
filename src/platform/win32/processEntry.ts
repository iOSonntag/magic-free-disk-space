/**
 * One process of a Toolhelp snapshot: its id, and the file name of its image, such as `Code.exe`.
 */
export type ProcessEntry = { processId: number; exeFileName: string };

/**
 * `PROCESSENTRY32W` on x64 and arm64: `dwSize`, `cntUsage` and `th32ProcessID` at 0, 4 and 8, the
 * pointer-sized heap id at 16, four more 32-bit fields, then `szExeFile`, 260 UTF-16 code units at
 * 44; 564 bytes, padded to the pointer's 8.
 */
export const PROCESS_ENTRY_BYTES = 568;

const PROCESS_ID_OFFSET = 8;

const EXE_FILE_OFFSET = 44;

const EXE_FILE_UNITS = 260;

/** A buffer for `Process32FirstW` and `Process32NextW`, its `dwSize` set as they demand. */
export function createProcessEntryBuffer(): Uint8Array {
  const bytes = new Uint8Array(PROCESS_ENTRY_BYTES);

  new DataView(bytes.buffer).setUint32(0, PROCESS_ENTRY_BYTES, true);

  return bytes;
}

/** The id and the image file name of the process a filled `PROCESSENTRY32W` describes. */
export function parseProcessEntry(params: { bytes: Uint8Array }): ProcessEntry {
  const view = new DataView(params.bytes.buffer, params.bytes.byteOffset, params.bytes.byteLength);
  const exeFile = Buffer.from(
    params.bytes.buffer,
    params.bytes.byteOffset + EXE_FILE_OFFSET,
    EXE_FILE_UNITS * 2,
  ).toString('utf16le');
  const nulIndex = exeFile.indexOf('\0');

  return {
    processId: view.getUint32(PROCESS_ID_OFFSET, true),
    exeFileName: nulIndex === -1 ? exeFile : exeFile.slice(0, nulIndex),
  };
}
