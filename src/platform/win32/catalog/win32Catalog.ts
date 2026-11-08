import type { CatalogEntry } from '../../../catalog/catalog.js';
import type { ProjectArtifactRule, ProjectMarker } from '../../../catalog/projectArtifactRules.js';
import { PROJECT_ARTIFACT_RULES } from '../../../catalog/projectArtifactRules.js';
import type {
  EnvironmentLocation,
  EnvironmentLocationAtRoot,
} from '../../../environment/environmentLocation.js';
import type { ExplorePlatform } from '../../../explore/explorePlatform.js';
import type { UserFileRoot } from '../../../scan/scanPlatform.js';
import { WIN32_CATALOG_ENTRIES } from './catalogEntries.js';
import { WIN32_PROTECTED_LOCATIONS, WIN32_SENSITIVE_LOCATIONS } from './protectedPaths.js';

/** The data of Windows the run takes beside what it reads from the system. */
export type Win32Catalog = {
  /** The caches and leftovers the scan measures, each at its location. */
  entries: CatalogEntry[];
  /**
   * Root-like folders, the profile and the known folders among them, never removed as a whole,
   * while an entry below one may go, such as a browser's `User Data` with its cache inside.
   */
  protectedLocations: EnvironmentLocation[];
  /** Folders below the profile and the AppData folders never removed, neither whole nor in part. */
  sensitiveLocations: EnvironmentLocationAtRoot[];
  /** Folders right below the profile that the project search never enters. */
  projectSearchExcludedNames: string[];
  /** The build and dependency folders the project search offers. */
  projectArtifactRules: ProjectArtifactRule[];
  /** The folders searched for large files, each a known folder wherever the user moved it. */
  userFileRoots: UserFileRoot[];
  /** Where the Explore probes look on Windows. */
  explore: ExplorePlatform;
};

/** Any project file of .NET in C#, F#, or Visual Basic ends in one of these. */
const DOTNET_PROJECT_MARKERS: ProjectMarker[] = [
  { kind: 'fileSuffix', suffix: '.csproj' },
  { kind: 'fileSuffix', suffix: '.fsproj' },
  { kind: 'fileSuffix', suffix: '.vbproj' },
];

/** The data of Windows, each location as the tool that keeps it or Microsoft documents it. */
export const WIN32_CATALOG: Win32Catalog = {
  entries: WIN32_CATALOG_ENTRIES,
  protectedLocations: WIN32_PROTECTED_LOCATIONS,
  sensitiveLocations: WIN32_SENSITIVE_LOCATIONS,
  projectSearchExcludedNames: [
    '3D Objects',
    'AppData',
    'Contacts',
    'Favorites',
    'Links',
    'Music',
    'Pictures',
    'Saved Games',
    'Searches',
    'Videos',
  ],
  projectArtifactRules: [
    ...PROJECT_ARTIFACT_RULES,
    {
      artifactName: 'bin',
      markers: DOTNET_PROJECT_MARKERS,
      unmarkedFolder: 'walked',
      title: '.NET build output',
      explanation: 'Compiled output of a .NET project.',
      regeneration: 'Rebuilt by the next build.',
      risk: 'safe',
    },
    {
      artifactName: 'obj',
      markers: DOTNET_PROJECT_MARKERS,
      unmarkedFolder: 'walked',
      title: '.NET intermediate output',
      explanation: 'Intermediate build files and the package restore of a .NET project.',
      regeneration: 'Rebuilt by the next restore or build.',
      risk: 'safe',
    },
  ],
  userFileRoots: [
    { kind: 'knownFolder', folder: 'desktop' },
    { kind: 'knownFolder', folder: 'documents' },
    { kind: 'knownFolder', folder: 'downloads' },
    { kind: 'knownFolder', folder: 'videos' },
  ],
  explore: {
    pnpmInstallPlaces: {
      homes: [{ root: 'localAppData', path: 'pnpm' }],
      corepackRoots: [
        { root: 'localAppData', path: 'node/corepack/v1/pnpm' },
        { root: 'localAppData', path: 'node/corepack/pnpm' },
      ],
      // The standalone executable. The `pnpm.cmd` and `pnpm.ps1` shims beside it run the pnpm of
      // `.tools` or `global`, which the probe reads on its own, as it does a `#!` launcher.
      launchers: [
        { root: 'localAppData', path: 'pnpm/pnpm.exe' },
        { root: 'localAppData', path: 'pnpm/bin/pnpm.exe' },
      ],
      npmPrefixes: [{ root: 'roamingAppData', path: 'npm' }],
      // npm installs a global package in `<prefix>\node_modules` on Windows, with no `lib`.
      npmGlobalFolderNames: ['node_modules'],
    },
    pnpmStoreRoot: { root: 'localAppData', path: 'pnpm/store' },
    pnpmXdgStoreRoot: null,
    androidSdkRoot: { root: 'localAppData', path: 'Android/Sdk' },
    // A second Android SDK that Flutter's settings name is not read on Windows yet.
    flutterSettingsPaths: [],
    vscodeProfilesRoot: { root: 'roamingAppData', path: 'Code/User/profiles' },
    projectSearchIncompleteEvidence:
      'The project search stopped at its time limit, could not read some folders, or left out folders stored only in OneDrive, so some projects were not searched.',
    containerEngines: {
      dockerDesktopEngine: null,
      orbStackEngine: null,
      colimaEngine: null,
    },
    ideVersionRoots: { caches: [], logs: [], settings: [] },
    icloudDriveRoot: null,
    mailDownloadsRoot: null,
    mailBundlePaths: [],
    downloadsRoot: null,
    browserBundles: {
      chromium: { appBundleNames: [], systemBundlePaths: [] },
      firefox: { appBundleNames: [], systemBundlePaths: [] },
      safari: { appBundleNames: [], systemBundlePaths: [] },
    },
  },
};
