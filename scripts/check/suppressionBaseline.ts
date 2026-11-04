import { readFile } from 'node:fs/promises';
import type { Result } from '../../src/result.js';
import { getErrorCode } from '../../src/system/getErrorCode.js';
import { isJsonObject, parseJsonValue } from '../../src/system/parseJsonValue.js';

/**
 * The violations a lint keeps frozen, in the format of ESLint's `eslint-suppressions.json`: for
 * each file, by its path from the repository root, how many violations of each rule it may keep.
 */
export type SuppressionBaseline = Record<string, Record<string, { count: number }>>;

/** A violation as a baseline counts it: by the file it stands in and the rule it breaks. */
export type CountedViolation = { filePath: string; rule: string };

/** A count of a baseline above the violations of its rule in its file, which it no longer needs. */
export type UnneededSuppression = {
  filePath: string;
  rule: string;
  count: number;
  violationCount: number;
};

/** The baseline file of the boundary lint, by its path from the repository root. */
export const BOUNDARY_SUPPRESSIONS_PATH = 'boundary-suppressions.json';

/** Parses the text of a baseline file; the failure names what is wrong with it. */
export function parseSuppressionBaseline(text: string): Result<SuppressionBaseline, string> {
  const json = parseJsonValue({ text: text });

  if (json.kind === 'failed' || !isJsonObject(json.value)) {
    return { kind: 'failed', failure: 'it is no JSON object' };
  }

  const baseline: SuppressionBaseline = {};

  for (const [filePath, rules] of Object.entries(json.value)) {
    if (!isJsonObject(rules)) {
      return { kind: 'failed', failure: `the entry of ${filePath} is no object of rules` };
    }

    const counts: Record<string, { count: number }> = {};

    for (const [rule, suppression] of Object.entries(rules)) {
      const count = isJsonObject(suppression) ? suppression.count : null;

      if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
        return {
          kind: 'failed',
          failure: `the count of ${rule} in ${filePath} is no whole number above 0`,
        };
      }

      counts[rule] = { count: count };
    }

    baseline[filePath] = counts;
  }

  return { kind: 'succeeded', value: baseline };
}

/** Reads the baseline file at `path`: empty when no file is there, failed when it is no baseline. */
export async function loadSuppressionBaseline(
  path: string,
): Promise<Result<SuppressionBaseline, string>> {
  const text = await loadBaselineText(path);

  if (text.kind === 'failed') {
    return text;
  }

  if (text.value === null) {
    return { kind: 'succeeded', value: {} };
  }

  return parseSuppressionBaseline(text.value);
}

/**
 * The violations the baseline does not freeze. A file that holds more violations of a rule than
 * the baseline counts keeps all of them, as in ESLint, since no count tells which ones are new.
 */
export function findUnsuppressedViolations<TViolation extends CountedViolation>(params: {
  violations: TViolation[];
  baseline: SuppressionBaseline;
}): TViolation[] {
  const violationCounts = countViolations(params.violations);

  return params.violations.filter((violation) => {
    const count = params.baseline[violation.filePath]?.[violation.rule]?.count ?? 0;

    return (violationCounts.get(formatCountKey(violation)) ?? 0) > count;
  });
}

/** Each count of the baseline above the violations it freezes, which the baseline must lower. */
export function findUnneededSuppressions(params: {
  violations: CountedViolation[];
  baseline: SuppressionBaseline;
}): UnneededSuppression[] {
  const violationCounts = countViolations(params.violations);

  return Object.entries(params.baseline).flatMap(([filePath, rules]) =>
    Object.entries(rules).flatMap(([rule, suppression]) => {
      const violationCount =
        violationCounts.get(formatCountKey({ filePath: filePath, rule: rule })) ?? 0;

      if (suppression.count <= violationCount) {
        return [];
      }

      return [
        {
          filePath: filePath,
          rule: rule,
          count: suppression.count,
          violationCount: violationCount,
        },
      ];
    }),
  );
}

/** The text of the file at `path`; `null` when no file is there. */
async function loadBaselineText(path: string): Promise<Result<string | null, string>> {
  try {
    return { kind: 'succeeded', value: await readFile(path, 'utf8') };
  } catch (error) {
    const code = getErrorCode(error);

    if (code === 'ENOENT') {
      return { kind: 'succeeded', value: null };
    }

    return { kind: 'failed', failure: `it cannot be read: ${code}` };
  }
}

function countViolations(violations: CountedViolation[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const violation of violations) {
    const key = formatCountKey(violation);

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function formatCountKey(violation: CountedViolation): string {
  return JSON.stringify([violation.filePath, violation.rule]);
}
