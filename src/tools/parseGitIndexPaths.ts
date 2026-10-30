const GIT_INDEX_HEADER_LENGTH = 12;

const GIT_INDEX_SIGNATURE = 'DIRC';

const GIT_INDEX_STAT_DATA_LENGTH = 40;

const GIT_INDEX_FLAGS_LENGTH = 2;

const GIT_INDEX_EXTENDED_FLAG = 0x4000;

const GIT_INDEX_ENTRY_ALIGNMENT = 8;

const GIT_INDEX_EXTENSION_HEADER_LENGTH = 8;

/** The lengths of a SHA-1 and a SHA-256 object name, which the index does not record. */
const objectNameLengths = [20, 32];

/**
 * Extensions whose index lists not every tracked file as its own entry: `link` keeps the entries
 * of a split index in `sharedindex.<hash>`, and `sdir` marks a sparse index's directory entries.
 */
const incompleteIndexExtensionSignatures = ['link', 'sdir'];

/** The entry paths and the extension signatures of an index parsed with one object name length. */
type GitIndexLayout = { paths: string[]; extensionSignatures: string[] };

/** The entries parsed with one object name length, and the offset after the last one. */
type GitIndexEntries = { paths: string[]; endOffset: number };

/**
 * The path of each entry of a git index of version 2 or 3, decoded as UTF-8; `null` for any other
 * version, a split or sparse index, bytes that parse with both or neither object name length, and
 * any other bytes that do not parse.
 */
export function parseGitIndexPaths(indexBytes: Uint8Array): string[] | null {
  if (indexBytes.length < GIT_INDEX_HEADER_LENGTH) {
    return null;
  }

  const signature = new TextDecoder().decode(indexBytes.subarray(0, 4));

  if (signature !== GIT_INDEX_SIGNATURE) {
    return null;
  }

  const view = new DataView(indexBytes.buffer, indexBytes.byteOffset, indexBytes.byteLength);
  const version = view.getUint32(4);

  // Version 4 prefix-compresses the paths.
  if (version !== 2 && version !== 3) {
    return null;
  }

  const layouts = objectNameLengths
    .map((objectNameLength) =>
      parseGitIndexLayout({
        indexBytes: indexBytes,
        view: view,
        version: version,
        objectNameLength: objectNameLength,
      }),
    )
    .filter((layout) => layout !== null);
  const layout = layouts[0];

  if (layouts.length !== 1 || layout === undefined) {
    return null;
  }

  const incomplete = layout.extensionSignatures.some((extensionSignature) =>
    incompleteIndexExtensionSignatures.includes(extensionSignature),
  );

  if (incomplete) {
    return null;
  }

  return layout.paths;
}

/**
 * The layout of an index whose object names are `objectNameLength` bytes long, when its entries
 * and extensions parse and exactly that length is left for the checksum; else `null`.
 */
function parseGitIndexLayout(params: {
  indexBytes: Uint8Array;
  view: DataView;
  version: 2 | 3;
  objectNameLength: number;
}): GitIndexLayout | null {
  const checksumOffset = params.indexBytes.length - params.objectNameLength;

  if (checksumOffset < GIT_INDEX_HEADER_LENGTH) {
    return null;
  }

  const entries = parseGitIndexEntries({
    indexBytes: params.indexBytes,
    view: params.view,
    version: params.version,
    objectNameLength: params.objectNameLength,
    checksumOffset: checksumOffset,
  });

  if (entries === null) {
    return null;
  }

  const extensionSignatures = parseGitIndexExtensionSignatures({
    indexBytes: params.indexBytes,
    view: params.view,
    startOffset: entries.endOffset,
    checksumOffset: checksumOffset,
  });

  if (extensionSignatures === null) {
    return null;
  }

  return { paths: entries.paths, extensionSignatures: extensionSignatures };
}

/**
 * The entries the header counts, each within `checksumOffset`, with a NUL-terminated path and NUL
 * padding to a multiple of 8 bytes, and the extended flag only in version 3; else `null`.
 */
function parseGitIndexEntries(params: {
  indexBytes: Uint8Array;
  view: DataView;
  version: 2 | 3;
  objectNameLength: number;
  checksumOffset: number;
}): GitIndexEntries | null {
  const entryCount = params.view.getUint32(8);
  const pathDecoder = new TextDecoder();
  const paths: string[] = [];
  let offset = GIT_INDEX_HEADER_LENGTH;

  for (let index = 0; index < entryCount; index += 1) {
    const flagsOffset = offset + GIT_INDEX_STAT_DATA_LENGTH + params.objectNameLength;

    if (flagsOffset + GIT_INDEX_FLAGS_LENGTH > params.checksumOffset) {
      return null;
    }

    const extended = (params.view.getUint16(flagsOffset) & GIT_INDEX_EXTENDED_FLAG) !== 0;

    if (extended && params.version === 2) {
      return null;
    }

    const pathOffset =
      flagsOffset + GIT_INDEX_FLAGS_LENGTH + (extended ? GIT_INDEX_FLAGS_LENGTH : 0);
    const pathEndOffset = params.indexBytes
      .subarray(0, params.checksumOffset)
      .indexOf(0, pathOffset);

    if (pathEndOffset === -1) {
      return null;
    }

    const unpaddedLength = pathEndOffset - offset;
    const entryEndOffset =
      pathEndOffset + GIT_INDEX_ENTRY_ALIGNMENT - (unpaddedLength % GIT_INDEX_ENTRY_ALIGNMENT);

    if (entryEndOffset > params.checksumOffset) {
      return null;
    }

    const padding = params.indexBytes.subarray(pathEndOffset, entryEndOffset);

    if (padding.some((byte) => byte !== 0)) {
      return null;
    }

    paths.push(pathDecoder.decode(params.indexBytes.subarray(pathOffset, pathEndOffset)));
    offset = entryEndOffset;
  }

  return { paths: paths, endOffset: offset };
}

/**
 * The signature of each extension from `startOffset`, each a 4-byte signature, a 32-bit size, and
 * that many bytes, when they end exactly at `checksumOffset`; else `null`.
 */
function parseGitIndexExtensionSignatures(params: {
  indexBytes: Uint8Array;
  view: DataView;
  startOffset: number;
  checksumOffset: number;
}): string[] | null {
  const signatureDecoder = new TextDecoder();
  const signatures: string[] = [];
  let offset = params.startOffset;

  while (offset < params.checksumOffset) {
    if (offset + GIT_INDEX_EXTENSION_HEADER_LENGTH > params.checksumOffset) {
      return null;
    }

    signatures.push(signatureDecoder.decode(params.indexBytes.subarray(offset, offset + 4)));
    offset += GIT_INDEX_EXTENSION_HEADER_LENGTH + params.view.getUint32(offset + 4);
  }

  if (offset !== params.checksumOffset) {
    return null;
  }

  return signatures;
}
