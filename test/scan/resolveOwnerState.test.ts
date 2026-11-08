import { describe, expect, test } from 'bun:test';
import type { CatalogOwner } from '../../src/catalog/catalogOwner.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import { win32Platform } from '../../src/platform/win32/win32Platform.js';
import type { RemovalOwner } from '../../src/scan/candidate.js';
import type { OwnerState } from '../../src/scan/resolveOwnerState.js';
import {
  findOwnerAppName,
  findOwnerBundlePaths,
  findRemovalOwner,
  isAppleBundleId,
  isBundleIdShape,
  isOwnerUninstalled,
  parseBundleIdShapedName,
  resolveRemovalOwnerState,
  resolveTargetOwner,
} from '../../src/scan/resolveOwnerState.js';
import type { InstalledApp, SystemApp } from '../../src/scan/scanPlatform.js';
import type { RunningProcesses } from '../../src/system/systemPlatform.js';
import { buildTestCatalogEntry } from '../support/candidateFixtures.js';
import {
  exampleDarwinEnvironment,
  exampleWin32Environment,
} from '../support/environmentFixtures.js';
import { buildTestInstalledApp } from '../support/installedAppFixtures.js';
import {
  buildTestCatalogOwner,
  buildTestMacBundleId,
  buildTestWindowsImageName,
  buildTestWindowsPath,
} from '../support/parsedValueFixtures.js';
import {
  buildRunningCommandLines,
  buildRunningImagePaths,
} from '../support/runningProcessesFixtures.js';
import { getCatalogEntry } from '../support/scanRunFixtures.js';

/** VS Code as a Windows program: its image name, and its install folder below LocalAppData. */
const codeOwner: CatalogOwner = {
  kind: 'executable',
  imageNames: [buildTestWindowsImageName({ text: 'Code.exe' })],
  installFolder: { root: 'localAppData', path: 'Programs/Microsoft VS Code' },
};

/**
 * The state of `owner` as the scan decides it: its removal owner, then whether it runs among
 * `runningProcesses`, which is `null` when the processes could not be listed.
 */
function resolveOwnerStateOf(params: {
  owner: CatalogOwner | null;
  environment: Environment;
  installedApps: InstalledApp[];
  systemApps: SystemApp[];
  runningProcesses: RunningProcesses | null;
}): OwnerState {
  return resolveRemovalOwnerState({
    owner: findRemovalOwner({
      owner: params.owner,
      environment: params.environment,
      installedApps: params.installedApps,
      systemApps: params.systemApps,
    }),
    pathRules: params.environment.pathRules,
    runningProcesses: params.runningProcesses,
  });
}

/**
 * The state of the owner of `Library/Caches/foo`, a child of a `children` entry, while `Foo.app`,
 * whose Info.plist names an empty id, is the one installed app.
 */
function resolveFooCacheOwnerState(params: { commandLines: string[] | null }): OwnerState {
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

  return resolveOwnerStateOf({
    owner: owner,
    environment: exampleDarwinEnvironment,
    installedApps: [foo],
    systemApps: [],
    runningProcesses: buildRunningCommandLines(params.commandLines),
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

/** The state of `codeOwner` while the processes of `processImagePaths` run on Windows. */
function resolveCodeOwnerState(params: { processImagePaths: string[] | null }): OwnerState {
  return resolveOwnerStateOf({
    owner: codeOwner,
    environment: exampleWin32Environment,
    installedApps: [],
    systemApps: [],
    runningProcesses: buildRunningImagePaths(params.processImagePaths),
  });
}

describe('isBundleIdShape', () => {
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

describe('parseBundleIdShapedName', () => {
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

describe('isAppleBundleId', () => {
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

describe('resolveTargetOwner', () => {
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

  test('takes the owner a children entry names, so a running Teams withholds its caches', () => {
    const owner = resolveTargetOwner({
      entry: getCatalogEntry('teams-cache', win32Platform.catalog),
      path: 'C:\\Users\\tester\\AppData\\Local\\Packages\\MSTeams_8wekyb3d8bbwe\\LocalCache\\Microsoft\\MSTeams\\EBWebView',
      installedApps: [],
    });

    expect(owner).toEqual({
      kind: 'executable',
      imageNames: [
        buildTestWindowsImageName({ text: 'ms-teams.exe' }),
        buildTestWindowsImageName({ text: 'ms-teamsupdate.exe' }),
        buildTestWindowsImageName({ text: 'msteams_autostarter.exe' }),
      ],
      installFolder: null,
    });
    expect(
      resolveOwnerStateOf({
        owner: owner,
        environment: exampleWin32Environment,
        installedApps: [],
        systemApps: [],
        runningProcesses: buildRunningImagePaths([
          'C:\\Program Files\\WindowsApps\\MSTeams_25000.0.0.0_x64__8wekyb3d8bbwe\\ms-teams.exe',
        ]),
      }),
    ).toBe('running');
    expect(
      resolveOwnerStateOf({
        owner: owner,
        environment: exampleWin32Environment,
        installedApps: [],
        systemApps: [],
        runningProcesses: buildRunningImagePaths(['C:\\Windows\\explorer.exe']),
      }),
    ).toBe('stopped');
  });

  test('names no owner on a macOS children entry, whose children own themselves by their names', () => {
    expect(
      darwinPlatform.catalog.entries
        .filter((entry) => entry.selection.kind === 'children' && entry.owner !== null)
        .map((entry) => entry.id),
    ).toEqual([]);
  });
});

describe('resolveRemovalOwnerState', () => {
  const bundlesOwner: RemovalOwner = { kind: 'bundles', bundlePaths: ['/Applications/Slack.app'] };
  // An owner whose bundle no app carries.
  const unbundledOwner: RemovalOwner = { kind: 'bundles', bundlePaths: [] };
  const executableOwner: RemovalOwner = {
    kind: 'executable',
    imageNames: [buildTestWindowsImageName({ text: 'Code.exe' })],
    installFolderPath: null,
  };

  test('is stopped for no owner, whatever the processes', () => {
    for (const runningProcesses of [
      null,
      buildRunningCommandLines([]),
      buildRunningImagePaths(['C:\\Tools\\Code.exe']),
    ]) {
      expect(
        resolveRemovalOwnerState({
          owner: { kind: 'none' },
          pathRules: exampleDarwinEnvironment.pathRules,
          runningProcesses: runningProcesses,
        }),
      ).toBe('stopped');
    }
  });

  test('is unknown for any owner while the processes could not be listed', () => {
    for (const owner of [bundlesOwner, unbundledOwner, executableOwner]) {
      expect(
        resolveRemovalOwnerState({
          owner: owner,
          pathRules: exampleWin32Environment.pathRules,
          runningProcesses: null,
        }),
      ).toBe('unknown');
    }
  });

  test('stops an owner whose bundle no app carries once the processes are known', () => {
    expect(
      resolveRemovalOwnerState({
        owner: unbundledOwner,
        pathRules: exampleDarwinEnvironment.pathRules,
        runningProcesses: buildRunningCommandLines([
          '/Applications/Slack.app/Contents/MacOS/Slack',
        ]),
      }),
    ).toBe('stopped');
  });

  test('runs a bundle owner while a process runs from its bundle, and stops it otherwise', () => {
    expect(
      resolveRemovalOwnerState({
        owner: bundlesOwner,
        pathRules: exampleDarwinEnvironment.pathRules,
        runningProcesses: buildRunningCommandLines([
          '/Applications/Slack.app/Contents/MacOS/Slack',
        ]),
      }),
    ).toBe('running');
    expect(
      resolveRemovalOwnerState({
        owner: bundlesOwner,
        pathRules: exampleDarwinEnvironment.pathRules,
        runningProcesses: buildRunningCommandLines(['/Applications/Slack2.app/Contents/MacOS/S']),
      }),
    ).toBe('stopped');
  });

  test('is unknown for a bundle owner beside the images of Windows, which never meet one', () => {
    expect(
      resolveRemovalOwnerState({
        owner: bundlesOwner,
        pathRules: exampleWin32Environment.pathRules,
        runningProcesses: buildRunningImagePaths(['C:\\Windows\\explorer.exe']),
      }),
    ).toBe('unknown');
  });

  test('is unknown for a Windows program owner beside the command lines of macOS, which never meet one', () => {
    expect(
      resolveRemovalOwnerState({
        owner: executableOwner,
        pathRules: exampleDarwinEnvironment.pathRules,
        runningProcesses: buildRunningCommandLines(['/usr/local/bin/Code.exe']),
      }),
    ).toBe('unknown');
  });

  test('runs a Windows program owner whose image name differs only by case', () => {
    expect(
      resolveRemovalOwnerState({
        owner: executableOwner,
        pathRules: exampleWin32Environment.pathRules,
        runningProcesses: buildRunningImagePaths(['C:\\Tools\\CODE.EXE']),
      }),
    ).toBe('running');
  });
});

describe('findRemovalOwner', () => {
  test('is no owner for a path without one', () => {
    expect(
      findRemovalOwner({
        owner: null,
        environment: exampleDarwinEnvironment,
        installedApps: [],
        systemApps: [],
      }),
    ).toEqual({ kind: 'none' });
  });

  test('is the bundles that carry the id of a bundle owner', () => {
    const slack = buildTestInstalledApp({
      bundlePath: '/Applications/Slack.app',
      bundleId: 'com.example.slack',
    });

    expect(
      findRemovalOwner({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.slack' }),
        environment: exampleDarwinEnvironment,
        installedApps: [slack],
        systemApps: [],
      }),
    ).toEqual({ kind: 'bundles', bundlePaths: ['/Applications/Slack.app'] });
  });

  test('is the program of an executable owner, its install folder resolved', () => {
    expect(
      findRemovalOwner({
        owner: codeOwner,
        environment: exampleWin32Environment,
        installedApps: [],
        systemApps: [],
      }),
    ).toEqual({
      kind: 'executable',
      imageNames: [buildTestWindowsImageName({ text: 'Code.exe' })],
      installFolderPath: buildTestWindowsPath({
        text: 'C:\\Users\\tester\\AppData\\Local\\Programs\\Microsoft VS Code',
      }),
    });
  });
});

describe('findOwnerBundlePaths', () => {
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

describe('findOwnerAppName', () => {
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

describe('isOwnerUninstalled', () => {
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

describe('the state of a bundle owner', () => {
  const slack = buildTestInstalledApp({
    bundlePath: '/Applications/Slack.app',
    bundleId: 'com.example.slack',
    nestedBundleIds: ['com.example.slack.helper'],
  });

  test('an entry without owner counts as stopped', () => {
    expect(
      resolveOwnerStateOf({
        owner: buildTestCatalogOwner({ bundleId: null }),
        environment: exampleDarwinEnvironment,
        installedApps: [slack],
        systemApps: [],
        runningProcesses: buildRunningCommandLines(null),
      }),
    ).toBe('stopped');
  });

  test('any owner is unknown while the process list is missing, installed or not', () => {
    expect(
      resolveOwnerStateOf({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.slack' }),
        environment: exampleDarwinEnvironment,
        installedApps: [slack],
        systemApps: [],
        runningProcesses: buildRunningCommandLines(null),
      }),
    ).toBe('unknown');
    expect(
      resolveOwnerStateOf({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.gone' }),
        environment: exampleDarwinEnvironment,
        installedApps: [slack],
        systemApps: [],
        runningProcesses: buildRunningCommandLines(null),
      }),
    ).toBe('unknown');
  });

  test('an owner no installed app carries counts as stopped', () => {
    expect(
      resolveOwnerStateOf({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.gone' }),
        environment: exampleDarwinEnvironment,
        installedApps: [slack],
        systemApps: [],
        runningProcesses: buildRunningCommandLines([
          '/Applications/Slack.app/Contents/MacOS/Slack',
        ]),
      }),
    ).toBe('stopped');
  });

  test('a process inside the bundle marks the owner running', () => {
    expect(
      resolveOwnerStateOf({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.slack' }),
        environment: exampleDarwinEnvironment,
        installedApps: [slack],
        systemApps: [],
        runningProcesses: buildRunningCommandLines([
          '/sbin/launchd',
          '/Applications/Slack.app/Contents/MacOS/Slack --flag',
        ]),
      }),
    ).toBe('running');
  });

  test('a nested bundle id maps to its app', () => {
    expect(
      resolveOwnerStateOf({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.slack.helper' }),
        environment: exampleDarwinEnvironment,
        installedApps: [slack],
        systemApps: [],
        runningProcesses: buildRunningCommandLines([
          '/Applications/Slack.app/Contents/Frameworks/Helper.app/Contents/MacOS/H',
        ]),
      }),
    ).toBe('running');
  });

  test('a bundle whose path only shares a prefix does not count', () => {
    expect(
      resolveOwnerStateOf({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.slack' }),
        environment: exampleDarwinEnvironment,
        installedApps: [slack],
        systemApps: [],
        runningProcesses: buildRunningCommandLines([
          '/Applications/Slack.app.old/Contents/MacOS/Slack',
        ]),
      }),
    ).toBe('stopped');
  });

  test('an app with an empty bundle id runs as the owner of a child named like it', () => {
    expect(
      resolveFooCacheOwnerState({ commandLines: ['/Applications/Foo.app/Contents/MacOS/Foo'] }),
    ).toBe('running');
  });

  test('an app with an empty bundle id owns a child named like it while the process list is missing', () => {
    expect(resolveFooCacheOwnerState({ commandLines: null })).toBe('unknown');
  });

  test('any of several copies of the app running marks it running', () => {
    const copy = buildTestInstalledApp({
      bundlePath: '/Users/tester/Applications/Slack.app',
      bundleId: 'com.example.slack',
    });

    expect(
      resolveOwnerStateOf({
        owner: buildTestCatalogOwner({ bundleId: 'com.example.slack' }),
        environment: exampleDarwinEnvironment,
        installedApps: [slack, copy],
        systemApps: [],
        runningProcesses: buildRunningCommandLines([
          '/Users/tester/Applications/Slack.app/Contents/MacOS/Slack',
        ]),
      }),
    ).toBe('running');
  });
});

describe('a system app owner', () => {
  const notes: SystemApp = {
    bundlePath: '/fixture/System/Applications/Notes.app',
    displayName: 'Notes',
    bundleId: buildTestMacBundleId({ text: 'com.example.notes' }),
  };
  const notesOwner = buildTestCatalogOwner({ bundleId: 'com.example.notes' });
  const notesCommand = '/fixture/System/Applications/Notes.app/Contents/MacOS/Notes';

  test('runs from the bundle the platform names, though no app folder lists it', () => {
    expect(
      resolveOwnerStateOf({
        owner: notesOwner,
        environment: exampleDarwinEnvironment,
        installedApps: [],
        systemApps: [notes],
        runningProcesses: buildRunningCommandLines([notesCommand]),
      }),
    ).toBe('running');
    expect(
      resolveOwnerStateOf({
        owner: notesOwner,
        environment: exampleDarwinEnvironment,
        installedApps: [],
        systemApps: [notes],
        runningProcesses: buildRunningCommandLines(['/sbin/launchd']),
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
        resolveOwnerStateOf({
          owner: resolveCatalogEntryOwner({ id: id }),
          environment: exampleDarwinEnvironment,
          installedApps: [],
          systemApps: darwinPlatform.scan.systemApps,
          runningProcesses: buildRunningCommandLines([command]),
        }),
      ),
    ).toEqual(['running', 'running', 'running', 'running']);
  });
});

describe('a bundle id family owner', () => {
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
      resolveOwnerStateOf({
        owner: owner,
        environment: exampleDarwinEnvironment,
        installedApps: installedApps,
        systemApps: [],
        runningProcesses: buildRunningCommandLines([
          '/Applications/Adobe Premiere Pro 2025/Adobe Premiere Pro 2025.app/Contents/MacOS/Adobe Premiere Pro 2025',
        ]),
      }),
    ).toBe('running');
  });

  test('a running Creative Cloud helper leaves the owner stopped, though it nests a lookalike id', () => {
    expect(
      resolveOwnerStateOf({
        owner: owner,
        environment: exampleDarwinEnvironment,
        installedApps: installedApps,
        systemApps: [],
        runningProcesses: buildRunningCommandLines([
          '/Applications/Utilities/Adobe Creative Cloud/ACC/Creative Cloud.app/Contents/MacOS/Creative Cloud',
          '/Applications/Amex.app/Contents/MacOS/Amex',
        ]),
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

describe('the state of a Windows program owner', () => {
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
      findOwnerBundlePaths({ owner: codeOwner, installedApps: [codeBundle], systemApps: [] }),
    ).toEqual([]);
    expect(
      findOwnerAppName({ owner: codeOwner, installedApps: [codeBundle], systemApps: [] }),
    ).toBeNull();
    expect(
      isOwnerUninstalled({
        owner: codeOwner,
        installedApps: [],
        systemApps: [],
        isInstalledAppListComplete: true,
      }),
    ).toBe(false);
  });
});
