import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import { isJsonObject, parseJsonValue } from '../../system/parseJsonValue.js';
import type { ExploreProbeDefinition } from '../loadProbeOutput.js';

declare const miseToolNameBrand: unique symbol;

declare const miseToolVersionBrand: unique symbol;

/** A tool name that `parseMiseToolName` checked, so it never reads as an option. */
export type MiseToolName = string & { [miseToolNameBrand]: true };

/** A version that `parseMiseToolVersion` checked, so it never reads as an option. */
export type MiseToolVersion = string & { [miseToolVersionBrand]: true };

/** An installed version that `mise prune` would remove. */
export type MisePrunableVersion = {
  miseToolName: MiseToolName;
  version: MiseToolVersion;
  installPath: AbsolutePath;
};

/**
 * The same set `mise prune --dry-run` names, as JSON on stdout; the dry run itself reports on
 * stderr, which the runner keeps only as a tail.
 */
export const MISE_PRUNABLE_LIST_PROBE: ExploreProbeDefinition<MisePrunableVersion[]> = {
  toolName: 'mise',
  args: ['ls', '--prunable', '--json'],
  parse: parseMisePrunableVersions,
};

// Both become the argument `<tool>@<version>` of `mise uninstall`, so neither may start an option.
const TOOL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/@-]*$/;

const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

/** The one maker of a `MiseToolName`; fails for a name that could start an option. */
export function parseMiseToolName(params: { text: string }): Result<MiseToolName, string> {
  if (!TOOL_NAME_PATTERN.test(params.text)) {
    return { kind: 'failed', failure: 'a malformed tool name' };
  }

  // The brand records the check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: params.text as MiseToolName };
}

/** The one maker of a `MiseToolVersion`; fails for a version that could start an option. */
export function parseMiseToolVersion(params: { text: string }): Result<MiseToolVersion, string> {
  if (!VERSION_PATTERN.test(params.text)) {
    return { kind: 'failed', failure: 'a malformed version' };
  }

  // The brand records the check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: params.text as MiseToolVersion };
}

/** Parses the JSON of `mise ls --prunable --json`; fails with a reason on any other shape. */
export function parseMisePrunableVersions(params: {
  stdoutText: string;
}): Result<MisePrunableVersion[], string> {
  const json = parseJsonValue({ text: params.stdoutText });

  if (json.kind === 'failed') {
    return json;
  }

  if (!isJsonObject(json.value)) {
    return { kind: 'failed', failure: 'no object of tools' };
  }

  const versions: MisePrunableVersion[] = [];

  for (const [miseToolNameText, toolVersions] of Object.entries(json.value)) {
    const miseToolName = parseMiseToolName({ text: miseToolNameText });

    if (miseToolName.kind === 'failed' || !Array.isArray(toolVersions)) {
      return { kind: 'failed', failure: 'a tool has a malformed name or no list of versions' };
    }

    for (const value of toolVersions) {
      const version = parseMisePrunableVersion({ value: value, miseToolName: miseToolName.value });

      if (version === null) {
        return { kind: 'failed', failure: 'a version lacks a field or has a malformed one' };
      }

      versions.push(version);
    }
  }

  return { kind: 'succeeded', value: versions };
}

function parseMisePrunableVersion(params: {
  value: unknown;
  miseToolName: MiseToolName;
}): MisePrunableVersion | null {
  if (!isJsonObject(params.value)) {
    return null;
  }

  const versionText = params.value.version;
  const installPathText = params.value.install_path;

  if (typeof versionText !== 'string' || typeof installPathText !== 'string') {
    return null;
  }

  const version = parseMiseToolVersion({ text: versionText });
  const installPath = parseAbsolutePath({ text: installPathText });

  if (version.kind === 'failed' || installPath.kind === 'failed') {
    return null;
  }

  return {
    miseToolName: params.miseToolName,
    version: version.value,
    installPath: installPath.value,
  };
}
