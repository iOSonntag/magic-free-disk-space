import { dlopen, FFIType } from 'bun:ffi';

/** What `GetFileAttributesW` returns when it fails. */
export const INVALID_FILE_ATTRIBUTES = 0xffffffff;

/** The `FILE_ATTRIBUTE_*` bits the facts report, by their Win32 names. */
export const FILE_ATTRIBUTE_BITS = {
  READONLY: 0x1,
  DIRECTORY: 0x10,
  REPARSE_POINT: 0x400,
  OFFLINE: 0x1000,
  RECALL_ON_OPEN: 0x40000,
  PINNED: 0x80000,
  UNPINNED: 0x100000,
  RECALL_ON_DATA_ACCESS: 0x400000,
} as const;

// WIN32_FIND_DATAW: dwFileAttributes at 0, three FILETIME, two size DWORDs, dwReserved0 at 36,
// dwReserved1 at 40, cFileName[260] and cAlternateFileName[14] as WCHAR: 592 bytes.
const FIND_DATA_BYTES = 592;
const FIND_DATA_RESERVED0_OFFSET = 36;

// HKEY_LOCAL_MACHINE is (HKEY)(ULONG_PTR)(LONG)0x80000002, sign-extended to 64 bits.
const HKEY_LOCAL_MACHINE = -2147483646n;
const RRF_RT_REG_DWORD = 0x10;

type Kernel32 = ReturnType<typeof openKernel32>;
type Advapi32 = ReturnType<typeof openAdvapi32>;
type Ntdll = ReturnType<typeof openNtdll>;

// Opened on the first call, so the module also loads where these libraries do not exist.
let kernel32: Kernel32 | null = null;
let advapi32: Advapi32 | null = null;
let ntdll: Ntdll | null = null;

const openKernel32 = () => {
  return dlopen('kernel32.dll', {
    GetFileAttributesW: { args: [FFIType.ptr], returns: FFIType.u32 },
    GetLastError: { args: [], returns: FFIType.u32 },
    FindFirstFileW: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i64 },
    FindClose: { args: [FFIType.i64], returns: FFIType.i32 },
  });
};

const openAdvapi32 = () => {
  return dlopen('advapi32.dll', {
    RegGetValueW: {
      args: [
        FFIType.i64,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.u32,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
      ],
      returns: FFIType.i32,
    },
  });
};

const openNtdll = () => {
  return dlopen('ntdll.dll', {
    RtlAreLongPathsEnabled: { args: [], returns: FFIType.u8 },
  });
};

/** The text as a NUL-terminated UTF-16LE buffer, the form of an `LPCWSTR`. */
export const toWideString = (text: string): Buffer => {
  return Buffer.from(`${text}\0`, 'utf16le');
};

/** The value as unsigned hex of at least 8 digits, a negative `number` as its 32-bit form. */
export const formatHex = (value: number | bigint): string => {
  const unsigned = typeof value === 'bigint' ? BigInt.asUintN(64, value) : value >>> 0;

  return `0x${unsigned.toString(16).padStart(8, '0')}`;
};

/** The attribute bits of the set flags, by name, such as `REPARSE_POINT|OFFLINE`. */
export const formatAttributeNames = (attributes: number): string => {
  if (attributes === INVALID_FILE_ATTRIBUTES) {
    return 'INVALID_FILE_ATTRIBUTES';
  }

  const names = Object.entries(FILE_ATTRIBUTE_BITS)
    .filter(([, bit]) => (attributes & bit) !== 0)
    .map(([name]) => name);

  return names.length === 0 ? 'none' : names.join('|');
};

/** What `GetFileAttributesW` returned for a path, raw, in hex and by name. */
export type FileAttributesReading = {
  attributes: number;
  attributesHex: string;
  attributeNames: string;
  /** `GetLastError` right after the call; Bun's runtime may have overwritten it. */
  lastError: number;
};

/** The `GetFileAttributesW` reading of the path; a failed call reads `INVALID_FILE_ATTRIBUTES`. */
export const loadFileAttributes = (path: string): FileAttributesReading => {
  kernel32 ??= openKernel32();

  const attributes = kernel32.symbols.GetFileAttributesW(toWideString(path));
  const lastError = kernel32.symbols.GetLastError();

  return {
    attributes: attributes,
    attributesHex: formatHex(attributes),
    attributeNames: formatAttributeNames(attributes),
    lastError: lastError,
  };
};

type FindDataReadingFound = { isFound: true; attributesHex: string; reparseTagHex: string };

type FindDataReadingMissing = { isFound: false; lastError: number };

/** What `FindFirstFileW` found for a path, or the `GetLastError` of its failure. */
export type FindDataReading = FindDataReadingFound | FindDataReadingMissing;

/** The attributes and the `dwReserved0` reparse tag `FindFirstFileW` reports for the path. */
export const loadFindData = (path: string): FindDataReading => {
  kernel32 ??= openKernel32();

  const findData = new Uint8Array(FIND_DATA_BYTES);
  const handle = kernel32.symbols.FindFirstFileW(toWideString(path), findData);

  if (handle === -1n) {
    return { isFound: false, lastError: kernel32.symbols.GetLastError() };
  }

  kernel32.symbols.FindClose(handle);

  const view = new DataView(findData.buffer);

  return {
    isFound: true,
    attributesHex: formatHex(view.getUint32(0, true)),
    reparseTagHex: formatHex(view.getUint32(FIND_DATA_RESERVED0_OFFSET, true)),
  };
};

type RegistryDwordReadingRead = { isRead: true; value: number };

type RegistryDwordReadingFailed = { isRead: false; status: number; statusHex: string };

/** A registry DWORD as read, or the LSTATUS the read failed with. */
export type RegistryDwordReading = RegistryDwordReadingRead | RegistryDwordReadingFailed;

/** A DWORD value under HKEY_LOCAL_MACHINE through `RegGetValueW`, or the LSTATUS it failed with. */
export const loadMachineRegistryDword = (params: {
  subKey: string;
  valueName: string;
}): RegistryDwordReading => {
  advapi32 ??= openAdvapi32();

  const valueBuffer = new Uint32Array(1);
  const sizeBuffer = new Uint32Array([4]);
  const status = advapi32.symbols.RegGetValueW(
    HKEY_LOCAL_MACHINE,
    toWideString(params.subKey),
    toWideString(params.valueName),
    RRF_RT_REG_DWORD,
    null,
    valueBuffer,
    sizeBuffer,
  );

  if (status !== 0) {
    return { isRead: false, status: status, statusHex: formatHex(status) };
  }

  return { isRead: true, value: valueBuffer[0] ?? 0 };
};

/**
 * The BOOLEAN `RtlAreLongPathsEnabled` returns for this process: 1 only when the machine setting
 * is on and the manifest of the executable is longPathAware.
 */
export const loadRtlAreLongPathsEnabled = (): number => {
  ntdll ??= openNtdll();

  return ntdll.symbols.RtlAreLongPathsEnabled();
};
