import { describe, expect, test } from 'bun:test';
import { buildInstalledBundleIds } from '../../src/scan/buildInstalledBundleIds.js';

describe('buildInstalledBundleIds', () => {
  test('collects the bundle id of each app and the ids nested in it', () => {
    const bundleIds = buildInstalledBundleIds({
      apps: [
        {
          bundlePath: '/a/Example.app',
          displayName: 'Example',
          bundleId: 'com.example.app',
          nestedBundleIds: ['com.example.app.helper'],
        },
        {
          bundlePath: '/a/Other.app',
          displayName: 'Other',
          bundleId: 'com.example.other',
          nestedBundleIds: [],
        },
      ],
    });

    expect([...bundleIds].toSorted()).toEqual([
      'com.example.app',
      'com.example.app.helper',
      'com.example.other',
    ]);
  });

  test('leaves out a null bundle id and keeps the nested ids', () => {
    const bundleIds = buildInstalledBundleIds({
      apps: [
        {
          bundlePath: '/a/Broken.app',
          displayName: 'Broken',
          bundleId: null,
          nestedBundleIds: ['com.example.broken.share'],
        },
      ],
    });

    expect([...bundleIds]).toEqual(['com.example.broken.share']);
  });

  test('returns an empty set when there are no apps', () => {
    expect(buildInstalledBundleIds({ apps: [] }).size).toBe(0);
  });
});
