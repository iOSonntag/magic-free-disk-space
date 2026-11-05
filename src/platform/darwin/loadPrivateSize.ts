import { dlopen, FFIType, ptr } from 'bun:ffi';

// `struct attrlist` of <sys/attr.h>: a u16 bitmap count, a u16 pad, then five u32 groups.
const ATTRIBUTE_LIST_BYTES = 24;
const ATTRIBUTE_BITMAP_COUNT = 5;
const ATTRIBUTE_COMMON_GROUP_OFFSET = 4;
const ATTRIBUTE_FORK_GROUP_OFFSET = 20;

// Asks which attributes came back, since one the volume lacks is left out of the answer.
const ATTR_CMN_RETURNED_ATTRS = 0x80000000;
// Read in the fork group once FSOPT_ATTR_CMN_EXTENDED is set: the bytes no clone shares.
const ATTR_CMNEXT_PRIVATESIZE = 0x00000008;
const FSOPT_NOFOLLOW = 0x00000001;
const FSOPT_ATTR_CMN_EXTENDED = 0x00000020;

// The answer: a u32 length, the returned `attribute_set_t` of five u32 groups, then the off_t.
const ANSWER_BYTES = 32;
const ANSWER_RETURNED_FORK_GROUP_OFFSET = 20;
const ANSWER_PRIVATE_SIZE_OFFSET = 24;

type LibSystem = ReturnType<typeof openLibSystem>;

// Opened on the first call, so the module also loads where libSystem does not exist.
let libSystem: LibSystem | null = null;

// The attribute list never changes, and `getattrlist` only reads it.
const privateSizeAttributeList = buildPrivateSizeAttributeList();

function openLibSystem() {
  return dlopen('/usr/lib/libSystem.B.dylib', {
    // Its options are an `unsigned int` on 64-bit macOS, as <unistd.h> declares under __LP64__.
    getattrlist: {
      args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.u64, FFIType.u32],
      returns: FFIType.i32,
    },
  });
}

function buildPrivateSizeAttributeList(): Uint8Array {
  const attributeList = new Uint8Array(ATTRIBUTE_LIST_BYTES);
  const view = new DataView(attributeList.buffer);

  view.setUint16(0, ATTRIBUTE_BITMAP_COUNT, true);
  view.setUint32(ATTRIBUTE_COMMON_GROUP_OFFSET, ATTR_CMN_RETURNED_ATTRS, true);
  view.setUint32(ATTRIBUTE_FORK_GROUP_OFFSET, ATTR_CMNEXT_PRIVATESIZE, true);

  return attributeList;
}

/**
 * The APFS private size of the entry itself, never of a link's target: the bytes of its blocks
 * that no clone shares, which deleting it frees. `null` when the entry cannot be read or its
 * volume does not report the size. Never throws.
 */
export function loadPrivateBytes(path: string): number | null {
  libSystem ??= openLibSystem();

  const answer = new Uint8Array(ANSWER_BYTES);
  const pathBytes = Buffer.from(`${path}\0`, 'utf8');
  const getattrlistResult = libSystem.symbols.getattrlist(
    ptr(pathBytes),
    ptr(privateSizeAttributeList),
    ptr(answer),
    ANSWER_BYTES,
    FSOPT_NOFOLLOW | FSOPT_ATTR_CMN_EXTENDED,
  );

  if (getattrlistResult !== 0) {
    return null;
  }

  const view = new DataView(answer.buffer);
  const returnedForkGroup = view.getUint32(ANSWER_RETURNED_FORK_GROUP_OFFSET, true);

  if ((returnedForkGroup & ATTR_CMNEXT_PRIVATESIZE) === 0) {
    return null;
  }

  const privateBytes = view.getBigInt64(ANSWER_PRIVATE_SIZE_OFFSET, true);

  return privateBytes < 0n ? null : Number(privateBytes);
}
