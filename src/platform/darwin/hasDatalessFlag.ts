import { dlopen, FFIType, ptr } from 'bun:ffi';
import type { EvictionCandidate } from '../../system/systemPlatform.js';

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
  });
}

/**
 * True for a folder whose content iCloud evicted from this Mac, by its dataless flag. Any other
 * entry is `false`, so a walk visits every file, link, and other entry it meets.
 */
export function isEntryEvicted(params: EvictionCandidate): boolean {
  switch (params.kind) {
    case 'directory':
      return hasDatalessFlag({ path: params.path });
    case 'file':
    case 'symbolicLink':
    case 'other':
      return false;
  }
}

/**
 * True when the entry is an iCloud placeholder whose content was evicted from this Mac.
 * Reads the entry itself without following a link and without downloading; `false` when it
 * cannot be read. `node:fs` hides `st_flags`, hence the direct call.
 */
export function hasDatalessFlag(params: { path: string }): boolean {
  libSystem ??= openLibSystem();

  const statBuffer = new Uint8Array(STAT_BUFFER_BYTES);
  const pathBytes = Buffer.from(`${params.path}\0`, 'utf8');
  const lstatResult = libSystem.symbols[LSTAT_SYMBOL_NAME]?.(ptr(pathBytes), ptr(statBuffer));

  if (lstatResult !== 0) {
    return false;
  }

  const flags = new DataView(statBuffer.buffer).getUint32(STAT_FLAGS_OFFSET, true);

  return (flags & SF_DATALESS) !== 0;
}
