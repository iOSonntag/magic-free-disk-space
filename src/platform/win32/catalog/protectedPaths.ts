import type { EnvironmentDirNames } from '../../../environment/buildEnvironment.js';

/**
 * Root-like folders below the profile and the AppData folders, one name per level, never removed
 * as a whole. The profile, both AppData folders, the temporary folder, the fixed drives, the
 * guarded known folders, and the OneDrive roots join them in the environment.
 */
export const WIN32_PROTECTED_DIR_NAMES: EnvironmentDirNames[] = [
  { base: 'home', names: ['AppData'] },
  { base: 'home', names: ['.cache'] },
  // Known folders the environment does not resolve, at the place Windows creates them.
  { base: 'home', names: ['3D Objects'] },
  { base: 'home', names: ['Contacts'] },
  { base: 'home', names: ['Favorites'] },
  { base: 'home', names: ['Links'] },
  { base: 'home', names: ['Saved Games'] },
  { base: 'home', names: ['Searches'] },
  { base: 'localAppData', names: ['Microsoft'] },
  { base: 'localAppData', names: ['Packages'] },
  // Each browser keeps its profiles with their passwords and cookies in `User Data`; the catalog
  // offers only caches inside the first profile, `Default`.
  { base: 'localAppData', names: ['BraveSoftware', 'Brave-Browser', 'User Data'] },
  { base: 'localAppData', names: ['BraveSoftware', 'Brave-Browser', 'User Data', 'Default'] },
  { base: 'localAppData', names: ['Google', 'Chrome', 'User Data'] },
  { base: 'localAppData', names: ['Google', 'Chrome', 'User Data', 'Default'] },
  { base: 'localAppData', names: ['Microsoft', 'Edge', 'User Data'] },
  { base: 'localAppData', names: ['Microsoft', 'Edge', 'User Data', 'Default'] },
];

/**
 * Folders of keys, credentials, and certificates below the profile and the AppData folders, one
 * name per level, never removed, neither whole nor in part. The folders of the deletion log and of
 * the preference file join them in the environment.
 */
export const WIN32_SENSITIVE_DIR_NAMES: EnvironmentDirNames[] = [
  { base: 'home', names: ['.ssh'] },
  { base: 'home', names: ['.gnupg'] },
  { base: 'home', names: ['.aws'] },
  { base: 'home', names: ['.azure'] },
  { base: 'home', names: ['.docker'] },
  { base: 'home', names: ['.kube'] },
  { base: 'home', names: ['.config', 'gh'] },
  { base: 'roamingAppData', names: ['gnupg'] },
  { base: 'roamingAppData', names: ['GitHub CLI'] },
  { base: 'roamingAppData', names: ['Microsoft', 'Credentials'] },
  { base: 'roamingAppData', names: ['Microsoft', 'Crypto'] },
  { base: 'roamingAppData', names: ['Microsoft', 'Protect'] },
  { base: 'roamingAppData', names: ['Microsoft', 'SystemCertificates'] },
  { base: 'roamingAppData', names: ['Microsoft', 'Vault'] },
  { base: 'localAppData', names: ['Microsoft', 'Credentials'] },
  { base: 'localAppData', names: ['Microsoft', 'Vault'] },
];
