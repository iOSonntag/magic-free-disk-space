import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import type { ExploreProbeDefinition } from '../loadProbeOutput.js';

/** The paths each of the two cleans would remove, across every package folder conda uses. */
export type CondaCleanPlan = { tarballPaths: AbsolutePath[]; packagePaths: AbsolutePath[] };

/** Prints its plan as JSON and removes nothing: its dry run returns before any removal. */
export const CONDA_CLEAN_DRY_RUN_PROBE: ExploreProbeDefinition<CondaCleanPlan> = {
  toolName: 'conda',
  args: ['clean', '--tarballs', '--packages', '--dry-run', '--json'],
  parse: parseCondaCleanDryRun,
};

// conda prints its JSON indented, so a top-level object closes at the start of a line.
const TOP_LEVEL_OBJECT_END = '\n}';

/**
 * Parses the JSON of the dry run: under `tarballs` and `packages`, `pkgs_dirs` maps each absolute
 * package folder to the names in it that would go. Fails on any other shape.
 */
export function parseCondaCleanDryRun(params: {
  pathRules: PathRules;
  stdoutText: string;
}): Result<CondaCleanPlan, string> {
  const answer = parseJsonObject({ text: params.stdoutText });

  if (answer === null) {
    return { kind: 'failed', failure: 'the answer is no JSON object' };
  }

  const tarballPaths = parseCondaCleanSection({
    pathRules: params.pathRules,
    section: answer.tarballs,
  });
  const packagePaths = parseCondaCleanSection({
    pathRules: params.pathRules,
    section: answer.packages,
  });

  if (tarballPaths === null || packagePaths === null) {
    return { kind: 'failed', failure: 'a clean section has no list of package folders' };
  }

  return { kind: 'succeeded', value: { tarballPaths: tarballPaths, packagePaths: packagePaths } };
}

/**
 * The whole text as one JSON object, or else its first object up to the first line that closes
 * one, since conda may print the note of its dry-run exit as JSON after the plan.
 */
function parseJsonObject(params: { text: string }): Record<string, unknown> | null {
  const whole = parseJsonObjectText({ text: params.text });

  if (whole !== null) {
    return whole;
  }

  const firstObjectEnd = params.text.indexOf(TOP_LEVEL_OBJECT_END);

  if (firstObjectEnd === -1) {
    return null;
  }

  return parseJsonObjectText({
    text: params.text.slice(0, firstObjectEnd + TOP_LEVEL_OBJECT_END.length),
  });
}

function parseJsonObjectText(params: { text: string }): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(params.text);

    return isJsonObject(value) ? value : null;
  } catch {
    return null;
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `null` for a section that is not `{pkgs_dirs: {<absolute folder>: [<entry name>, …]}}`. */
function parseCondaCleanSection(params: {
  pathRules: PathRules;
  section: unknown;
}): AbsolutePath[] | null {
  if (!isJsonObject(params.section) || !isJsonObject(params.section.pkgs_dirs)) {
    return null;
  }

  const paths: AbsolutePath[] = [];

  for (const [folderText, names] of Object.entries(params.section.pkgs_dirs)) {
    const folderPath = parseAbsolutePath({ rules: params.pathRules, text: folderText });

    if (folderPath.kind === 'failed' || !Array.isArray(names)) {
      return null;
    }

    for (const name of names) {
      if (!isCondaEntryName(name, params.pathRules.separator)) {
        return null;
      }

      paths.push(
        joinAbsolutePath({ rules: params.pathRules, parentPath: folderPath.value, names: [name] }),
      );
    }
  }

  return paths;
}

function isCondaEntryName(name: unknown, separator: string): name is string {
  return (
    typeof name === 'string' &&
    name !== '' &&
    name !== '.' &&
    name !== '..' &&
    !name.includes(separator)
  );
}
