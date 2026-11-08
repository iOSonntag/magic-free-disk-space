import type { Result } from '../../result.js';
import type { VagrantBoxName, VagrantBoxProvider, VagrantBoxVersion } from './vagrantBoxNames.js';

/**
 * Each becomes an argument of `vagrant box remove`, so none may start an option. A name's slashes
 * become its folder's `-VAGRANTSLASH-`, so it never names a folder outside the boxes folder.
 */
const BOX_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._/-]*$/;

const BOX_PROVIDER_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/** Only numbered versions, which `compareDottedVersions` orders. */
const BOX_VERSION_PATTERN = /^\d+(\.\d+)*$/;

export function parseVagrantBoxName(params: { text: string }): Result<VagrantBoxName, string> {
  if (!BOX_NAME_PATTERN.test(params.text)) {
    return { kind: 'failed', failure: 'not a box name' };
  }

  // The brand records the check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: params.text as VagrantBoxName };
}

export function parseVagrantBoxProvider(params: {
  text: string;
}): Result<VagrantBoxProvider, string> {
  if (!BOX_PROVIDER_PATTERN.test(params.text)) {
    return { kind: 'failed', failure: 'not a provider' };
  }

  // The brand records the check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: params.text as VagrantBoxProvider };
}

export function parseVagrantBoxVersion(params: {
  text: string;
}): Result<VagrantBoxVersion, string> {
  if (!BOX_VERSION_PATTERN.test(params.text)) {
    return { kind: 'failed', failure: 'not a numbered version' };
  }

  // The brand records the check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: params.text as VagrantBoxVersion };
}
