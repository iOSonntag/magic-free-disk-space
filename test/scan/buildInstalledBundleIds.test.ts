import { describe, expect, test } from 'bun:test';
import { buildInstalledBundleIds } from '../../src/scan/buildInstalledBundleIds.js';
import { TEST_INSTALLED_APP_FACTS_NONE } from '../support/installedAppFixtures.js';
import { buildTestMacBundleId } from '../support/parsedValueFixtures.js';

describe('buildInstalledBundleIds', () => {
  test('collects the bundle id of each app and the ids nested in it', () => {
    const bundleIds = buildInstalledBundleIds({
      apps: [
        {
          bundlePath: '/a/Example.app',
          displayName: 'Example',
          bundleId: buildTestMacBundleId({ text: 'com.example.app' }),
          nestedBundleIds: [buildTestMacBundleId({ text: 'com.example.app.helper' })],
          ...TEST_INSTALLED_APP_FACTS_NONE,
        },
        {
          bundlePath: '/a/Other.app',
          displayName: 'Other',
          bundleId: buildTestMacBundleId({ text: 'com.example.other' }),
          nestedBundleIds: [],
          ...TEST_INSTALLED_APP_FACTS_NONE,
        },
      ],
    });

    expect([...bundleIds].toSorted()).toEqual([
      buildTestMacBundleId({ text: 'com.example.app' }),
      buildTestMacBundleId({ text: 'com.example.app.helper' }),
      buildTestMacBundleId({ text: 'com.example.other' }),
    ]);
  });

  test('leaves out a null bundle id and keeps the nested ids', () => {
    const bundleIds = buildInstalledBundleIds({
      apps: [
        {
          bundlePath: '/a/Broken.app',
          displayName: 'Broken',
          bundleId: null,
          nestedBundleIds: [buildTestMacBundleId({ text: 'com.example.broken.share' })],
          ...TEST_INSTALLED_APP_FACTS_NONE,
        },
      ],
    });

    expect([...bundleIds]).toEqual([buildTestMacBundleId({ text: 'com.example.broken.share' })]);
  });

  test('returns an empty set when there are no apps', () => {
    expect(buildInstalledBundleIds({ apps: [] }).size).toBe(0);
  });
});
