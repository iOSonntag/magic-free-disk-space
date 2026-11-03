import { describe, expect, test } from 'bun:test';
import type { ModuleBoundary, ModuleName } from '../../src/moduleBoundary.js';
import { formatManifestPath } from './findBoundaryViolations.js';
import { moduleRegistry } from './moduleRegistry.js';

/**
 * Walks the `imports` of the manifests depth first, and returns each cycle a walk closes, as the
 * names along it with the first again at the end. A tangle of cycles yields at least one of them.
 */
function findDeclaredCycles(modules: Record<string, ModuleBoundary>): string[][] {
  const cycles: string[][] = [];
  const finishedNames = new Set<string>();

  function visitModule(name: string, walkedNames: string[]): void {
    const cycleStart = walkedNames.indexOf(name);

    if (cycleStart !== -1) {
      cycles.push([...walkedNames.slice(cycleStart), name]);

      return;
    }

    if (finishedNames.has(name)) {
      return;
    }

    for (const importedName of modules[name]?.imports ?? []) {
      visitModule(importedName, [...walkedNames, name]);
    }

    finishedNames.add(name);
  }

  for (const name of Object.keys(modules).toSorted()) {
    visitModule(name, []);
  }

  return cycles;
}

function formatCycle(cycle: string[]): string {
  const manifestPaths = [...new Set(cycle)].map(formatManifestPath);

  return `the manifests declare the cycle ${cycle.join(' → ')}, which makes its modules one: remove an edge of it from ${manifestPaths.join(', ')}`;
}

function buildFixtureBoundary(imports: ModuleName[]): ModuleBoundary {
  return { imports: imports, readsTablesOf: [], exposes: [] };
}

describe('findDeclaredCycles', () => {
  test('finds no cycle in imports that only point down', () => {
    const modules = {
      cli: buildFixtureBoundary(['report', 'system']),
      report: buildFixtureBoundary(['system']),
      system: buildFixtureBoundary([]),
    };

    expect(findDeclaredCycles(modules)).toEqual([]);
  });

  test('finds a cycle through several modules, and one of a module that imports itself', () => {
    const modules = {
      cli: buildFixtureBoundary(['report']),
      report: buildFixtureBoundary(['scan']),
      scan: buildFixtureBoundary(['cli']),
      system: buildFixtureBoundary(['system']),
    };

    expect(findDeclaredCycles(modules)).toEqual([
      ['cli', 'report', 'scan', 'cli'],
      ['system', 'system'],
    ]);
  });
});

describe('the manifests of src/', () => {
  test('declare no cycle of modules', () => {
    expect(findDeclaredCycles(moduleRegistry).map(formatCycle)).toEqual([]);
  });
});
