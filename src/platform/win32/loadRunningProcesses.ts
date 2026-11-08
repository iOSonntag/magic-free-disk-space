import type { Result } from '../../result.js';
import type {
  RunningProcessesFailure,
  RunningProcessesImagePaths,
} from '../../system/systemPlatform.js';
import type { ProcessEntry } from './processEntry.js';
import { listProcesses, loadProcessImagePath } from './win32Api.js';

/**
 * The image path of each running process, from a Toolhelp snapshot. A process this user may not
 * query keeps the file name of its image, which still matches an owner by its image names. A
 * failed snapshot fails the whole listing, so every owned item is withheld.
 */
export async function loadRunningProcesses(): Promise<
  Result<RunningProcessesImagePaths, RunningProcessesFailure>
> {
  const processes = listProcesses();

  if (processes.kind === 'failed') {
    return { kind: 'failed', failure: { reason: 'callFailed', ...processes.failure } };
  }

  const imagePaths = listProcessImagePaths({
    processes: processes.value,
    loadImagePath: (processId) => {
      const imagePath = loadProcessImagePath({ processId: processId });

      return imagePath.kind === 'succeeded' ? imagePath.value : null;
    },
  });

  return { kind: 'succeeded', value: { kind: 'imagePaths', imagePaths: imagePaths } };
}

/**
 * The image path of each process, or its image's file name where `loadImagePath` reads none; an
 * entry with neither is left out.
 */
export function listProcessImagePaths(params: {
  processes: ProcessEntry[];
  loadImagePath: (processId: number) => string | null;
}): string[] {
  return params.processes.flatMap((entry) => {
    const imagePath = params.loadImagePath(entry.processId);

    if (imagePath !== null && imagePath !== '') {
      return [imagePath];
    }

    return entry.exeFileName === '' ? [] : [entry.exeFileName];
  });
}
