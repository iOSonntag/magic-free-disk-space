import { describe, expect, test } from 'bun:test';
import {
  buildWin32BaseEnvironment,
  WIN32_TOOL_PROCESSES,
} from '../../../src/platform/win32/toolProcesses.js';

describe('buildWin32BaseEnvironment', () => {
  test('holds the profile, the temporary folder, SystemRoot, and its folders after the tool folder', () => {
    const environment = buildWin32BaseEnvironment({
      toolFolderPath: 'C:\\Tools\\mise',
      homeDir: 'C:\\Users\\tester',
      tempDir: 'C:\\Users\\tester\\AppData\\Local\\Temp',
      systemRoot: 'C:\\Windows',
    });

    expect(environment).toEqual({
      USERPROFILE: 'C:\\Users\\tester',
      TEMP: 'C:\\Users\\tester\\AppData\\Local\\Temp',
      TMP: 'C:\\Users\\tester\\AppData\\Local\\Temp',
      SystemRoot: 'C:\\Windows',
      PATH: 'C:\\Tools\\mise;C:\\Windows\\System32;C:\\Windows',
    });
  });

  test('holds the tool folder alone in PATH when SystemRoot is unset', () => {
    const environment = buildWin32BaseEnvironment({
      toolFolderPath: 'C:\\Tools\\mise',
      homeDir: 'C:\\Users\\tester',
      tempDir: 'C:\\Temp',
      systemRoot: null,
    });

    expect(environment).toEqual({
      USERPROFILE: 'C:\\Users\\tester',
      TEMP: 'C:\\Temp',
      TMP: 'C:\\Temp',
      PATH: 'C:\\Tools\\mise',
    });
  });
});

describe.skipIf(process.platform !== 'win32')('a Windows tool in its job', () => {
  /** Starts a Bun child that runs until something ends it, in a job of its own. */
  function startIdleTool() {
    const started = WIN32_TOOL_PROCESSES.startTool({
      path: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1_000)'],
      cwd: process.cwd(),
      env: WIN32_TOOL_PROCESSES.buildBaseEnvironment({
        toolFolderPath: process.cwd(),
        homeDir: process.cwd(),
        tempDir: process.cwd(),
      }),
    });

    if (started.kind === 'failed') {
      throw new Error(`The tool did not start: ${started.failure}`);
    }

    return started.value;
  }

  /** The exit code of the tool once it ended, or `null` when it still runs after `timeoutMs`. */
  function waitForExit(params: {
    tool: ReturnType<typeof startIdleTool>;
    timeoutMs: number;
  }): Promise<number | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), params.timeoutMs);

      params.tool.process.once('exit', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
  }

  test('ends the tool once the hold on its job is released', async () => {
    const tool = startIdleTool();
    const exited = waitForExit({ tool: tool, timeoutMs: 5_000 });

    tool.release();

    expect(await exited).not.toBeNull();
  });

  test('ends the tool on stop, and a stop after its end is no error', async () => {
    const tool = startIdleTool();
    const exited = waitForExit({ tool: tool, timeoutMs: 5_000 });

    tool.stop();

    expect(await exited).toBe(1);

    tool.stop();
    tool.release();
  });
});
