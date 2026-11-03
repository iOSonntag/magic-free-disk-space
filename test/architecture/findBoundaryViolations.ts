import type { ModuleBoundary } from '../../src/moduleBoundary.js';
import type { SourceImport } from './loadSourceImports.js';

/**
 * What the rules hold the imports of `src/` to: the manifest of each module, by its folder below
 * `src/`, and the files at the root of `src/`, which belong to no module, by their names.
 */
export type BoundaryConfig<TModuleName extends string> = {
  modules: Record<TModuleName, ModuleBoundary<TModuleName>>;
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
export type ModuleEdge<TModuleName extends string> = {
  importerName: TModuleName;
  importedName: TModuleName;
};

/** A file a manifest exposes, by its module and its path inside the module's folder. */
export type ModuleExpose<TModuleName extends string> = {
  moduleName: TModuleName;
  internalPath: string;
};

type SourceFilePlaceModule<TModuleName extends string> = {
  kind: 'module';
  name: TModuleName;
  boundary: ModuleBoundary<TModuleName>;
  internalPath: string;
};

type SourceFilePlaceCompositionRoot = { kind: 'compositionRoot' };

type SourceFilePlaceSharedRoot = { kind: 'sharedRoot' };

/** Where a file of `src/` belongs: to a module, at a path inside its folder, or to the root. */
export type SourceFilePlace<TModuleName extends string> =
  | SourceFilePlaceModule<TModuleName>
  | SourceFilePlaceCompositionRoot
  | SourceFilePlaceSharedRoot;

export const SOURCE_DIR_PREFIX = 'src/';

const MANIFEST_SUFFIX = '/boundary.ts';

/** The path of the manifest of the module `moduleName`, from the repository root. */
export function formatManifestPath(moduleName: string): string {
  return `${SOURCE_DIR_PREFIX}${moduleName}${MANIFEST_SUFFIX}`;
}

/** The module whose manifest stands at `path`, from the repository root; `null` for any other path. */
export function parseManifestModuleName(path: string): string | null {
  if (!path.startsWith(SOURCE_DIR_PREFIX) || !path.endsWith(MANIFEST_SUFFIX)) {
    return null;
  }

  const moduleName = path.slice(SOURCE_DIR_PREFIX.length, -MANIFEST_SUFFIX.length);

  return moduleName === '' ? null : moduleName;
}

/**
 * Places the file at `path`, from the repository root, in the deepest module folder that holds
 * it, so a module nested in another is a module of its own. Throws for a file in no module folder
 * and for a root file `config` does not name, since no rule could hold its imports.
 */
export function placeSourceFile<TModuleName extends string>(params: {
  path: string;
  config: BoundaryConfig<TModuleName>;
}): SourceFilePlace<TModuleName> {
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

  const moduleEntry = listModuleEntries(params.config)
    .filter(([name]) => sourceRelativePath.startsWith(`${name}/`))
    .toSorted(([leftName], [rightName]) => rightName.length - leftName.length)[0];

  if (moduleEntry === undefined) {
    throw new Error(
      `${params.path} lies in no module: give its folder a boundary.ts and register it in test/architecture/moduleRegistry.ts`,
    );
  }

  const [moduleName, boundary] = moduleEntry;

  return {
    kind: 'module',
    name: moduleName,
    boundary: boundary,
    internalPath: sourceRelativePath.slice(moduleName.length + 1),
  };
}

/** Each import of `imports` that the manifests and the root files of `config` do not allow. */
export function findBoundaryViolations<TModuleName extends string>(params: {
  imports: SourceImport[];
  config: BoundaryConfig<TModuleName>;
}): BoundaryViolation[] {
  return params.imports.flatMap((sourceImport) => {
    const violation = findImportViolation({ sourceImport: sourceImport, config: params.config });

    return violation === null ? [] : [violation];
  });
}

/** Each edge a manifest of `config` declares that no import of `imports` follows. */
export function findUnusedModuleEdges<TModuleName extends string>(params: {
  imports: SourceImport[];
  config: BoundaryConfig<TModuleName>;
}): ModuleEdge<TModuleName>[] {
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

  return listModuleEntries(params.config).flatMap(([importerName, boundary]) =>
    boundary.imports
      .map((importedName) => ({ importerName: importerName, importedName: importedName }))
      .filter((edge) => !usedEdgeKeys.has(formatEdgeKey(edge))),
  );
}

/**
 * Each file a manifest of `config` exposes that no import of `imports` reaches from outside its
 * module, from another module or from the composition root.
 */
export function findUnusedModuleExposes<TModuleName extends string>(params: {
  imports: SourceImport[];
  config: BoundaryConfig<TModuleName>;
}): ModuleExpose<TModuleName>[] {
  const usedExposeKeys = new Set(
    params.imports.flatMap((sourceImport) => {
      const importer = placeSourceFile({ path: sourceImport.importerPath, config: params.config });
      const imported = placeSourceFile({ path: sourceImport.importedPath, config: params.config });

      if (imported.kind !== 'module') {
        return [];
      }

      if (importer.kind === 'module' && importer.name === imported.name) {
        return [];
      }

      return [formatExposeKey({ moduleName: imported.name, internalPath: imported.internalPath })];
    }),
  );

  return listModuleEntries(params.config).flatMap(([moduleName, boundary]) =>
    boundary.exposes
      .map((internalPath) => ({ moduleName: moduleName, internalPath: internalPath }))
      .filter((expose) => !usedExposeKeys.has(formatExposeKey(expose))),
  );
}

function listModuleEntries<TModuleName extends string>(
  config: BoundaryConfig<TModuleName>,
): [TModuleName, ModuleBoundary<TModuleName>][] {
  // Object.entries types every key as string; the keys of `modules` are its module names.
  return Object.entries(config.modules) as [TModuleName, ModuleBoundary<TModuleName>][];
}

function findImportViolation<TModuleName extends string>(params: {
  sourceImport: SourceImport;
  config: BoundaryConfig<TModuleName>;
}): BoundaryViolation | null {
  const location = `${params.sourceImport.importerPath}:${params.sourceImport.line}`;
  const importer = placeSourceFile({
    path: params.sourceImport.importerPath,
    config: params.config,
  });
  const imported = placeSourceFile({
    path: params.sourceImport.importedPath,
    config: params.config,
  });

  switch (imported.kind) {
    case 'sharedRoot':
      return null;
    case 'compositionRoot':
      return {
        filePath: params.sourceImport.importerPath,
        rule: 'boundaries/edge',
        message: `${location} imports ${params.sourceImport.importedPath}, an entry point of the composition root, which no file imports`,
      };
    case 'module':
      break;
  }

  switch (importer.kind) {
    case 'sharedRoot':
      return {
        filePath: params.sourceImport.importerPath,
        rule: 'boundaries/edge',
        message: `${location} imports ${params.sourceImport.importedPath}, but ${params.sourceImport.importerPath} is a shared root file, which imports no module`,
      };
    case 'compositionRoot':
      return findSurfaceViolation({
        sourceImport: params.sourceImport,
        imported: imported,
        location: location,
      });
    case 'module':
      break;
  }

  if (importer.name === imported.name) {
    return null;
  }

  if (!importer.boundary.imports.includes(imported.name)) {
    return {
      filePath: params.sourceImport.importerPath,
      rule: 'boundaries/edge',
      message: `${location} imports ${params.sourceImport.importedPath} of the module ${imported.name}, an edge ${formatManifestPath(importer.name)} does not declare: add '${imported.name}' to its imports, or import nothing of ${imported.name}`,
    };
  }

  return findSurfaceViolation({
    sourceImport: params.sourceImport,
    imported: imported,
    location: location,
  });
}

function findSurfaceViolation<TModuleName extends string>(params: {
  sourceImport: SourceImport;
  imported: SourceFilePlaceModule<TModuleName>;
  location: string;
}): BoundaryViolation | null {
  if (params.imported.boundary.exposes.includes(params.imported.internalPath)) {
    return null;
  }

  return {
    filePath: params.sourceImport.importerPath,
    rule: 'boundaries/surface',
    message: `${params.location} imports ${params.sourceImport.importedPath}, which is not on the surface of the module ${params.imported.name}: import a file ${formatManifestPath(params.imported.name)} exposes, or add '${params.imported.internalPath}' to its exposes`,
  };
}

function formatEdgeKey<TModuleName extends string>(edge: ModuleEdge<TModuleName>): string {
  return JSON.stringify([edge.importerName, edge.importedName]);
}

function formatExposeKey<TModuleName extends string>(expose: ModuleExpose<TModuleName>): string {
  return JSON.stringify([expose.moduleName, expose.internalPath]);
}
