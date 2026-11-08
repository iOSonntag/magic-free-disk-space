import type { EnvironmentFailure } from '../../environment/environmentPlatform.js';
import { isSamePath } from '../../path/isSameOrInsidePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';

/** What a variable that names a folder of the run holds, as the loader read it. */
export type VariableReading =
  | { kind: 'unset' }
  | { kind: 'resolved'; realPath: AbsolutePath }
  | { kind: 'unresolvable' };

/** A variable, what it holds, and the folder Windows keeps for it, by display and real path. */
export type VariableCheck = {
  variableName: string;
  reading: VariableReading;
  expectedPath: AbsolutePath;
  expectedRealPath: AbsolutePath;
};

/**
 * The refusal for the first variable that names another folder than the one Windows keeps for the
 * run, or `null`. A tool started by the user reads these variables, so the run refuses to delete
 * when they disagree with Windows. An unset variable names no folder and passes; one that does not
 * resolve fails. Real paths compare, since Windows often writes a variable with short 8.3 names.
 */
export function checkVariablePlacement(params: {
  pathRules: PathRules;
  checks: VariableCheck[];
}): EnvironmentFailure | null {
  for (const check of params.checks) {
    if (!isPlacedAsExpected({ pathRules: params.pathRules, check: check })) {
      return {
        reason: 'variableElsewhere',
        variableName: check.variableName,
        path: check.expectedPath,
      };
    }
  }

  return null;
}

function isPlacedAsExpected(params: { pathRules: PathRules; check: VariableCheck }): boolean {
  switch (params.check.reading.kind) {
    case 'unset':
      return true;
    case 'unresolvable':
      return false;
    case 'resolved':
      return isSamePath({
        rules: params.pathRules,
        path: params.check.reading.realPath,
        otherPath: params.check.expectedRealPath,
      });
  }
}
