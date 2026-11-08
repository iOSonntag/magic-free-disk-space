/** `items` as a list known to hold one at least, such as found paths; `null` when it is empty. */
export function toNonEmpty<T>(items: T[]): [T, ...T[]] | null {
  const [firstItem, ...restItems] = items;

  if (firstItem === undefined) {
    return null;
  }

  return [firstItem, ...restItems];
}

/** Each item through `mapItem`, in the order of `items`, as a list that still holds one at least. */
export function mapNonEmpty<T, TResult>(
  items: [T, ...T[]],
  mapItem: (item: T) => TResult,
): [TResult, ...TResult[]] {
  const [firstItem, ...restItems] = items;

  return [mapItem(firstItem), ...restItems.map((item) => mapItem(item))];
}

/** As `mapNonEmpty`, each `mapItem` awaited before the next item starts. */
export async function mapNonEmptyInTurn<T, TResult>(
  items: [T, ...T[]],
  mapItem: (item: T) => Promise<TResult>,
): Promise<[TResult, ...TResult[]]> {
  const [firstItem, ...restItems] = items;
  const results: [TResult, ...TResult[]] = [await mapItem(firstItem)];

  for (const item of restItems) {
    results.push(await mapItem(item));
  }

  return results;
}
