import type {
  MiseToolName,
  MiseToolVersion,
} from '../../src/explore/miseVersions/parseMisePrunableVersions.js';
import {
  parseMiseToolName,
  parseMiseToolVersion,
} from '../../src/explore/miseVersions/parseMisePrunableVersions.js';
import type { SimulatorDeviceUdid } from '../../src/explore/simulatorDevices/parseSimulatorDeviceList.js';
import { parseSimulatorDeviceUdid } from '../../src/explore/simulatorDevices/parseSimulatorDeviceList.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../src/path/parseAbsolutePath.js';
import type { Result } from '../../src/result.js';

/** Branded values for fixtures, each made by its one maker; a value that fails it throws. */

export function buildTestAbsolutePath(params: { text: string }): AbsolutePath {
  return unwrapFixtureValue({ parsed: parseAbsolutePath(params), text: params.text });
}

export function buildTestUdid(params: { text: string }): SimulatorDeviceUdid {
  return unwrapFixtureValue({ parsed: parseSimulatorDeviceUdid(params), text: params.text });
}

export function buildTestMiseToolName(params: { text: string }): MiseToolName {
  return unwrapFixtureValue({ parsed: parseMiseToolName(params), text: params.text });
}

export function buildTestMiseToolVersion(params: { text: string }): MiseToolVersion {
  return unwrapFixtureValue({ parsed: parseMiseToolVersion(params), text: params.text });
}

function unwrapFixtureValue<T>(params: { parsed: Result<T, string>; text: string }): T {
  if (params.parsed.kind === 'failed') {
    throw new Error(`The fixture value "${params.text}" fails its maker: ${params.parsed.failure}`);
  }

  return params.parsed.value;
}
