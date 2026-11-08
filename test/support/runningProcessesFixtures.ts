import type {
  RunningProcessesCommandLines,
  RunningProcessesImagePaths,
} from '../../src/system/systemPlatform.js';

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

/** The processes as Windows lists them, by the paths of their images. */
export function buildRunningImagePaths(imagePaths: string[]): RunningProcessesImagePaths {
  return { kind: 'imagePaths', imagePaths: imagePaths };
}
