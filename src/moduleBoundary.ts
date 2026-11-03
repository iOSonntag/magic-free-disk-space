/** A module of `src/`, named by its folder below `src/`; a nested one joins its folders with `/`. */
export type ModuleName =
  | 'bridge'
  | 'catalog'
  | 'cli'
  | 'delete'
  | 'environment'
  | 'explore'
  | 'path'
  | 'preferences'
  | 'report'
  | 'scan'
  | 'system'
  | 'tools'
  | 'update';

/**
 * The manifest a module declares in its `boundary.ts`: the modules its files import, the modules
 * whose stored data it reads, and its surface, the files another module may import, by their path
 * inside its folder. `test/architecture` fails every import that the manifests do not allow; its
 * fixtures name modules of their own through `TModuleName`.
 */
export type ModuleBoundary<TModuleName extends string = ModuleName> = {
  imports: TModuleName[];
  readsTablesOf: TModuleName[];
  exposes: string[];
};
