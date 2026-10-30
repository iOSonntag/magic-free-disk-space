import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';

export const APPLE_SILICON_CELLAR_PATH = buildTestAbsolutePath({ text: '/opt/homebrew/Cellar' });

export const INTEL_CELLAR_PATH = buildTestAbsolutePath({ text: '/usr/local/Cellar' });

/** The old kegs each Cellar of `buildHomebrewCleanupDryRunText` holds, with their sizes. */
export const HOMEBREW_OLD_KEGS = [
  { formula: 'wget', version: '1.21.3', sizeText: '91 files, 4.2MB' },
  { formula: 'python@3.12', version: '3.12.1', sizeText: '3,210 files, 65.4MB' },
  { formula: 'wget', version: '1.21.4', sizeText: '92 files, 4.3MB' },
] as const;

export function buildHomebrewKegPath(params: {
  cellarPath: string;
  formula: string;
  version: string;
}): AbsolutePath {
  return buildTestAbsolutePath({
    text: `${params.cellarPath}/${params.formula}/${params.version}`,
  });
}

/**
 * Creates the folder of each keg in its rack under `cellarPath`, and an empty rack for a formula
 * with no version.
 */
export async function createHomebrewRacks(params: {
  cellarPath: string;
  racks: { formula: string; versions: string[] }[];
}): Promise<void> {
  for (const rack of params.racks) {
    const rackPath = join(params.cellarPath, rack.formula);

    await mkdir(rackPath, { recursive: true });

    for (const version of rack.versions) {
      await mkdir(join(rackPath, version));
    }
  }
}

/**
 * What `brew cleanup -n` prints in the form Homebrew uses: the old kegs of each given Cellar, so
 * each brew must keep to its own, beside a cached download, the portable Ruby, and the closing
 * line.
 */
export function buildHomebrewCleanupDryRunText(params: {
  homeDir: string;
  cellarPaths: string[];
}): string {
  const kegLines = params.cellarPaths.flatMap((cellarPath) =>
    HOMEBREW_OLD_KEGS.map(
      (keg) =>
        `Would remove: ${buildHomebrewKegPath({ cellarPath: cellarPath, formula: keg.formula, version: keg.version })} (${keg.sizeText})`,
    ),
  );

  return `Would remove: ${params.homeDir}/Library/Caches/Homebrew/downloads/0123abcd--wget-1.21.3.arm64_sonoma.bottle.tar.gz (1.5MB)
Would remove: /opt/homebrew/Library/Homebrew/vendor/portable-ruby/3.3.4 (2,345 files, 45.1MB)
${kegLines.join('\n')}
==> This operation would free approximately 120.1MB of disk space.
`;
}

/** What `brew autoremove -n` prints for two orphans, one of them from a tap. */
export const HOMEBREW_AUTOREMOVE_DRY_RUN_TEXT = `==> Would autoremove 2 unneeded formulae:
libyaml
example/tools/libfoo
`;
