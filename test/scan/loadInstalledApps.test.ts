import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SCAN_LIMITS } from '../../src/scan/limits.js';
import { loadInstalledApps } from '../../src/scan/loadInstalledApps.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureRoot,
  deleteFixtureRoot,
} from '../support/fixtureRoot.js';

function buildInfoPlistText(params: { bundleId: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
<key>CFBundleIdentifier</key>
<string>${params.bundleId}</string>
</dict>
</plist>
`;
}

async function createFixtureBundle(params: {
  bundlePath: string;
  bundleId: string;
}): Promise<void> {
  const contentsPath = join(params.bundlePath, 'Contents');

  await createFixtureDirectory({ path: contentsPath });
  await writeFile(
    join(contentsPath, 'Info.plist'),
    buildInfoPlistText({ bundleId: params.bundleId }),
  );
}

describe('loadInstalledApps', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  test('reads an iOS app on a Mac through its wrapped bundle', async () => {
    const wrapperPath = join(fixtureRoot.applicationDir, 'Pocket.app');
    const innerPath = join(wrapperPath, 'Wrapper', 'Pocket.app');

    await createFixtureDirectory({ path: join(innerPath, 'PlugIns', 'Widget.appex') });
    await writeFile(
      join(innerPath, 'Info.plist'),
      buildInfoPlistText({ bundleId: 'com.example.pocket' }),
    );
    await writeFile(
      join(innerPath, 'PlugIns', 'Widget.appex', 'Info.plist'),
      buildInfoPlistText({ bundleId: 'com.example.pocket.widget' }),
    );
    await symlink('Wrapper/Pocket.app', join(wrapperPath, 'WrappedBundle'));

    const result = await loadInstalledApps({
      appDirs: [fixtureRoot.applicationDir],
      commandTimeoutMs: SCAN_LIMITS.commandTimeoutMs,
    });

    expect(result.issues).toEqual([]);
    expect(result.apps).toEqual([
      {
        bundlePath: wrapperPath,
        displayName: 'Pocket',
        bundleId: 'com.example.pocket',
        nestedBundleIds: ['com.example.pocket.widget'],
      },
    ]);
  });

  test('lists app bundles, vendor folder apps, and nested ids in walk order', async () => {
    const applicationDir = fixtureRoot.applicationDir;
    const examplePath = join(applicationDir, 'Example.app');

    await createFixtureBundle({ bundlePath: examplePath, bundleId: 'com.example.app' });
    await createFixtureBundle({
      bundlePath: join(examplePath, 'Contents', 'PlugIns', 'Share.appex'),
      bundleId: 'com.example.share',
    });
    await createFixtureBundle({
      bundlePath: join(applicationDir, 'Loud.APP'),
      bundleId: 'com.example.loud',
    });
    await createFixtureBundle({
      bundlePath: join(applicationDir, 'Utilities', 'Helper.app'),
      bundleId: 'com.example.helper',
    });

    const result = await loadInstalledApps({
      appDirs: [applicationDir],
      commandTimeoutMs: SCAN_LIMITS.commandTimeoutMs,
    });

    expect(result).toEqual({
      apps: [
        {
          bundlePath: examplePath,
          displayName: 'Example',
          bundleId: 'com.example.app',
          nestedBundleIds: ['com.example.share'],
        },
        {
          bundlePath: join(applicationDir, 'Loud.APP'),
          displayName: 'Loud',
          bundleId: 'com.example.loud',
          nestedBundleIds: [],
        },
        {
          bundlePath: join(applicationDir, 'Utilities', 'Helper.app'),
          displayName: 'Helper',
          bundleId: 'com.example.helper',
          nestedBundleIds: [],
        },
      ],
      issues: [],
    });
  });

  test('an app without a readable Info.plist has no id and a commandFailed issue', async () => {
    const brokenPath = join(fixtureRoot.applicationDir, 'Broken.app');

    await createFixtureDirectory({ path: join(brokenPath, 'Contents') });

    const result = await loadInstalledApps({
      appDirs: [fixtureRoot.applicationDir],
      commandTimeoutMs: SCAN_LIMITS.commandTimeoutMs,
    });

    expect(result).toEqual({
      apps: [
        { bundlePath: brokenPath, displayName: 'Broken', bundleId: null, nestedBundleIds: [] },
      ],
      issues: [{ path: brokenPath, reason: 'commandFailed', detail: 'exitedWithError' }],
    });
  });

  test('a missing app folder adds no apps and no issues', async () => {
    const result = await loadInstalledApps({
      appDirs: [join(fixtureRoot.rootDir, 'Missing')],
      commandTimeoutMs: SCAN_LIMITS.commandTimeoutMs,
    });

    expect(result).toEqual({ apps: [], issues: [] });
  });

  test('an unreadable app folder gives an issue; other folders are still read', async () => {
    const lockedDir = join(fixtureRoot.rootDir, 'Locked');

    await createFixtureBundle({
      bundlePath: join(lockedDir, 'Hidden.app'),
      bundleId: 'com.example.hidden',
    });
    await chmod(lockedDir, 0o000);
    await createFixtureBundle({
      bundlePath: join(fixtureRoot.applicationDir, 'Example.app'),
      bundleId: 'com.example.app',
    });

    const result = await loadInstalledApps({
      appDirs: [lockedDir, fixtureRoot.applicationDir],
      commandTimeoutMs: SCAN_LIMITS.commandTimeoutMs,
    });

    expect(result.issues).toEqual([
      { path: lockedDir, reason: 'permissionDenied', detail: 'EACCES' },
    ]);
    expect(result.apps.map((app) => app.displayName)).toEqual(['Example']);
  });

  test('an unreadable vendor folder gives an issue and its siblings are listed', async () => {
    const applicationDir = fixtureRoot.applicationDir;
    const vendorPath = join(applicationDir, 'Vendor');

    await createFixtureBundle({
      bundlePath: join(vendorPath, 'Inner.app'),
      bundleId: 'com.example.inner',
    });
    await chmod(vendorPath, 0o000);
    await createFixtureBundle({
      bundlePath: join(applicationDir, 'Example.app'),
      bundleId: 'com.example.app',
    });

    const result = await loadInstalledApps({
      appDirs: [applicationDir],
      commandTimeoutMs: SCAN_LIMITS.commandTimeoutMs,
    });

    expect(result.issues).toEqual([
      { path: vendorPath, reason: 'permissionDenied', detail: 'EACCES' },
    ]);
    expect(result.apps.map((app) => app.displayName)).toEqual(['Example']);
  });

  test('a symbolic link named like an app is listed and its id counts', async () => {
    const targetPath = join(fixtureRoot.rootDir, 'Real.app');
    const linkPath = join(fixtureRoot.applicationDir, 'Linked.app');

    await createFixtureBundle({ bundlePath: targetPath, bundleId: 'com.example.real' });
    await symlink(targetPath, linkPath);

    const result = await loadInstalledApps({
      appDirs: [fixtureRoot.applicationDir],
      commandTimeoutMs: SCAN_LIMITS.commandTimeoutMs,
    });

    expect(result).toEqual({
      apps: [
        {
          bundlePath: linkPath,
          displayName: 'Linked',
          bundleId: 'com.example.real',
          nestedBundleIds: [],
        },
      ],
      issues: [],
    });
  });

  test('a symbolic link to a folder of apps is not followed', async () => {
    const realVendorPath = join(fixtureRoot.rootDir, 'RealVendor');

    await createFixtureBundle({
      bundlePath: join(realVendorPath, 'Inner.app'),
      bundleId: 'com.example.inner',
    });
    await symlink(realVendorPath, join(fixtureRoot.applicationDir, 'LinkedVendor'));

    const result = await loadInstalledApps({
      appDirs: [fixtureRoot.applicationDir],
      commandTimeoutMs: SCAN_LIMITS.commandTimeoutMs,
    });

    expect(result).toEqual({ apps: [], issues: [] });
  });

  test('a vendor folder is listed one level down only', async () => {
    await createFixtureBundle({
      bundlePath: join(fixtureRoot.applicationDir, 'Utilities', 'Nested', 'Deep.app'),
      bundleId: 'com.example.deep',
    });

    const result = await loadInstalledApps({
      appDirs: [fixtureRoot.applicationDir],
      commandTimeoutMs: SCAN_LIMITS.commandTimeoutMs,
    });

    expect(result).toEqual({ apps: [], issues: [] });
  });

  test('nested bundles are found to depth 6, not deeper or inside a bundle', async () => {
    const examplePath = join(fixtureRoot.applicationDir, 'Example.app');
    const contentsPath = join(examplePath, 'Contents');

    await createFixtureBundle({ bundlePath: examplePath, bundleId: 'com.example.app' });
    await createFixtureBundle({
      bundlePath: join(
        contentsPath,
        'Frameworks',
        'Kit.framework',
        'Versions',
        'A',
        'XPCServices',
        'Near.xpc',
      ),
      bundleId: 'com.example.near',
    });
    await createFixtureBundle({
      bundlePath: join(contentsPath, 'A', 'B', 'C', 'D', 'E', 'F', 'Far.xpc'),
      bundleId: 'com.example.far',
    });
    await createFixtureBundle({
      bundlePath: join(contentsPath, 'PlugIns', 'Share.appex'),
      bundleId: 'com.example.share',
    });
    await createFixtureBundle({
      bundlePath: join(
        contentsPath,
        'PlugIns',
        'Share.appex',
        'Contents',
        'PlugIns',
        'Inner.appex',
      ),
      bundleId: 'com.example.inner',
    });

    const result = await loadInstalledApps({
      appDirs: [fixtureRoot.applicationDir],
      commandTimeoutMs: SCAN_LIMITS.commandTimeoutMs,
    });

    expect(result).toEqual({
      apps: [
        {
          bundlePath: examplePath,
          displayName: 'Example',
          bundleId: 'com.example.app',
          nestedBundleIds: ['com.example.near', 'com.example.share'],
        },
      ],
      issues: [],
    });
  });

  test('nested bundles without an Info.plist or behind a link add nothing', async () => {
    const examplePath = join(fixtureRoot.applicationDir, 'Example.app');
    const contentsPath = join(examplePath, 'Contents');

    await createFixtureBundle({ bundlePath: examplePath, bundleId: 'com.example.app' });
    await createFixtureDirectory({
      path: join(contentsPath, 'XPCServices', 'Silent.xpc', 'Contents'),
    });
    await createFixtureBundle({
      bundlePath: join(contentsPath, 'PlugIns', 'Share.appex'),
      bundleId: 'com.example.share',
    });
    await symlink(
      join(contentsPath, 'PlugIns', 'Share.appex'),
      join(contentsPath, 'PlugIns', 'Linked.appex'),
    );

    const result = await loadInstalledApps({
      appDirs: [fixtureRoot.applicationDir],
      commandTimeoutMs: SCAN_LIMITS.commandTimeoutMs,
    });

    expect(result).toEqual({
      apps: [
        {
          bundlePath: examplePath,
          displayName: 'Example',
          bundleId: 'com.example.app',
          nestedBundleIds: ['com.example.share'],
        },
      ],
      issues: [],
    });
  });
});
