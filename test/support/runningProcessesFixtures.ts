import type {
  RunningProcessesCommandLines,
  RunningProcessesImagePaths,
} from '../../src/system/systemPlatform.js';

/** The processes as macOS lists them, by their command lines. */
export function buildRunningCommandLines(commandLines: string[]): RunningProcessesCommandLines {
  return { kind: 'commandLines', commandLines: commandLines };
}

/** The processes as Windows lists them, by the paths of their images. */
export function buildRunningImagePaths(imagePaths: string[]): RunningProcessesImagePaths {
  return { kind: 'imagePaths', imagePaths: imagePaths };
}
