import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExploreToolUnit } from '../../src/explore/exploreUnit.js';
import { buildUnitCommand } from '../../src/explore/exploreUnit.js';
import { buildToolArguments } from '../../src/tools/runToolCommand.js';
import type { ToolInstallLocations, ToolName } from '../../src/tools/toolInstallLocations.js';
import { createFakeTool } from '../support/fakeTool.js';

/** The arguments each probe passes, the runner's leading arguments included. */
export const PROBE_ARGUMENT_TEXTS: Record<ToolName, string> = {
  xcrun: 'simctl list devices --json',
  dart: '--suppress-analytics pub cache gc --dry-run',
  mise: 'ls --prunable --json',
};

const UNEXPECTED_ARGUMENTS_EXIT_CODE = 64;

/**
 * Writes a fake `name` into `folder` that prints `stdoutText` and exits with `exitCode` when
 * called with its probe's arguments, and exits 64 for any other call. `prelude`, shell code, runs
 * before the answer.
 */
export async function createProbeFakeTool(params: {
  folder: string;
  name: ToolName;
  stdoutText: string;
  exitCode: number;
  mode?: number;
  prelude?: string;
}): Promise<string> {
  const stdoutPath = join(params.folder, `${params.name}.stdout`);
  const body = `[ "$*" = "${PROBE_ARGUMENT_TEXTS[params.name]}" ] || { echo "unexpected arguments: $*" >&2; exit ${UNEXPECTED_ARGUMENTS_EXIT_CODE}; }
${params.prelude ?? ''}
cat '${stdoutPath}'
echo 'a line on stderr' >&2
exit ${params.exitCode}`;

  const path = await createFakeTool({
    folder: params.folder,
    name: params.name,
    body: body,
    mode: params.mode ?? 0o755,
  });

  await writeFile(stdoutPath, params.stdoutText);

  return path;
}

/**
 * Writes a fake of the unit's tool into `folder` that answers its probe as `createProbeFakeTool`
 * does, runs `commandBody` when called with the unit's command, and exits 64 for any other call.
 * `commandBody` is shell code that ends with its own `exit`; `probePrelude`, shell code too, runs
 * before the probe's answer.
 */
export async function createUnitRunFakeTool(params: {
  folder: string;
  unit: ExploreToolUnit;
  probeStdoutText: string;
  probeExitCode: number;
  commandBody: string;
  probePrelude?: string;
}): Promise<string> {
  const name = params.unit.tool.name;
  const stdoutPath = join(params.folder, `${name}.stdout`);
  const commandText = buildToolArguments({
    name: name,
    args: buildUnitCommand(params.unit),
  }).join(' ');
  const body = `if [ "$*" = "${PROBE_ARGUMENT_TEXTS[name]}" ]; then
${params.probePrelude ?? ''}
  cat '${stdoutPath}'
  echo 'a line on stderr' >&2
  exit ${params.probeExitCode}
fi
if [ "$*" = "${commandText}" ]; then
${params.commandBody}
fi
echo "unexpected arguments: $*" >&2
exit ${UNEXPECTED_ARGUMENTS_EXIT_CODE}`;

  const path = await createFakeTool({ folder: params.folder, name: name, body: body });

  await writeFile(stdoutPath, params.probeStdoutText);

  return path;
}

/** Each tool at the one absolute path given, or nowhere when the path is `null`. */
export function buildFixtureToolLocations(
  paths: Record<ToolName, string | null>,
): ToolInstallLocations {
  return {
    xcrun: paths.xcrun === null ? [] : [{ kind: 'path', root: 'absolute', path: paths.xcrun }],
    dart: paths.dart === null ? [] : [{ kind: 'path', root: 'absolute', path: paths.dart }],
    mise: paths.mise === null ? [] : [{ kind: 'path', root: 'absolute', path: paths.mise }],
  };
}
