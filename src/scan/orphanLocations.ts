/**
 * How an app's leftover folders are named in one location: by its bundle id alone, or, in
 * `Application Support`, also by the app's name.
 */
export type OrphanLocationNaming = 'bundleId' | 'bundleIdOrName';

/** A folder below the home folder whose entries are each one app's data. */
export type OrphanLocation = {
  /** Below the home folder, one name per level. */
  pathNames: string[];
  naming: OrphanLocationNaming;
  /** What follows the bundle id in each name, such as `.savedState`; empty for none. */
  nameSuffix: string;
  /**
   * False only where each folder is one app's own sandbox; elsewhere a vendor's other apps may
   * share it, so an installed app of the same vendor keeps it.
   */
  isVendorShared: boolean;
  /**
   * True where no other entry judges the folders, so the scan tells each one it holds back as no
   * leftover; elsewhere, such as in `Caches`, the entries that also judge them tell it, once.
   */
  isOnlyJudge: boolean;
  /** What a leftover found here is, for the person. */
  explanation: string;
};

/** The places an app keeps data in, which stay behind once the app is removed. */
export const ORPHAN_LOCATIONS: OrphanLocation[] = [
  {
    pathNames: ['Library', 'Containers'],
    naming: 'bundleId',
    nameSuffix: '',
    isVendorShared: false,
    isOnlyJudge: true,
    explanation:
      'The sandbox container of an app that is not in an Applications folder and that has not changed for the unused period. It holds the settings and the documents of that app.',
  },
  {
    pathNames: ['Library', 'Group Containers'],
    naming: 'bundleId',
    nameSuffix: '',
    isVendorShared: true,
    isOnlyJudge: true,
    explanation:
      'The folder a group of apps of one maker shares, none of them in an Applications folder, unchanged for the unused period. It may hold their documents.',
  },
  {
    pathNames: ['Library', 'Application Support'],
    naming: 'bundleIdOrName',
    nameSuffix: '',
    isVendorShared: true,
    isOnlyJudge: false,
    explanation:
      'The support folder of an app that is not in an Applications folder, unchanged for the unused period. It may hold the settings, the documents, and the downloads of that app.',
  },
  {
    pathNames: ['Library', 'Caches'],
    naming: 'bundleId',
    nameSuffix: '',
    isVendorShared: true,
    isOnlyJudge: false,
    explanation:
      'The cache of an app that is not in an Applications folder, unchanged for the unused period.',
  },
  {
    pathNames: ['Library', 'HTTPStorages'],
    naming: 'bundleId',
    nameSuffix: '',
    isVendorShared: true,
    isOnlyJudge: false,
    explanation:
      'The web cookies and storage of an app that is not in an Applications folder, unchanged for the unused period.',
  },
  {
    pathNames: ['Library', 'WebKit'],
    naming: 'bundleId',
    nameSuffix: '',
    isVendorShared: true,
    isOnlyJudge: false,
    explanation:
      'The web data of an app that is not in an Applications folder, unchanged for the unused period.',
  },
  {
    pathNames: ['Library', 'Saved Application State'],
    naming: 'bundleId',
    nameSuffix: '.savedState',
    isVendorShared: true,
    isOnlyJudge: false,
    explanation:
      'The saved windows of an app that is not in an Applications folder, unchanged for the unused period.',
  },
];

/**
 * Folders macOS and Apple's apps keep in `Application Support` under a plain name, lower-case;
 * never a leftover, whatever app is installed. `MobileSync` holds the backups of iPhones.
 */
export const APPLE_SUPPORT_FOLDER_NAMES = new Set([
  'accessibility',
  'accounts',
  'addressbook',
  'animoji',
  'app store',
  'apple',
  'applemediaservices',
  'appstore',
  'books',
  'calendar',
  'callhistorydb',
  'callhistorytransactions',
  'cloudkit',
  'clouddocs',
  'contacts',
  'coreparsec',
  'crashreporter',
  'differentialprivacy',
  'diskimages',
  'dock',
  'facetime',
  'fileprovider',
  'findmy',
  'garageband',
  'home',
  'icloud',
  'icdd',
  'ilifemediabrowser',
  'imovie',
  'knowledge',
  'logic',
  'mail',
  'maps',
  'messages',
  'mobilesync',
  'music',
  'networkserviceproxy',
  'news',
  'notes',
  'photos',
  'podcasts',
  'quick look',
  'reminders',
  'safari',
  'shortcuts',
  'siri',
  'stocks',
  'syncservices',
  'tv',
  'ubiquity',
  'wallpaper',
  'weather',
  'xcode',
]);

/**
 * Words that name a maker or a part every app may have, lower-case: a folder named so tells no
 * single app it belongs to, as `Google` holds the data of Chrome and of Google's other apps.
 */
export const GENERIC_SUPPORT_FOLDER_NAMES = new Set([
  'adobe',
  'application',
  'applications',
  'cache',
  'caches',
  'chromium',
  'cookies',
  'crashpad',
  'data',
  'default',
  'electron',
  'extensions',
  'google',
  'helper',
  'installer',
  'java',
  'jetbrains',
  'library',
  'logs',
  'microsoft',
  'mozilla',
  'node',
  'npm',
  'oracle',
  'plugins',
  'preferences',
  'python',
  'sentry',
  'shared',
  'shipit',
  'squirrel',
  'support',
  'temp',
  'tmp',
  'update',
  'updater',
  'user data',
]);
