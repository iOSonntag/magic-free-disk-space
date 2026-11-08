import { afterEach, beforeEach, expect, test } from 'bun:test';
import { realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { POSIX_PATH_RULES } from '../../../src/path/pathRules.js';
import { darwinPlatform } from '../../../src/platform/darwin/darwinPlatform.js';
import { findTrustedTool } from '../../../src/tools/findTrustedTool.js';
import type { ToolLocation } from '../../../src/tools/toolInstallLocations.js';
import { createFakeTool } from '../../support/fakeTool.js';
import type { FixtureRoot } from '../../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../../support/fixtureRoot.js';
import { buildTestUserIdentity } from '../../support/parsedValueFixtures.js';
import { describeOnPosix } from '../../support/posixOnly.js';

let fixtureRoot: FixtureRoot;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

/** The locations with each absolute path moved under the fixture root, so a fixture stands in. */
function rebaseUnderFixtureRoot(locations: ToolLocation[]): ToolLocation[] {
  return locations.map((location) => {
    if (location.kind !== 'path' || location.root !== 'absolute') {
      return location;
    }

    return { kind: 'path', root: 'absolute', path: join(fixtureRoot.rootDir, location.path) };
  });
}

/** Where Homebrew keeps its keg-only rustup, on Apple silicon and on Intel. */
const RUSTUP_KEG_PATHS = [
  '/opt/homebrew/opt/rustup/bin/rustup',
  '/usr/local/opt/rustup/bin/rustup',
];

describeOnPosix('the rustup locations of macOS', () => {
  test.each(RUSTUP_KEG_PATHS)('find the keg-only rustup of Homebrew at %s', async (kegPath) => {
    const path = await createFakeTool({
      folder: join(fixtureRoot.rootDir, dirname(kegPath)),
      name: 'rustup',
      body: 'process.exit(0);',
    });

    const found = await findTrustedTool({
      name: 'rustup',
      locations: rebaseUnderFixtureRoot(darwinPlatform.tools.installLocations.rustup),
      pathRules: POSIX_PATH_RULES,
      homeDir: fixtureRoot.homeDir,
      user: buildTestUserIdentity({ uid: process.getuid?.() ?? 0 }),
    });

    expect(found).toEqual({
      kind: 'succeeded',
      value: { name: 'rustup', path: await realpath(path) },
    });
  });
});
