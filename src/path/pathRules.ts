/** A POSIX path: rooted at `/`, separated by `/`, its names compared as they are. */
export type PathRulesPosix = { rootForm: 'posix'; separator: '/' };

/**
 * A Windows path: rooted at a drive letter such as `C:\`, separated by `\`, its names compared
 * without case.
 */
export type PathRulesWin32 = { rootForm: 'win32'; separator: '\\' };

/**
 * How the platform spells and compares an absolute path, one member per form of path. Every
 * helper of `src/path` takes it as a value.
 */
export type PathRules = PathRulesPosix | PathRulesWin32;

/** The rules of every POSIX path, whatever platform runs. */
export const POSIX_PATH_RULES: PathRulesPosix = { rootForm: 'posix', separator: '/' };

/** The rules of every Windows path, whatever platform runs. */
export const WIN32_PATH_RULES: PathRulesWin32 = { rootForm: 'win32', separator: '\\' };
