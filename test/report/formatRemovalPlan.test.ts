import { expect, test } from 'bun:test';
import { formatRemovalPlan } from '../../src/report/formatRemovalPlan.js';
import type { Candidate } from '../../src/scan/candidate.js';
import { buildTestVscodeExtensionCandidate } from '../explore/vscodeExtensionFixtures.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import {
  buildTestDartToolCandidate,
  buildTestToolCandidate,
  TEST_LISTING_FACTS_NONE,
} from '../support/candidateFixtures.js';
import {
  buildTestEvictCandidate,
  buildTestEvictTarget,
} from '../support/evictCandidateFixtures.js';

function buildCandidate(params: {
  path: string;
  allocatedBytes: number;
  isComplete: boolean;
}): Candidate {
  return {
    path: params.path,
    title: 'Derived data',
    category: 'developer',
    risk: 'safe',
    origin: { kind: 'catalog', entryId: 'test-entry' },
    explanation: 'Build products.',
    regeneration: 'Rebuilt by the next build.',
    allocatedBytes: params.allocatedBytes,
    entryCount: 1,
    isComplete: params.isComplete,
    ...TEST_LISTING_FACTS_NONE,
    removal: {
      kind: 'deletePaths',
      targets: [
        {
          path: params.path,
          identity: { dev: 1n, ino: 1n, birthtimeNs: 1n, kind: 'directory', realPath: params.path },
        },
      ],
      ownerBundlePaths: [],
    },
  };
}

describeAwaitingWin32Platform('formatRemovalPlan', () => {
  test('writes out control characters in a path, so the plan cannot be rewritten', () => {
    const lines = formatRemovalPlan({
      plan: {
        approved: [
          buildCandidate({
            path: '/fixture/clip\u001b[1A\u001b[2K.mov',
            allocatedBytes: 1000,
            isComplete: true,
          }),
        ],
        refused: [{ path: '/fixture/a\rb', number: 2, reason: 'protectedRoot' }],
      },
    });

    expect(lines).toEqual([
      'This item will be deleted permanently, 1.0 kB in total:',
      '- 1.0 kB /fixture/clip\\u{1b}[1A\\u{1b}[2K.mov',
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
          buildCandidate({ path: '/fixture/a', allocatedBytes: 1000, isComplete: true }),
          buildCandidate({ path: '/fixture/b', allocatedBytes: 2000, isComplete: true }),
        ],
        refused: [],
      },
    });

    expect(lines).toEqual([
      'These 2 items will be deleted permanently, 3.0 kB in total:',
      '- 1.0 kB /fixture/a',
      '- 2.0 kB /fixture/b',
    ]);
  });

  test('names the command that removes a tool item below its path', () => {
    const toolCandidate = buildTestToolCandidate({
      homeDir: '/fixture/home',
      version: '20.1.0',
      allocatedBytes: 2000,
    });
    const lines = formatRemovalPlan({
      plan: {
        approved: [
          buildCandidate({ path: '/fixture/a', allocatedBytes: 1000, isComplete: true }),
          toolCandidate,
        ],
        refused: [],
      },
    });

    expect(lines).toEqual([
      'These 2 items will be deleted permanently, 3.0 kB in total:',
      '- 1.0 kB /fixture/a',
      '- 2.0 kB /fixture/home/.local/share/mise/installs/node/20.1.0',
      '   by running: mise uninstall node@20.1.0',
    ]);
  });

  test('names the command with the leading arguments of its tool', () => {
    const lines = formatRemovalPlan({
      plan: { approved: [buildTestDartToolCandidate({ homeDir: '/fixture/home' })], refused: [] },
    });

    expect(lines).toContain('   by running: dart --suppress-analytics pub cache gc --force');
  });

  test('lists a unit folder as a path deleted as it is, with no command', () => {
    const lines = formatRemovalPlan({
      plan: {
        approved: [buildTestVscodeExtensionCandidate({ homeDir: '/Users/example' })],
        refused: [],
      },
    });

    expect(lines).toEqual([
      'This item will be deleted permanently, 4.1 kB in total:',
      '- 4.1 kB /Users/example/.vscode/extensions/example.alpha-1.0.0',
    ]);
  });

  test('says an evict takes the files off this Mac alone, never that it deletes them', () => {
    const folderPath = '/Users/example/Library/Mobile Documents/com~apple~CloudDocs/Projects';
    const lines = formatRemovalPlan({
      plan: {
        approved: [
          buildTestEvictCandidate({
            folderPath: folderPath,
            targets: [buildTestEvictTarget({ path: `${folderPath}/video.mov` })],
            allocatedBytes: 1000,
          }),
        ],
        refused: [],
      },
    });

    expect(lines).toEqual([
      'This item will be removed from this Mac, 1.0 kB in total; iCloud Drive keeps the files:',
      `- 1.0 kB ${folderPath}`,
      '   evicted from this Mac; iCloud Drive keeps the files',
    ]);
  });

  test('says which items of a mixed plan iCloud Drive keeps and which are deleted', () => {
    const folderPath = '/Users/example/Library/Mobile Documents/com~apple~CloudDocs/Projects';
    const lines = formatRemovalPlan({
      plan: {
        approved: [
          buildTestEvictCandidate({
            folderPath: folderPath,
            targets: [buildTestEvictTarget({ path: `${folderPath}/video.mov` })],
            allocatedBytes: 1000,
          }),
          buildCandidate({ path: '/fixture/a', allocatedBytes: 1000, isComplete: true }),
        ],
        refused: [],
      },
    });

    expect(lines[0]).toBe(
      'These 2 items will be removed from this Mac, 2.0 kB in total; iCloud Drive keeps the evicted files, and the rest is deleted permanently:',
    );
  });

  test('marks an incomplete approved size as at least', () => {
    const lines = formatRemovalPlan({
      plan: {
        approved: [buildCandidate({ path: '/fixture/a', allocatedBytes: 1000, isComplete: false })],
        refused: [],
      },
    });

    expect(lines[1]).toBe('- at least 1.0 kB /fixture/a');
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
        approved: [buildCandidate({ path: '/fixture/ok', allocatedBytes: 1000, isComplete: true })],
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
      'This item will be deleted permanently, 1.0 kB in total:',
      '- 1.0 kB /fixture/ok',
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
