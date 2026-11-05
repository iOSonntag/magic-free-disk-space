import { describe, expect, test } from 'bun:test';
import { basename } from 'node:path';
import {
  listProcessImagePaths,
  loadRunningProcesses,
} from '../../../src/platform/win32/loadRunningProcesses.js';
import { listProcesses, loadProcessImagePath } from '../../../src/platform/win32/win32Api.js';

describe('listProcessImagePaths', () => {
  test('takes the image path of each process it can query', () => {
    expect(
      listProcessImagePaths({
        processes: [
          { processId: 10, exeFileName: 'Code.exe' },
          { processId: 11, exeFileName: 'node.exe' },
        ],
        loadImagePath: (processId) =>
          processId === 10
            ? 'C:\\Users\\example\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe'
            : 'C:\\Program Files\\nodejs\\node.exe',
      }),
    ).toEqual([
      'C:\\Users\\example\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
      'C:\\Program Files\\nodejs\\node.exe',
    ]);
  });

  test('keeps the image file name of a process it may not query, or whose path is empty', () => {
    expect(
      listProcessImagePaths({
        processes: [
          { processId: 4, exeFileName: 'System' },
          { processId: 20, exeFileName: 'emulator.exe' },
        ],
        loadImagePath: (processId) => (processId === 4 ? null : ''),
      }),
    ).toEqual(['System', 'emulator.exe']);
  });

  test('leaves out an entry with neither a path nor a name', () => {
    expect(
      listProcessImagePaths({
        processes: [{ processId: 0, exeFileName: '' }],
        loadImagePath: () => null,
      }),
    ).toEqual([]);
  });
});

describe.skipIf(process.platform !== 'win32')('the processes of Windows', () => {
  test('a Toolhelp snapshot lists this process by its id and the file name of its image', () => {
    const processes = listProcesses();

    expect(processes.kind).toBe('succeeded');

    if (processes.kind === 'succeeded') {
      const own = processes.value.find((entry) => entry.processId === process.pid);

      expect(own?.exeFileName.toLowerCase()).toBe(basename(process.execPath).toLowerCase());
    }
  });

  test('QueryFullProcessImageNameW names the image of this process as Bun names it', () => {
    const imagePath = loadProcessImagePath({ processId: process.pid });

    expect(imagePath.kind).toBe('succeeded');

    if (imagePath.kind === 'succeeded') {
      // NTFS compares names without case; the fact is that the path is the full image path.
      expect(imagePath.value.toLowerCase()).toBe(process.execPath.toLowerCase());
    }
  });

  test('the listing holds the image path of this process', async () => {
    const processes = await loadRunningProcesses({ commandTimeoutMs: 10_000 });

    expect(processes.kind).toBe('succeeded');

    if (processes.kind === 'succeeded') {
      expect(processes.value.imagePaths.map((path) => path.toLowerCase())).toContain(
        process.execPath.toLowerCase(),
      );
    }
  });
});
