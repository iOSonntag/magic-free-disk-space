import { describe, expect, test } from 'bun:test';
import type { ProjectArtifactRule } from '../../src/catalog/projectArtifactRules.js';
import { findMarkedArtifactRule } from '../../src/catalog/projectArtifactRules.js';
import { POSIX_PATH_RULES, WIN32_PATH_RULES } from '../../src/path/pathRules.js';

const binRule: ProjectArtifactRule = {
  artifactName: 'bin',
  markers: [{ kind: 'fileSuffix', suffix: '.csproj' }],
  unmarkedFolder: 'walked',
  title: 'Example build output',
  explanation: 'Compiled output of an example project.',
  regeneration: 'Rebuilt by the next build.',
  risk: 'safe',
};

const nodeModulesRule: ProjectArtifactRule = {
  artifactName: 'node_modules',
  markers: [{ kind: 'fileName', name: 'package.json' }],
  unmarkedFolder: 'skipped',
  title: 'Example dependencies',
  explanation: 'Installed packages of an example project.',
  regeneration: 'Reinstalled by the package manager.',
  risk: 'review',
};

const artifactRules = [binRule, nodeModulesRule];

describe('findMarkedArtifactRule', () => {
  test('matches a folder and its marker in another case under the rules of Windows, as the catalog names its rule', () => {
    expect(
      findMarkedArtifactRule({
        pathRules: WIN32_PATH_RULES,
        rules: artifactRules,
        name: 'Bin',
        projectEntryNames: new Set(['Bin', 'Foo.CSPROJ']),
      }),
    ).toBe(binRule);
    expect(
      findMarkedArtifactRule({
        pathRules: WIN32_PATH_RULES,
        rules: artifactRules,
        name: 'NODE_MODULES',
        projectEntryNames: new Set(['NODE_MODULES', 'Package.JSON']),
      }),
    ).toBe(nodeModulesRule);
  });

  test('matches names only exactly under the rules of POSIX', () => {
    expect(
      findMarkedArtifactRule({
        pathRules: POSIX_PATH_RULES,
        rules: artifactRules,
        name: 'Bin',
        projectEntryNames: new Set(['Bin', 'Foo.csproj']),
      }),
    ).toBeNull();
    expect(
      findMarkedArtifactRule({
        pathRules: POSIX_PATH_RULES,
        rules: artifactRules,
        name: 'node_modules',
        projectEntryNames: new Set(['node_modules', 'Package.json']),
      }),
    ).toBeNull();
    expect(
      findMarkedArtifactRule({
        pathRules: POSIX_PATH_RULES,
        rules: artifactRules,
        name: 'bin',
        projectEntryNames: new Set(['bin', 'Foo.csproj']),
      }),
    ).toBe(binRule);
  });

  test('takes no suffix alone as a marker, in any case', () => {
    expect(
      findMarkedArtifactRule({
        pathRules: WIN32_PATH_RULES,
        rules: artifactRules,
        name: 'bin',
        projectEntryNames: new Set(['bin', '.CSPROJ']),
      }),
    ).toBeNull();
  });
});
