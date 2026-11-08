import type { EnvironmentFailure } from '../environment/environmentPlatform.js';
import { formatSystemCallFailure } from '../system/systemCallFailure.js';
import { formatDisplayText } from './formatDisplayText.js';

/** The text with which the tool refuses to start on an operating system it does not run on. */
export function formatUnsupportedPlatform(): string {
  return 'This tool runs on macOS and Windows only.';
}

export function formatEnvironmentFailure(params: { failure: EnvironmentFailure }): string {
  const failure = params.failure;

  switch (failure.reason) {
    case 'runAsRoot':
      return 'Run this tool as yourself, not as root or with sudo: it deletes in the home folder of the user who runs it.';
    case 'runElevated':
      return 'Start this tool without "Run as administrator": it deletes in the user folder of the account that runs it.';
    case 'unresolvable':
      return `Cannot resolve ${formatDisplayText({ text: failure.path })}: ${failure.code}`;
    case 'callFailed':
      return `Cannot read your account and its folders from the system: ${formatSystemCallFailure({ failure: failure })}`;
    case 'homeNotOwned':
      return `The home folder ${formatDisplayText({ text: failure.path })} does not belong to you. Check the HOME variable.`;
    case 'profileNotOwned':
      return `The user folder ${formatDisplayText({ text: failure.path })} does not belong to your Windows account.`;
    case 'tempOverlapsHome':
      return `The temporary folder ${formatDisplayText({ text: failure.path })} overlaps the home folder, so nothing in it can count as temporary.`;
    case 'variableElsewhere':
      return `The environment variable ${formatDisplayText({ text: failure.variableName })} does not point to ${formatDisplayText({ text: failure.path })}, the folder Windows keeps for your account. Start this tool from a normal session of your account.`;
  }
}
