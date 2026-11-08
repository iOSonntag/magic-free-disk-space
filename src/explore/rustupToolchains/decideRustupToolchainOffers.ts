import type { ToolPins } from '../projectPins/selectToolPins.js';
import type { RustupInstalledToolchain, RustupState } from './loadRustupState.js';
import type { RustToolchainPins } from './parseRustToolchainPins.js';
import { isRustToolchainPinned, parseRustToolchainPins } from './parseRustToolchainPins.js';

/**
 * The toolchains rustup marks for none, such as the default, that no folder override names and no
 * found `rust-toolchain(.toml)` pins, at the scan and at the recheck alike.
 */
export function decideRustupToolchainOffers(params: {
  state: RustupState;
  toolPins: ToolPins;
}): RustupInstalledToolchain[] {
  const pins = decideRustToolchainPins({ toolPins: params.toolPins });

  return params.state.toolchains.filter(
    (toolchain) =>
      !toolchain.isMarked &&
      !params.state.overrideNames.includes(toolchain.name) &&
      !isRustToolchainPinned({ pins: pins, toolchainName: toolchain.name }),
  );
}

function decideRustToolchainPins(params: { toolPins: ToolPins }): RustToolchainPins {
  switch (params.toolPins.kind) {
    case 'everyVersionPinned':
      return { kind: 'everyToolchain' };
    case 'texts':
      return parseRustToolchainPins({ files: params.toolPins.files });
  }
}
