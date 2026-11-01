/** The version of a release of this app, `X.Y.Z`; release builds and GitHub tags carry no other form. */
export type ReleaseVersion = { major: number; minor: number; patch: number };

const RELEASE_VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

const RELEASE_TAG_PREFIX = 'v';

/** `null` unless the text is exactly `X.Y.Z` of non-negative integers without leading zeros. */
export function parseReleaseVersion(text: string): ReleaseVersion | null {
  const match = RELEASE_VERSION_PATTERN.exec(text);

  if (match === null) {
    return null;
  }

  const [, majorText, minorText, patchText] = match;
  const version = { major: Number(majorText), minor: Number(minorText), patch: Number(patchText) };

  if (
    !Number.isSafeInteger(version.major) ||
    !Number.isSafeInteger(version.minor) ||
    !Number.isSafeInteger(version.patch)
  ) {
    return null;
  }

  return version;
}

/** `null` unless the tag is exactly `vX.Y.Z`, the form of this repository's release tags. */
export function parseReleaseTag(tag: string): ReleaseVersion | null {
  if (!tag.startsWith(RELEASE_TAG_PREFIX)) {
    return null;
  }

  return parseReleaseVersion(tag.slice(RELEASE_TAG_PREFIX.length));
}

export function formatReleaseVersion(version: ReleaseVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

export function formatReleaseTag(version: ReleaseVersion): string {
  return `${RELEASE_TAG_PREFIX}${formatReleaseVersion(version)}`;
}

/** Negative when `left` is older, positive when newer, zero when equal. */
export function compareReleaseVersions(left: ReleaseVersion, right: ReleaseVersion): number {
  if (left.major !== right.major) {
    return left.major - right.major;
  }

  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }

  return left.patch - right.patch;
}
