import { describe, expect, test } from 'bun:test';
import type { ProjectArtifactRule } from '../../src/catalog/projectArtifactRules.js';
import { buildArtifactFolderMatcher } from '../../src/catalog/projectArtifactRules.js';
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

const otherBinRule: ProjectArtifactRule = {
  ...binRule,
  markers: [{ kind: 'fileName', name: 'Makefile' }],
  title: 'Other build output',
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

const win32Matcher = buildArtifactFolderMatcher({
  pathRules: WIN32_PATH_RULES,
  rules: artifactRules,
});

const posixMatcher = buildArtifactFolderMatcher({
  pathRules: POSIX_PATH_RULES,
  rules: artifactRules,
});

describe('buildArtifactFolderMatcher', () => {
  test('finds the rules of a name in another case under the rules of Windows, in their order', () => {
    const matcher = buildArtifactFolderMatcher({
      pathRules: WIN32_PATH_RULES,
      rules: [binRule, nodeModulesRule, otherBinRule],
    });

    expect(
      matcher.matchFolder({ name: 'BIN', siblingNames: new Set(['BIN', 'Makefile']) }),
    ).toEqual({ kind: 'artifact', rule: otherBinRule });
    expect(
      matcher.matchFolder({
        name: 'BIN',
        siblingNames: new Set(['BIN', 'Makefile', 'Foo.CSPROJ']),
      }),
    ).toEqual({ kind: 'artifact', rule: binRule });
    expect(matcher.matchFolder({ name: 'BIN', siblingNames: new Set(['BIN']) })).toEqual({
      kind: 'unmarked',
      unmarkedFolder: 'walked',
    });
  });

  test('finds a name only exactly under the rules of POSIX, and none no rule names', () => {
    expect(posixMatcher.matchFolder({ name: 'Bin', siblingNames: new Set(['Bin']) })).toEqual({
      kind: 'noRule',
    });
    expect(posixMatcher.matchFolder({ name: 'bin', siblingNames: new Set(['bin']) })).toEqual({
      kind: 'unmarked',
      unmarkedFolder: 'walked',
    });
    expect(posixMatcher.matchFolder({ name: 'src', siblingNames: new Set(['src']) })).toEqual({
      kind: 'noRule',
    });
  });

  test('matches a folder and its marker in another case under the rules of Windows, as the catalog names its rule', () => {
    expect(
      win32Matcher.matchFolder({ name: 'Bin', siblingNames: new Set(['Bin', 'Foo.CSPROJ']) }),
    ).toEqual({ kind: 'artifact', rule: binRule });
    expect(
      win32Matcher.matchFolder({
        name: 'NODE_MODULES',
        siblingNames: new Set(['NODE_MODULES', 'Package.JSON']),
      }),
    ).toEqual({ kind: 'artifact', rule: nodeModulesRule });
  });

  test('matches names only exactly under the rules of POSIX', () => {
    expect(
      posixMatcher.matchFolder({ name: 'Bin', siblingNames: new Set(['Bin', 'Foo.csproj']) }),
    ).toEqual({ kind: 'noRule' });
    expect(
      posixMatcher.matchFolder({
        name: 'node_modules',
        siblingNames: new Set(['node_modules', 'Package.json']),
      }),
    ).toEqual({ kind: 'unmarked', unmarkedFolder: 'skipped' });
    expect(
      posixMatcher.matchFolder({ name: 'bin', siblingNames: new Set(['bin', 'Foo.csproj']) }),
    ).toEqual({ kind: 'artifact', rule: binRule });
  });

  test('takes no suffix alone as a marker, in any case', () => {
    expect(
      win32Matcher.matchFolder({ name: 'bin', siblingNames: new Set(['bin', '.CSPROJ']) }),
    ).toEqual({ kind: 'unmarked', unmarkedFolder: 'walked' });
  });

  test('takes the first rule of the name whose marker the project folder holds', () => {
    const matcher = buildArtifactFolderMatcher({
      pathRules: POSIX_PATH_RULES,
      rules: [binRule, otherBinRule],
    });

    expect(
      matcher.matchFolder({ name: 'bin', siblingNames: new Set(['bin', 'Makefile']) }),
    ).toEqual({ kind: 'artifact', rule: otherBinRule });
    expect(
      matcher.matchFolder({
        name: 'bin',
        siblingNames: new Set(['bin', 'Makefile', 'app.csproj']),
      }),
    ).toEqual({ kind: 'artifact', rule: binRule });
  });

  test('matches no rule of another name, though a marker of a rule stands beside the folder', () => {
    expect(
      posixMatcher.matchFolder({
        name: 'vendor',
        siblingNames: new Set(['vendor', 'package.json']),
      }),
    ).toEqual({ kind: 'noRule' });
  });

  test('skips an unmarked folder once any rule of its name skips one', () => {
    const matcher = buildArtifactFolderMatcher({
      pathRules: POSIX_PATH_RULES,
      rules: [binRule, { ...otherBinRule, unmarkedFolder: 'skipped' }],
    });

    expect(matcher.matchFolder({ name: 'bin', siblingNames: new Set(['bin']) })).toEqual({
      kind: 'unmarked',
      unmarkedFolder: 'skipped',
    });
  });
});
