import { dlopen, FFIType, ptr } from 'bun:ffi';

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
 * True when the entry is an iCloud placeholder whose content was evicted from this Mac.
 * Reads the entry itself without following a link and without downloading; `false` when it
 * cannot be read, and on any system but macOS, which has no such placeholders. `node:fs` hides
 * `st_flags`, hence the direct call.
 */
export function hasDatalessFlag(params: { path: string }): boolean {
  if (process.platform !== 'darwin') {
    return false;
  }

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
