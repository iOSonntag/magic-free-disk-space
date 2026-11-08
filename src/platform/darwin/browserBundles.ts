import type { BrowserBundles } from '../../explore/explorePlatform.js';

/**
 * The browsers that leave a partial download in Downloads, by the family whose name it ends in.
 * Safari runs from the system's cryptex, where its process shows, while `/Applications/Safari.app`
 * only points there.
 */
export const BROWSER_BUNDLES: BrowserBundles = {
  chromium: {
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
    ],
    systemBundlePaths: [],
  },
  firefox: {
    appBundleNames: ['Firefox.app', 'Firefox Developer Edition.app', 'Firefox Nightly.app'],
    systemBundlePaths: [],
  },
  safari: {
    appBundleNames: ['Safari Technology Preview.app'],
    systemBundlePaths: [
      '/Applications/Safari.app',
      '/System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app',
    ],
  },
};
