import type { BrowserBundles } from '../../explore/explorePlatform.js';

/**
 * The browsers that leave a partial download in Downloads: Safari's `.download`, Chrome's and its
 * kin's `.crdownload`, Firefox's `.part`. Safari runs from the system's cryptex, where its process
 * shows, while `/Applications/Safari.app` only points there.
 */
export const BROWSER_BUNDLES: BrowserBundles = {
  appBundleNames: [
    'Google Chrome.app',
    'Google Chrome Beta.app',
    'Google Chrome Canary.app',
    'Chromium.app',
    'Microsoft Edge.app',
    'Brave Browser.app',
    'Arc.app',
    'Vivaldi.app',
    'Opera.app',
    'Firefox.app',
    'Firefox Developer Edition.app',
    'Firefox Nightly.app',
    'Safari Technology Preview.app',
  ],
  systemBundlePaths: [
    '/Applications/Safari.app',
    '/System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app',
  ],
};
