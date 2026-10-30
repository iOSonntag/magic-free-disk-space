import { describe, expect, test } from 'bun:test';
import { buildMiseVersionFindings } from '../../src/explore/miseVersions/buildMiseVersionFindings.js';
import { parseMisePrunableVersions } from '../../src/explore/miseVersions/parseMisePrunableVersions.js';
import type { LocatedTool } from '../../src/tools/findTrustedTool.js';
import {
  buildMiseInstallPath,
  buildMisePrunableJson,
  FIXTURE_HOME_DIR,
} from './probeOutputFixtures.js';

const tool: LocatedTool = { name: 'mise', path: '/opt/example/bin/mise' };

const nodeInstallPath = buildMiseInstallPath({
  homeDir: FIXTURE_HOME_DIR,
  toolName: 'node',
  version: '20.1.0',
});

describe('parseMisePrunableVersions', () => {
  test('reads each prunable version with its install path', () => {
    expect(
      parseMisePrunableVersions({
        stdoutText: buildMisePrunableJson({ homeDir: FIXTURE_HOME_DIR }),
      }),
    ).toEqual({
      kind: 'succeeded',
      value: [
        { toolName: 'node', version: '20.1.0', installPath: nodeInstallPath },
        {
          toolName: 'pnpm',
          version: '9.0.0',
          installPath: buildMiseInstallPath({
            homeDir: FIXTURE_HOME_DIR,
            toolName: 'pnpm',
            version: '9.0.0',
          }),
        },
      ],
    });
  });

  test('reads no versions from an empty object', () => {
    expect(parseMisePrunableVersions({ stdoutText: '{}' })).toEqual({
      kind: 'succeeded',
      value: [],
    });
  });

  test('rejects text that is no JSON', () => {
    expect(parseMisePrunableVersions({ stdoutText: 'garbage' }).kind).toBe('failed');
  });

  test('rejects a version that could start an option', () => {
    const text = JSON.stringify({
      node: [{ version: '--all', install_path: nodeInstallPath }],
    });

    expect(parseMisePrunableVersions({ stdoutText: text }).kind).toBe('failed');
  });

  test('rejects a version without an absolute install path', () => {
    const text = JSON.stringify({ node: [{ version: '20.1.0', install_path: 'node/20.1.0' }] });

    expect(parseMisePrunableVersions({ stdoutText: text }).kind).toBe('failed');
  });
});

describe('buildMiseVersionFindings', () => {
  test('offers each version with its install path shown with ~', () => {
    const findings = buildMiseVersionFindings({
      tool: tool,
      versions: [{ toolName: 'node', version: '20.1.0', installPath: nodeInstallPath }],
      homeDir: FIXTURE_HOME_DIR,
      processCommands: null,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.unit).toEqual({
      kind: 'miseVersion',
      tool: tool,
      toolName: 'node',
      version: '20.1.0',
      installPath: nodeInstallPath,
    });
    expect(findings[0]?.title).toBe('mise node 20.1.0');
    expect(findings[0]?.risk).toBe('review');
    expect(findings[0]?.displayPath).toBe(nodeInstallPath);
    expect(findings[0]?.activity).toBe('idle');
    expect(findings[0]?.evidenceLines).toEqual([
      '`mise prune` would remove node@20.1.0: no config file mise tracks pins this version.',
      'Installed at ~/.local/share/mise/installs/node/20.1.0',
    ]);
  });
});
