import type { PathRules } from './pathRules.js';

/**
 * True when `path` equals `parentPath` or lies below it, comparing whole path segments split by
 * the separator of `rules`, so `/a/bc` is not inside `/a/b`. Names compare as the platform compares
 * them: exactly on POSIX, without case on Windows. Both paths must be absolute and normalized.
 */
export function isSameOrInsidePath(params: {
  rules: PathRules;
  path: string;
  parentPath: string;
}): boolean {
  return isPrefixPath({
    separator: params.rules.separator,
    path: toComparablePathText({ rules: params.rules, text: params.path }),
    parentPath: toComparablePathText({ rules: params.rules, text: params.parentPath }),
  });
}

/**
 * Like `isSameOrInsidePath`, but true as well when the two paths differ only by case, on every
 * platform: a macOS volume usually ignores case too. A refusal takes this looser match, which only
 * refuses more.
 */
export function mayBeSameOrInsidePath(params: {
  rules: PathRules;
  path: string;
  parentPath: string;
}): boolean {
  return isPrefixPath({
    separator: params.rules.separator,
    path: foldCase(params.path),
    parentPath: foldCase(params.parentPath),
  });
}

/** True when two entry names name the same entry: exactly on POSIX, without case on Windows. */
export function isSameEntryName(params: {
  rules: PathRules;
  name: string;
  otherName: string;
}): boolean {
  return (
    toComparablePathText({ rules: params.rules, text: params.name }) ===
    toComparablePathText({ rules: params.rules, text: params.otherName })
  );
}

/**
 * True when two absolute, normalized paths name the same entry: exactly on POSIX, without case on
 * Windows.
 */
export function isSamePath(params: { rules: PathRules; path: string; otherPath: string }): boolean {
  return (
    toComparablePathText({ rules: params.rules, text: params.path }) ===
    toComparablePathText({ rules: params.rules, text: params.otherPath })
  );
}

/**
 * A name or a path in the form the platform compares it by: as it is on POSIX, without case on
 * Windows. Two texts name the same entry when their forms are equal.
 */
export function toComparablePathText(params: { rules: PathRules; text: string }): string {
  switch (params.rules.rootForm) {
    case 'posix':
      return params.text;
    case 'win32':
      return foldCase(params.text);
  }
}

function foldCase(text: string): string {
  return text.toLowerCase();
}

function isPrefixPath(params: { separator: string; path: string; parentPath: string }): boolean {
  if (params.path === params.parentPath) {
    return true;
  }

  const parentPrefix = params.parentPath.endsWith(params.separator)
    ? params.parentPath
    : `${params.parentPath}${params.separator}`;

  return params.path.startsWith(parentPrefix);
}
