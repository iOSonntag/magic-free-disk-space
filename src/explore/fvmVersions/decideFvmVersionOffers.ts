import type { ToolPins } from '../projectPins/selectToolPins.js';
import type { FvmState, FvmVersionFolder } from './loadFvmState.js';
import type { FvmPins } from './parseFvmrcPins.js';
import { parseFvmrcPins } from './parseFvmrcPins.js';

/** The version folders that are neither the global version nor pinned by a found `.fvmrc`. */
export function decideFvmVersionOffers(params: {
  state: FvmState;
  toolPins: ToolPins;
}): FvmVersionFolder[] {
  const pins = decideFvmPins({ toolPins: params.toolPins });

  switch (pins.kind) {
    case 'everyVersion':
      return [];
    case 'versions':
      return params.state.versions.filter(
        (folder) =>
          folder.version !== params.state.globalVersion && !pins.versions.has(folder.version),
      );
  }
}

function decideFvmPins(params: { toolPins: ToolPins }): FvmPins {
  switch (params.toolPins.kind) {
    case 'everyVersionPinned':
      return { kind: 'everyVersion' };
    case 'texts':
      return parseFvmrcPins({ files: params.toolPins.files });
  }
}
