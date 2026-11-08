import { describe, expect, test } from 'bun:test';
import { WIN32_PATH_RULES } from '../../src/path/pathRules.js';
import { isExecutableOwnerRunning } from '../../src/scan/isExecutableOwnerRunning.js';
import { buildTestWindowsImageName, buildTestWindowsPath } from '../support/parsedValueFixtures.js';

const slackImageNames = [buildTestWindowsImageName({ text: 'slack.exe' })];

const slackFolderPath = buildTestWindowsPath({ text: 'C:\\Program Files\\Slack' });

function isSlackRunning(params: {
  installFolder: 'named' | 'none';
  processImagePaths: string[];
}): boolean {
  return isExecutableOwnerRunning({
    pathRules: WIN32_PATH_RULES,
    imageNames: slackImageNames,
    installFolderPath: params.installFolder === 'named' ? slackFolderPath : null,
    processImagePaths: params.processImagePaths,
  });
}

describe('isExecutableOwnerRunning', () => {
  test('is true for a process that carries an image name, in any case', () => {
    expect(
      isSlackRunning({ installFolder: 'none', processImagePaths: ['D:\\Tools\\SLACK.EXE'] }),
    ).toBe(true);
  });

  test('is true for a process that runs from the install folder, in any case', () => {
    expect(
      isSlackRunning({
        installFolder: 'named',
        processImagePaths: ['c:\\program files\\SLACK\\app-4.41\\crash-reporter.exe'],
      }),
    ).toBe(true);
  });

  test('is false for a process whose folder only shares the prefix of the install folder', () => {
    expect(
      isSlackRunning({
        installFolder: 'named',
        processImagePaths: ['C:\\Program Files\\Slack Beta\\crash-reporter.exe'],
      }),
    ).toBe(false);
  });

  test('is false for a folder named like an image, where another program runs', () => {
    expect(
      isSlackRunning({
        installFolder: 'none',
        processImagePaths: ['C:\\Users\\tester\\slack.exe\\other.exe'],
      }),
    ).toBe(false);
  });

  test('is false while no process runs', () => {
    expect(isSlackRunning({ installFolder: 'named', processImagePaths: [] })).toBe(false);
  });
});
