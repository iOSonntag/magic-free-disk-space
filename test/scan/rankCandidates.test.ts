import { expect, test } from 'bun:test';
import type { CandidateCategory } from '../../src/catalog/catalog.js';
import { rankByPlace, rankBySize } from '../../src/scan/rankCandidates.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { buildTestCandidate, buildTestToolCandidate } from '../support/candidateFixtures.js';

describeAwaitingWin32Platform('rankBySize', () => {
  test('orders items by allocated bytes, largest first', () => {
    const small = { path: '/a/small', allocatedBytes: 10 };
    const medium = { path: '/a/medium', allocatedBytes: 50 };
    const large = { path: '/a/large', allocatedBytes: 300 };

    expect(rankBySize({ items: [small, large, medium] })).toEqual([large, medium, small]);
  });

  test('orders equal sizes by path with plain comparison', () => {
    const upperCase = { path: '/a/B', allocatedBytes: 10 };
    const lowerCase = { path: '/a/a', allocatedBytes: 10 };
    const last = { path: '/a/z', allocatedBytes: 10 };

    expect(rankBySize({ items: [last, lowerCase, upperCase] })).toEqual([
      upperCase,
      lowerCase,
      last,
    ]);
  });

  test('returns a new array and leaves the input in its order', () => {
    const large = { path: '/a/large', allocatedBytes: 300 };
    const small = { path: '/a/small', allocatedBytes: 10 };
    const items = [small, large];
    const itemsBefore = [...items];

    const ranked = rankBySize({ items });

    expect(ranked).toEqual([large, small]);
    expect(ranked).not.toBe(items);
    expect(items).toEqual(itemsBefore);
  });
});

describeAwaitingWin32Platform('rankByPlace', () => {
  test('orders every section top to bottom, whatever the sizes', () => {
    const categoriesTopToBottom: CandidateCategory[] = [
      'temporary',
      'packages',
      'projects',
      'containerEngines',
      'aiModels',
      'installers',
      'cloudCopies',
      'appContainers',
      'userFiles',
      'trash',
      'appManaged',
    ];
    // Each lower section holds a larger item, so only the section order can rank them so.
    const candidatesTopToBottom = categoriesTopToBottom.map((category, index) =>
      buildTestCandidate({
        path: `/a/${category}`,
        category: category,
        risk: 'safe',
        allocatedBytes: (index + 1) * 100,
      }),
    );

    expect(rankByPlace({ candidates: candidatesTopToBottom.toReversed() })).toEqual(
      candidatesTopToBottom,
    );
  });

  test('puts the safe items of a section before the others, each group by size', () => {
    const safeSmall = buildTestCandidate({
      path: '/a/safe-small',
      category: 'caches',
      risk: 'safe',
      allocatedBytes: 10,
    });
    const safeLarge = buildTestCandidate({
      path: '/a/safe-large',
      category: 'caches',
      risk: 'safe',
      allocatedBytes: 100,
    });
    const review = buildTestCandidate({
      path: '/a/review',
      category: 'caches',
      risk: 'review',
      allocatedBytes: 500,
    });
    const careful = buildTestCandidate({
      path: '/a/careful',
      category: 'caches',
      risk: 'careful',
      allocatedBytes: 50,
    });
    const never = buildTestCandidate({
      path: '/a/never',
      category: 'caches',
      risk: 'never',
      allocatedBytes: 1000,
    });

    expect(rankByPlace({ candidates: [review, careful, safeSmall, never, safeLarge] })).toEqual([
      safeLarge,
      safeSmall,
      never,
      review,
      careful,
    ]);
  });

  test('orders equal sizes in one place by path with plain comparison', () => {
    const upperCase = buildTestCandidate({
      path: '/a/B',
      category: 'caches',
      risk: 'safe',
      allocatedBytes: 10,
    });
    const lowerCase = buildTestCandidate({
      path: '/a/a',
      category: 'caches',
      risk: 'safe',
      allocatedBytes: 10,
    });

    expect(rankByPlace({ candidates: [lowerCase, upperCase] })).toEqual([upperCase, lowerCase]);
  });

  test('ranks Explore last, even a safe item larger than all others', () => {
    const tool = buildTestToolCandidate({ homeDir: '/a', version: '20.1.0', allocatedBytes: 5000 });
    const trashReview = buildTestCandidate({
      path: '/a/trash',
      category: 'trash',
      risk: 'review',
      allocatedBytes: 10,
    });

    expect(rankByPlace({ candidates: [tool, trashReview] })).toEqual([trashReview, tool]);
  });

  test('returns a new array and leaves the input in its order', () => {
    const review = buildTestCandidate({
      path: '/a/review',
      category: 'caches',
      risk: 'review',
      allocatedBytes: 10,
    });
    const safe = buildTestCandidate({
      path: '/a/safe',
      category: 'caches',
      risk: 'safe',
      allocatedBytes: 10,
    });
    const candidates = [review, safe];

    const ranked = rankByPlace({ candidates: candidates });

    expect(ranked).toEqual([safe, review]);
    expect(candidates).toEqual([review, safe]);
  });
});
