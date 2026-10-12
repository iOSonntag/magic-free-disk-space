import { describe, expect, test } from 'bun:test';
import { formatRemovalPlan } from '../../src/report/formatRemovalPlan.js';
import type { Candidate } from '../../src/scan/candidate.js';

function buildCandidate(params: {
  path: string;
  allocatedBytes: number;
  isComplete: boolean;
}): Candidate {
  return {
    path: params.path,
    identity: { dev: 1n, ino: 1n, birthtimeNs: 1n, kind: 'directory', realPath: params.path },
    title: 'Derived data',
    category: 'developer',
    risk: 'safe',
    origin: 'catalog',
    explanation: 'Build products.',
    regeneration: 'Rebuilt by the next build.',
    allocatedBytes: params.allocatedBytes,
    entryCount: 1,
    isComplete: params.isComplete,
    ownerBundlePaths: [],
  };
}

describe('formatRemovalPlan', () => {
  test('writes out control characters in a path, so the plan cannot be rewritten', () => {
    const lines = formatRemovalPlan({
      plan: {
        approved: [
          buildCandidate({
            path: '/fixture/clip\u001b[1A\u001b[2K.mov',
            allocatedBytes: 1024,
            isComplete: true,
          }),
        ],
        refused: [{ path: '/fixture/a\rb', number: 2, reason: 'protectedRoot' }],
      },
    });

    expect(lines).toEqual([
      'This item will be deleted permanently, 1.0 KiB in total:',
      '- 1.0 KiB /fixture/clip\\u{1b}[1A\\u{1b}[2K.mov',
      '',
      'Refused 1 selected item:',
      '- 2. /fixture/a\\u{d}b: a protected folder',
    ]);
  });

  test('says that nothing of the selection can be deleted for an empty plan', () => {
    const lines = formatRemovalPlan({ plan: { approved: [], refused: [] } });

    expect(lines).toEqual(['Nothing of the selection can be deleted.']);
  });

  test('lists approved items in the given order with their total', () => {
    const lines = formatRemovalPlan({
      plan: {
        approved: [
          buildCandidate({ path: '/fixture/a', allocatedBytes: 1024, isComplete: true }),
          buildCandidate({ path: '/fixture/b', allocatedBytes: 2048, isComplete: true }),
        ],
        refused: [],
      },
    });

    expect(lines).toEqual([
      'These 2 items will be deleted permanently, 3.0 KiB in total:',
      '- 1.0 KiB /fixture/a',
      '- 2.0 KiB /fixture/b',
    ]);
  });

  test('marks an incomplete approved size as at least', () => {
    const lines = formatRemovalPlan({
      plan: {
        approved: [buildCandidate({ path: '/fixture/a', allocatedBytes: 1024, isComplete: false })],
        refused: [],
      },
    });

    expect(lines[1]).toBe('- at least 1.0 KiB /fixture/a');
  });

  test('shows refused items after a blank line when nothing of the selection is approved', () => {
    const lines = formatRemovalPlan({
      plan: {
        approved: [],
        refused: [{ path: '/fixture/x', number: 4, reason: 'neverRisk' }],
      },
    });

    expect(lines).toEqual([
      'Nothing of the selection can be deleted.',
      '',
      'Refused 1 selected item:',
      '- 4. /fixture/x: marked never-delete',
    ]);
  });

  test('shows approved and refused items with each refusal text', () => {
    const lines = formatRemovalPlan({
      plan: {
        approved: [buildCandidate({ path: '/fixture/ok', allocatedBytes: 1024, isComplete: true })],
        refused: [
          { path: '/fixture/a', number: 1, reason: 'neverRisk' },
          { path: '/fixture/b', number: 2, reason: 'protectedRoot' },
          { path: '/fixture/c', number: 3, reason: 'outsideAllowedRoot' },
          { path: '/fixture/d', number: 4, reason: 'symbolicLink' },
          { path: '/fixture/e', number: 5, reason: 'unsupportedKind' },
        ],
      },
    });

    expect(lines).toEqual([
      'This item will be deleted permanently, 1.0 KiB in total:',
      '- 1.0 KiB /fixture/ok',
      '',
      'Refused 5 selected items:',
      '- 1. /fixture/a: marked never-delete',
      '- 2. /fixture/b: a protected folder',
      '- 3. /fixture/c: outside the folders this tool may delete in',
      '- 4. /fixture/d: a symbolic link',
      '- 5. /fixture/e: not a file or folder',
    ]);
  });
});
