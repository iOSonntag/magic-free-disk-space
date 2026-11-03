import { describe, expect, test } from 'bun:test';
import type { BoundaryConfig } from './findBoundaryViolations.js';
import { findBoundaryViolations, findUnusedModuleEdges } from './findBoundaryViolations.js';
import type { SourceImport } from './loadSourceImports.js';

const fixtureConfig: BoundaryConfig = {
  modules: {
    cli: { imports: ['report'], readsTablesOf: [], exposes: ['runCli.ts'] },
    report: { imports: [], readsTablesOf: [], exposes: ['formatUsage.ts'] },
    'report/notices': { imports: ['report'], readsTablesOf: [], exposes: ['noticeView.ts'] },
    update: { imports: [], readsTablesOf: [], exposes: ['releaseVersion.ts'] },
  },
  compositionRootFiles: ['main.ts'],
  sharedRootFiles: ['result.ts'],
};

function buildFixtureImport(importerPath: string, importedPath: string): SourceImport {
  return { importerPath: importerPath, importedPath: importedPath, line: 3 };
}

describe('findBoundaryViolations', () => {
  test('allows an import along a declared edge into the surface, within a module, and of a shared root file', () => {
    const imports = [
      buildFixtureImport('src/cli/runCli.ts', 'src/report/formatUsage.ts'),
      buildFixtureImport('src/cli/runCli.ts', 'src/cli/parseArguments.ts'),
      buildFixtureImport('src/report/formatUsage.ts', 'src/result.ts'),
      buildFixtureImport('src/main.ts', 'src/cli/runCli.ts'),
      buildFixtureImport('src/report/notices/noticeView.ts', 'src/report/formatUsage.ts'),
    ];

    expect(findBoundaryViolations({ imports: imports, config: fixtureConfig })).toEqual([]);
  });

  test('fails an edge the importer does not declare, naming the manifest of the importer', () => {
    const imports = [buildFixtureImport('src/cli/runCli.ts', 'src/update/releaseVersion.ts')];

    expect(findBoundaryViolations({ imports: imports, config: fixtureConfig })).toEqual([
      {
        filePath: 'src/cli/runCli.ts',
        rule: 'boundaries/edge',
        message:
          "src/cli/runCli.ts:3 imports src/update/releaseVersion.ts of the module update, an edge src/cli/boundary.ts does not declare: add 'update' to its imports, or import nothing of update",
      },
    ]);
  });

  test('fails a file off the surface of its module, naming the manifest of that module', () => {
    const imports = [
      buildFixtureImport('src/cli/runCli.ts', 'src/report/formatBytes.ts'),
      buildFixtureImport('src/main.ts', 'src/report/formatBytes.ts'),
    ];

    expect(findBoundaryViolations({ imports: imports, config: fixtureConfig })).toEqual([
      {
        filePath: 'src/cli/runCli.ts',
        rule: 'boundaries/surface',
        message:
          "src/cli/runCli.ts:3 imports src/report/formatBytes.ts, which is not on the surface of the module report: import a file src/report/boundary.ts exposes, or add 'formatBytes.ts' to its exposes",
      },
      {
        filePath: 'src/main.ts',
        rule: 'boundaries/surface',
        message:
          "src/main.ts:3 imports src/report/formatBytes.ts, which is not on the surface of the module report: import a file src/report/boundary.ts exposes, or add 'formatBytes.ts' to its exposes",
      },
    ]);
  });

  test('takes a nested module for a module of its own, with its own edges', () => {
    const imports = [buildFixtureImport('src/cli/runCli.ts', 'src/report/notices/noticeView.ts')];

    expect(
      findBoundaryViolations({ imports: imports, config: fixtureConfig }).map(
        (violation) => violation.rule,
      ),
    ).toEqual(['boundaries/edge']);
  });

  test('fails an import of an entry point, and a shared root file that imports a module', () => {
    const imports = [
      buildFixtureImport('src/cli/runCli.ts', 'src/main.ts'),
      buildFixtureImport('src/result.ts', 'src/report/formatUsage.ts'),
    ];

    expect(
      findBoundaryViolations({ imports: imports, config: fixtureConfig }).map(
        (violation) => violation.rule,
      ),
    ).toEqual(['boundaries/edge', 'boundaries/edge']);
  });

  test('throws for a file in a folder with no manifest', () => {
    const imports = [buildFixtureImport('src/cli/runCli.ts', 'src/scan/runScan.ts')];

    expect(() => findBoundaryViolations({ imports: imports, config: fixtureConfig })).toThrow(
      'src/scan/runScan.ts lies in no module',
    );
  });
});

describe('findUnusedModuleEdges', () => {
  test('returns each declared edge no import follows', () => {
    const config: BoundaryConfig = {
      ...fixtureConfig,
      modules: {
        ...fixtureConfig.modules,
        cli: { imports: ['report', 'update'], readsTablesOf: [], exposes: ['runCli.ts'] },
      },
    };
    const imports = [buildFixtureImport('src/cli/runCli.ts', 'src/report/formatUsage.ts')];

    expect(findUnusedModuleEdges({ imports: imports, config: config })).toEqual([
      { importerName: 'cli', importedName: 'update' },
      { importerName: 'report/notices', importedName: 'report' },
    ]);
  });
});
