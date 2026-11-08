import type { Pointer } from 'bun:ffi';
import { dlopen, FFIType, ptr, read, toArrayBuffer } from 'bun:ffi';
import type { DriveRoot } from '../../path/driveRoot.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import type { RecycleBinContent } from '../../scan/candidate.js';
import type { SystemCallFailure } from '../../system/systemCallFailure.js';
import type { VolumeSpace } from '../../system/volumeSpace.js';
import type { ProcessEntry } from './processEntry.js';
import { createProcessEntryBuffer, parseProcessEntry } from './processEntry.js';

declare const windowsHandleBrand: unique symbol;

/** A HANDLE of Windows as the u64 a 64-bit process holds it in, made only by the calls below. */
export type WindowsHandle = bigint & { [windowsHandleBrand]: true };

/** The calls of Windows below whose failure a caller reads. */
export type Win32CallName =
  | 'AssignProcessToJobObject'
  | 'ConvertSidToStringSidW'
  | 'CreateJobObjectW'
  | 'CreateToolhelp32Snapshot'
  | 'GetDiskFreeSpaceExW'
  | 'GetFileAttributesW'
  | 'GetLogicalDrives'
  | 'GetNamedSecurityInfoW'
  | 'GetTokenInformation'
  | 'OpenProcess'
  | 'OpenProcessToken'
  | 'Process32NextW'
  | 'QueryFullProcessImageNameW'
  | 'RegEnumKeyExW'
  | 'RegOpenKeyExW'
  | 'SetFileAttributesW'
  | 'SetInformationJobObject'
  | 'SHEmptyRecycleBinW'
  | 'SHGetKnownFolderPath'
  | 'SHQueryRecycleBinW';

/**
 * A call of Windows that failed, with the code it failed with: its `GetLastError`, the error code
 * it returned, or its HRESULT, as the call reports a failure.
 */
export type Win32CallFailure = SystemCallFailure & { call: Win32CallName };

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

/**
 * The predefined key of each hive: `HKEY_CURRENT_USER` and `HKEY_LOCAL_MACHINE` are
 * `(HKEY)(ULONG_PTR)(LONG)0x80000001` and `0x80000002`, sign-extended to 64 bits.
 */
const registryHiveKeys: Record<RegistryHive, bigint> = {
  currentUser: 0xffffffff80000001n,
  localMachine: 0xffffffff80000002n,
};
const KEY_READ = 0x20019;
const RRF_RT_REG_SZ = 0x2;
const RRF_RT_REG_DWORD = 0x10;
const ERROR_SUCCESS = 0;
const ERROR_FILE_NOT_FOUND = 2;
const ERROR_NO_MORE_FILES = 18;
const ERROR_NO_MORE_ITEMS = 259;

/** The flags that open the 64-bit or the 32-bit view of a redirected key. */
const keyWow64Flags: Record<RegistryView, number> = { shared: 0, bits64: 0x100, bits32: 0x200 };

/** A key name has at most 255 characters, a value at most 32 767, each with its NUL. */
const REGISTRY_KEY_NAME_UNITS = 256;
const REGISTRY_VALUE_BYTES = 65_536;

/** A path of Windows has at most 32 767 UTF-16 code units. */
const MAX_WIDE_STRING_UNITS = 32_767;

/** What `CreateToolhelp32Snapshot` returns when it fails. */
const INVALID_HANDLE_VALUE = 0xffffffffffffffffn;
const TH32CS_SNAPPROCESS = 0x2;
const PROCESS_TERMINATE = 0x1;
const PROCESS_SET_QUOTA = 0x100;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

/** `JobObjectExtendedLimitInformation` and the limit that ends every process of a closed job. */
const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS = 9;
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;

/**
 * `JOBOBJECT_EXTENDED_LIMIT_INFORMATION` on x64 and arm64: the basic limits of 64 bytes, whose
 * `LimitFlags` sits at byte 16, then the I/O counters and four sizes.
 */
const JOB_EXTENDED_LIMIT_BYTES = 144;
const JOB_LIMIT_FLAGS_OFFSET = 16;

/** `FILE_ATTRIBUTE_NORMAL`, which `SetFileAttributesW` takes for an entry with no other bit. */
const FILE_ATTRIBUTE_NORMAL = 0x80;

/** `SHQUERYRBINFO` on x64 and arm64: `cbSize`, then the size and the item count at 8 and 16. */
const RECYCLE_BIN_INFO_BYTES = 24;

/** Empties without asking, without a progress window, and without a sound. */
const SHERB_SILENT = 0x7;

/** The registry views a key can be read in. */
export type RegistryView = 'shared' | 'bits64' | 'bits32';

/** The two hives the Uninstall keys live in. */
export type RegistryHive = 'currentUser' | 'localMachine';

/** The values of one Uninstall subkey, each `null` where the subkey lacks it or holds another type. */
export type UninstallKeyValues = {
  keyName: string;
  displayName: string | null;
  uninstallString: string | null;
  installLocation: string | null;
  estimatedSize: number | null;
  systemComponent: number | null;
  parentKeyName: string | null;
  releaseType: string | null;
};

/** One subkey of an open key, by its name, which the value reads below take beside the key. */
type RegistrySubkey = { key: bigint; subkeyName: string };

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
    GetDiskFreeSpaceExW: {
      args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr],
      returns: FFIType.i32,
    },
    SetFileAttributesW: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
    GetCurrentProcess: { args: [], returns: FFIType.u64 },
    OpenProcess: { args: [FFIType.u32, FFIType.i32, FFIType.u32], returns: FFIType.u64 },
    QueryFullProcessImageNameW: {
      args: [FFIType.u64, FFIType.u32, FFIType.ptr, FFIType.ptr],
      returns: FFIType.i32,
    },
    CreateToolhelp32Snapshot: { args: [FFIType.u32, FFIType.u32], returns: FFIType.u64 },
    Process32FirstW: { args: [FFIType.u64, FFIType.ptr], returns: FFIType.i32 },
    Process32NextW: { args: [FFIType.u64, FFIType.ptr], returns: FFIType.i32 },
    CreateJobObjectW: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.u64 },
    SetInformationJobObject: {
      args: [FFIType.u64, FFIType.u32, FFIType.ptr, FFIType.u32],
      returns: FFIType.i32,
    },
    AssignProcessToJobObject: { args: [FFIType.u64, FFIType.u64], returns: FFIType.i32 },
    TerminateJobObject: { args: [FFIType.u64, FFIType.u32], returns: FFIType.i32 },
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
    ConvertSidToStringSidW: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
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
    SHQueryRecycleBinW: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
    SHEmptyRecycleBinW: { args: [FFIType.u64, FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
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

  const attributes = kernel32.symbols.GetFileAttributesW(toWidePath({ path: params.path }));

  if (attributes === INVALID_FILE_ATTRIBUTES) {
    return buildLastErrorFailure({ call: 'GetFileAttributesW' });
  }

  return { kind: 'succeeded', value: attributes };
}

/** The bit mask of the drive letters in use, bit 0 for `A:`. */
export function loadLogicalDrives(): Result<number, Win32CallFailure> {
  kernel32 ??= openKernel32();

  const drives = kernel32.symbols.GetLogicalDrives();

  if (drives === 0) {
    return buildLastErrorFailure({ call: 'GetLogicalDrives' });
  }

  return { kind: 'succeeded', value: drives };
}

/** The `DRIVE_*` type of the drive whose root is `rootPath`, such as `DRIVE_FIXED` 3. */
export function loadDriveType(params: { rootPath: AbsolutePath }): number {
  kernel32 ??= openKernel32();

  return kernel32.symbols.GetDriveTypeW(toWidePath({ path: params.rootPath }));
}

/**
 * The size of the volume that holds the folder at `folderPath` and the bytes free on it, each as
 * far as the disk quota lets the calling user use them.
 */
export function loadDiskFreeSpace(params: {
  folderPath: AbsolutePath;
}): Result<VolumeSpace, Win32CallFailure> {
  kernel32 ??= openKernel32();

  const availableBytes = new BigUint64Array(1);
  const capacityBytes = new BigUint64Array(1);
  // GetDiskFreeSpaceExW takes the folder in its documented form, with a trailing backslash.
  const folderText = params.folderPath.endsWith('\\')
    ? params.folderPath
    : `${params.folderPath}\\`;

  const isRead = kernel32.symbols.GetDiskFreeSpaceExW(
    toWideString({ text: folderText }),
    availableBytes,
    capacityBytes,
    null,
  );

  if (isRead === 0) {
    return buildLastErrorFailure({ call: 'GetDiskFreeSpaceExW' });
  }

  return {
    kind: 'succeeded',
    value: {
      capacityBytes: Number(capacityBytes[0] ?? 0n),
      availableBytes: Number(availableBytes[0] ?? 0n),
    },
  };
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
      return buildHresultFailure({ call: 'SHGetKnownFolderPath', hresult: hresult });
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
    return buildLastErrorFailure({ call: 'OpenProcessToken' });
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

  // Over an ArrayBuffer of its own, which never moves, as a small typed array's bytes may.
  const tokenUser = new Uint8Array(new ArrayBuffer(TOKEN_USER_BUFFER_BYTES));
  const returnLength = new Uint32Array(1);
  const isRead = advapi32.symbols.GetTokenInformation(
    params.token,
    TOKEN_USER_CLASS,
    tokenUser,
    TOKEN_USER_BUFFER_BYTES,
    returnLength,
  );

  if (isRead === 0) {
    return buildLastErrorFailure({ call: 'GetTokenInformation' });
  }

  const sidOffset = Number(new DataView(tokenUser.buffer).getBigUint64(0, true)) - ptr(tokenUser);

  if (sidOffset < 0 || sidOffset >= TOKEN_USER_BUFFER_BYTES) {
    throw new Error('GetTokenInformation pointed to a SID outside its buffer.');
  }

  // A view of the buffer, not the SID's address, keeps the buffer that holds it alive in the call.
  return convertSidToString({ sid: tokenUser.subarray(sidOffset) });
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
    return buildLastErrorFailure({ call: 'GetTokenInformation' });
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
    toWidePath({ path: params.path }),
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
    return convertSidToString({ sid: toPointer({ address: readAddress(ownerSidAddress) }) });
  } finally {
    kernel32.symbols.LocalFree(readAddress(descriptorAddress));
  }
}

/**
 * The string value `valueName` of each subkey of the key `keyPath` of `HKEY_CURRENT_USER`, in the
 * order of the subkeys; a subkey without that string value is left out, and a key that does not
 * exist holds no subkeys.
 */
export function loadCurrentUserSubkeyStrings(params: {
  keyPath: string;
  valueName: string;
}): Result<string[], Win32CallFailure> {
  const values = loadFromEachSubkey({
    hive: 'currentUser',
    view: 'shared',
    keyPath: params.keyPath,
    loadSubkey: (subkey) => loadSubkeyString({ ...subkey, valueName: params.valueName }),
  });

  if (values.kind === 'failed') {
    return values;
  }

  return {
    kind: 'succeeded',
    value: values.value.flatMap((value) => (value === null ? [] : [value])),
  };
}

/**
 * The values of each subkey of the key `keyPath` of the hive, in the given view, in the order of
 * the subkeys. A key that does not exist holds no subkeys.
 */
export function loadUninstallKeyValues(params: {
  hive: RegistryHive;
  view: RegistryView;
  keyPath: string;
}): Result<UninstallKeyValues[], Win32CallFailure> {
  return loadFromEachSubkey({
    hive: params.hive,
    view: params.view,
    keyPath: params.keyPath,
    loadSubkey: (subkey) => ({
      keyName: subkey.subkeyName,
      displayName: loadSubkeyString({ ...subkey, valueName: 'DisplayName' }),
      uninstallString: loadSubkeyString({ ...subkey, valueName: 'UninstallString' }),
      installLocation: loadSubkeyString({ ...subkey, valueName: 'InstallLocation' }),
      estimatedSize: loadSubkeyNumber({ ...subkey, valueName: 'EstimatedSize' }),
      systemComponent: loadSubkeyNumber({ ...subkey, valueName: 'SystemComponent' }),
      parentKeyName: loadSubkeyString({ ...subkey, valueName: 'ParentKeyName' }),
      releaseType: loadSubkeyString({ ...subkey, valueName: 'ReleaseType' }),
    }),
  });
}

/**
 * Each running process by its id and the file name of its image, as `Process32FirstW` and
 * `Process32NextW` list a snapshot of them.
 */
export function listProcesses(): Result<ProcessEntry[], Win32CallFailure> {
  kernel32 ??= openKernel32();

  const snapshot = kernel32.symbols.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);

  if (snapshot === INVALID_HANDLE_VALUE) {
    return buildLastErrorFailure({ call: 'CreateToolhelp32Snapshot' });
  }

  try {
    const processes: ProcessEntry[] = [];
    const entry = createProcessEntryBuffer();
    let isListed = kernel32.symbols.Process32FirstW(snapshot, entry);

    while (isListed !== 0) {
      processes.push(parseProcessEntry({ bytes: entry }));
      isListed = kernel32.symbols.Process32NextW(snapshot, entry);
    }

    const endCode = kernel32.symbols.GetLastError();

    if (endCode !== ERROR_NO_MORE_FILES) {
      return { kind: 'failed', failure: { call: 'Process32NextW', code: endCode } };
    }

    return { kind: 'succeeded', value: processes };
  } finally {
    kernel32.symbols.CloseHandle(snapshot);
  }
}

/**
 * The full path of the image of the process `processId`. Fails for a process this user may not
 * query, such as a protected process or one of another user.
 */
export function loadProcessImagePath(params: {
  processId: number;
}): Result<string, Win32CallFailure> {
  kernel32 ??= openKernel32();

  const processHandle = kernel32.symbols.OpenProcess(
    PROCESS_QUERY_LIMITED_INFORMATION,
    0,
    params.processId,
  );

  if (processHandle === 0n) {
    return buildLastErrorFailure({ call: 'OpenProcess' });
  }

  try {
    const pathBuffer = new Uint16Array(MAX_WIDE_STRING_UNITS + 1);
    const pathUnits = new Uint32Array([pathBuffer.length]);
    const isRead = kernel32.symbols.QueryFullProcessImageNameW(
      processHandle,
      0,
      pathBuffer,
      pathUnits,
    );

    if (isRead === 0) {
      return buildLastErrorFailure({ call: 'QueryFullProcessImageNameW' });
    }

    return {
      kind: 'succeeded',
      value: Buffer.from(pathBuffer.buffer, 0, (pathUnits[0] ?? 0) * 2).toString('utf16le'),
    };
  } finally {
    kernel32.symbols.CloseHandle(processHandle);
  }
}

/**
 * A new job whose processes Windows ends once its last handle closes, so a tool in it dies with
 * the app however the app ends. Close it with `closeHandle`.
 */
export function createKillOnCloseJob(): Result<WindowsHandle, Win32CallFailure> {
  kernel32 ??= openKernel32();

  const job = kernel32.symbols.CreateJobObjectW(null, null);

  if (job === 0n) {
    return buildLastErrorFailure({ call: 'CreateJobObjectW' });
  }

  const limits = new Uint8Array(JOB_EXTENDED_LIMIT_BYTES);

  new DataView(limits.buffer).setUint32(
    JOB_LIMIT_FLAGS_OFFSET,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    true,
  );

  const isSet = kernel32.symbols.SetInformationJobObject(
    job,
    JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS,
    limits,
    JOB_EXTENDED_LIMIT_BYTES,
  );

  if (isSet === 0) {
    const failure = buildLastErrorFailure({ call: 'SetInformationJobObject' });

    kernel32.symbols.CloseHandle(job);

    return failure;
  }

  // The brand records that the handle came from CreateJobObjectW.
  return { kind: 'succeeded', value: job as WindowsHandle };
}

/** Puts the process `processId` into the job; each process it starts from then on joins it too. */
export function assignProcessToJob(params: {
  job: WindowsHandle;
  processId: number;
}): Result<null, Win32CallFailure> {
  kernel32 ??= openKernel32();

  const processHandle = kernel32.symbols.OpenProcess(
    PROCESS_SET_QUOTA | PROCESS_TERMINATE,
    0,
    params.processId,
  );

  if (processHandle === 0n) {
    return buildLastErrorFailure({ call: 'OpenProcess' });
  }

  try {
    if (kernel32.symbols.AssignProcessToJobObject(params.job, processHandle) === 0) {
      return buildLastErrorFailure({ call: 'AssignProcessToJobObject' });
    }

    return { kind: 'succeeded', value: null };
  } finally {
    kernel32.symbols.CloseHandle(processHandle);
  }
}

/**
 * Ends every process of the job with the exit code 1. A failure goes unread, since closing a job
 * created by `createKillOnCloseJob` ends its processes as well.
 */
export function terminateJob(params: { job: WindowsHandle }): void {
  kernel32 ??= openKernel32();
  kernel32.symbols.TerminateJobObject(params.job, 1);
}

/** Sets the `FILE_ATTRIBUTE_*` bits of the entry at `path`; no bit set at all is `NORMAL`. */
export function setFileAttributes(params: {
  path: AbsolutePath;
  attributes: number;
}): Result<null, Win32CallFailure> {
  kernel32 ??= openKernel32();

  const isSet = kernel32.symbols.SetFileAttributesW(
    toWidePath({ path: params.path }),
    params.attributes === 0 ? FILE_ATTRIBUTE_NORMAL : params.attributes,
  );

  if (isSet === 0) {
    return buildLastErrorFailure({ call: 'SetFileAttributesW' });
  }

  return { kind: 'succeeded', value: null };
}

/**
 * The size and item count of the Recycle Bin of the drive whose root is `driveRoot`, such as
 * `C:\`. The HRESULT of a failure is its code.
 */
export function loadRecycleBinContent(params: {
  driveRoot: DriveRoot;
}): Result<RecycleBinContent, Win32CallFailure> {
  shell32 ??= openShell32();

  const info = new Uint8Array(RECYCLE_BIN_INFO_BYTES);
  const view = new DataView(info.buffer);

  view.setUint32(0, RECYCLE_BIN_INFO_BYTES, true);

  const hresult = shell32.symbols.SHQueryRecycleBinW(
    toWideString({ text: params.driveRoot }),
    info,
  );

  if (hresult < 0) {
    return buildHresultFailure({ call: 'SHQueryRecycleBinW', hresult: hresult });
  }

  return {
    kind: 'succeeded',
    value: {
      sizeBytes: Number(view.getBigInt64(8, true)),
      itemCount: Number(view.getBigInt64(16, true)),
    },
  };
}

/**
 * Empties the Recycle Bin of the drive whose root is `driveRoot`, without asking, a progress
 * window, or a sound. The HRESULT of a failure is its code.
 */
export function emptyRecycleBin(params: { driveRoot: DriveRoot }): Result<null, Win32CallFailure> {
  shell32 ??= openShell32();

  const hresult = shell32.symbols.SHEmptyRecycleBinW(
    0n,
    toWideString({ text: params.driveRoot }),
    SHERB_SILENT,
  );

  if (hresult < 0) {
    return buildHresultFailure({ call: 'SHEmptyRecycleBinW', hresult: hresult });
  }

  return { kind: 'succeeded', value: null };
}

function listSubkeyNames(params: { key: bigint }): Result<string[], Win32CallFailure> {
  advapi32 ??= openAdvapi32();

  const names: string[] = [];
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
      return { kind: 'succeeded', value: names };
    }

    if (enumStatus !== ERROR_SUCCESS) {
      return { kind: 'failed', failure: { call: 'RegEnumKeyExW', code: enumStatus } };
    }

    names.push(Buffer.from(nameBuffer.buffer, 0, (nameLength[0] ?? 0) * 2).toString('utf16le'));
  }
}

/** The `REG_DWORD` value of the subkey, or `null` when it has none. */
function loadSubkeyNumber(params: {
  key: bigint;
  subkeyName: string;
  valueName: string;
}): number | null {
  advapi32 ??= openAdvapi32();

  const value = new Uint32Array(1);
  const valueBytes = new Uint32Array([value.byteLength]);
  const status = advapi32.symbols.RegGetValueW(
    params.key,
    toWideString({ text: params.subkeyName }),
    toWideString({ text: params.valueName }),
    RRF_RT_REG_DWORD,
    null,
    value,
    valueBytes,
  );

  if (status !== ERROR_SUCCESS) {
    return null;
  }

  return value[0] ?? null;
}

/**
 * What `loadSubkey` reads from each subkey of the key `keyPath` of the hive, in the given view, in
 * the order of the subkeys, with the key open only for the reads. A key that does not exist holds
 * no subkeys.
 */
function loadFromEachSubkey<TValue>(params: {
  hive: RegistryHive;
  view: RegistryView;
  keyPath: string;
  loadSubkey: (subkey: RegistrySubkey) => TValue;
}): Result<TValue[], Win32CallFailure> {
  advapi32 ??= openAdvapi32();

  const keyHandle = new BigUint64Array(1);
  const openStatus = advapi32.symbols.RegOpenKeyExW(
    registryHiveKeys[params.hive],
    toWideString({ text: params.keyPath }),
    0,
    KEY_READ | keyWow64Flags[params.view],
    keyHandle,
  );

  if (openStatus === ERROR_FILE_NOT_FOUND) {
    return { kind: 'succeeded', value: [] };
  }

  if (openStatus !== ERROR_SUCCESS) {
    return { kind: 'failed', failure: { call: 'RegOpenKeyExW', code: openStatus } };
  }

  const key = readAddress(keyHandle);

  try {
    const subkeyNames = listSubkeyNames({ key: key });

    if (subkeyNames.kind === 'failed') {
      return subkeyNames;
    }

    return {
      kind: 'succeeded',
      value: subkeyNames.value.map((subkeyName) =>
        params.loadSubkey({ key: key, subkeyName: subkeyName }),
      ),
    };
  } finally {
    advapi32.symbols.RegCloseKey(key);
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

function convertSidToString(params: {
  sid: Uint8Array | Pointer;
}): Result<string, Win32CallFailure> {
  kernel32 ??= openKernel32();
  advapi32 ??= openAdvapi32();

  const stringAddress = new BigUint64Array(1);
  const isConverted = advapi32.symbols.ConvertSidToStringSidW(params.sid, stringAddress);

  if (isConverted === 0) {
    return buildLastErrorFailure({ call: 'ConvertSidToStringSidW' });
  }

  try {
    return { kind: 'succeeded', value: readWideString({ address: readAddress(stringAddress) }) };
  } finally {
    kernel32.symbols.LocalFree(readAddress(stringAddress));
  }
}

/** The failure of `call` with its `GetLastError`, read right after the call failed. */
function buildLastErrorFailure(params: { call: Win32CallName }): Result<never, Win32CallFailure> {
  kernel32 ??= openKernel32();

  return {
    kind: 'failed',
    failure: { call: params.call, code: kernel32.symbols.GetLastError() },
  };
}

/** The failure of `call` with the HRESULT it returned, a negative number, as its 32 bits. */
function buildHresultFailure(params: {
  call: Win32CallName;
  hresult: number;
}): Result<never, Win32CallFailure> {
  return { kind: 'failed', failure: { call: params.call, code: params.hresult >>> 0 } };
}

/**
 * The drive path in its `\\?\` form as an `LPCWSTR`, the form the file calls above take for a path
 * that may pass 260 characters. `GetDiskFreeSpaceExW` takes its folder as it is, a home folder or
 * a drive root never that long, and the shell calls of the Recycle Bin take a plain drive root.
 */
function toWidePath(params: { path: AbsolutePath }): Buffer {
  return toWideString({ text: `${EXTENDED_LENGTH_PREFIX}${params.path}` });
}

/** The text as a NUL-terminated UTF-16LE buffer, the form of an `LPCWSTR`. */
function toWideString(params: { text: string }): Buffer {
  return Buffer.from(`${params.text}\0`, 'utf16le');
}

/** The address an out parameter of pointer size received. */
function readAddress(slot: BigUint64Array): bigint {
  return slot[0] ?? 0n;
}

/** The address as the pointer a function of bun:ffi takes. */
function toPointer(params: { address: bigint }): Pointer {
  // A user-mode address lies below 2^47, which a number holds exactly.
  return Number(params.address) as Pointer;
}

/** The NUL-terminated UTF-16LE string at `address`, read up to the longest path Windows allows. */
function readWideString(params: { address: bigint }): string {
  const pointer = toPointer({ address: params.address });
  let length = 0;

  while (length < MAX_WIDE_STRING_UNITS && read.u16(pointer, length * 2) !== 0) {
    length += 1;
  }

  if (length === 0) {
    return '';
  }

  return Buffer.from(toArrayBuffer(pointer, 0, length * 2)).toString('utf16le');
}
