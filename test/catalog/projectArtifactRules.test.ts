import { describe, expect, test } from 'bun:test';
import type { ProjectArtifactRule } from '../../src/catalog/projectArtifactRules.js';
import {
  findArtifactRulesOfName,
  findMarkedArtifactRule,
  groupArtifactRulesByName,
} from '../../src/catalog/projectArtifactRules.js';
import type { PathRules } from '../../src/path/pathRules.js';
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

/** The rule a folder is the artifact of, its name and its marker matched as a walk matches them. */
function findMarkedRuleOfFolder(params: {
  pathRules: PathRules;
  rules: ProjectArtifactRule[];
  name: string;
  projectEntryNames: ReadonlySet<string>;
}): ProjectArtifactRule | null {
  const nameRules = findArtifactRulesOfName({
    pathRules: params.pathRules,
    rulesByName: groupArtifactRulesByName({ pathRules: params.pathRules, rules: params.rules }),
    name: params.name,
  });

  if (nameRules === null) {
    return null;
  }

  return findMarkedArtifactRule({
    pathRules: params.pathRules,
    nameRules: nameRules,
    projectEntryNames: params.projectEntryNames,
  });
}

describe('findArtifactRulesOfName', () => {
  test('finds the rules of a name in another case under the rules of Windows, in their order', () => {
    expect(
      findArtifactRulesOfName({
        pathRules: WIN32_PATH_RULES,
        rulesByName: groupArtifactRulesByName({
          pathRules: WIN32_PATH_RULES,
          rules: [binRule, nodeModulesRule, otherBinRule],
        }),
        name: 'BIN',
      }),
    ).toEqual([binRule, otherBinRule]);
  });

  test('finds a name only exactly under the rules of POSIX, and none no rule names', () => {
    const rulesByName = groupArtifactRulesByName({
      pathRules: POSIX_PATH_RULES,
      rules: artifactRules,
    });

    expect(
      findArtifactRulesOfName({
        pathRules: POSIX_PATH_RULES,
        rulesByName: rulesByName,
        name: 'Bin',
      }),
    ).toBeNull();
    expect(
      findArtifactRulesOfName({
        pathRules: POSIX_PATH_RULES,
        rulesByName: rulesByName,
        name: 'bin',
      }),
    ).toEqual([binRule]);
    expect(
      findArtifactRulesOfName({
        pathRules: POSIX_PATH_RULES,
        rulesByName: rulesByName,
        name: 'src',
      }),
    ).toBeNull();
  });
});

describe('findMarkedArtifactRule', () => {
  test('matches a folder and its marker in another case under the rules of Windows, as the catalog names its rule', () => {
    expect(
      findMarkedRuleOfFolder({
        pathRules: WIN32_PATH_RULES,
        rules: artifactRules,
        name: 'Bin',
        projectEntryNames: new Set(['Bin', 'Foo.CSPROJ']),
      }),
    ).toBe(binRule);
    expect(
      findMarkedRuleOfFolder({
        pathRules: WIN32_PATH_RULES,
        rules: artifactRules,
        name: 'NODE_MODULES',
        projectEntryNames: new Set(['NODE_MODULES', 'Package.JSON']),
      }),
    ).toBe(nodeModulesRule);
  });

  test('matches names only exactly under the rules of POSIX', () => {
    expect(
      findMarkedRuleOfFolder({
        pathRules: POSIX_PATH_RULES,
        rules: artifactRules,
        name: 'Bin',
        projectEntryNames: new Set(['Bin', 'Foo.csproj']),
      }),
    ).toBeNull();
    expect(
      findMarkedRuleOfFolder({
        pathRules: POSIX_PATH_RULES,
        rules: artifactRules,
        name: 'node_modules',
        projectEntryNames: new Set(['node_modules', 'Package.json']),
      }),
    ).toBeNull();
    expect(
      findMarkedRuleOfFolder({
        pathRules: POSIX_PATH_RULES,
        rules: artifactRules,
        name: 'bin',
        projectEntryNames: new Set(['bin', 'Foo.csproj']),
      }),
    ).toBe(binRule);
  });

  test('takes no suffix alone as a marker, in any case', () => {
    expect(
      findMarkedRuleOfFolder({
        pathRules: WIN32_PATH_RULES,
        rules: artifactRules,
        name: 'bin',
        projectEntryNames: new Set(['bin', '.CSPROJ']),
      }),
    ).toBeNull();
  });

  test('takes the first rule of the name whose marker the project folder holds', () => {
    expect(
      findMarkedArtifactRule({
        pathRules: POSIX_PATH_RULES,
        nameRules: [binRule, otherBinRule],
        projectEntryNames: new Set(['bin', 'Makefile']),
      }),
    ).toBe(otherBinRule);
    expect(
      findMarkedArtifactRule({
        pathRules: POSIX_PATH_RULES,
        nameRules: [binRule, otherBinRule],
        projectEntryNames: new Set(['bin', 'Makefile', 'app.csproj']),
      }),
    ).toBe(binRule);
  });
});
