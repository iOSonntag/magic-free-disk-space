import { describe, expect, test } from 'bun:test';
import {
  createProcessEntryBuffer,
  PROCESS_ENTRY_BYTES,
  parseProcessEntry,
} from '../../../src/platform/win32/processEntry.js';

/** A filled `PROCESSENTRY32W` with `processId` at 8 and `exeFileName` at 44, as Toolhelp writes it. */
function buildFilledEntry(params: { processId: number; exeFileName: string }): Uint8Array {
  const bytes = createProcessEntryBuffer();

  new DataView(bytes.buffer).setUint32(8, params.processId, true);
  bytes.set(Buffer.from(`${params.exeFileName}\0`, 'utf16le'), 44);

  return bytes;
}

describe('createProcessEntryBuffer', () => {
  test('sets dwSize to the size of the whole entry, and nothing else', () => {
    const bytes = createProcessEntryBuffer();

    expect(bytes.byteLength).toBe(PROCESS_ENTRY_BYTES);
    expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(PROCESS_ENTRY_BYTES);
    expect(bytes.subarray(4).every((byte) => byte === 0)).toBe(true);
  });
});

describe('parseProcessEntry', () => {
  test('reads the process id and the image file name up to its NUL', () => {
    expect(
      parseProcessEntry({ bytes: buildFilledEntry({ processId: 4242, exeFileName: 'Code.exe' }) }),
    ).toEqual({ processId: 4242, exeFileName: 'Code.exe' });
  });

  test('reads a name outside ASCII, and a process id above 2^31', () => {
    expect(
      parseProcessEntry({
        bytes: buildFilledEntry({ processId: 0x8000_0001, exeFileName: 'Größe.exe' }),
      }),
    ).toEqual({ processId: 0x8000_0001, exeFileName: 'Größe.exe' });
  });

  test('reads the empty name of an entry with no image name', () => {
    expect(
      parseProcessEntry({ bytes: buildFilledEntry({ processId: 0, exeFileName: '' }) }),
    ).toEqual({ processId: 0, exeFileName: '' });
  });

  test('reads all 260 units of a name that fills the field without a NUL', () => {
    const bytes = createProcessEntryBuffer();
    const exeFileName = 'a'.repeat(260);
    bytes.set(Buffer.from(exeFileName, 'utf16le'), 44);

    expect(parseProcessEntry({ bytes: bytes }).exeFileName).toBe(exeFileName);
  });

  test('reads an entry that starts inside a larger buffer', () => {
    const entry = buildFilledEntry({ processId: 7, exeFileName: 'node.exe' });
    const larger = new Uint8Array(16 + PROCESS_ENTRY_BYTES);
    larger.set(entry, 16);

    expect(parseProcessEntry({ bytes: larger.subarray(16) })).toEqual({
      processId: 7,
      exeFileName: 'node.exe',
    });
  });
});
