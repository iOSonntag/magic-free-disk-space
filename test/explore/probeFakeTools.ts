import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExploreToolUnit } from '../../src/explore/exploreUnit.js';
import { buildUnitRunArguments } from '../../src/explore/exploreUnit.js';
import type {
  ToolInstallLocations,
  ToolLocation,
  ToolName,
} from '../../src/tools/toolInstallLocations.js';
import { createFakeTool } from '../support/fakeTool.js';

/** The arguments of each read-only command a probe runs, the runner's leading arguments included. */
export const PROBE_ARGUMENT_TEXTS = {
  simulatorDevices: 'simctl list devices --json',
  simulatorRuntimes: 'simctl runtime list -j',
  dartPubCache: '--suppress-analytics pub cache gc --dry-run',
  miseVersions: 'ls --prunable --json',
  homebrewCellar: '--cellar',
  homebrewCleanup: 'cleanup -n',
  homebrewAutoremove: 'autoremove -n',
} as const;

export type ProbeCommandName = keyof typeof PROBE_ARGUMENT_TEXTS;

/** What a fake tool prints and how it exits when called with the arguments of `command`. */
export type ProbeFakeAnswer = { command: ProbeCommandName; stdoutText: string; exitCode: number };

const UNEXPECTED_ARGUMENTS_EXIT_CODE = 64;

/**
 * Writes a fake `name` into `folder` that prints the `stdoutText` of an answer and exits with its
 * `exitCode` when called with the arguments of its command, and exits 64 for any other call.
 * `prelude`, shell code, runs before each answer.
 */
export async function createProbeFakeTool(params: {
  folder: string;
  name: ToolName;
  answers: ProbeFakeAnswer[];
  mode?: number;
  prelude?: string;
}): Promise<string> {
  const answerBranches = buildAnswerBranches({
    folder: params.folder,
    name: params.name,
    answers: params.answers,
    prelude: params.prelude ?? '',
  });
  const body = `case "$*" in
${answerBranches}
esac
echo "unexpected arguments: $*" >&2
exit ${UNEXPECTED_ARGUMENTS_EXIT_CODE}`;
  const path = await createFakeTool({
    folder: params.folder,
    name: params.name,
    body: body,
    mode: params.mode ?? 0o755,
  });

  await writeAnswerStdoutFiles({
    folder: params.folder,
    name: params.name,
    answers: params.answers,
  });

  return path;
}

/**
 * Writes a fake of the unit's tool into `folder` that answers the commands of its probe as
 * `createProbeFakeTool` does, runs `commandBody` when called with the unit's command, and exits 64
 * for any other call. `commandBody` is shell code that ends with its own `exit`; `probePrelude`,
 * shell code too, runs before each answer.
 */
export async function createUnitRunFakeTool(params: {
  folder: string;
  unit: ExploreToolUnit;
  answers: ProbeFakeAnswer[];
  commandBody: string;
  probePrelude?: string;
}): Promise<string> {
  const name = params.unit.tool.name;
  const answerBranches = buildAnswerBranches({
    folder: params.folder,
    name: name,
    answers: params.answers,
    prelude: params.probePrelude ?? '',
  });
  const commandText = buildUnitRunArguments(params.unit).join(' ');
  const body = `case "$*" in
${answerBranches}
"${commandText}")
${params.commandBody}
;;
esac
echo "unexpected arguments: $*" >&2
exit ${UNEXPECTED_ARGUMENTS_EXIT_CODE}`;
  const path = await createFakeTool({ folder: params.folder, name: name, body: body });

  await writeAnswerStdoutFiles({ folder: params.folder, name: name, answers: params.answers });

  return path;
}

/** Each tool at the one absolute path given, and every tool not given nowhere. */
export function buildFixtureToolLocations(
  paths: Partial<Record<ToolName, string>>,
): ToolInstallLocations {
  return {
    xcrun: buildFixtureToolLocation(paths.xcrun),
    dart: buildFixtureToolLocation(paths.dart),
    mise: buildFixtureToolLocation(paths.mise),
    brewAppleSilicon: buildFixtureToolLocation(paths.brewAppleSilicon),
    brewIntel: buildFixtureToolLocation(paths.brewIntel),
    avdmanager: buildFixtureToolLocation(paths.avdmanager),
  };
}

function buildFixtureToolLocation(path: string | undefined): ToolLocation[] {
  if (path === undefined) {
    return [];
  }

  return [{ kind: 'path', root: 'absolute', path: path }];
}

/** The `case` branches that print the stdout file of each answer and exit with its code. */
function buildAnswerBranches(params: {
  folder: string;
  name: ToolName;
  answers: ProbeFakeAnswer[];
  prelude: string;
}): string {
  return params.answers
    .map(
      (answer) => `"${PROBE_ARGUMENT_TEXTS[answer.command]}")
${params.prelude}
  cat '${buildAnswerStdoutPath({ folder: params.folder, name: params.name, answer: answer })}'
  echo 'a line on stderr' >&2
  exit ${answer.exitCode}
;;`,
    )
    .join('\n');
}

async function writeAnswerStdoutFiles(params: {
  folder: string;
  name: ToolName;
  answers: ProbeFakeAnswer[];
}): Promise<void> {
  await Promise.all(
    params.answers.map((answer) =>
      writeFile(
        buildAnswerStdoutPath({ folder: params.folder, name: params.name, answer: answer }),
        answer.stdoutText,
      ),
    ),
  );
}

function buildAnswerStdoutPath(params: {
  folder: string;
  name: ToolName;
  answer: ProbeFakeAnswer;
}): string {
  return join(params.folder, `${params.name}.${params.answer.command}.stdout`);
}
