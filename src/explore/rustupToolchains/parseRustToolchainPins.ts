import { basename } from 'node:path';
import type { ProjectPinFileKind, ProjectPinFileText } from '../projectPins/projectPins.js';

export const RUSTUP_PIN_FILE_KINDS: ProjectPinFileKind[] = ['rustToolchain'];

/** Every toolchain counts as pinned, since a pin file named none rustup could be judged by. */
export type RustToolchainPinsEvery = { kind: 'everyToolchain' };

/** The channels the pin files name, such as `stable`, `1.75.0`, or `nightly-2024-01-01`. */
export type RustToolchainPinsChannels = { kind: 'channels'; channels: string[] };

export type RustToolchainPins = RustToolchainPinsEvery | RustToolchainPinsChannels;

const TOML_FILE_NAME = 'rust-toolchain.toml';

const TOML_CHANNEL_PATTERN = /^\s*channel\s*=\s*["']([^"']+)["']/m;

const TOML_PATH_PATTERN = /^\s*path\s*=/m;

const TOML_TABLE_PATTERN = /^\s*\[toolchain\]/m;

// The legacy file's one line, a toolchain name.
const LEGACY_CHANNEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

/**
 * The channels of `rust-toolchain.toml` (`[toolchain] channel`) and of the legacy
 * `rust-toolchain`, a single name or the same TOML. A file of a custom `path` pins no installed
 * toolchain; any other file whose channel is unclear pins every toolchain.
 */
export function parseRustToolchainPins(params: { files: ProjectPinFileText[] }): RustToolchainPins {
  const channels: string[] = [];

  for (const file of params.files) {
    const channel = parseRustToolchainFileChannel({
      isTomlName: basename(file.path) === TOML_FILE_NAME,
      text: file.text,
    });

    switch (channel.kind) {
      case 'unclear':
        return { kind: 'everyToolchain' };
      case 'customPath':
        break;
      case 'channel':
        channels.push(channel.channel);
        break;
    }
  }

  return { kind: 'channels', channels: channels };
}

/**
 * Whether a pin names the installed toolchain: its name, or its name less the host part rustup
 * appends, such as `1.75.0` for `1.75.0-aarch64-apple-darwin`.
 */
export function isRustToolchainPinned(params: {
  pins: RustToolchainPins;
  toolchainName: string;
}): boolean {
  switch (params.pins.kind) {
    case 'everyToolchain':
      return true;
    case 'channels':
      return params.pins.channels.some(
        (channel) =>
          params.toolchainName === channel || params.toolchainName.startsWith(`${channel}-`),
      );
  }
}

type RustToolchainFileChannel =
  | { kind: 'channel'; channel: string }
  | { kind: 'customPath' }
  | { kind: 'unclear' };

function parseRustToolchainFileChannel(params: {
  isTomlName: boolean;
  text: string;
}): RustToolchainFileChannel {
  if (params.isTomlName || TOML_TABLE_PATTERN.test(params.text)) {
    const channel = TOML_CHANNEL_PATTERN.exec(params.text)?.[1] ?? null;

    if (channel !== null) {
      return { kind: 'channel', channel: channel };
    }

    return TOML_PATH_PATTERN.test(params.text) ? { kind: 'customPath' } : { kind: 'unclear' };
  }

  const line = params.text.trim();

  return LEGACY_CHANNEL_PATTERN.test(line)
    ? { kind: 'channel', channel: line }
    : { kind: 'unclear' };
}
