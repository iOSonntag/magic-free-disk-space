const LEGACY_VERSION_FILE_KEY = 'legacy_version_file';

// asdf reads `~/.asdfrc` as ini: `=` or `:` ends the key, `#` or `;` starts a comment anywhere on
// the line, and one pair of quotes around the key or the value goes.
const ASDFRC_COMMENT_PATTERN = /[#;]/;

const ASDFRC_SEPARATOR_PATTERN = /[=:]/;

const ASDFRC_QUOTED_TEXT_PATTERN = /^("""|["'`])(.*)\1$/;

/** Whether any line of a `~/.asdfrc` text sets `legacy_version_file` to `yes` in any case. */
export function isAsdfLegacyVersionFileOn(params: { text: string }): boolean {
  for (const line of params.text.split('\n')) {
    const commentIndex = line.search(ASDFRC_COMMENT_PATTERN);
    const content = commentIndex === -1 ? line : line.slice(0, commentIndex);
    const separatorIndex = content.search(ASDFRC_SEPARATOR_PATTERN);

    if (separatorIndex === -1) {
      continue;
    }

    const key = content.slice(0, separatorIndex).trim().replace(ASDFRC_QUOTED_TEXT_PATTERN, '$2');
    const value = content
      .slice(separatorIndex + 1)
      .trim()
      .replace(ASDFRC_QUOTED_TEXT_PATTERN, '$2');

    if (key === LEGACY_VERSION_FILE_KEY && value.toLowerCase() === 'yes') {
      return true;
    }
  }

  return false;
}
