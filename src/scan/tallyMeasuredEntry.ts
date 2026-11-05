/** A folder, which counts its own blocks; each entry inside it counts on its own. */
export type MeasuredEntryDirectory = { kind: 'directory'; allocatedBytes: number };

/** Any entry but a folder, such as a file or a symbolic link: one of its inode's names. */
export type MeasuredEntryFile = {
  kind: 'file';
  dev: bigint;
  ino: bigint;
  allocatedBytes: number;
  /** The names the inode has, inside the offer and outside it. */
  linkCount: number;
  /** The bytes of its blocks that no clone shares; `null` when they could not be read. */
  privateBytes: number | null;
};

export type MeasuredEntry = MeasuredEntryDirectory | MeasuredEntryFile;

/** An inode with more than one name, with the names of it the offer met so far. */
type LinkedInode = {
  linkCount: number;
  metLinkCount: number;
  bytes: number;
  isPrivateSizeFallback: boolean;
};

/**
 * The running tally of one offer's entries. `createEntryTally` starts it,
 * `tallyMeasuredEntry` adds to it, and `getEntryTallyTotals` reads it.
 */
export type EntryTally = {
  /** Folders and single-link files, counted as they come. */
  countedBytes: number;
  privateSizeFallbackCount: number;
  /** The inodes with more than one name, by `dev:ino`, decided once every entry is in. */
  linkedInodes: Map<string, LinkedInode>;
};

export type EntryTallyTotals = {
  /** What deleting the offer frees, each block counted once. */
  countedBytes: number;
  /** The counted files whose private size could not be read, so their allocated blocks count. */
  privateSizeFallbackCount: number;
};

export function createEntryTally(): EntryTally {
  return { countedBytes: 0, privateSizeFallbackCount: 0, linkedInodes: new Map() };
}

/**
 * Adds one entry to the tally in place. A folder counts its allocated blocks, a file its private
 * size, or its allocated blocks as a fallback when that size could not be read. A file with
 * more than one name waits for `getEntryTallyTotals`. Each name must be added once, so the
 * paths of one offer must not overlap.
 */
export function tallyMeasuredEntry(params: { tally: EntryTally; entry: MeasuredEntry }): void {
  if (params.entry.kind === 'directory') {
    params.tally.countedBytes += params.entry.allocatedBytes;

    return;
  }

  const bytes = params.entry.privateBytes ?? params.entry.allocatedBytes;
  const isPrivateSizeFallback = params.entry.privateBytes === null;

  if (params.entry.linkCount <= 1) {
    params.tally.countedBytes += bytes;
    params.tally.privateSizeFallbackCount += isPrivateSizeFallback ? 1 : 0;

    return;
  }

  const inodeKey = `${params.entry.dev}:${params.entry.ino}`;
  const linkedInode = params.tally.linkedInodes.get(inodeKey);

  if (linkedInode === undefined) {
    params.tally.linkedInodes.set(inodeKey, {
      linkCount: params.entry.linkCount,
      metLinkCount: 1,
      bytes: bytes,
      isPrivateSizeFallback: isPrivateSizeFallback,
    });

    return;
  }

  linkedInode.metLinkCount += 1;
}

/**
 * The tally's totals. An inode with more than one name counts once, and only when the offer met
 * every name of it, since deleting some of its names frees nothing.
 */
export function getEntryTallyTotals(tally: EntryTally): EntryTallyTotals {
  let countedBytes = tally.countedBytes;
  let privateSizeFallbackCount = tally.privateSizeFallbackCount;

  for (const linkedInode of tally.linkedInodes.values()) {
    if (linkedInode.metLinkCount < linkedInode.linkCount) {
      continue;
    }

    countedBytes += linkedInode.bytes;
    privateSizeFallbackCount += linkedInode.isPrivateSizeFallback ? 1 : 0;
  }

  return { countedBytes: countedBytes, privateSizeFallbackCount: privateSizeFallbackCount };
}
