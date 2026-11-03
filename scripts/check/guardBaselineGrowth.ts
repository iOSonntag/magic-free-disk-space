import type { Result } from '../../src/result.js';
import type { SuppressionBaseline } from './suppressionBaseline.js';
import {
  BOUNDARY_SUPPRESSIONS_PATH,
  loadSuppressionBaseline,
  parseSuppressionBaseline,
} from './suppressionBaseline.js';

type BaselineGrowthRuleTotal = {
  kind: 'ruleTotal';
  rule: string;
  baseCount: number;
  currentCount: number;
};

type BaselineGrowthFileCount = {
  kind: 'fileCount';
  filePath: string;
  rule: string;
  baseCount: number;
  currentCount: number;
};

/** A count of a baseline that rose against the base: of a rule in total, or of a rule in a file. */
type BaselineGrowth = BaselineGrowthRuleTotal | BaselineGrowthFileCount;

/** The commit a change grows from, and the text of the baseline file in it, `null` for none. */
type BaselineBase = { commit: string; baselineText: string | null };

type GitRun = { exitCode: number; stdoutText: string; stderrText: string };

const DEFAULT_BASE_REF = 'origin/main';
const FAILURE_EXIT_CODE = 1;
const SHORT_COMMIT_LENGTH = 7;

/** Each count of `current` above its count in `base`: each rule's total, then each file's rules. */
function findBaselineGrowth(params: {
  base: SuppressionBaseline;
  current: SuppressionBaseline;
}): BaselineGrowth[] {
  const baseTotals = countRuleTotals(params.base);
  const ruleTotalGrowth = [...countRuleTotals(params.current)].flatMap(
    ([rule, currentCount]): BaselineGrowth[] => {
      const baseCount = baseTotals.get(rule) ?? 0;

      if (currentCount <= baseCount) {
        return [];
      }

      return [{ kind: 'ruleTotal', rule: rule, baseCount: baseCount, currentCount: currentCount }];
    },
  );
  const fileCountGrowth = Object.entries(params.current).flatMap(([filePath, rules]) =>
    Object.entries(rules).flatMap(([rule, suppression]): BaselineGrowth[] => {
      const baseCount = params.base[filePath]?.[rule]?.count ?? 0;

      if (suppression.count <= baseCount) {
        return [];
      }

      return [
        {
          kind: 'fileCount',
          filePath: filePath,
          rule: rule,
          baseCount: baseCount,
          currentCount: suppression.count,
        },
      ];
    }),
  );

  return [...ruleTotalGrowth, ...fileCountGrowth];
}

function countRuleTotals(baseline: SuppressionBaseline): Map<string, number> {
  const totals = new Map<string, number>();

  for (const rules of Object.values(baseline)) {
    for (const [rule, suppression] of Object.entries(rules)) {
      totals.set(rule, (totals.get(rule) ?? 0) + suppression.count);
    }
  }

  return totals;
}

/**
 * Finds the merge base of HEAD and `baseRef` and reads the baseline file at `baselinePath` in it.
 * Fails when the ref names no commit or shares none with HEAD. Runs git for reads only.
 */
async function loadBaselineBase(params: {
  baseRef: string;
  baselinePath: string;
}): Promise<Result<BaselineBase, string>> {
  const resolved = await runGit(['rev-parse', '--verify', '--quiet', `${params.baseRef}^{commit}`]);

  if (resolved.exitCode !== 0) {
    return {
      kind: 'failed',
      failure: `the base ref ${params.baseRef} names no commit; fetch it, or set BASELINE_BASE_REF to the ref the change merges into`,
    };
  }

  const mergeBase = await runGit(['merge-base', 'HEAD', resolved.stdoutText.trim()]);

  if (mergeBase.exitCode !== 0) {
    return {
      kind: 'failed',
      failure: `HEAD shares no commit with ${params.baseRef}; a shallow clone needs its full history`,
    };
  }

  const commit = mergeBase.stdoutText.trim();
  const listed = await runGit(['ls-tree', '--name-only', commit, '--', params.baselinePath]);

  if (listed.exitCode !== 0) {
    return { kind: 'failed', failure: `git ls-tree failed: ${listed.stderrText.trim()}` };
  }

  if (listed.stdoutText.trim() === '') {
    return { kind: 'succeeded', value: { commit: commit, baselineText: null } };
  }

  const shown = await runGit(['cat-file', 'blob', `${commit}:./${params.baselinePath}`]);

  if (shown.exitCode !== 0) {
    return { kind: 'failed', failure: `git cat-file failed: ${shown.stderrText.trim()}` };
  }

  return { kind: 'succeeded', value: { commit: commit, baselineText: shown.stdoutText } };
}

async function runGit(args: string[]): Promise<GitRun> {
  const child = Bun.spawn(['git', ...args], { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
  const [stdoutText, stderrText, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { exitCode: exitCode, stdoutText: stdoutText, stderrText: stderrText };
}

function formatBaselineGrowth(growth: BaselineGrowth): string {
  switch (growth.kind) {
    case 'ruleTotal':
      return `  ${growth.rule}: ${growth.currentCount} in total, ${growth.baseCount} at the base`;
    case 'fileCount':
      return `  ${growth.filePath}: ${growth.currentCount} of ${growth.rule}, ${growth.baseCount} at the base`;
  }
}

async function runGuardBaselineGrowthCommand(): Promise<number> {
  const baselinePath = BOUNDARY_SUPPRESSIONS_PATH;
  const configuredBaseRef = process.env.BASELINE_BASE_REF;
  const baseRef =
    configuredBaseRef === undefined || configuredBaseRef === ''
      ? DEFAULT_BASE_REF
      : configuredBaseRef;
  const base = await loadBaselineBase({ baseRef: baseRef, baselinePath: baselinePath });

  if (base.kind === 'failed') {
    console.error(`error: ${base.failure}`);

    return FAILURE_EXIT_CODE;
  }

  const baseName = `${base.value.commit.slice(0, SHORT_COMMIT_LENGTH)} of ${baseRef}`;
  // A base without the file counts as empty, so a change that deletes the file and the next one
  // that adds it back with counts cannot grow it in two steps.
  const baseBaseline: Result<SuppressionBaseline, string> =
    base.value.baselineText === null
      ? { kind: 'succeeded', value: {} }
      : parseSuppressionBaseline(base.value.baselineText);

  if (baseBaseline.kind === 'failed') {
    console.error(
      `error: ${baselinePath} in its base ${baseName} is no baseline: ${baseBaseline.failure}`,
    );

    return FAILURE_EXIT_CODE;
  }

  const currentBaseline = await loadSuppressionBaseline(baselinePath);

  if (currentBaseline.kind === 'failed') {
    console.error(`error: ${baselinePath} is no baseline: ${currentBaseline.failure}`);

    return FAILURE_EXIT_CODE;
  }

  const growth = findBaselineGrowth({ base: baseBaseline.value, current: currentBaseline.value });

  if (growth.length === 0) {
    console.log(`${baselinePath} did not grow against its base ${baseName}`);

    return 0;
  }

  console.error(`error: ${baselinePath} grew against its base ${baseName}:
${growth.map(formatBaselineGrowth).join('\n')}
The baseline may only shrink: fix the new violations instead of freezing them.`);

  return FAILURE_EXIT_CODE;
}

if (import.meta.main) {
  process.exit(await runGuardBaselineGrowthCommand());
}
