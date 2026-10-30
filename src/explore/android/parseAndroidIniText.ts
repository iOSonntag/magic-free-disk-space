/**
 * The values of an Android `key=value` file, such as an AVD's `<name>.ini` or its `config.ini`, by
 * key. Spaces around the `=` are dropped; a line without `=` is skipped, and a later key wins.
 */
export function parseAndroidIniText(params: { text: string }): Map<string, string> {
  const values = new Map<string, string>();

  for (const line of params.text.split('\n')) {
    const separatorIndex = line.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    values.set(line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim());
  }

  return values;
}
