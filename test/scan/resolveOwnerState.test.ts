import { expect, test } from 'bun:test';
import {
  findOwnerBundlePaths,
  isAppleBundleId,
  isBundleIdShape,
  resolveOwnerState,
  resolveTargetOwner,
} from '../../src/scan/resolveOwnerState.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { buildTestCatalogEntry } from '../support/candidateFixtures.js';
import { buildTestInstalledApp } from '../support/installedAppFixtures.js';
import { buildTestCatalogOwner, buildTestMacBundleId } from '../support/parsedValueFixtures.js';

describeAwaitingWin32Platform('isBundleIdShape', () => {
  test('accepts reverse-DNS names with three or more segments', () => {
    expect(isBundleIdShape({ name: 'com.example.app' })).toBe(true);
    expect(isBundleIdShape({ name: 'com.example.app-beta.helper' })).toBe(true);
  });

  test('rejects ordinary folder names', () => {
    expect(isBundleIdShape({ name: 'Homebrew' })).toBe(false);
    expect(isBundleIdShape({ name: 'com.example' })).toBe(false);
    expect(isBundleIdShape({ name: 'com..example' })).toBe(false);
    expect(isBundleIdShape({ name: 'My App.v2.final' })).toBe(false);
    expect(isBundleIdShape({ name: '.com.example.app' })).toBe(false);
  });
});

describeAwaitingWin32Platform('isAppleBundleId', () => {
  test('matches the com.apple. prefix only', () => {
    expect(isAppleBundleId({ bundleId: buildTestMacBundleId({ text: 'com.apple.Safari' }) })).toBe(
      true,
    );
    expect(
      isAppleBundleId({ bundleId: buildTestMacBundleId({ text: 'com.applesauce.app' }) }),
    ).toBe(false);
  });
});

describeAwaitingWin32Platform('resolveTargetOwner', () => {
  test('takes the owner of a self entry', () => {
    const entry = buildTestCatalogEntry({
      scope: 'self',
      owner: buildTestCatalogOwner({ bundleId: 'com.example.app' }),
    });

    expect(
      resolveTargetOwner({ entry: entry, path: '/home/Library/Caches/Test', installedApps: [] }),
    ).toEqual(buildTestCatalogOwner({ bundleId: 'com.example.app' }));
  });

  test('takes the child name of a children entry when it is a bundle id', () => {
    const entry = buildTestCatalogEntry({
      scope: 'children',
      owner: buildTestCatalogOwner({ bundleId: null }),
    });

    expect(
      resolveTargetOwner({
        entry: entry,
        path: '/home/Library/Caches/com.example.app',
        installedApps: [],
      }),
    ).toEqual(buildTestCatalogOwner({ bundleId: 'com.example.app' }));
    expect(
      resolveTargetOwner({
        entry: entry,
        path: '/home/Library/Caches/Homebrew',
        installedApps: [],
      }),
    ).toEqual(buildTestCatalogOwner({ bundleId: null }));
  });

  test('takes the installed app named like a child, ignoring case', () => {
    const entry = buildTestCatalogEntry({
      scope: 'children',
      owner: buildTestCatalogOwner({ bundleId: null }),
    });
    const slack = buildTestInstalledApp({ displayName: 'Slack', bundleId: 'com.example.slack' });

    expect(
      resolveTargetOwner({
        entry: entry,
        path: '/home/Library/Caches/slack',
        installedApps: [slack],
      }),
    ).toEqual(buildTestCatalogOwner({ bundleId: 'com.example.slack' }));
  });
});

describeAwaitingWin32Platform('findOwnerBundlePaths', () => {
  test('lists every installed bundle carrying the id, as app or as helper', () => {
    const apps = [
      buildTestInstalledApp({ bundlePath: '/Applications/A.app', bundleId: 'com.example.a' }),
      buildTestInstalledApp({
        bundlePath: '/Applications/B.app',
        bundleId: 'com.example.b',
        nestedBundleIds: ['com.example.a'],
      }),
      buildTestInstalledApp({ bundlePath: '/Applications/C.app', bundleId: 'com.example.c' }),
    ];

    expect(
      findOwnerBundlePaths({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.a' }),
        installedApps: apps,
      }),
    ).toEqual(['/Applications/A.app', '/Applications/B.app']);
    expect(
      findOwnerBundlePaths({
        owner: buildTestCatalogOwner({ bundleId: null }),
        installedApps: apps,
      }),
    ).toEqual([]);
  });
});

describeAwaitingWin32Platform('resolveOwnerState', () => {
  const slack = buildTestInstalledApp({
    bundlePath: '/Applications/Slack.app',
    bundleId: 'com.example.slack',
    nestedBundleIds: ['com.example.slack.helper'],
  });

  test('an entry without owner counts as stopped', () => {
    expect(
      resolveOwnerState({
        owner: buildTestCatalogOwner({ bundleId: null }),
        installedApps: [slack],
        processCommands: null,
      }),
    ).toBe('stopped');
  });

  test('any owner is unknown while the process list is missing, installed or not', () => {
    expect(
      resolveOwnerState({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.slack' }),
        installedApps: [slack],
        processCommands: null,
      }),
    ).toBe('unknown');
    expect(
      resolveOwnerState({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.gone' }),
        installedApps: [slack],
        processCommands: null,
      }),
    ).toBe('unknown');
  });

  test('an owner no installed app carries counts as stopped', () => {
    expect(
      resolveOwnerState({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.gone' }),
        installedApps: [slack],
        processCommands: ['/Applications/Slack.app/Contents/MacOS/Slack'],
      }),
    ).toBe('stopped');
  });

  test('a process inside the bundle marks the owner running', () => {
    expect(
      resolveOwnerState({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.slack' }),
        installedApps: [slack],
        processCommands: ['/sbin/launchd', '/Applications/Slack.app/Contents/MacOS/Slack --flag'],
      }),
    ).toBe('running');
  });

  test('a nested bundle id maps to its app', () => {
    expect(
      resolveOwnerState({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.slack.helper' }),
        installedApps: [slack],
        processCommands: [
          '/Applications/Slack.app/Contents/Frameworks/Helper.app/Contents/MacOS/H',
        ],
      }),
    ).toBe('running');
  });

  test('a bundle whose path only shares a prefix does not count', () => {
    expect(
      resolveOwnerState({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.slack' }),
        installedApps: [slack],
        processCommands: ['/Applications/Slack.app.old/Contents/MacOS/Slack'],
      }),
    ).toBe('stopped');
  });

  test('any of several copies of the app running marks it running', () => {
    const copy = buildTestInstalledApp({
      bundlePath: '/Users/tester/Applications/Slack.app',
      bundleId: 'com.example.slack',
    });

    expect(
      resolveOwnerState({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.slack' }),
        installedApps: [slack, copy],
        processCommands: ['/Users/tester/Applications/Slack.app/Contents/MacOS/Slack'],
      }),
    ).toBe('running');
  });
});
