import type { Result } from '../../result.js';
import type { ExploreProbeDefinition } from '../loadProbeOutput.js';
import type { RustupToolchainName } from './rustupToolchainName.js';
import { parseRustupToolchainName } from './rustupToolchainName.js';

/**
 * A toolchain as `rustup toolchain list` gives it. `isMarked` holds for one it annotates, such as
 * `(default)`, `(active, default)`, or `(override)`, which the probe always keeps.
 */
export type RustupListedToolchain = { name: RustupToolchainName; isMarked: boolean };

export const RUSTUP_TOOLCHAIN_LIST_PROBE: ExploreProbeDefinition<RustupListedToolchain[]> = {
  toolName: 'rustup',
  args: ['toolchain', 'list'],
  parse: (params) => parseRustupToolchainList({ stdoutText: params.stdoutText }),
};

export const RUSTUP_OVERRIDE_LIST_PROBE: ExploreProbeDefinition<string[]> = {
  toolName: 'rustup',
  args: ['override', 'list'],
  parse: (params) => parseRustupOverrideList({ stdoutText: params.stdoutText }),
};

const NO_TOOLCHAINS_LINE = 'no installed toolchains';

const NO_OVERRIDES_LINE = 'no overrides';

// `<name>` and an optional annotation, such as `stable-aarch64-apple-darwin (active, default)`.
const TOOLCHAIN_LINE_PATTERN = /^(\S+)(?:\s+\(([^)]*)\))?$/;

/** Fails on a line that is neither a toolchain nor rustup's line for none. */
export function parseRustupToolchainList(params: {
  stdoutText: string;
}): Result<RustupListedToolchain[], string> {
  const toolchains: RustupListedToolchain[] = [];

  for (const line of listContentLines({ text: params.stdoutText })) {
    if (line === NO_TOOLCHAINS_LINE) {
      continue;
    }

    const match = TOOLCHAIN_LINE_PATTERN.exec(line);
    const name = parseRustupToolchainName({ text: match?.[1] ?? '' });

    if (match === null || name.kind === 'failed') {
      return { kind: 'failed', failure: 'a line is no toolchain' };
    }

    toolchains.push({ name: name.value, isMarked: match[2] !== undefined });
  }

  return { kind: 'succeeded', value: toolchains };
}

/**
 * The toolchain of each folder override, the last word of each line after its padded path; none
 * for rustup's line for none. Never fails, since a word that names no toolchain keeps nothing.
 */
export function parseRustupOverrideList(params: { stdoutText: string }): Result<string[], string> {
  const toolchainNames = listContentLines({ text: params.stdoutText })
    .filter((line) => line !== NO_OVERRIDES_LINE)
    .flatMap((line) => line.split(/\s+/).slice(-1));

  return { kind: 'succeeded', value: toolchainNames };
}

function listContentLines(params: { text: string }): string[] {
  return params.text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}
