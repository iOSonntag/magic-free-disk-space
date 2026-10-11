import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadCommandOutput } from '../../src/system/loadCommandOutput.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';

const infoPlistText = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
<key>CFBundleIdentifier</key>
<string>com.example.fixture</string>
</dict>
</plist>
`;

describe('loadCommandOutput', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  test('returns the path text of xcode-select -p', async () => {
    const result = await loadCommandOutput({
      command: 'xcode-select',
      args: ['-p'],
      timeoutMs: 5000,
    });

    expect(result).toEqual({ kind: 'succeeded', value: expect.stringMatching(/^\/\S+/) });
  });

  test('returns the bundle identifier that plutil extracts from a plist', async () => {
    const plistPath = join(fixtureRoot.rootDir, 'Info.plist');
    await writeFile(plistPath, infoPlistText);

    const result = await loadCommandOutput({
      command: 'plutil',
      args: ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', plistPath],
      timeoutMs: 5000,
    });

    expect(result).toEqual({ kind: 'succeeded', value: 'com.example.fixture\n' });
  });

  test('fails with exitedWithError when plutil cannot read the file', async () => {
    const missingPath = join(fixtureRoot.rootDir, 'missing.plist');

    const result = await loadCommandOutput({
      command: 'plutil',
      args: ['-lint', missingPath],
      timeoutMs: 5000,
    });

    expect(result).toEqual({
      kind: 'failed',
      failure: {
        reason: 'exitedWithError',
        command: 'plutil',
        exitCode: 1,
        stderrText: expect.stringMatching(/\S/),
      },
    });
  });

  test('fails with timedOut when the command outlasts its time limit', async () => {
    // A 1 ms limit is shorter than a run of ps, so the timer wins the race.
    const result = await loadCommandOutput({
      command: 'ps',
      args: ['-axww', '-o', 'command='],
      timeoutMs: 1,
    });

    expect(result).toEqual({
      kind: 'failed',
      failure: { reason: 'timedOut', command: 'ps', timeoutMs: 1 },
    });
  });
});
