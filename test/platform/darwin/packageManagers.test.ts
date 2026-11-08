import { describe, expect, test } from 'bun:test';
import { PACKAGE_MANAGER_ENTRIES } from '../../../src/platform/darwin/catalog/packageManagers.js';
import { buildRiskAndPathById } from './catalogPins.js';

describe('PACKAGE_MANAGER_ENTRIES', () => {
  test('pins the risk and the path of every entry', () => {
    expect(buildRiskAndPathById(PACKAGE_MANAGER_ENTRIES)).toEqual({
      'dart-pub-cache': ['review', '.pub-cache/hosted'],
      'npm-cache': ['safe', '.npm/_cacache'],
      'npx-cache': ['safe', '.npm/_npx'],
      'yarn-berry-cache': ['safe', '.yarn/berry/cache'],
      'maven-repository': ['review', '.m2/repository'],
      'nuget-packages': ['review', '.nuget/packages'],
      'poetry-cache': ['safe', 'Library/Caches/pypoetry/cache'],
      'poetry-artifacts': ['safe', 'Library/Caches/pypoetry/artifacts'],
      'poetry-virtualenvs': ['review', 'Library/Caches/pypoetry/virtualenvs'],
      'cypress-binaries': ['review', 'Library/Caches/Cypress'],
      'electron-downloads': ['safe', 'Library/Caches/electron'],
      'bun-install-cache': ['safe', '.bun/install/cache'],
      'bun-cache': ['safe', 'Library/Caches/bun'],
      'pnpm-store': ['review', 'Library/pnpm/store'],
      'pnpm-store-xdg': ['review', '.local/share/pnpm/store'],
      'pnpm-cache': ['safe', 'Library/Caches/pnpm'],
      'playwright-browsers': ['review', 'Library/Caches/ms-playwright'],
      'puppeteer-browsers': ['safe', '.cache/puppeteer'],
      'cocoapods-cache': ['safe', 'Library/Caches/CocoaPods'],
      'swiftpm-repositories': ['safe', 'Library/Caches/org.swift.swiftpm/repositories'],
      'swiftpm-manifests': ['safe', 'Library/Caches/org.swift.swiftpm/manifests'],
      'composer-cache': ['safe', 'Library/Caches/composer'],
      'uv-cache': ['safe', '.cache/uv'],
      'pip-cache': ['safe', 'Library/Caches/pip'],
      'bundler-cache': ['review', '.bundle/cache'],
      'hex-packages': ['review', '.hex/packages'],
    });
  });
});
