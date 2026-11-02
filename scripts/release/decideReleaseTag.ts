import type { ReleaseVersion } from '../../src/update/releaseVersion.js';
import {
  compareReleaseVersions,
  formatReleaseTag,
  parseReleaseTag,
  parseReleaseVersion,
} from '../../src/update/releaseVersion.js';

export type ReleaseTagDecisionAccepted = { kind: 'accepted'; tag: string };

export type ReleaseTagRefusalMalformedVersion = { kind: 'refused'; reason: 'malformedVersion' };

export type ReleaseTagRefusalTagExists = { kind: 'refused'; reason: 'tagExists'; tag: string };

export type ReleaseTagRefusalNotNewer = { kind: 'refused'; reason: 'notNewer'; latestTag: string };

export type ReleaseTagRefusal =
  | ReleaseTagRefusalMalformedVersion
  | ReleaseTagRefusalTagExists
  | ReleaseTagRefusalNotNewer;

export type ReleaseTagDecision = ReleaseTagDecisionAccepted | ReleaseTagRefusal;

const USAGE_EXIT_CODE = 2;
const REFUSAL_EXIT_CODE = 1;

/**
 * Decides the tag that releases `versionText`: refused when the version is not `X.Y.Z`, when its
 * tag is among `remoteTagNames`, or when it is not newer than the highest release tag among them.
 */
export function decideReleaseTag(params: {
  versionText: string;
  remoteTagNames: string[];
}): ReleaseTagDecision {
  const version = parseReleaseVersion(params.versionText);

  if (version === null) {
    return { kind: 'refused', reason: 'malformedVersion' };
  }

  const tag = formatReleaseTag(version);

  if (params.remoteTagNames.includes(tag)) {
    return { kind: 'refused', reason: 'tagExists', tag: tag };
  }

  const latest = findLatestReleaseVersion(params.remoteTagNames);

  if (latest !== null && compareReleaseVersions(version, latest) <= 0) {
    return { kind: 'refused', reason: 'notNewer', latestTag: formatReleaseTag(latest) };
  }

  return { kind: 'accepted', tag: tag };
}

function findLatestReleaseVersion(tagNames: string[]): ReleaseVersion | null {
  let latest: ReleaseVersion | null = null;

  for (const tagName of tagNames) {
    const version = parseReleaseTag(tagName);

    if (version !== null && (latest === null || compareReleaseVersions(version, latest) > 0)) {
      latest = version;
    }
  }

  return latest;
}

function formatReleaseTagRefusal(params: {
  refusal: ReleaseTagRefusal;
  versionText: string;
}): string {
  switch (params.refusal.reason) {
    case 'malformedVersion':
      return `error: ${params.versionText} is not a version X.Y.Z without leading zeros`;
    case 'tagExists':
      return `error: the tag ${params.refusal.tag} exists on origin already`;
    case 'notNewer':
      return `error: ${params.versionText} is not newer than the latest release tag ${params.refusal.latestTag}`;
  }
}

function runDecideReleaseTagCommand(commandArguments: string[]): number {
  const [versionText, ...remoteTagNames] = commandArguments;

  if (versionText === undefined) {
    console.error('usage: bun scripts/release/decideReleaseTag.ts <X.Y.Z> [remote tag name …]');

    return USAGE_EXIT_CODE;
  }

  const decision = decideReleaseTag({ versionText: versionText, remoteTagNames: remoteTagNames });

  switch (decision.kind) {
    case 'accepted':
      console.log(decision.tag);

      return 0;
    case 'refused':
      console.error(formatReleaseTagRefusal({ refusal: decision, versionText: versionText }));

      return REFUSAL_EXIT_CODE;
  }
}

if (import.meta.main) {
  process.exit(runDecideReleaseTagCommand(process.argv.slice(2)));
}
