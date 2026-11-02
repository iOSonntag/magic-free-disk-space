import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isJsonObject } from '../../src/system/parseJsonValue.js';
import { createFakeTool } from '../support/fakeTool.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { isPresent } from '../support/fixtureRoot.js';

/** A release script the tests run, by its file name in `scripts/release`. */
export type ReleaseScriptName = 'setupSigning.sh' | 'rehearse.sh' | 'tagRelease.sh';

export type FixtureCommandRun = { exitCode: number; stdoutText: string; stderrText: string };

/**
 * What the fake `gh` prints and how it exits for a call whose arguments, joined by single spaces,
 * equal `argumentsText`: the n-th such call prints the n-th of `stdoutTexts`, every later call the
 * last one.
 */
export type FakeGhAnswer = {
  argumentsText: string;
  stdoutTexts: [string, ...string[]];
  exitCode: number;
};

/** One call of the fake `gh`: its arguments joined by single spaces, and all it read on stdin. */
export type FakeGhCall = { argumentsText: string; stdinText: string };

/** What `.github/workflows/release.yml` decides and the release scripts must match. */
export type ReleaseWorkflowContract = {
  /** Each `secrets.NAME` the workflow reads, once, sorted. */
  secretNames: string[];
  dispatchInputNames: string[];
  uploadedArtifactNames: string[];
};

/** The arguments of the `gh` call by which a release script names the repository it works on. */
export const REPO_VIEW_ARGUMENTS = 'repo view --json nameWithOwner --jq .nameWithOwner';

const repositoryDir = join(import.meta.dir, '../..');
const releaseScriptsDir = join(repositoryDir, 'scripts/release');
const releaseWorkflowPath = join(repositoryDir, '.github/workflows/release.yml');
const systemPathDirs = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];

// Without a global or system config, no signing, hook, or credential helper of the machine runs.
const fixtureGitEnvironment = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
  GIT_AUTHOR_NAME: 'Release Test',
  GIT_AUTHOR_EMAIL: 'release-test@example.com',
  GIT_COMMITTER_NAME: 'Release Test',
  GIT_COMMITTER_EMAIL: 'release-test@example.com',
};

const UNEXPECTED_ARGUMENTS_EXIT_CODE = 64;

/**
 * Runs `command` in `workingDir` with the fixture environment: PATH holds the fixture's bin folder,
 * where `bun` links to the running Bun and `createFakeGh` writes `gh`, then the system folders;
 * HOME and TMPDIR lie in the fixture root; git reads no config of the machine.
 */
export async function runFixtureCommand(params: {
  fixtureRoot: FixtureRoot;
  workingDir: string;
  command: string[];
  stdinText: string | null;
}): Promise<FixtureCommandRun> {
  const binDir = await createFixtureBinDir({ fixtureRoot: params.fixtureRoot });
  const child = Bun.spawn(params.command, {
    cwd: params.workingDir,
    env: {
      PATH: [binDir, ...systemPathDirs].join(':'),
      HOME: params.fixtureRoot.homeDir,
      TMPDIR: params.fixtureRoot.tempDir,
      ...fixtureGitEnvironment,
    },
    stdin: params.stdinText === null ? 'ignore' : new Blob([params.stdinText]),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdoutText, stderrText, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { exitCode: exitCode, stdoutText: stdoutText, stderrText: stderrText };
}

/** Runs a release script of this checkout under `/bin/bash`, as `runFixtureCommand` runs a command. */
export async function runReleaseScript(params: {
  fixtureRoot: FixtureRoot;
  scriptName: ReleaseScriptName;
  args: string[];
  workingDir: string;
  stdinText: string | null;
}): Promise<FixtureCommandRun> {
  return runFixtureCommand({
    fixtureRoot: params.fixtureRoot,
    workingDir: params.workingDir,
    command: ['/bin/bash', join(releaseScriptsDir, params.scriptName), ...params.args],
    stdinText: params.stdinText,
  });
}

/**
 * Writes a fake `gh` into the fixture's bin folder. It records every call for `loadFakeGhCalls`,
 * reads stdin only where gh does, for `secret set` and `--input -`, answers a call that matches an
 * answer, and exits 64 on any other call.
 */
export async function createFakeGh(params: {
  fixtureRoot: FixtureRoot;
  answers: FakeGhAnswer[];
}): Promise<void> {
  const binDir = await createFixtureBinDir({ fixtureRoot: params.fixtureRoot });
  const logDir = join(params.fixtureRoot.rootDir, 'gh-log');
  const answersDir = join(params.fixtureRoot.rootDir, 'gh-answers');

  await mkdir(logDir, { recursive: true });

  for (const [answerIndex, answer] of params.answers.entries()) {
    await writeFakeGhAnswer({
      answerDir: join(answersDir, String(answerIndex).padStart(3, '0')),
      answer: answer,
    });
  }

  await createFakeTool({
    folder: binDir,
    name: 'gh',
    body: buildFakeGhBody({ logDir: logDir, answersDir: answersDir }),
  });
}

/** The calls the fake `gh` received, in their order; empty when it was never called. */
export async function loadFakeGhCalls(params: { fixtureRoot: FixtureRoot }): Promise<FakeGhCall[]> {
  const logDir = join(params.fixtureRoot.rootDir, 'gh-log');
  const countPath = join(logDir, 'count');

  if (!(await isPresent(countPath))) {
    return [];
  }

  const callCount = Number(await readFile(countPath, 'utf8'));
  const calls: FakeGhCall[] = [];

  for (let callNumber = 1; callNumber <= callCount; callNumber += 1) {
    calls.push({
      argumentsText: await readFile(join(logDir, `call-${callNumber}-arguments`), 'utf8'),
      stdinText: await readFile(join(logDir, `call-${callNumber}-stdin`), 'utf8'),
    });
  }

  return calls;
}

export async function loadReleaseWorkflowContract(): Promise<ReleaseWorkflowContract> {
  const workflowText = await readFile(releaseWorkflowPath, 'utf8');
  const workflow: unknown = Bun.YAML.parse(workflowText);

  return {
    secretNames: findSecretNames(workflowText),
    dispatchInputNames: findDispatchInputNames(workflow),
    uploadedArtifactNames: findUploadedArtifactNames(workflow),
  };
}

/**
 * Creates the fixture's bin folder, which the fixture PATH reads first, with `bun` linked into it,
 * and returns its path; a tool a test writes there shadows the system one.
 */
export async function createFixtureBinDir(params: { fixtureRoot: FixtureRoot }): Promise<string> {
  const binDir = join(params.fixtureRoot.rootDir, 'bin');
  const bunPath = join(binDir, 'bun');

  await mkdir(binDir, { recursive: true });

  if (!(await isPresent(bunPath))) {
    await symlink(process.execPath, bunPath);
  }

  return binDir;
}

async function writeFakeGhAnswer(params: {
  answerDir: string;
  answer: FakeGhAnswer;
}): Promise<void> {
  await mkdir(params.answerDir, { recursive: true });
  await writeFile(join(params.answerDir, 'arguments'), params.answer.argumentsText);
  await writeFile(join(params.answerDir, 'exit-code'), String(params.answer.exitCode));
  await writeFile(join(params.answerDir, 'count'), '0');
  await writeFile(join(params.answerDir, 'last'), String(params.answer.stdoutTexts.length));

  for (const [outputIndex, stdoutText] of params.answer.stdoutTexts.entries()) {
    await writeFile(join(params.answerDir, `stdout-${outputIndex + 1}`), stdoutText);
  }
}

function buildFakeGhBody(params: { logDir: string; answersDir: string }): string {
  return `log_dir='${params.logDir}'
answers_dir='${params.answersDir}'
call_count=0
if [ -f "$log_dir/count" ]; then call_count=$(cat "$log_dir/count"); fi
call_number=$((call_count + 1))
printf '%s' "$call_number" > "$log_dir/count"
printf '%s' "$*" > "$log_dir/call-$call_number-arguments"
case " $* " in
  *" secret set "* | *" --input - "*) cat > "$log_dir/call-$call_number-stdin" ;;
  *) : > "$log_dir/call-$call_number-stdin" ;;
esac
for answer_dir in "$answers_dir"/*; do
  [ -d "$answer_dir" ] || continue
  if [ "$*" = "$(cat "$answer_dir/arguments")" ]; then
    answer_count=$(($(cat "$answer_dir/count") + 1))
    printf '%s' "$answer_count" > "$answer_dir/count"
    stdout_path="$answer_dir/stdout-$answer_count"
    if [ ! -f "$stdout_path" ]; then stdout_path="$answer_dir/stdout-$(cat "$answer_dir/last")"; fi
    cat "$stdout_path"
    exit "$(cat "$answer_dir/exit-code")"
  fi
done
echo "unexpected arguments: $*" >&2
exit ${UNEXPECTED_ARGUMENTS_EXIT_CODE}`;
}

function findSecretNames(workflowText: string): string[] {
  const names = new Set<string>();

  for (const match of workflowText.matchAll(/\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*\}\}/g)) {
    const name = match[1];

    if (name !== undefined) {
      names.add(name);
    }
  }

  return [...names].toSorted();
}

function findDispatchInputNames(workflow: unknown): string[] {
  const triggers = readRecordField(workflow, 'on');
  const dispatch = readRecordField(triggers, 'workflow_dispatch');
  const inputs = readRecordField(dispatch, 'inputs');

  if (inputs === null) {
    return [];
  }

  return Object.keys(inputs);
}

function findUploadedArtifactNames(workflow: unknown): string[] {
  const jobs = readRecordField(workflow, 'jobs');

  if (jobs === null) {
    return [];
  }

  return Object.values(jobs).flatMap((job) => {
    const steps = isJsonObject(job) ? job.steps : null;

    if (!Array.isArray(steps)) {
      return [];
    }

    return steps.flatMap((step: unknown) => {
      const uses = isJsonObject(step) ? step.uses : null;
      const name = readRecordField(step, 'with')?.name;

      if (typeof uses !== 'string' || !uses.startsWith('actions/upload-artifact@')) {
        return [];
      }

      return typeof name === 'string' ? [name] : [];
    });
  });
}

function readRecordField(value: unknown, key: string): Record<string, unknown> | null {
  if (!isJsonObject(value)) {
    return null;
  }

  const field = value[key];

  return isJsonObject(field) ? field : null;
}
