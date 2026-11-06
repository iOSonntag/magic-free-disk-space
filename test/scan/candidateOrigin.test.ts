import { expect, test } from 'bun:test';
import type { Advice } from '../../src/scan/candidate.js';
import { buildItemKey } from '../../src/scan/candidateOrigin.js';
import { buildTestVscodeExtensionCandidate } from '../explore/vscodeExtensionFixtures.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import {
  buildTestCandidate,
  buildTestDartToolCandidate,
  buildTestToolCandidate,
  TEST_LISTING_FACTS_NONE,
} from '../support/candidateFixtures.js';
import { buildTestMacBundleId } from '../support/parsedValueFixtures.js';

const ADVICE: Advice = {
  origin: { kind: 'catalog', entryId: 'tool-store' },
  path: '/fixture/store',
  title: 'Tool store',
  category: 'packages',
  risk: 'review',
  explanation: 'Packages the tool keeps.',
  advice: 'Run the tool prune command.',
  opener: null,
  allocatedBytes: 1,
  isComplete: true,
  ...TEST_LISTING_FACTS_NONE,
};

describeAwaitingWin32Platform('buildItemKey', () => {
  test('names an item by its source, the id that source knows it by, and its path', () => {
    expect<string[]>(
      [
        buildTestCandidate({ path: '/fixture/cache', origin: { kind: 'catalog', entryId: 'c' } }),
        buildTestCandidate({
          path: '/fixture/shop/node_modules',
          origin: { kind: 'artifact', artifactName: 'node_modules' },
        }),
        buildTestCandidate({
          path: '/Applications/Example.app',
          origin: {
            kind: 'application',
            bundleId: buildTestMacBundleId({ text: 'com.example.app' }),
          },
        }),
        buildTestCandidate({ path: '/fixture/movie.mov', origin: { kind: 'userFile' } }),
        buildTestCandidate({
          path: '/fixture/Containers/com.example.gone',
          origin: { kind: 'leftover', matchedBy: 'bundleId' },
        }),
      ].map((candidate) => buildItemKey({ item: candidate })),
    ).toEqual([
      'catalog:c:/fixture/cache',
      'artifact:node_modules:/fixture/shop/node_modules',
      'application:com.example.app:/Applications/Example.app',
      'userFile:/fixture/movie.mov',
      'leftover:/fixture/Containers/com.example.gone',
    ]);
  });

  test('names a probed item by its probe and its unit', () => {
    expect<string[]>(
      [
        buildTestToolCandidate({ homeDir: '/fixture', version: '20.1.0' }),
        buildTestDartToolCandidate({ homeDir: '/fixture' }),
        buildTestVscodeExtensionCandidate({ homeDir: '/fixture' }),
      ].map((candidate) => buildItemKey({ item: candidate })),
    ).toEqual([
      'explore:miseVersions:miseVersion:node@20.1.0',
      'explore:dartPubCache:dartPubCache',
      'explore:vscodeExtensions:vscodeExtension:/fixture/.vscode/extensions/example.alpha-1.0.0',
    ]);
  });

  test('names advice by its entry and its path', () => {
    expect<string>(buildItemKey({ item: ADVICE })).toBe('catalog:tool-store:/fixture/store');
  });

  test('gives the same key to the same item of a later scan, whatever its size', () => {
    const first = buildTestCandidate({ path: '/fixture/cache', allocatedBytes: 1 });
    const later = buildTestCandidate({ path: '/fixture/cache', allocatedBytes: 2 });

    expect(buildItemKey({ item: later })).toBe(buildItemKey({ item: first }));
  });
});
