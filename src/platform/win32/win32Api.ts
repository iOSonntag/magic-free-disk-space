import type { Pointer } from 'bun:ffi';
import { dlopen, FFIType, read, toArrayBuffer } from 'bun:ffi';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';

declare const windowsHandleBrand: unique symbol;

/** A HANDLE of Windows as the u64 a 64-bit process holds it in, made only by the calls below. */
export type WindowsHandle = bigint & { [windowsHandleBrand]: true };

/**
 * A call of Windows that failed, by its name, with the code it failed with: its `GetLastError`, the
 * error code it returned, or its HRESULT, as the call reports a failure.
 */
export type Win32CallFailure = { call: string; code: number };

/** What `GetFileAttributesW` returns when it fails. */
const INVALID_FILE_ATTRIBUTES = 0xffffffff;

/** The prefix with which a W function takes a drive path past 260 characters on every machine. */
const EXTENDED_LENGTH_PREFIX = '\\\\?\\';

/** `TOKEN_QUERY`, the right to read a token's information. */
const TOKEN_QUERY = 0x8;

/** The `TOKEN_INFORMATION_CLASS` values read below. */
const TOKEN_USER_CLASS = 1;
const TOKEN_ELEVATION_CLASS = 20;

/** `TOKEN_USER`: a pointer to the SID and its attributes, then the SID, at most 68 bytes. */
const TOKEN_USER_BUFFER_BYTES = 128;

/** `SE_FILE_OBJECT` and `OWNER_SECURITY_INFORMATION` of `GetNamedSecurityInfoW`. */
const SE_FILE_OBJECT = 1;
const OWNER_SECURITY_INFORMATION = 0x1;

/** `HKEY_CURRENT_USER` is `(HKEY)(ULONG_PTR)(LONG)0x80000001`, sign-extended to 64 bits. */
const HKEY_CURRENT_USER = 0xffffffff80000001n;
const KEY_READ = 0x20019;
const RRF_RT_REG_SZ = 0x2;
const ERROR_SUCCESS = 0;
const ERROR_NO_MORE_ITEMS = 259;

/** A key name has at most 255 characters, a value at most 32 767, each with its NUL. */
const REGISTRY_KEY_NAME_UNITS = 256;
const REGISTRY_VALUE_BYTES = 65_536;

/** A path of Windows has at most 32 767 UTF-16 code units. */
const MAX_WIDE_STRING_UNITS = 32_767;

type Kernel32 = ReturnType<typeof openKernel32>;
type Advapi32 = ReturnType<typeof openAdvapi32>;
type Shell32 = ReturnType<typeof openShell32>;
type Ole32 = ReturnType<typeof openOle32>;

// Each opened on its first call, so the module also loads where these libraries do not exist.
let kernel32: Kernel32 | null = null;
let advapi32: Advapi32 | null = null;
let shell32: Shell32 | null = null;
let ole32: Ole32 | null = null;

function openKernel32() {
  return dlopen('kernel32.dll', {
    GetFileAttributesW: { args: [FFIType.ptr], returns: FFIType.u32 },
    GetLogicalDrives: { args: [], returns: FFIType.u32 },
    GetDriveTypeW: { args: [FFIType.ptr], returns: FFIType.u32 },
    GetCurrentProcess: { args: [], returns: FFIType.u64 },
    CloseHandle: { args: [FFIType.u64], returns: FFIType.i32 },
    LocalFree: { args: [FFIType.u64], returns: FFIType.u64 },
    GetLastError: { args: [], returns: FFIType.u32 },
  });
}

function openAdvapi32() {
  return dlopen('advapi32.dll', {
    OpenProcessToken: { args: [FFIType.u64, FFIType.u32, FFIType.ptr], returns: FFIType.i32 },
    GetTokenInformation: {
      args: [FFIType.u64, FFIType.u32, FFIType.ptr, FFIType.u32, FFIType.ptr],
      returns: FFIType.i32,
    },
    ConvertSidToStringSidW: { args: [FFIType.u64, FFIType.ptr], returns: FFIType.i32 },
    GetNamedSecurityInfoW: {
      args: [
        FFIType.ptr,
        FFIType.u32,
        FFIType.u32,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
      ],
      returns: FFIType.u32,
    },
    RegOpenKeyExW: {
      args: [FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr],
      returns: FFIType.i32,
    },
    RegEnumKeyExW: {
      args: [
        FFIType.u64,
        FFIType.u32,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
      ],
      returns: FFIType.i32,
    },
    RegGetValueW: {
      args: [
        FFIType.u64,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.u32,
        FFIType.ptr,
        FFIType.ptr,
        FFIType.ptr,
      ],
      returns: FFIType.i32,
    },
    RegCloseKey: { args: [FFIType.u64], returns: FFIType.i32 },
  });
}

function openShell32() {
  return dlopen('shell32.dll', {
    SHGetKnownFolderPath: {
      args: [FFIType.ptr, FFIType.u32, FFIType.u64, FFIType.ptr],
      returns: FFIType.i32,
    },
  });
}

function openOle32() {
  return dlopen('ole32.dll', {
    CoTaskMemFree: { args: [FFIType.u64], returns: FFIType.void },
  });
}

/** The `FILE_ATTRIBUTE_*` bits of the entry at `path`, read without following or recalling it. */
export function loadFileAttributes(params: {
  path: AbsolutePath;
}): Result<number, Win32CallFailure> {
  kernel32 ??= openKernel32();

  const attributes = kernel32.symbols.GetFileAttributesW(
    toWideString({ text: toExtendedLengthPath({ path: params.path }) }),
  );

  if (attributes === INVALID_FILE_ATTRIBUTES) {
    return failWithLastError({ call: 'GetFileAttributesW' });
  }

  return { kind: 'succeeded', value: attributes };
}

/** The bit mask of the drive letters in use, bit 0 for `A:`. */
export function loadLogicalDrives(): Result<number, Win32CallFailure> {
  kernel32 ??= openKernel32();

  const drives = kernel32.symbols.GetLogicalDrives();

  if (drives === 0) {
    return failWithLastError({ call: 'GetLogicalDrives' });
  }

  return { kind: 'succeeded', value: drives };
}

/** The `DRIVE_*` type of the drive whose root is `rootPath`, such as `DRIVE_FIXED` 3. */
export function loadDriveType(params: { rootPath: AbsolutePath }): number {
  kernel32 ??= openKernel32();

  return kernel32.symbols.GetDriveTypeW(
    toWideString({ text: toExtendedLengthPath({ path: params.rootPath }) }),
  );
}

/**
 * The path Windows names for the known folder whose `KNOWNFOLDERID` is `folderId`, 16 bytes in the
 * layout of a GUID. Fails for a folder that does not exist.
 */
export function loadKnownFolderPath(params: {
  folderId: Uint8Array;
}): Result<string, Win32CallFailure> {
  shell32 ??= openShell32();
  ole32 ??= openOle32();

  const pathAddress = new BigUint64Array(1);
  const hresult = shell32.symbols.SHGetKnownFolderPath(params.folderId, 0, 0n, pathAddress);

  try {
    if (hresult < 0) {
      return { kind: 'failed', failure: { call: 'SHGetKnownFolderPath', code: hresult >>> 0 } };
    }

    return { kind: 'succeeded', value: readWideString({ address: readAddress(pathAddress) }) };
  } finally {
    // Freed whether the call succeeded or not, as its contract says.
    ole32.symbols.CoTaskMemFree(readAddress(pathAddress));
  }
}

/** The token of this process, opened to read; close it with `closeHandle`. */
export function openProcessToken(): Result<WindowsHandle, Win32CallFailure> {
  kernel32 ??= openKernel32();
  advapi32 ??= openAdvapi32();

  const tokenHandle = new BigUint64Array(1);
  const isOpened = advapi32.symbols.OpenProcessToken(
    kernel32.symbols.GetCurrentProcess(),
    TOKEN_QUERY,
    tokenHandle,
  );

  if (isOpened === 0) {
    return failWithLastError({ call: 'OpenProcessToken' });
  }

  // The brand records that the handle came from OpenProcessToken.
  return { kind: 'succeeded', value: readAddress(tokenHandle) as WindowsHandle };
}

export function closeHandle(params: { handle: WindowsHandle }): void {
  kernel32 ??= openKernel32();
  kernel32.symbols.CloseHandle(params.handle);
}

/** The SID of the user of the token, in its string form. */
export function loadTokenUserSid(params: {
  token: WindowsHandle;
}): Result<string, Win32CallFailure> {
  advapi32 ??= openAdvapi32();

  const tokenUser = new Uint8Array(TOKEN_USER_BUFFER_BYTES);
  const returnLength = new Uint32Array(1);
  const isRead = advapi32.symbols.GetTokenInformation(
    params.token,
    TOKEN_USER_CLASS,
    tokenUser,
    TOKEN_USER_BUFFER_BYTES,
    returnLength,
  );

  if (isRead === 0) {
    return failWithLastError({ call: 'GetTokenInformation' });
  }

  const sidAddress = new DataView(tokenUser.buffer).getBigUint64(0, true);

  return convertSidToString({ sidAddress: sidAddress });
}

/** Whether the token is elevated, as by "Run as administrator". */
export function loadTokenElevation(params: {
  token: WindowsHandle;
}): Result<boolean, Win32CallFailure> {
  advapi32 ??= openAdvapi32();

  const elevation = new Uint32Array(1);
  const returnLength = new Uint32Array(1);
  const isRead = advapi32.symbols.GetTokenInformation(
    params.token,
    TOKEN_ELEVATION_CLASS,
    elevation,
    elevation.byteLength,
    returnLength,
  );

  if (isRead === 0) {
    return failWithLastError({ call: 'GetTokenInformation' });
  }

  return { kind: 'succeeded', value: elevation[0] !== 0 };
}

/** The SID of the owner of the file or folder at `path`, in its string form. */
export function loadFileOwnerSid(params: { path: AbsolutePath }): Result<string, Win32CallFailure> {
  kernel32 ??= openKernel32();
  advapi32 ??= openAdvapi32();

  const ownerSidAddress = new BigUint64Array(1);
  const descriptorAddress = new BigUint64Array(1);
  const status = advapi32.symbols.GetNamedSecurityInfoW(
    toWideString({ text: toExtendedLengthPath({ path: params.path }) }),
    SE_FILE_OBJECT,
    OWNER_SECURITY_INFORMATION,
    ownerSidAddress,
    null,
    null,
    null,
    descriptorAddress,
  );

  if (status !== ERROR_SUCCESS) {
    return { kind: 'failed', failure: { call: 'GetNamedSecurityInfoW', code: status } };
  }

  try {
    // The owner SID lies inside the security descriptor, which is freed after its conversion.
    return convertSidToString({ sidAddress: readAddress(ownerSidAddress) });
  } finally {
    kernel32.symbols.LocalFree(readAddress(descriptorAddress));
  }
}

/**
 * The string value `valueName` of each subkey of the key `keyPath` of `HKEY_CURRENT_USER`, in the
 * order of the subkeys; a subkey without that string value is left out.
 */
export function loadCurrentUserSubkeyStrings(params: {
  keyPath: string;
  valueName: string;
}): Result<string[], Win32CallFailure> {
  advapi32 ??= openAdvapi32();

  const keyHandle = new BigUint64Array(1);
  const openStatus = advapi32.symbols.RegOpenKeyExW(
    HKEY_CURRENT_USER,
    toWideString({ text: params.keyPath }),
    0,
    KEY_READ,
    keyHandle,
  );

  if (openStatus !== ERROR_SUCCESS) {
    return { kind: 'failed', failure: { call: 'RegOpenKeyExW', code: openStatus } };
  }

  const key = readAddress(keyHandle);

  try {
    return listSubkeyStrings({ key: key, valueName: params.valueName });
  } finally {
    advapi32.symbols.RegCloseKey(key);
  }
}

function listSubkeyStrings(params: {
  key: bigint;
  valueName: string;
}): Result<string[], Win32CallFailure> {
  advapi32 ??= openAdvapi32();

  const values: string[] = [];
  const nameBuffer = new Uint16Array(REGISTRY_KEY_NAME_UNITS);
  const nameLength = new Uint32Array(1);

  for (let index = 0; ; index += 1) {
    nameLength[0] = REGISTRY_KEY_NAME_UNITS;

    const enumStatus = advapi32.symbols.RegEnumKeyExW(
      params.key,
      index,
      nameBuffer,
      nameLength,
      null,
      null,
      null,
      null,
    );

    if (enumStatus === ERROR_NO_MORE_ITEMS) {
      return { kind: 'succeeded', value: values };
    }

    if (enumStatus !== ERROR_SUCCESS) {
      return { kind: 'failed', failure: { call: 'RegEnumKeyExW', code: enumStatus } };
    }

    const subkeyName = Buffer.from(nameBuffer.buffer, 0, (nameLength[0] ?? 0) * 2).toString(
      'utf16le',
    );
    const value = loadSubkeyString({
      key: params.key,
      subkeyName: subkeyName,
      valueName: params.valueName,
    });

    if (value !== null) {
      values.push(value);
    }
  }
}

/** The string value of the subkey, or `null` when it has none that fits the buffer. */
function loadSubkeyString(params: {
  key: bigint;
  subkeyName: string;
  valueName: string;
}): string | null {
  advapi32 ??= openAdvapi32();

  const valueBuffer = new Uint8Array(REGISTRY_VALUE_BYTES);
  const valueBytes = new Uint32Array([REGISTRY_VALUE_BYTES]);
  const status = advapi32.symbols.RegGetValueW(
    params.key,
    toWideString({ text: params.subkeyName }),
    toWideString({ text: params.valueName }),
    RRF_RT_REG_SZ,
    null,
    valueBuffer,
    valueBytes,
  );

  if (status !== ERROR_SUCCESS) {
    return null;
  }

  // The size counts the NUL that RegGetValueW writes after a string.
  return Buffer.from(valueBuffer.buffer, 0, valueBytes[0] ?? 0)
    .toString('utf16le')
    .replace(/\0+$/, '');
}

function convertSidToString(params: { sidAddress: bigint }): Result<string, Win32CallFailure> {
  kernel32 ??= openKernel32();
  advapi32 ??= openAdvapi32();

  const stringAddress = new BigUint64Array(1);
  const isConverted = advapi32.symbols.ConvertSidToStringSidW(params.sidAddress, stringAddress);

  if (isConverted === 0) {
    return failWithLastError({ call: 'ConvertSidToStringSidW' });
  }

  try {
    return { kind: 'succeeded', value: readWideString({ address: readAddress(stringAddress) }) };
  } finally {
    kernel32.symbols.LocalFree(readAddress(stringAddress));
  }
}

/** The failure of `call` with its `GetLastError`, read right after the call failed. */
function failWithLastError(params: { call: string }): Result<never, Win32CallFailure> {
  kernel32 ??= openKernel32();

  return {
    kind: 'failed',
    failure: { call: params.call, code: kernel32.symbols.GetLastError() },
  };
}

/** The `\\?\` form of a drive path, which every W function above takes for a path. */
function toExtendedLengthPath(params: { path: AbsolutePath }): string {
  return `${EXTENDED_LENGTH_PREFIX}${params.path}`;
}

/** The text as a NUL-terminated UTF-16LE buffer, the form of an `LPCWSTR`. */
function toWideString(params: { text: string }): Buffer {
  return Buffer.from(`${params.text}\0`, 'utf16le');
}

/** The address an out parameter of pointer size received. */
function readAddress(slot: BigUint64Array): bigint {
  return slot[0] ?? 0n;
}

/** The NUL-terminated UTF-16LE string at `address`, read up to the longest path Windows allows. */
function readWideString(params: { address: bigint }): string {
  // A user-mode address lies below 2^47, which a number holds exactly.
  const pointer = Number(params.address) as Pointer;
  let length = 0;

  while (length < MAX_WIDE_STRING_UNITS && read.u16(pointer, length * 2) !== 0) {
    length += 1;
  }

  if (length === 0) {
    return '';
  }

  return Buffer.from(toArrayBuffer(pointer, 0, length * 2)).toString('utf16le');
}
