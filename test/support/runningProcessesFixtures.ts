import type {
  RunningProcesses,
  RunningProcessesCommandLines,
  RunningProcessesImagePaths,
} from '../../src/system/systemPlatform.js';

/**
 * The running processes in the form the host's platform lists them: `imagePaths` on Windows,
 * `commandLines` elsewhere; two empty lists for no running process.
 */
export function buildHostRunningProcesses(params: {
  commandLines: string[];
  imagePaths: string[];
}): RunningProcesses {
  if (process.platform === 'win32') {
    return buildRunningImagePaths(params.imagePaths);
  }

  return buildRunningCommandLines(params.commandLines);
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
