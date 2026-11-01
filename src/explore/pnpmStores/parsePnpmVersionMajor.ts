const PNPM_VERSION_PATTERN = /^(\d+)(?:\.\d+){0,2}(?:[-+_].*)?$/;

/**
 * The major of a pnpm version `<major>[.<minor>[.<patch>]]`, optionally followed by a suffix after
 * `-`, `+`, or `_`; `null` for any other text.
 */
export function parsePnpmVersionMajor(params: { text: string }): number | null {
  const match = PNPM_VERSION_PATTERN.exec(params.text);

  if (match === null) {
    return null;
  }

  return Number(match[1]);
}
