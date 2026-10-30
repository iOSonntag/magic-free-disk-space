import { isAbsolute } from 'node:path';
import type { Result } from '../../result.js';
import { isJsonObject, parseJsonValue } from '../parseJsonValue.js';

/** An installed version that `mise prune` would remove. */
export type MisePrunableVersion = { toolName: string; version: string; installPath: string };

/**
 * The same set `mise prune --dry-run` names, as JSON on stdout; the dry run itself reports on
 * stderr, which the runner keeps only as a tail.
 */
export const MISE_PRUNABLE_LIST_ARGS = ['ls', '--prunable', '--json'];

// Both become the argument `<tool>@<version>` of `mise uninstall`, so neither may start an option.
const TOOL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/@-]*$/;

const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

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

  for (const [toolName, toolVersions] of Object.entries(json.value)) {
    if (!TOOL_NAME_PATTERN.test(toolName) || !Array.isArray(toolVersions)) {
      return { kind: 'failed', failure: 'a tool has a malformed name or no list of versions' };
    }

    for (const value of toolVersions) {
      const version = parseMisePrunableVersion({ value: value, toolName: toolName });

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
  toolName: string;
}): MisePrunableVersion | null {
  if (!isJsonObject(params.value)) {
    return null;
  }

  const version = params.value.version;
  const installPath = params.value.install_path;

  if (
    typeof version !== 'string' ||
    !VERSION_PATTERN.test(version) ||
    typeof installPath !== 'string' ||
    !isAbsolute(installPath)
  ) {
    return null;
  }

  return { toolName: params.toolName, version: version, installPath: installPath };
}
