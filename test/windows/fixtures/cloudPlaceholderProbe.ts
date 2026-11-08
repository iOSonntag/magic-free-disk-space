import { dlopen, FFIType, ptr } from 'bun:ffi';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { win32Platform } from '../../../src/platform/win32/win32Platform.js';
import type { EntryRef } from '../../../src/system/entryReads.js';
import { formatSystemCallCode } from '../../../src/system/systemCallFailure.js';
import {
  FILE_ATTRIBUTE_DIRECTORY,
  FILE_ATTRIBUTE_NORMAL,
} from '../../support/windowsFileAttributes.js';
import { loadAttributesText, loadLstatText, observeSafely } from '../observations.js';

// Registers a sync root in the given empty folder, creates cloud placeholders in it and converts
// an ordinary file into a full, in-sync one through cldapi, and writes one JSON line per stage,
// so a crash from a wrong struct layout still leaves the stages before it on stdout. Each
// placeholder is read as the walk reads it, through win32Api.ts and loadEntryPlacement.
//   cloudPlaceholderProbe.ts <sync root folder>

// The layouts follow learn.microsoft.com/windows/win32/api/cfapi for LLP64, shared by x64 and
// arm64: pointers 8 bytes on 8, ULONG, DWORD, HRESULT and enums 4 bytes, GUID 16 bytes on 4.

// CF_SYNC_REGISTRATION: StructSize 0, ProviderName 8, ProviderVersion 16, SyncRootIdentity 24,
// SyncRootIdentityLength 32, FileIdentity 40, FileIdentityLength 48, ProviderId 52, size 72.
const SYNC_REGISTRATION_BYTES = 72;

// CF_SYNC_POLICIES: StructSize 0, Hydration {USHORT Primary, USHORT Modifier} 4, Population 8,
// InSync 12, HardLink 16, PlaceholderManagement 20, size 24.
const SYNC_POLICIES_BYTES = 24;
const CF_HYDRATION_POLICY_FULL = 2;
const CF_POPULATION_POLICY_ALWAYS_FULL = 3;

// CF_PLACEHOLDER_CREATE_INFO: RelativeFileName 0, FsMetadata 8 (CF_FS_METADATA: FILE_BASIC_INFO
// with four LARGE_INTEGER times and FileAttributes at 32 padded to 40, then FileSize at 40, size
// 48), FileIdentity 56, FileIdentityLength 64, Flags 68, Result 72, CreateUsn 80, size 88.
const PLACEHOLDER_CREATE_INFO_BYTES = 88;
const CF_PLACEHOLDER_CREATE_FLAG_DISABLE_ON_DEMAND_POPULATION = 0x1;
const CF_PLACEHOLDER_CREATE_FLAG_MARK_IN_SYNC = 0x2;
const CF_CONVERT_FLAG_MARK_IN_SYNC = 0x1;

const GENERIC_READ_WRITE = 0xc0000000;
const FILE_SHARE_READ_WRITE_DELETE = 0x7;
const OPEN_EXISTING = 3;
const INVALID_HANDLE_VALUE = 0xffffffffffffffffn;

const PLACEHOLDER_FILE_SIZE_BYTES = 1048576n;
// The seconds from 1601-01-01, the FILETIME epoch, to the Unix epoch.
const FILETIME_UNIX_EPOCH_SECONDS = 11644473600n;

const CLOUD_ONLY_FILE_NAME = 'cloudOnlyFile.txt';
const CLOUD_ONLY_FOLDER_NAME = 'cloudOnlyFolder';
const HYDRATED_FILE_NAME = 'hydratedFile.txt';

function openCloudFilterApi() {
  return dlopen('cldapi.dll', {
    CfRegisterSyncRoot: {
      args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.u32],
      returns: FFIType.i32,
    },
    CfUnregisterSyncRoot: { args: [FFIType.ptr], returns: FFIType.i32 },
    CfCreatePlaceholders: {
      args: [FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr],
      returns: FFIType.i32,
    },
    CfConvertToPlaceholder: {
      args: [FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr, FFIType.ptr],
      returns: FFIType.i32,
    },
  });
}

/**
 * The handle calls of kernel32, bound here since win32Api.ts keeps its own private, each handle
 * a u64 as win32Api.ts holds it.
 */
function openKernel32Handles() {
  return dlopen('kernel32.dll', {
    CreateFileW: {
      args: [
        FFIType.ptr,
        FFIType.u32,
        FFIType.u32,
        FFIType.ptr,
        FFIType.u32,
        FFIType.u32,
        FFIType.ptr,
      ],
      returns: FFIType.u64,
    },
    CloseHandle: { args: [FFIType.u64], returns: FFIType.i32 },
    GetLastError: { args: [], returns: FFIType.u32 },
  });
}

type CloudFilterApi = ReturnType<typeof openCloudFilterApi>;

/** The text as a NUL-terminated UTF-16LE buffer, the form of an `LPCWSTR`. */
function toWideString(text: string): Buffer {
  return Buffer.from(`${text}\0`, 'utf16le');
}

function writeStage(stage: string, observations: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ stage: stage, ...observations })}\n`);
}

function buildSyncRegistration(params: {
  providerName: Buffer;
  providerVersion: Buffer;
  identity: Uint8Array;
}): Uint8Array {
  const registration = new Uint8Array(SYNC_REGISTRATION_BYTES);
  const view = new DataView(registration.buffer);

  view.setUint32(0, SYNC_REGISTRATION_BYTES, true);
  view.setBigUint64(8, BigInt(ptr(params.providerName)), true);
  view.setBigUint64(16, BigInt(ptr(params.providerVersion)), true);
  view.setBigUint64(24, BigInt(ptr(params.identity)), true);
  view.setUint32(32, params.identity.byteLength, true);
  registration.set(crypto.getRandomValues(new Uint8Array(16)), 52);

  return registration;
}

function buildSyncPolicies(): Uint8Array {
  const policies = new Uint8Array(SYNC_POLICIES_BYTES);
  const view = new DataView(policies.buffer);

  view.setUint32(0, SYNC_POLICIES_BYTES, true);
  view.setUint16(4, CF_HYDRATION_POLICY_FULL, true);
  view.setUint16(8, CF_POPULATION_POLICY_ALWAYS_FULL, true);

  return policies;
}

function writePlaceholderCreateInfo(params: {
  view: DataView;
  offset: number;
  relativeName: Buffer;
  identity: Uint8Array;
  fileAttributes: number;
  fileSizeBytes: bigint;
  flags: number;
}): void {
  const nowFiletime = (BigInt(Date.now()) / 1000n + FILETIME_UNIX_EPOCH_SECONDS) * 10000000n;

  params.view.setBigUint64(params.offset, BigInt(ptr(params.relativeName)), true);

  for (const timeOffset of [8, 16, 24, 32]) {
    params.view.setBigInt64(params.offset + timeOffset, nowFiletime, true);
  }

  params.view.setUint32(params.offset + 40, params.fileAttributes, true);
  params.view.setBigInt64(params.offset + 48, params.fileSizeBytes, true);
  params.view.setBigUint64(params.offset + 56, BigInt(ptr(params.identity)), true);
  params.view.setUint32(params.offset + 64, params.identity.byteLength, true);
  params.view.setUint32(params.offset + 68, params.flags, true);
}

function createCloudOnlyPlaceholders(cloudFilterApi: CloudFilterApi, syncRoot: string): boolean {
  const fileName = toWideString(CLOUD_ONLY_FILE_NAME);
  const folderName = toWideString(CLOUD_ONLY_FOLDER_NAME);
  const fileIdentity = new TextEncoder().encode('cloud-only-file');
  const folderIdentity = new TextEncoder().encode('cloud-only-folder');
  const createInfos = new Uint8Array(PLACEHOLDER_CREATE_INFO_BYTES * 2);
  const view = new DataView(createInfos.buffer);
  const entriesProcessed = new Uint32Array(1);

  writePlaceholderCreateInfo({
    view: view,
    offset: 0,
    relativeName: fileName,
    identity: fileIdentity,
    fileAttributes: FILE_ATTRIBUTE_NORMAL,
    fileSizeBytes: PLACEHOLDER_FILE_SIZE_BYTES,
    flags: CF_PLACEHOLDER_CREATE_FLAG_MARK_IN_SYNC,
  });
  writePlaceholderCreateInfo({
    view: view,
    offset: PLACEHOLDER_CREATE_INFO_BYTES,
    relativeName: folderName,
    identity: folderIdentity,
    fileAttributes: FILE_ATTRIBUTE_DIRECTORY,
    fileSizeBytes: 0n,
    flags:
      CF_PLACEHOLDER_CREATE_FLAG_MARK_IN_SYNC |
      CF_PLACEHOLDER_CREATE_FLAG_DISABLE_ON_DEMAND_POPULATION,
  });

  const hresult = cloudFilterApi.symbols.CfCreatePlaceholders(
    toWideString(syncRoot),
    createInfos,
    2,
    0,
    entriesProcessed,
  );

  writeStage('CfCreatePlaceholders', {
    hresult: formatSystemCallCode({ code: hresult }),
    entriesProcessed: entriesProcessed[0],
    fileResult: formatSystemCallCode({ code: view.getInt32(72, true) }),
    folderResult: formatSystemCallCode({
      code: view.getInt32(PLACEHOLDER_CREATE_INFO_BYTES + 72, true),
    }),
  });

  return hresult >= 0;
}

async function convertToHydratedPlaceholder(
  cloudFilterApi: CloudFilterApi,
  path: string,
): Promise<boolean> {
  await writeFile(path, 'A fully local file in a sync root.\n');

  const kernel32 = openKernel32Handles();
  const handle = kernel32.symbols.CreateFileW(
    toWideString(path),
    GENERIC_READ_WRITE,
    FILE_SHARE_READ_WRITE_DELETE,
    null,
    OPEN_EXISTING,
    FILE_ATTRIBUTE_NORMAL,
    null,
  );

  if (handle === INVALID_HANDLE_VALUE) {
    writeStage('CreateFileW', {
      lastError: formatSystemCallCode({ code: kernel32.symbols.GetLastError() }),
    });

    return false;
  }

  try {
    const identity = new TextEncoder().encode('hydrated-file');
    const hresult = cloudFilterApi.symbols.CfConvertToPlaceholder(
      handle,
      identity,
      identity.byteLength,
      CF_CONVERT_FLAG_MARK_IN_SYNC,
      null,
      null,
    );

    writeStage('CfConvertToPlaceholder', { hresult: formatSystemCallCode({ code: hresult }) });

    return hresult >= 0;
  } finally {
    kernel32.symbols.CloseHandle(handle);
  }
}

async function observeEntry(label: string, entry: EntryRef): Promise<void> {
  const lstatText = await observeSafely(() => loadLstatText(entry.path));

  writeStage(label, {
    lstat: lstatText,
    attributes: loadAttributesText(entry.path),
    placement: win32Platform.system.entryReads.loadEntryPlacement(entry),
  });
}

async function runCloudPlaceholderProbe(syncRoot: string): Promise<void> {
  const cloudFilterApi = openCloudFilterApi();

  writeStage('dlopen cldapi.dll', { result: 'ok' });

  const providerName = toWideString('MagicFreeDiskSpaceFacts');
  const providerVersion = toWideString('1.0');
  const syncRootIdentity = new TextEncoder().encode('magic-free-disk-space-facts');
  const registration = buildSyncRegistration({
    providerName: providerName,
    providerVersion: providerVersion,
    identity: syncRootIdentity,
  });
  const registerHresult = cloudFilterApi.symbols.CfRegisterSyncRoot(
    toWideString(syncRoot),
    registration,
    buildSyncPolicies(),
    0,
  );

  writeStage('CfRegisterSyncRoot', { hresult: formatSystemCallCode({ code: registerHresult }) });

  if (registerHresult < 0) {
    return;
  }

  try {
    if (createCloudOnlyPlaceholders(cloudFilterApi, syncRoot)) {
      await observeEntry('cloud-only file', {
        path: join(syncRoot, CLOUD_ONLY_FILE_NAME),
        kind: 'file',
      });
      await observeEntry('cloud-only folder', {
        path: join(syncRoot, CLOUD_ONLY_FOLDER_NAME),
        kind: 'directory',
      });
    }

    const hydratedPath = join(syncRoot, HYDRATED_FILE_NAME);

    if (await convertToHydratedPlaceholder(cloudFilterApi, hydratedPath)) {
      await observeEntry('hydrated file', { path: hydratedPath, kind: 'file' });
    }
  } finally {
    const unregisterHresult = cloudFilterApi.symbols.CfUnregisterSyncRoot(toWideString(syncRoot));

    writeStage('CfUnregisterSyncRoot', {
      hresult: formatSystemCallCode({ code: unregisterHresult }),
    });
  }
}

const syncRoot = process.argv[2];

if (syncRoot === undefined) {
  process.stderr.write('Usage: cloudPlaceholderProbe.ts <sync root folder>\n');
  process.exit(2);
}

await runCloudPlaceholderProbe(syncRoot);
