import { join } from 'node:path';
import type { CatalogEntry } from './catalog.js';

/** A folder of the platform, below the home folder or at a fixed place. */
export type CatalogFolder = { root: 'home' | 'absolute'; path: string };

/** What the catalog takes from the operating system: its entries and the folders it guards. */
export type CatalogPlatform = {
  entries: CatalogEntry[];
  /** Where the platform's apps are installed; a removal may reach into them. */
  applicationDirs: CatalogFolder[];
  /** Root-like folders below the home folder, which are never removed as a whole. */
  protectedHomeRelativePaths: string[];
  /** Folders below the home folder that are never removed, neither whole nor in part. */
  sensitiveHomeRelativePaths: string[];
};

/** The absolute path of the folder: its path as is, or joined below `homeDir`. */
export function resolveCatalogFolderPath(params: {
  folder: CatalogFolder;
  homeDir: string;
}): string {
  switch (params.folder.root) {
    case 'absolute':
      return params.folder.path;
    case 'home':
      return join(params.homeDir, params.folder.path);
  }
}
