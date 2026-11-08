import type {
  EnvironmentLocation,
  EnvironmentLocationAtRoot,
} from '../../../environment/environmentLocation.js';
import { buildLocationBelow } from '../../../environment/environmentLocation.js';
import { teamsCacheFolder, teamsClassicCacheFolder } from './teamsCaches.js';

/**
 * Root-like folders, never removed as a whole, while an entry below one may go, such as a
 * browser's `User Data` with its cache inside. Both AppData folders, the temporary folder, the
 * fixed drives, and the OneDrive roots join them in the environment.
 */
export const WIN32_PROTECTED_LOCATIONS: EnvironmentLocation[] = [
  { root: 'home', path: '' },
  { root: 'home', path: 'AppData' },
  { root: 'home', path: '.cache' },
  // Wherever the user moved a known folder, its own path is guarded.
  { root: 'knownFolder', folder: 'desktop', path: '' },
  { root: 'knownFolder', folder: 'documents', path: '' },
  { root: 'knownFolder', folder: 'downloads', path: '' },
  { root: 'knownFolder', folder: 'videos', path: '' },
  { root: 'knownFolder', folder: 'music', path: '' },
  { root: 'knownFolder', folder: 'pictures', path: '' },
  { root: 'knownFolder', folder: 'localAppDataLow', path: '' },
  // Known folders the environment does not resolve, at the place Windows creates them.
  { root: 'home', path: '3D Objects' },
  { root: 'home', path: 'Contacts' },
  { root: 'home', path: 'Favorites' },
  { root: 'home', path: 'Links' },
  { root: 'home', path: 'Saved Games' },
  { root: 'home', path: 'Searches' },
  { root: 'localAppData', path: 'Microsoft' },
  { root: 'localAppData', path: 'Packages' },
  // Each browser keeps its profiles with their passwords and cookies in `User Data`; the catalog
  // offers only caches inside the first profile, `Default`.
  { root: 'localAppData', path: 'BraveSoftware/Brave-Browser/User Data' },
  { root: 'localAppData', path: 'BraveSoftware/Brave-Browser/User Data/Default' },
  { root: 'localAppData', path: 'Google/Chrome/User Data' },
  { root: 'localAppData', path: 'Google/Chrome/User Data/Default' },
  { root: 'localAppData', path: 'Microsoft/Edge/User Data' },
  { root: 'localAppData', path: 'Microsoft/Edge/User Data/Default' },
];

/**
 * Folders of keys, credentials, and certificates below the profile and the AppData folders, and
 * folders of files the user made inside a cache, never removed, neither whole nor in part. The
 * folders of the deletion log and of the preference file join them in the environment.
 */
export const WIN32_SENSITIVE_LOCATIONS: EnvironmentLocationAtRoot[] = [
  { root: 'home', path: '.ssh' },
  { root: 'home', path: '.gnupg' },
  { root: 'home', path: '.aws' },
  { root: 'home', path: '.azure' },
  { root: 'home', path: '.docker' },
  { root: 'home', path: '.kube' },
  { root: 'home', path: '.config/gh' },
  { root: 'roamingAppData', path: 'gnupg' },
  { root: 'roamingAppData', path: 'GitHub CLI' },
  { root: 'roamingAppData', path: 'Microsoft/Credentials' },
  { root: 'roamingAppData', path: 'Microsoft/Crypto' },
  { root: 'roamingAppData', path: 'Microsoft/Protect' },
  { root: 'roamingAppData', path: 'Microsoft/SystemCertificates' },
  { root: 'roamingAppData', path: 'Microsoft/Vault' },
  { root: 'localAppData', path: 'Microsoft/Credentials' },
  { root: 'localAppData', path: 'Microsoft/Vault' },
  // The backgrounds the user uploaded to Teams lie among the folders of its cache, which the
  // catalog offers one by one.
  buildLocationBelow({ location: teamsCacheFolder, path: 'Backgrounds' }),
  buildLocationBelow({ location: teamsClassicCacheFolder, path: 'Backgrounds' }),
];
