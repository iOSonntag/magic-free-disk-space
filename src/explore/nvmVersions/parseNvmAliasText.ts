const TRAILING_SPACE_PATTERN = /[ \t\n\v\f\r]+$/;

const NON_SPACE_PATTERN = /[^ \t\n\v\f\r]/;

// nvm stores flags such as `--lts ` before an alias's target, which this reader does not judge.
const FLAG_PREFIX = '--';

/**
 * The target an nvm alias file names, as nvm's `nvm_print_alias_file` and `nvm_resolve_alias` read
 * it; `null` for a file with no target or one with flags, which does not resolve.
 */
export function parseNvmAliasText(params: { text: string }): string | null {
  const target = params.text
    .split('\n')
    .map((line) => line.split('#', 1)[0] ?? '')
    .filter((line) => NON_SPACE_PATTERN.test(line))
    .map((line) => line.replace(TRAILING_SPACE_PATTERN, ''))
    .at(0);

  if (target === undefined || target.startsWith(FLAG_PREFIX)) {
    return null;
  }

  return target;
}
