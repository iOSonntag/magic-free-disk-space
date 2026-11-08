import { describe, expect, test } from 'bun:test';
import { mapNonEmpty, mapNonEmptyInTurn, toNonEmpty } from '../../src/system/nonEmptyList.js';

describe('toNonEmpty', () => {
  test('keeps the items of a list that holds one at least, in their order', () => {
    expect(toNonEmpty(['a', 'b'])).toEqual(['a', 'b']);
  });

  test('gives null for an empty list', () => {
    expect(toNonEmpty([])).toBeNull();
  });
});

describe('mapNonEmpty', () => {
  test('maps each item in its order and passes only the item', () => {
    const seen: unknown[][] = [];

    expect(
      mapNonEmpty(['a', 'b', 'c'], (...args: unknown[]) => {
        seen.push(args);

        return String(args[0]).toUpperCase();
      }),
    ).toEqual(['A', 'B', 'C']);
    expect(seen).toEqual([['a'], ['b'], ['c']]);
  });
});

describe('mapNonEmptyInTurn', () => {
  test('starts each item only once the one before it has finished', async () => {
    const events: string[] = [];

    const results = await mapNonEmptyInTurn(['a', 'b', 'c'], async (item) => {
      events.push(`start ${item}`);
      await Promise.resolve();
      events.push(`end ${item}`);

      return item.toUpperCase();
    });

    expect(results).toEqual(['A', 'B', 'C']);
    expect(events).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });
});
