import type { ProjectPinFileKind } from '../projectPins/projectPins.js';

/** The kinds of the pin files that pin an nvm Node.js. */
export const NVM_PIN_FILE_KINDS: ProjectPinFileKind[] = ['nvmrc'];

// The POSIX `[[:space:]]` class that nvm's `sed` trims with.
const EDGE_SPACE_PATTERN = /^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$/g;

// Any control character but a tab; the newlines are already split away.
const CONTROL_CHARACTER_PATTERN = /[^\P{Cc}\t]/u;

/**
 * The version or alias a `.nvmrc` pins, as nvm's `nvm_process_nvmrc_content` reads it; `null` for
 * a file nvm refuses, which pins nothing it could resolve.
 */
export function parseNvmrcPin(params: { text: string }): string | null {
  const lines = params.text
    .split('\n')
    .map((line) => line.replace(/#.*/, '').replace(EDGE_SPACE_PATTERN, ''))
    .filter((line) => line !== '');

  if (lines.length === 0 || lines.some((line) => CONTROL_CHARACTER_PATTERN.test(line))) {
    return null;
  }

  const keys = new Set<string>();
  const versionLines: string[] = [];

  for (const line of lines) {
    const equalsIndex = line.indexOf('=');

    if (equalsIndex <= 0) {
      versionLines.push(line);
      continue;
    }

    const key = line.slice(0, equalsIndex).replace(EDGE_SPACE_PATTERN, '');

    if (key === 'node' || keys.has(key)) {
      return null;
    }

    keys.add(key);
  }

  if (versionLines.length !== 1) {
    return null;
  }

  return versionLines[0] ?? null;
}
