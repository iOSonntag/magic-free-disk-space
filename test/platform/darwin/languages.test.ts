import { describe, expect, test } from 'bun:test';
import { LANGUAGE_ENTRIES } from '../../../src/platform/darwin/catalog/languages.js';
import { SCAN_LIMITS } from '../../../src/scan/limits.js';
import { describeOnDarwin } from '../../support/darwinOnly.js';
import { buildRiskAndPathById } from './catalogPins.js';
import { listCatalogOffers, withScannedCatalogHome } from './catalogScan.js';

const FILE_BYTES = SCAN_LIMITS.minOfferedBytes;

describe('LANGUAGE_ENTRIES', () => {
  test('pins the risk and the path of every entry', () => {
    expect(buildRiskAndPathById(LANGUAGE_ENTRIES)).toEqual({
      'dart-analysis-cache': ['review', '.dartServer/.analysis-driver'],
      'node-gyp-cache': ['safe', 'Library/Caches/node-gyp'],
      'nvm-node-versions': ['review', '.nvm/versions/node'],
      'asdf-installs': ['review', '.asdf/installs'],
      'mise-installs': ['review', '.local/share/mise/installs'],
      'go-module-cache': ['review', 'go/pkg/mod'],
      'go-build-cache': ['safe', 'Library/Caches/go-build'],
      'cargo-registry-sources': ['safe', '.cargo/registry/src'],
      'cargo-registry-downloads': ['review', '.cargo/registry/cache'],
      'cargo-git-checkouts': ['safe', '.cargo/git/checkouts'],
      'cargo-git-repositories': ['review', '.cargo/git/db'],
      'rustup-toolchains': ['review', '.rustup/toolchains'],
      'conda-packages': ['review', 'miniconda3/pkgs'],
      'fvm-flutter-versions': ['review', 'fvm/versions'],
      'gradle-jdks': ['review', '.gradle/jdks'],
      'bazel-cache': ['review', 'Library/Caches/bazel'],
      'deno-cache': ['safe', 'Library/Caches/deno'],
      'unity-package-cache': ['review', 'Library/Unity/cache'],
      'unreal-derived-data-cache': [
        'review',
        'Library/Application Support/Epic/UnrealEngine/Common/DerivedDataCache',
      ],
      'terraform-plugin-cache': ['review', '.terraform.d/plugin-cache'],
      'sst-providers': ['review', 'Library/Application Support/sst'],
    });
  });
});

// Only macOS scans its catalog; Windows scans its own.
describeOnDarwin('the scan of the language entries', () => {
  test("offers Deno's downloads and compiled code, never the data its scripts stored", async () => {
    await withScannedCatalogHome({
      entryIds: ['deno-cache', 'user-caches'],
      files: [
        { path: 'Library/Caches/deno/remote/https/deno.land/module.ts', sizeBytes: FILE_BYTES },
        { path: 'Library/Caches/deno/npm/registry.npmjs.org/package.tgz', sizeBytes: FILE_BYTES },
        { path: 'Library/Caches/deno/location_data/hash/kv.sqlite3', sizeBytes: FILE_BYTES },
      ],
      run: ({ homeDir, report }) => {
        expect(listCatalogOffers({ report: report, homeDir: homeDir })).toEqual([
          {
            entryId: 'deno-cache',
            path: 'Library/Caches/deno',
            deletedPaths: ['Library/Caches/deno/remote', 'Library/Caches/deno/npm'],
          },
        ]);
      },
    });
  });

  test("offers SST's providers and tools, never the state of the apps it keeps", async () => {
    await withScannedCatalogHome({
      entryIds: ['sst-providers'],
      files: [
        { path: 'Library/Application Support/sst/bin/node', sizeBytes: FILE_BYTES },
        { path: 'Library/Application Support/sst/plugins/aws/provider', sizeBytes: FILE_BYTES },
        { path: 'Library/Application Support/sst/state/app/dev.json', sizeBytes: FILE_BYTES },
      ],
      run: ({ homeDir, report }) => {
        expect(listCatalogOffers({ report: report, homeDir: homeDir })).toEqual([
          {
            entryId: 'sst-providers',
            path: 'Library/Application Support/sst',
            deletedPaths: [
              'Library/Application Support/sst/bin',
              'Library/Application Support/sst/plugins',
            ],
          },
        ]);
      },
    });
  });
});
