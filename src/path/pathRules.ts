/** A POSIX path: rooted at `/`, separated by `/`, its names compared as they are. */
export type PathRulesPosix = { rootForm: 'posix'; separator: '/' };

/**
 * How the platform spells and compares an absolute path, one member per form of path. Every
 * helper of `src/path` takes it as a value.
 */
export type PathRules = PathRulesPosix;
