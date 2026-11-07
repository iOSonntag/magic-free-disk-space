import { afterEach, beforeEach, expect, test } from 'bun:test';
import { chmod, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadInstalledApps } from '../../../src/platform/darwin/loadInstalledApps.js';
import { loadPlistProductVersion } from '../../../src/platform/darwin/loadSystemVersion.js';
import { SYSTEM_COMMAND_TIMEOUT_MS } from '../../../src/system/limits.js';
import { describeAwaitingWin32Platform } from '../../support/awaitsWin32Platform.js';
import type { FixtureRoot } from '../../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureRoot,
  deleteFixtureRoot,
} from '../../support/fixtureRoot.js';
import { buildTestMacBundleId } from '../../support/parsedValueFixtures.js';
import { testOnPosix } from '../../support/posixOnly.js';

/** A fixture bundle is no installer, and the user running the test owns it. */
const FIXTURE_APP_FACTS = { builtForSystemVersion: null, ownerUid: process.getuid?.() ?? null };

function buildInfoPlistText(params: {
  bundleId: string;
  platformVersion?: string | undefined;
}): string {
  const platformVersionLines =
    params.platformVersion === undefined
      ? ''
      : `<key>DTPlatformVersion</key>\n<string>${params.platformVersion}</string>\n`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
<key>CFBundleIdentifier</key>
<string>${params.bundleId}</string>
${platformVersionLines}</dict>
</plist>
`;
}

async function createFixtureBundle(params: {
  bundlePath: string;
  bundleId: string;
  platformVersion?: string;
}): Promise<void> {
  const contentsPath = join(params.bundlePath, 'Contents');

  await createFixtureDirectory({ path: contentsPath });
  await writeFile(
    join(contentsPath, 'Info.plist'),
    buildInfoPlistText({ bundleId: params.bundleId, platformVersion: params.platformVersion }),
  );
}

describeAwaitingWin32Platform('loadInstalledApps', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  testOnPosix('reads an iOS app on a Mac through its wrapped bundle', async () => {
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
      commandTimeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
    });

    expect(result.issues).toEqual([]);
    expect(result.apps).toEqual([
      {
        bundlePath: wrapperPath,
        displayName: 'Pocket',
        bundleId: buildTestMacBundleId({ text: 'com.example.pocket' }),
        nestedBundleIds: [buildTestMacBundleId({ text: 'com.example.pocket.widget' })],
        ...FIXTURE_APP_FACTS,
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
      commandTimeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
    });

    expect(result).toEqual({
      apps: [
        {
          bundlePath: examplePath,
          displayName: 'Example',
          bundleId: buildTestMacBundleId({ text: 'com.example.app' }),
          nestedBundleIds: [buildTestMacBundleId({ text: 'com.example.share' })],
          ...FIXTURE_APP_FACTS,
        },
        {
          bundlePath: join(applicationDir, 'Loud.APP'),
          displayName: 'Loud',
          bundleId: buildTestMacBundleId({ text: 'com.example.loud' }),
          nestedBundleIds: [],
          ...FIXTURE_APP_FACTS,
        },
        {
          bundlePath: join(applicationDir, 'Utilities', 'Helper.app'),
          displayName: 'Helper',
          bundleId: buildTestMacBundleId({ text: 'com.example.helper' }),
          nestedBundleIds: [],
          ...FIXTURE_APP_FACTS,
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
      commandTimeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
    });

    expect(result).toEqual({
      apps: [
        {
          bundlePath: brokenPath,
          displayName: 'Broken',
          bundleId: null,
          nestedBundleIds: [],
          ...FIXTURE_APP_FACTS,
        },
      ],
      issues: [{ path: brokenPath, reason: 'commandFailed', detail: 'exitedWithError' }],
    });
  });

  test('an app whose Info.plist names an empty id keeps the empty id', async () => {
    const fooPath = join(fixtureRoot.applicationDir, 'Foo.app');

    await createFixtureBundle({ bundlePath: fooPath, bundleId: '' });

    const result = await loadInstalledApps({
      appDirs: [fixtureRoot.applicationDir],
      commandTimeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
    });

    expect(result).toEqual({
      apps: [
        {
          bundlePath: fooPath,
          displayName: 'Foo',
          bundleId: buildTestMacBundleId({ text: '' }),
          nestedBundleIds: [],
          ...FIXTURE_APP_FACTS,
        },
      ],
      issues: [],
    });
  });

  test('a missing app folder adds no apps and no issues', async () => {
    const result = await loadInstalledApps({
      appDirs: [join(fixtureRoot.rootDir, 'Missing')],
      commandTimeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
    });

    expect(result).toEqual({ apps: [], issues: [] });
  });

  testOnPosix('an unreadable app folder gives an issue; other folders are still read', async () => {
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
      commandTimeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
    });

    expect(result.issues).toEqual([
      { path: lockedDir, reason: 'permissionDenied', detail: 'EACCES' },
    ]);
    expect(result.apps.map((app) => app.displayName)).toEqual(['Example']);
  });

  testOnPosix(
    'an unreadable vendor folder gives an issue and its siblings are listed',
    async () => {
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
        commandTimeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
      });

      expect(result.issues).toEqual([
        { path: vendorPath, reason: 'permissionDenied', detail: 'EACCES' },
      ]);
      expect(result.apps.map((app) => app.displayName)).toEqual(['Example']);
    },
  );

  testOnPosix('a symbolic link named like an app is listed and its id counts', async () => {
    const targetPath = join(fixtureRoot.rootDir, 'Real.app');
    const linkPath = join(fixtureRoot.applicationDir, 'Linked.app');

    await createFixtureBundle({ bundlePath: targetPath, bundleId: 'com.example.real' });
    await symlink(targetPath, linkPath);

    const result = await loadInstalledApps({
      appDirs: [fixtureRoot.applicationDir],
      commandTimeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
    });

    expect(result).toEqual({
      apps: [
        {
          bundlePath: linkPath,
          displayName: 'Linked',
          bundleId: buildTestMacBundleId({ text: 'com.example.real' }),
          nestedBundleIds: [],
          ...FIXTURE_APP_FACTS,
        },
      ],
      issues: [],
    });
  });

  testOnPosix('a symbolic link to a folder of apps is not followed', async () => {
    const realVendorPath = join(fixtureRoot.rootDir, 'RealVendor');

    await createFixtureBundle({
      bundlePath: join(realVendorPath, 'Inner.app'),
      bundleId: 'com.example.inner',
    });
    await symlink(realVendorPath, join(fixtureRoot.applicationDir, 'LinkedVendor'));

    const result = await loadInstalledApps({
      appDirs: [fixtureRoot.applicationDir],
      commandTimeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
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
      commandTimeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
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
      commandTimeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
    });

    expect(result).toEqual({
      apps: [
        {
          bundlePath: examplePath,
          displayName: 'Example',
          bundleId: buildTestMacBundleId({ text: 'com.example.app' }),
          nestedBundleIds: [
            buildTestMacBundleId({ text: 'com.example.near' }),
            buildTestMacBundleId({ text: 'com.example.share' }),
          ],
          ...FIXTURE_APP_FACTS,
        },
      ],
      issues: [],
    });
  });

  testOnPosix('nested bundles without an Info.plist or behind a link add nothing', async () => {
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
      commandTimeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
    });

    expect(result).toEqual({
      apps: [
        {
          bundlePath: examplePath,
          displayName: 'Example',
          bundleId: buildTestMacBundleId({ text: 'com.example.app' }),
          nestedBundleIds: [buildTestMacBundleId({ text: 'com.example.share' })],
          ...FIXTURE_APP_FACTS,
        },
      ],
      issues: [],
    });
  });

  test('reads the release a macOS installer installs, by its bundle id alone', async () => {
    const installerPath = join(fixtureRoot.applicationDir, 'Install macOS Sequoia.app');
    const otherPath = join(fixtureRoot.applicationDir, 'Install Something.app');

    await createFixtureBundle({
      bundlePath: installerPath,
      bundleId: 'com.apple.InstallAssistant',
      platformVersion: '15.6',
    });
    await createFixtureBundle({
      bundlePath: otherPath,
      bundleId: 'com.example.installer',
      platformVersion: '15.6',
    });

    const result = await loadInstalledApps({
      appDirs: [fixtureRoot.applicationDir],
      commandTimeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
    });

    expect(result.issues).toEqual([]);
    expect(
      result.apps.map((app) => ({
        displayName: app.displayName,
        builtForSystemVersion: app.builtForSystemVersion,
      })),
    ).toEqual([
      { displayName: 'Install Something', builtForSystemVersion: null },
      { displayName: 'Install macOS Sequoia', builtForSystemVersion: '15.6' },
    ]);
  });

  test('an installer without a platform version has none, so it is never offered', async () => {
    await createFixtureBundle({
      bundlePath: join(fixtureRoot.applicationDir, 'Install macOS Old.app'),
      bundleId: 'com.apple.InstallAssistant',
    });

    const result = await loadInstalledApps({
      appDirs: [fixtureRoot.applicationDir],
      commandTimeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
    });

    expect(result.apps.map((app) => app.builtForSystemVersion)).toEqual([null]);
  });
});

describeAwaitingWin32Platform('loadPlistProductVersion', () => {
  testOnPosix('reads the product version of a plist, and null for none or no file', async () => {
    const fixtureRoot = await createFixtureRoot();

    try {
      const plistPath = join(fixtureRoot.rootDir, 'SystemVersion.plist');
      const emptyPlistPath = join(fixtureRoot.rootDir, 'Empty.plist');

      await writeFile(
        plistPath,
        '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n<key>ProductVersion</key>\n<string>26.2</string>\n</dict>\n</plist>\n',
      );
      await writeFile(
        emptyPlistPath,
        '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n</dict>\n</plist>\n',
      );

      expect(await loadPlistProductVersion({ plistPath: plistPath })).toBe('26.2');
      expect(await loadPlistProductVersion({ plistPath: emptyPlistPath })).toBeNull();
      expect(
        await loadPlistProductVersion({ plistPath: join(fixtureRoot.rootDir, 'Missing.plist') }),
      ).toBeNull();
    } finally {
      await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
    }
  });
});
