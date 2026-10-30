// `dart pub cache gc` exists from Dart 3.11; an older Dart rejects it as an unknown subcommand.
const DART_SUPPORTED_MAJOR = 3;
const DART_SUPPORTED_MINOR_MIN = 11;

const DART_VERSION_PATTERN = /^(\d+)\.(\d+)\.\d+(-[0-9A-Za-z.]+)?$/;

/**
 * Whether the text of a Dart SDK's version file, such as `3.11.0` or `3.12.0-123.0.dev`, names a
 * Dart of 3.11 or later: a release of 3.11, or any version from 3.12 on, a prerelease included,
 * since a prerelease of 3.11 may predate `pub cache gc`. `false` for text that is no version.
 */
export function isDartVersionSupported(versionText: string): boolean {
  const match = DART_VERSION_PATTERN.exec(versionText.trim());

  if (match === null) {
    return false;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const prerelease = match[3] !== undefined;

  if (major !== DART_SUPPORTED_MAJOR) {
    return major > DART_SUPPORTED_MAJOR;
  }

  if (minor === DART_SUPPORTED_MINOR_MIN) {
    return !prerelease;
  }

  return minor > DART_SUPPORTED_MINOR_MIN;
}
