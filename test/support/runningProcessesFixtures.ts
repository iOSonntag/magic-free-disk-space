import type {
  RunningProcesses,
  RunningProcessesCommandLines,
  RunningProcessesImagePaths,
} from '../../src/system/systemPlatform.js';

/** No running process, in the form the host's platform lists processes in. */
export function buildHostNoRunningProcesses(): RunningProcesses {
  if (process.platform === 'win32') {
    return buildRunningImagePaths([]);
  }

  return buildRunningCommandLines([]);
}

/** The processes as macOS lists them, by their command lines; `null` stays `null`, a run whose processes could not be listed. */
export function buildRunningCommandLines(commandLines: string[]): RunningProcessesCommandLines;
export function buildRunningCommandLines(
  commandLines: string[] | null,
): RunningProcessesCommandLines | null;
export function buildRunningCommandLines(
  commandLines: string[] | null,
): RunningProcessesCommandLines | null {
  if (commandLines === null) {
    return null;
  }

  return { kind: 'commandLines', commandLines: commandLines };
}

/** The processes as Windows lists them, by the paths of their images; `null` stays `null`, a run whose processes could not be listed. */
export function buildRunningImagePaths(imagePaths: string[]): RunningProcessesImagePaths;
export function buildRunningImagePaths(
  imagePaths: string[] | null,
): RunningProcessesImagePaths | null;
export function buildRunningImagePaths(
  imagePaths: string[] | null,
): RunningProcessesImagePaths | null {
  if (imagePaths === null) {
    return null;
  }

  return { kind: 'imagePaths', imagePaths: imagePaths };
}
