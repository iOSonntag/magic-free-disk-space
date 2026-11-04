import { describe, expect, test } from 'bun:test';
import type { CatalogOwner } from '../../src/catalog/catalogOwner.js';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import type { OwnerState } from '../../src/scan/resolveOwnerState.js';
import {
  findOwnerAppName,
  findOwnerBundlePaths,
  isAppleBundleId,
  isBundleIdShape,
  isOwnerUninstalled,
  parseBundleIdShapedName,
  resolveOwnerState,
  resolveTargetOwner,
} from '../../src/scan/resolveOwnerState.js';
import type { SystemApp } from '../../src/scan/scanPlatform.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { buildTestCatalogEntry } from '../support/candidateFixtures.js';
import {
  EXAMPLE_DARWIN_ENVIRONMENT,
  EXAMPLE_WIN32_ENVIRONMENT,
} from '../support/environmentFixtures.js';
import { buildTestInstalledApp } from '../support/installedAppFixtures.js';
import {
  buildTestCatalogOwner,
  buildTestMacBundleId,
  buildTestWindowsImageName,
} from '../support/parsedValueFixtures.js';
import { getCatalogEntry } from '../support/scanRunFixtures.js';

/** VS Code as a Windows program: its image name, and its install folder below LocalAppData. */
const CODE_OWNER: CatalogOwner = {
  kind: 'executable',
  imageNames: [buildTestWindowsImageName({ text: 'Code.exe' })],
  installFolder: { root: 'localAppData', path: 'Programs/Microsoft VS Code' },
};

/**
 * The state of the owner of `Library/Caches/foo`, a child of a `children` entry, while `Foo.app`,
 * whose Info.plist names an empty id, is the one installed app.
 */
function resolveFooCacheOwnerState(params: { processCommands: string[] | null }): OwnerState {
  const foo = buildTestInstalledApp({
    bundlePath: '/Applications/Foo.app',
    displayName: 'Foo',
    bundleId: '',
  });
  const owner = resolveTargetOwner({
    entry: buildTestCatalogEntry({ selection: { kind: 'children' } }),
    path: '/home/Library/Caches/foo',
    installedApps: [foo],
  });

  return resolveOwnerState({
    owner: owner,
    environment: EXAMPLE_DARWIN_ENVIRONMENT,
    installedApps: [foo],
    systemApps: [],
    processCommands: params.processCommands,
  });
}

/** The owner of the macOS catalog entry `id`, as the scan resolves it for the entry's own path. */
function resolveCatalogEntryOwner(params: { id: string }): CatalogOwner | null {
  return resolveTargetOwner({
    entry: getCatalogEntry(params.id),
    path: '/home/Library',
    installedApps: [],
  });
}

/** The state of `CODE_OWNER` while the processes of `processImagePaths` run on Windows. */
function resolveCodeOwnerState(params: { processImagePaths: string[] | null }): OwnerState {
  return resolveOwnerState({
    owner: CODE_OWNER,
    environment: EXAMPLE_WIN32_ENVIRONMENT,
    installedApps: [],
    systemApps: [],
    processCommands: params.processImagePaths,
  });
}

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

describeAwaitingWin32Platform('parseBundleIdShapedName', () => {
  test('takes a bundle-id-shaped name as it is', () => {
    expect(parseBundleIdShapedName({ name: 'com.example.app' })).toEqual(
      buildTestMacBundleId({ text: 'com.example.app' }),
    );
    expect(parseBundleIdShapedName({ name: 'group.com.apple.notes' })).toEqual(
      buildTestMacBundleId({ text: 'group.com.apple.notes' }),
    );
  });

  test('takes the team id off a team-prefixed name', () => {
    expect(parseBundleIdShapedName({ name: 'UBF8T346G9.com.microsoft.teams' })).toEqual(
      buildTestMacBundleId({ text: 'com.microsoft.teams' }),
    );
  });

  test('names no bundle id for a team-prefixed name without one', () => {
    expect(parseBundleIdShapedName({ name: 'UBF8T346G9.Office' })).toBeNull();
    expect(parseBundleIdShapedName({ name: 'Homebrew' })).toBeNull();
  });

  test('names no bundle id for a team-prefixed name whose rest is too short for one', () => {
    // The group folder of 1Password, whose app is `com.1password.1password`.
    expect(parseBundleIdShapedName({ name: '2BUA8C4S2C.com.1password' })).toBeNull();
  });

  test('keeps a lower-case first segment of ten characters as part of the id', () => {
    expect(parseBundleIdShapedName({ name: 'abcdefghij.example.app' })).toEqual(
      buildTestMacBundleId({ text: 'abcdefghij.example.app' }),
    );
  });
});

describeAwaitingWin32Platform('isAppleBundleId', () => {
  test('matches the com.apple. prefix and the group.com.apple. prefix only', () => {
    expect(isAppleBundleId({ bundleId: buildTestMacBundleId({ text: 'com.apple.Safari' }) })).toBe(
      true,
    );
    expect(
      isAppleBundleId({ bundleId: buildTestMacBundleId({ text: 'group.com.apple.notes' }) }),
    ).toBe(true);
    expect(
      isAppleBundleId({ bundleId: buildTestMacBundleId({ text: 'com.applesauce.app' }) }),
    ).toBe(false);
    expect(
      isAppleBundleId({ bundleId: buildTestMacBundleId({ text: 'group.com.example.app' }) }),
    ).toBe(false);
  });
});

describeAwaitingWin32Platform('resolveTargetOwner', () => {
  test('takes the owner of a path entry', () => {
    const entry = buildTestCatalogEntry({
      selection: { kind: 'path' },
      owner: {
        app: { kind: 'bundleId', bundleId: buildTestMacBundleId({ text: 'com.example.app' }) },
        uninstalledAdvice: null,
      },
    });

    expect(
      resolveTargetOwner({ entry: entry, path: '/home/Library/Caches/Test', installedApps: [] }),
    ).toEqual(buildTestCatalogOwner({ bundleId: 'com.example.app' }));
  });

  test('takes the child name of a children entry when it is a bundle id', () => {
    const entry = buildTestCatalogEntry({ selection: { kind: 'children' } });

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

  test('takes the bundle id of a team-prefixed child of a children entry', () => {
    const entry = buildTestCatalogEntry({ selection: { kind: 'children' } });

    expect(
      resolveTargetOwner({
        entry: entry,
        path: '/home/Library/Group Containers/UBF8T346G9.com.microsoft.teams',
        installedApps: [],
      }),
    ).toEqual(buildTestCatalogOwner({ bundleId: 'com.microsoft.teams' }));
  });

  test('takes the installed app named like a child, ignoring case', () => {
    const entry = buildTestCatalogEntry({ selection: { kind: 'children' } });
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
        systemApps: [],
      }),
    ).toEqual(['/Applications/A.app', '/Applications/B.app']);
    expect(
      findOwnerBundlePaths({
        owner: buildTestCatalogOwner({ bundleId: null }),
        installedApps: apps,
        systemApps: [],
      }),
    ).toEqual([]);
  });
});

describeAwaitingWin32Platform('findOwnerAppName', () => {
  const host = buildTestInstalledApp({
    bundlePath: '/Applications/Host.app',
    displayName: 'Host',
    bundleId: 'com.example.host',
    nestedBundleIds: ['com.example.helper'],
  });
  const helper = buildTestInstalledApp({
    bundlePath: '/Applications/Helper.app',
    displayName: 'Helper',
    bundleId: 'com.example.helper',
  });

  test('names the app of the id itself before an app that nests it', () => {
    expect(
      findOwnerAppName({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.helper' }),
        installedApps: [host, helper],
        systemApps: [],
      }),
    ).toBe('Helper');
  });

  test('names the app that nests the id when no app has it as its own', () => {
    expect(
      findOwnerAppName({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.helper' }),
        installedApps: [host],
        systemApps: [],
      }),
    ).toBe('Host');
  });

  test('names no app for no owner or an id no app carries', () => {
    expect(
      findOwnerAppName({
        owner: buildTestCatalogOwner({ bundleId: null }),
        installedApps: [host],
        systemApps: [],
      }),
    ).toBeNull();
    expect(
      findOwnerAppName({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.gone' }),
        installedApps: [host, helper],
        systemApps: darwinPlatform.scan.systemApps,
      }),
    ).toBeNull();
  });
});

describeAwaitingWin32Platform('isOwnerUninstalled', () => {
  const host = buildTestInstalledApp({
    bundlePath: '/Applications/Host.app',
    bundleId: 'com.example.host',
    nestedBundleIds: ['com.example.host.helper'],
  });

  test('is true for an owner no app of the complete list is, as app or as helper', () => {
    expect(
      ['com.example.gone', 'com.example.host', 'com.example.host.helper'].map((bundleId) =>
        isOwnerUninstalled({
          owner: buildTestCatalogOwner({ bundleId: bundleId }),
          installedApps: [host],
          systemApps: [],
          isInstalledAppListComplete: true,
        }),
      ),
    ).toEqual([true, false, false]);
  });

  test('is false for no owner, and while the list of installed apps is incomplete', () => {
    expect(
      isOwnerUninstalled({
        owner: buildTestCatalogOwner({ bundleId: null }),
        installedApps: [],
        systemApps: [],
        isInstalledAppListComplete: true,
      }),
    ).toBe(false);
    expect(
      isOwnerUninstalled({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.gone' }),
        installedApps: [host],
        systemApps: [],
        isInstalledAppListComplete: false,
      }),
    ).toBe(false);
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
        environment: EXAMPLE_DARWIN_ENVIRONMENT,
        installedApps: [slack],
        systemApps: [],
        processCommands: null,
      }),
    ).toBe('stopped');
  });

  test('any owner is unknown while the process list is missing, installed or not', () => {
    expect(
      resolveOwnerState({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.slack' }),
        environment: EXAMPLE_DARWIN_ENVIRONMENT,
        installedApps: [slack],
        systemApps: [],
        processCommands: null,
      }),
    ).toBe('unknown');
    expect(
      resolveOwnerState({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.gone' }),
        environment: EXAMPLE_DARWIN_ENVIRONMENT,
        installedApps: [slack],
        systemApps: [],
        processCommands: null,
      }),
    ).toBe('unknown');
  });

  test('an owner no installed app carries counts as stopped', () => {
    expect(
      resolveOwnerState({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.gone' }),
        environment: EXAMPLE_DARWIN_ENVIRONMENT,
        installedApps: [slack],
        systemApps: [],
        processCommands: ['/Applications/Slack.app/Contents/MacOS/Slack'],
      }),
    ).toBe('stopped');
  });

  test('a process inside the bundle marks the owner running', () => {
    expect(
      resolveOwnerState({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.slack' }),
        environment: EXAMPLE_DARWIN_ENVIRONMENT,
        installedApps: [slack],
        systemApps: [],
        processCommands: ['/sbin/launchd', '/Applications/Slack.app/Contents/MacOS/Slack --flag'],
      }),
    ).toBe('running');
  });

  test('a nested bundle id maps to its app', () => {
    expect(
      resolveOwnerState({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.slack.helper' }),
        environment: EXAMPLE_DARWIN_ENVIRONMENT,
        installedApps: [slack],
        systemApps: [],
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
        environment: EXAMPLE_DARWIN_ENVIRONMENT,
        installedApps: [slack],
        systemApps: [],
        processCommands: ['/Applications/Slack.app.old/Contents/MacOS/Slack'],
      }),
    ).toBe('stopped');
  });

  test('an app with an empty bundle id runs as the owner of a child named like it', () => {
    expect(
      resolveFooCacheOwnerState({ processCommands: ['/Applications/Foo.app/Contents/MacOS/Foo'] }),
    ).toBe('running');
  });

  test('an app with an empty bundle id owns a child named like it while the process list is missing', () => {
    expect(resolveFooCacheOwnerState({ processCommands: null })).toBe('unknown');
  });

  test('any of several copies of the app running marks it running', () => {
    const copy = buildTestInstalledApp({
      bundlePath: '/Users/tester/Applications/Slack.app',
      bundleId: 'com.example.slack',
    });

    expect(
      resolveOwnerState({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.slack' }),
        environment: EXAMPLE_DARWIN_ENVIRONMENT,
        installedApps: [slack, copy],
        systemApps: [],
        processCommands: ['/Users/tester/Applications/Slack.app/Contents/MacOS/Slack'],
      }),
    ).toBe('running');
  });
});

describeAwaitingWin32Platform('a system app owner', () => {
  const notes: SystemApp = {
    bundlePath: '/fixture/System/Applications/Notes.app',
    displayName: 'Notes',
    bundleId: buildTestMacBundleId({ text: 'com.example.notes' }),
  };
  const notesOwner = buildTestCatalogOwner({ bundleId: 'com.example.notes' });
  const notesCommand = '/fixture/System/Applications/Notes.app/Contents/MacOS/Notes';

  test('runs from the bundle the platform names, though no app folder lists it', () => {
    expect(
      resolveOwnerState({
        owner: notesOwner,
        environment: EXAMPLE_DARWIN_ENVIRONMENT,
        installedApps: [],
        systemApps: [notes],
        processCommands: [notesCommand],
      }),
    ).toBe('running');
    expect(
      resolveOwnerState({
        owner: notesOwner,
        environment: EXAMPLE_DARWIN_ENVIRONMENT,
        installedApps: [],
        systemApps: [notes],
        processCommands: ['/sbin/launchd'],
      }),
    ).toBe('stopped');
  });

  test('gives its bundle to the removal after the installed bundles, and never counts as uninstalled', () => {
    const notesCopy = buildTestInstalledApp({
      bundlePath: '/Applications/Notes.app',
      bundleId: 'com.example.notes',
    });

    expect(
      findOwnerBundlePaths({ owner: notesOwner, installedApps: [notesCopy], systemApps: [notes] }),
    ).toEqual(['/Applications/Notes.app', notes.bundlePath]);
    expect(
      isOwnerUninstalled({
        owner: notesOwner,
        installedApps: [],
        systemApps: [notes],
        isInstalledAppListComplete: true,
      }),
    ).toBe(false);
  });

  test('names the system app that is the owner after the installed apps', () => {
    const notesCopy = buildTestInstalledApp({
      bundlePath: '/Applications/Notes Copy.app',
      displayName: 'Notes Copy',
      bundleId: 'com.example.notes',
    });

    expect(findOwnerAppName({ owner: notesOwner, installedApps: [], systemApps: [notes] })).toBe(
      'Notes',
    );
    expect(
      findOwnerAppName({ owner: notesOwner, installedApps: [notesCopy], systemApps: [notes] }),
    ).toBe('Notes Copy');
  });

  test('holds the Messages caches and the Mail downloads of macOS while their app runs', () => {
    const ownerRuns: [string, string][] = [
      ['messages-attachment-previews', '/System/Applications/Messages.app/Contents/MacOS/Messages'],
      ['messages-sticker-previews', '/System/Applications/Messages.app/Contents/MacOS/Messages'],
      ['messages-sticker-cache', '/System/Applications/Messages.app/Contents/MacOS/Messages'],
      ['mail-downloads', '/System/Applications/Mail.app/Contents/MacOS/Mail'],
    ];

    expect(
      ownerRuns.map(([id, command]) =>
        resolveOwnerState({
          owner: resolveCatalogEntryOwner({ id: id }),
          environment: EXAMPLE_DARWIN_ENVIRONMENT,
          installedApps: [],
          systemApps: darwinPlatform.scan.systemApps,
          processCommands: [command],
        }),
      ),
    ).toEqual(['running', 'running', 'running', 'running']);
  });
});

describeAwaitingWin32Platform('a bundle id family owner', () => {
  const owner: CatalogOwner = {
    kind: 'bundleIdFamily',
    bundleIdPrefixes: ['com.adobe.PremierePro', 'com.adobe.ame'],
  };
  const premiere = buildTestInstalledApp({
    bundlePath: '/Applications/Adobe Premiere Pro 2025/Adobe Premiere Pro 2025.app',
    displayName: 'Adobe Premiere Pro 2025',
    bundleId: 'com.adobe.PremierePro.25',
  });
  const creativeCloud = buildTestInstalledApp({
    bundlePath: '/Applications/Utilities/Adobe Creative Cloud/ACC/Creative Cloud.app',
    displayName: 'Creative Cloud',
    bundleId: 'com.adobe.acc.AdobeCreativeCloud',
    nestedBundleIds: ['com.adobe.ame.helper', 'com.adobe.ccxprocess', 'com.adobe.CoreSync'],
  });
  const lookalike = buildTestInstalledApp({
    bundlePath: '/Applications/Amex.app',
    displayName: 'Amex',
    bundleId: 'com.adobe.amex',
  });
  const installedApps = [premiere, creativeCloud, lookalike];

  test('a running member of the family marks the owner running', () => {
    expect(
      resolveOwnerState({
        owner: owner,
        environment: EXAMPLE_DARWIN_ENVIRONMENT,
        installedApps: installedApps,
        systemApps: [],
        processCommands: [
          '/Applications/Adobe Premiere Pro 2025/Adobe Premiere Pro 2025.app/Contents/MacOS/Adobe Premiere Pro 2025',
        ],
      }),
    ).toBe('running');
  });

  test('a running Creative Cloud helper leaves the owner stopped, though it nests a lookalike id', () => {
    expect(
      resolveOwnerState({
        owner: owner,
        environment: EXAMPLE_DARWIN_ENVIRONMENT,
        installedApps: installedApps,
        systemApps: [],
        processCommands: [
          '/Applications/Utilities/Adobe Creative Cloud/ACC/Creative Cloud.app/Contents/MacOS/Creative Cloud',
          '/Applications/Amex.app/Contents/MacOS/Amex',
        ],
      }),
    ).toBe('stopped');
  });

  test('lists and names only the apps whose own id continues a prefix after a dot', () => {
    expect(
      findOwnerBundlePaths({ owner: owner, installedApps: installedApps, systemApps: [] }),
    ).toEqual([premiere.bundlePath]);
    expect(findOwnerAppName({ owner: owner, installedApps: installedApps, systemApps: [] })).toBe(
      'Adobe Premiere Pro 2025',
    );
  });
});

describe('resolveOwnerState of a Windows program', () => {
  test('is unknown while the process list is missing', () => {
    expect(resolveCodeOwnerState({ processImagePaths: null })).toBe('unknown');
  });

  test('runs while a process runs from the install folder below LocalAppData', () => {
    expect(
      resolveCodeOwnerState({
        processImagePaths: [
          'C:\\Users\\tester\\AppData\\Local\\Programs\\Microsoft VS Code\\resources\\helper.exe',
        ],
      }),
    ).toBe('running');
  });

  test('runs while a process carries its image name, wherever it runs from', () => {
    expect(resolveCodeOwnerState({ processImagePaths: ['D:\\Portable\\VSCode\\code.exe'] })).toBe(
      'running',
    );
  });

  test('is stopped while no process carries its image name or runs from its folder', () => {
    expect(
      resolveCodeOwnerState({
        processImagePaths: [
          'C:\\Windows\\explorer.exe',
          'C:\\Users\\tester\\AppData\\Local\\Programs\\Microsoft VS Code Insiders\\helper.exe',
        ],
      }),
    ).toBe('stopped');
  });
});

describe('a Windows program owner beside the app bundles', () => {
  const codeBundle = buildTestInstalledApp({
    bundlePath: '/Applications/Code.app',
    displayName: 'Code',
    bundleId: 'com.example.code',
  });

  test('owns no bundle, names no app, and is never told uninstalled by the complete app list', () => {
    expect(
      findOwnerBundlePaths({ owner: CODE_OWNER, installedApps: [codeBundle], systemApps: [] }),
    ).toEqual([]);
    expect(
      findOwnerAppName({ owner: CODE_OWNER, installedApps: [codeBundle], systemApps: [] }),
    ).toBeNull();
    expect(
      isOwnerUninstalled({
        owner: CODE_OWNER,
        installedApps: [],
        systemApps: [],
        isInstalledAppListComplete: true,
      }),
    ).toBe(false);
  });
});
