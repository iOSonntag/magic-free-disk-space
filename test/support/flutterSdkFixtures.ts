import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The path of the pub active-roots file `<group>/<name>` under `homeDir`. */
export function buildActiveRootPath(params: {
  homeDir: string;
  group: string;
  name: string;
}): string {
  return join(params.homeDir, '.pub-cache', 'active_roots', params.group, params.name);
}

/**
 * Writes a project `<homeDir>/projects/<name>` whose package config names `flutterRoot`, and the
 * active-roots file `<group>/<name>` that names that package config.
 */
export async function createActiveProject(params: {
  homeDir: string;
  group: string;
  name: string;
  flutterRoot: string;
}): Promise<void> {
  const packageConfigPath = join(
    params.homeDir,
    'projects',
    params.name,
    '.dart_tool',
    'package_config.json',
  );

  await Bun.write(
    packageConfigPath,
    JSON.stringify({ configVersion: 2, flutterRoot: pathToFileURL(params.flutterRoot).href }),
  );
  await Bun.write(
    buildActiveRootPath({ homeDir: params.homeDir, group: params.group, name: params.name }),
    JSON.stringify({ package_config: pathToFileURL(packageConfigPath).href }),
  );
}

/** Writes `version` as the version file of the Dart SDK whose binary is at `dartPath`. */
export async function writeDartVersionFile(params: {
  dartPath: string;
  version: string;
}): Promise<void> {
  await Bun.write(join(dirname(dirname(params.dartPath)), 'version'), `${params.version}\n`);
}
