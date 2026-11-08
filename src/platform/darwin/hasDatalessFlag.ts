import { dlopen, FFIType, ptr, read } from 'bun:ffi';
import { getSystemErrorName } from 'node:util';
import type { Result } from '../../result.js';
import type { EntryPlacement, EntryRef } from '../../system/entryReads.js';

// macOS `struct stat` with 64-bit inodes: 144 bytes, `st_flags` at byte 116. Checked against
// `ls -lO` on Apple silicon. Intel Macs name this variant `lstat$INODE64`.
const STAT_BUFFER_BYTES = 144;
const STAT_FLAGS_OFFSET = 116;
const LSTAT_SYMBOL_NAME = process.arch === 'x64' ? 'lstat$INODE64' : 'lstat';

// The file's content lives only in iCloud; reading a folder like this downloads it and blocks.
const SF_DATALESS = 0x40000000;

type LibSystem = ReturnType<typeof openLibSystem>;

// Opened on the first call, so the module also loads where libSystem does not exist.
let libSystem: LibSystem | null = null;

function openLibSystem() {
  return dlopen('/usr/lib/libSystem.B.dylib', {
    [LSTAT_SYMBOL_NAME]: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
    // The address of the calling thread's `errno`.
    __error: { args: [], returns: FFIType.ptr },
  });
}

/**
 * `cloudOnly` for a folder whose content iCloud evicted from this Mac, by its dataless flag, and
 * `unread` with the code of lstat for one whose flags cannot be read; a link is the link lstat
 * names, and any other entry is `onDisk`, so a walk visits every file and other entry it meets.
 */
export function loadEntryPlacement(params: EntryRef): EntryPlacement {
  switch (params.kind) {
    case 'directory': {
      const flags = loadEntryFlags({ path: params.path });

      if (flags.kind === 'failed') {
        return { kind: 'unread', code: flags.failure };
      }

      return (flags.value & SF_DATALESS) !== 0 ? { kind: 'cloudOnly' } : { kind: 'onDisk' };
    }
    case 'symbolicLink':
      return { kind: 'link' };
    case 'file':
    case 'other':
      return { kind: 'onDisk' };
  }
}

/**
 * The `st_flags` of the entry itself, read without following a link and without downloading; on
 * failure the POSIX name of lstat's `errno`, such as `ENOENT`. `node:fs` hides `st_flags`, hence
 * the direct call.
 */
function loadEntryFlags(params: { path: string }): Result<number, string> {
  libSystem ??= openLibSystem();

  const statBuffer = new Uint8Array(STAT_BUFFER_BYTES);
  const pathBytes = Buffer.from(`${params.path}\0`, 'utf8');
  const lstatResult = libSystem.symbols[LSTAT_SYMBOL_NAME]?.(ptr(pathBytes), ptr(statBuffer));

  if (lstatResult !== 0) {
    // Read before any other call of the system can set `errno` again.
    const errorNumberPointer = libSystem.symbols.__error();

    if (errorNumberPointer === null) {
      throw new Error('libSystem gave no address of errno.');
    }

    return {
      kind: 'failed',
      failure: getSystemErrorName(-read.i32(errorNumberPointer, 0)),
    };
  }

  return {
    kind: 'succeeded',
    value: new DataView(statBuffer.buffer).getUint32(STAT_FLAGS_OFFSET, true),
  };
}
