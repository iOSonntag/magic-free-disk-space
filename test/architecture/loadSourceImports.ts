import { readFile } from 'node:fs/promises';
import { join, posix, sep } from 'node:path';
import type { EcmaScriptModule, Program } from 'oxc-parser';
import { parseSync, Visitor } from 'oxc-parser';

/** One import of a file of `src/` by another, both by their path from the repository root. */
export type SourceImport = { importerPath: string; importedPath: string; line: number };

/** The text of a module specifier, and where it starts in its file. */
type ModuleSpecifier = { text: string; start: number };

/**
 * Reads every import between the files of `src/` below `repositoryDir`: static imports and
 * exports, type-only ones included, import types, and dynamic imports. Throws on a file that does
 * not parse, on a dynamic import of a computed path, and on a relative path that names no file of
 * `src/`.
 */
export async function loadSourceImports(params: {
  repositoryDir: string;
}): Promise<SourceImport[]> {
  const sourcePaths = await loadSourcePaths({ repositoryDir: params.repositoryDir });
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
export async function loadSourcePaths(params: { repositoryDir: string }): Promise<string[]> {
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

  const specifiers = [
    ...listStaticSpecifiers(parsed.module),
    ...findExpressionSpecifiers({
      program: parsed.program,
      sourceText: sourceText,
      sourcePath: params.sourcePath,
    }),
  ];

  return specifiers
    .filter((specifier) => specifier.text.startsWith('./') || specifier.text.startsWith('../'))
    .map((specifier) => {
      const line = findLineAt(sourceText, specifier.start);

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

function listStaticSpecifiers(module: EcmaScriptModule): ModuleSpecifier[] {
  const staticImports = module.staticImports.map((staticImport) => ({
    text: staticImport.moduleRequest.value,
    start: staticImport.moduleRequest.start,
  }));
  // The entries of one export statement share its request, or hold none for a local export.
  const staticExports = module.staticExports.flatMap((staticExport) => {
    const request = staticExport.entries[0]?.moduleRequest ?? null;

    return request === null ? [] : [{ text: request.value, start: request.start }];
  });

  return [...staticImports, ...staticExports];
}

/**
 * The specifiers of the dynamic imports and the import types of `program`, which the module record
 * of oxc-parser does not list in full: it holds no import type. Throws on a dynamic import whose
 * specifier is no string literal, since no boundary rule can follow it.
 */
function findExpressionSpecifiers(params: {
  program: Program;
  sourceText: string;
  sourcePath: string;
}): ModuleSpecifier[] {
  const specifiers: ModuleSpecifier[] = [];
  const visitor = new Visitor({
    ImportExpression(node) {
      if (node.source.type !== 'Literal' || typeof node.source.value !== 'string') {
        throw new Error(
          `${params.sourcePath}:${findLineAt(params.sourceText, node.source.start)} imports a computed path, which no boundary rule can follow: import a string literal`,
        );
      }

      specifiers.push({ text: node.source.value, start: node.source.start });
    },
    TSImportType(node) {
      specifiers.push({ text: node.source.value, start: node.source.start });
    },
  });

  visitor.visit(params.program);

  return specifiers;
}

function findLineAt(sourceText: string, offset: number): number {
  return sourceText.slice(0, offset).split('\n').length;
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
