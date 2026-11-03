import { readFile } from 'node:fs/promises';
import { join, posix, sep } from 'node:path';
import type { EcmaScriptModule } from 'oxc-parser';
import { parseSync } from 'oxc-parser';

/** One import of a file of `src/` by another, both by their path from the repository root. */
export type SourceImport = { importerPath: string; importedPath: string; line: number };

/** The text of a module specifier, and where it starts in its file. */
type ModuleSpecifier = { text: string; start: number };

const stringLiteralPattern = /^(['"])(.*)\1$/;

/**
 * Reads every import between the files of `src/` below `repositoryDir`: static imports and
 * exports, type-only ones included, and dynamic imports. Throws on a file that does not parse, on
 * a dynamic import of a computed path, and on a relative path that names no file of `src/`.
 */
export async function loadSourceImports(params: {
  repositoryDir: string;
}): Promise<SourceImport[]> {
  const sourcePaths = await listSourcePaths({ repositoryDir: params.repositoryDir });
  const knownPaths = new Set(sourcePaths);
  const importsByFile = await Promise.all(
    sourcePaths.map((sourcePath) =>
      loadFileImports({
        repositoryDir: params.repositoryDir,
        sourcePath: sourcePath,
        knownPaths: knownPaths,
      }),
    ),
  );

  return importsByFile.flat();
}

/** Every TypeScript file of `src/` below `repositoryDir`, by its path from it with `/`, sorted. */
export async function listSourcePaths(params: { repositoryDir: string }): Promise<string[]> {
  const scannedPaths = await Array.fromAsync(
    new Bun.Glob('src/**/*.ts').scan({ cwd: params.repositoryDir }),
  );

  // The glob yields the separator of the platform; the rules and the baseline name paths with `/`.
  return scannedPaths.map((path) => path.split(sep).join('/')).toSorted();
}

async function loadFileImports(params: {
  repositoryDir: string;
  sourcePath: string;
  knownPaths: Set<string>;
}): Promise<SourceImport[]> {
  const sourceText = await readFile(join(params.repositoryDir, params.sourcePath), 'utf8');
  const parsed = parseSync(params.sourcePath, sourceText);
  const firstError = parsed.errors[0];

  if (firstError !== undefined) {
    throw new Error(`${params.sourcePath} does not parse: ${firstError.message}`);
  }

  const specifiers = listModuleSpecifiers({
    module: parsed.module,
    sourceText: sourceText,
    sourcePath: params.sourcePath,
  });

  return specifiers
    .filter((specifier) => specifier.text.startsWith('./') || specifier.text.startsWith('../'))
    .map((specifier) => {
      const line = sourceText.slice(0, specifier.start).split('\n').length;

      return {
        importerPath: params.sourcePath,
        importedPath: resolveImportedPath({
          importerPath: params.sourcePath,
          specifier: specifier.text,
          line: line,
          knownPaths: params.knownPaths,
        }),
        line: line,
      };
    });
}

function listModuleSpecifiers(params: {
  module: EcmaScriptModule;
  sourceText: string;
  sourcePath: string;
}): ModuleSpecifier[] {
  const staticImports = params.module.staticImports.map((staticImport) => ({
    text: staticImport.moduleRequest.value,
    start: staticImport.moduleRequest.start,
  }));
  // The entries of one export statement share its request, or hold none for a local export.
  const staticExports = params.module.staticExports.flatMap((staticExport) => {
    const request = staticExport.entries[0]?.moduleRequest ?? null;

    return request === null ? [] : [{ text: request.value, start: request.start }];
  });
  const dynamicImports = params.module.dynamicImports.map((dynamicImport) => {
    const requestText = params.sourceText.slice(
      dynamicImport.moduleRequest.start,
      dynamicImport.moduleRequest.end,
    );
    const specifierText = stringLiteralPattern.exec(requestText)?.[2];

    if (specifierText === undefined) {
      throw new Error(
        `${params.sourcePath} imports ${requestText}, a computed path, which no boundary rule can follow`,
      );
    }

    return { text: specifierText, start: dynamicImport.moduleRequest.start };
  });

  return [...staticImports, ...staticExports, ...dynamicImports];
}

function resolveImportedPath(params: {
  importerPath: string;
  specifier: string;
  line: number;
  knownPaths: Set<string>;
}): string {
  const joinedPath = posix.join(posix.dirname(params.importerPath), params.specifier);
  // NodeNext names a TypeScript file by the `.js` file it compiles to.
  const importedPath = joinedPath.endsWith('.js') ? `${joinedPath.slice(0, -3)}.ts` : joinedPath;

  if (!params.knownPaths.has(importedPath)) {
    throw new Error(
      `${params.importerPath}:${params.line} imports '${params.specifier}', which names no file of src/`,
    );
  }

  return importedPath;
}
