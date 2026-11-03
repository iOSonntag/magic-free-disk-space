import type { ModuleBoundary } from '../../src/moduleBoundary.js';
import type { SourceImport } from './loadSourceImports.js';

/**
 * What the rules hold the imports of `src/` to: the manifest of each module, by its folder below
 * `src/`, and the files at the root of `src/`, which belong to no module, by their names.
 */
export type BoundaryConfig = {
  modules: Record<string, ModuleBoundary>;
  /** The entry points: they may import the surface of every module, and nothing imports them. */
  compositionRootFiles: string[];
  /** Files every file may import; they import no module, so they close no cycle. */
  sharedRootFiles: string[];
};

/**
 * `boundaries/edge` fails an import along an edge its importer does not declare, and
 * `boundaries/surface` an import of a file its module does not expose.
 */
export type BoundaryRule = 'boundaries/edge' | 'boundaries/surface';

/** An import a rule fails, by the file it stands in, with a message that names the file to edit. */
export type BoundaryViolation = { filePath: string; rule: BoundaryRule; message: string };

/** An edge a manifest declares, from the module that imports to the module it imports. */
export type ModuleEdge = { importerName: string; importedName: string };

type SourceFilePlaceModule = { kind: 'module'; name: string; internalPath: string };

type SourceFilePlaceCompositionRoot = { kind: 'compositionRoot' };

type SourceFilePlaceSharedRoot = { kind: 'sharedRoot' };

/** Where a file of `src/` belongs: to a module, at a path inside its folder, or to the root. */
export type SourceFilePlace =
  | SourceFilePlaceModule
  | SourceFilePlaceCompositionRoot
  | SourceFilePlaceSharedRoot;

const SOURCE_DIR_PREFIX = 'src/';

/** The path of the manifest of the module `moduleName`, from the repository root. */
export function formatManifestPath(moduleName: string): string {
  return `${SOURCE_DIR_PREFIX}${moduleName}/boundary.ts`;
}

/**
 * Places the file at `path`, from the repository root, in the deepest module folder that holds
 * it, so a module nested in another is a module of its own. Throws for a file in no module folder
 * and for a root file `config` does not name, since no rule could hold its imports.
 */
export function placeSourceFile(params: { path: string; config: BoundaryConfig }): SourceFilePlace {
  const sourceRelativePath = params.path.slice(SOURCE_DIR_PREFIX.length);

  if (!sourceRelativePath.includes('/')) {
    if (params.config.compositionRootFiles.includes(sourceRelativePath)) {
      return { kind: 'compositionRoot' };
    }

    if (params.config.sharedRootFiles.includes(sourceRelativePath)) {
      return { kind: 'sharedRoot' };
    }

    throw new Error(
      `${params.path} is a root file test/architecture/moduleRegistry.ts does not name: add it to the composition root or the shared root files`,
    );
  }

  const moduleName = Object.keys(params.config.modules)
    .filter((name) => sourceRelativePath.startsWith(`${name}/`))
    .toSorted((left, right) => right.length - left.length)[0];

  if (moduleName === undefined) {
    throw new Error(
      `${params.path} lies in no module: give its folder a boundary.ts and register it in test/architecture/moduleRegistry.ts`,
    );
  }

  return {
    kind: 'module',
    name: moduleName,
    internalPath: sourceRelativePath.slice(moduleName.length + 1),
  };
}

/** Each import of `imports` that the manifests and the root files of `config` do not allow. */
export function findBoundaryViolations(params: {
  imports: SourceImport[];
  config: BoundaryConfig;
}): BoundaryViolation[] {
  return params.imports.flatMap((sourceImport) => {
    const violation = findImportViolation({ sourceImport: sourceImport, config: params.config });

    return violation === null ? [] : [violation];
  });
}

/** Each edge a manifest of `config` declares that no import of `imports` follows. */
export function findUnusedModuleEdges(params: {
  imports: SourceImport[];
  config: BoundaryConfig;
}): ModuleEdge[] {
  const usedEdgeKeys = new Set(
    params.imports.flatMap((sourceImport) => {
      const importer = placeSourceFile({ path: sourceImport.importerPath, config: params.config });
      const imported = placeSourceFile({ path: sourceImport.importedPath, config: params.config });

      if (importer.kind !== 'module' || imported.kind !== 'module') {
        return [];
      }

      return [formatEdgeKey({ importerName: importer.name, importedName: imported.name })];
    }),
  );

  return Object.entries(params.config.modules).flatMap(([importerName, boundary]) =>
    boundary.imports
      .map((importedName) => ({ importerName: importerName, importedName: importedName }))
      .filter((edge) => !usedEdgeKeys.has(formatEdgeKey(edge))),
  );
}

function findImportViolation(params: {
  sourceImport: SourceImport;
  config: BoundaryConfig;
}): BoundaryViolation | null {
  const importerPath = params.sourceImport.importerPath;
  const importedPath = params.sourceImport.importedPath;
  const location = `${importerPath}:${params.sourceImport.line}`;
  const importer = placeSourceFile({ path: importerPath, config: params.config });
  const imported = placeSourceFile({ path: importedPath, config: params.config });

  switch (imported.kind) {
    case 'sharedRoot':
      return null;
    case 'compositionRoot':
      return {
        filePath: importerPath,
        rule: 'boundaries/edge',
        message: `${location} imports ${importedPath}, an entry point of the composition root, which no file imports`,
      };
    case 'module':
      break;
  }

  switch (importer.kind) {
    case 'sharedRoot':
      return {
        filePath: importerPath,
        rule: 'boundaries/edge',
        message: `${location} imports ${importedPath}, but ${importerPath} is a shared root file, which imports no module`,
      };
    case 'compositionRoot':
      return findSurfaceViolation({
        sourceImport: params.sourceImport,
        imported: imported,
        config: params.config,
      });
    case 'module':
      break;
  }

  if (importer.name === imported.name) {
    return null;
  }

  const importerBoundary = params.config.modules[importer.name];

  if (!importerBoundary?.imports.some((name) => name === imported.name)) {
    return {
      filePath: importerPath,
      rule: 'boundaries/edge',
      message: `${location} imports ${importedPath} of the module ${imported.name}, an edge ${formatManifestPath(importer.name)} does not declare: add '${imported.name}' to its imports, or import nothing of ${imported.name}`,
    };
  }

  return findSurfaceViolation({
    sourceImport: params.sourceImport,
    imported: imported,
    config: params.config,
  });
}

function findSurfaceViolation(params: {
  sourceImport: SourceImport;
  imported: SourceFilePlaceModule;
  config: BoundaryConfig;
}): BoundaryViolation | null {
  const importedBoundary = params.config.modules[params.imported.name];

  if (importedBoundary?.exposes.includes(params.imported.internalPath)) {
    return null;
  }

  return {
    filePath: params.sourceImport.importerPath,
    rule: 'boundaries/surface',
    message: `${params.sourceImport.importerPath}:${params.sourceImport.line} imports ${params.sourceImport.importedPath}, which is not on the surface of the module ${params.imported.name}: import a file ${formatManifestPath(params.imported.name)} exposes, or add '${params.imported.internalPath}' to its exposes`,
  };
}

function formatEdgeKey(edge: ModuleEdge): string {
  return JSON.stringify([edge.importerName, edge.importedName]);
}
