import type { EnvironmentFailure } from '../environment/loadEnvironment.js';
import { formatDisplayText } from './formatDisplayText.js';

export function formatEnvironmentFailure(params: { failure: EnvironmentFailure }): string {
  const failure = params.failure;

  switch (failure.reason) {
    case 'unsupportedPlatform':
      return 'This tool runs on macOS only.';
    case 'runAsRoot':
      return 'Run this tool as yourself, not as root or with sudo: it deletes in the home folder of the user who runs it.';
    case 'unresolvable':
      return `Cannot resolve ${formatDisplayText({ text: failure.path })}: ${failure.code}`;
    case 'homeNotOwned':
      return `The home folder ${formatDisplayText({ text: failure.path })} does not belong to you. Check the HOME variable.`;
    case 'tempOverlapsHome':
      return `The temporary folder ${formatDisplayText({ text: failure.path })} overlaps the home folder, so nothing in it can count as temporary.`;
  }
}
