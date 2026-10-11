/**
 * Returns a new array, largest `allocatedBytes` first.
 * Equal sizes sort by `path` with plain `<`.
 */
export function rankBySize<TItem extends { path: string; allocatedBytes: number }>(params: {
  items: TItem[];
}): TItem[] {
  return params.items.toSorted((left, right): number => {
    if (left.allocatedBytes !== right.allocatedBytes) {
      return right.allocatedBytes - left.allocatedBytes;
    }

    if (left.path < right.path) {
      return -1;
    }

    if (left.path > right.path) {
      return 1;
    }

    return 0;
  });
}
