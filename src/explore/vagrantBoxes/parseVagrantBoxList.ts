import type { Result } from '../../result.js';
import type { ExploreProbeDefinition } from '../loadProbeOutput.js';
import {
  parseVagrantBoxName,
  parseVagrantBoxProvider,
  parseVagrantBoxVersion,
} from './parseVagrantBoxNames.js';
import type { VagrantBoxName, VagrantBoxProvider, VagrantBoxVersion } from './vagrantBoxNames.js';

/** One installed box: a name, provider and version, for one architecture or for none. */
export type VagrantBox = {
  name: VagrantBoxName;
  provider: VagrantBoxProvider;
  version: VagrantBoxVersion;
  /** Such as `arm64`; `null` for a box stored without one. */
  architecture: string | null;
};

/** `--machine-readable` prints each value as a line `timestamp,target,type,data…`. */
export const VAGRANT_BOX_LIST_PROBE: ExploreProbeDefinition<VagrantBox[]> = {
  toolName: 'vagrant',
  args: ['box', 'list', '--machine-readable'],
  parse: parseVagrantBoxList,
};

/** The value Vagrant gives a box stored without an architecture. */
const NO_ARCHITECTURE = 'n/a';

const ARCHITECTURE_PATTERN = /^[A-Za-z0-9_]+$/;

/** The data of a line holds its commas so escaped. */
const ESCAPED_COMMA = '%!(VAGRANT_COMMA)';

type BoxLines = {
  name: string;
  provider: string | null;
  version: string | null;
  architecture: string | null;
};

/**
 * Reads the lines of each box, which start with its `box-name`, and skips every other line. A box
 * whose name, provider, version or architecture does not parse is left out, so it is never
 * offered; a box without its provider or version fails the whole list.
 */
export function parseVagrantBoxList(params: { stdoutText: string }): Result<VagrantBox[], string> {
  const boxLines: BoxLines[] = [];

  for (const line of params.stdoutText.split('\n')) {
    const fields = line.split(',');
    const lineType = fields[2];
    const value = fields.slice(3).join(',').replaceAll(ESCAPED_COMMA, ',');
    const current = boxLines.at(-1);

    switch (lineType) {
      case 'box-name':
        boxLines.push({ name: value, provider: null, version: null, architecture: null });
        break;
      case 'box-provider':
      case 'box-version':
      case 'box-architecture':
        if (current === undefined) {
          return { kind: 'failed', failure: `${lineType} before any box-name` };
        }

        setBoxLine({ boxLines: current, lineType: lineType, value: value });
        break;
    }
  }

  const boxes: VagrantBox[] = [];

  for (const lines of boxLines) {
    if (lines.provider === null || lines.version === null) {
      return { kind: 'failed', failure: 'a box without its provider or version' };
    }

    const box = parseBox({ ...lines, provider: lines.provider, version: lines.version });

    if (box !== null) {
      boxes.push(box);
    }
  }

  return { kind: 'succeeded', value: boxes };
}

function setBoxLine(params: {
  boxLines: BoxLines;
  lineType: 'box-provider' | 'box-version' | 'box-architecture';
  value: string;
}): void {
  switch (params.lineType) {
    case 'box-provider':
      params.boxLines.provider = params.value;
      return;
    case 'box-version':
      params.boxLines.version = params.value;
      return;
    case 'box-architecture':
      params.boxLines.architecture = params.value === NO_ARCHITECTURE ? null : params.value;
      return;
  }
}

function parseBox(params: {
  name: string;
  provider: string;
  version: string;
  architecture: string | null;
}): VagrantBox | null {
  const name = parseVagrantBoxName({ text: params.name });
  const provider = parseVagrantBoxProvider({ text: params.provider });
  const version = parseVagrantBoxVersion({ text: params.version });

  if (name.kind === 'failed' || provider.kind === 'failed' || version.kind === 'failed') {
    return null;
  }

  if (params.architecture !== null && !ARCHITECTURE_PATTERN.test(params.architecture)) {
    return null;
  }

  return {
    name: name.value,
    provider: provider.value,
    version: version.value,
    architecture: params.architecture,
  };
}
