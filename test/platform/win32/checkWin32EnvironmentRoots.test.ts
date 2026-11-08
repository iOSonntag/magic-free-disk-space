import { describe, expect, test } from 'bun:test';
import type { EnvironmentFailure } from '../../../src/environment/environmentPlatform.js';
import type { AbsolutePath } from '../../../src/path/parseAbsolutePath.js';
import type { ResolvedFolder } from '../../../src/platform/win32/loadEnvironment.js';
import {
  buildWin32Environment,
  checkWin32EnvironmentRoots,
} from '../../../src/platform/win32/loadEnvironment.js';
import { exampleWin32EnvironmentValues } from '../../support/environmentFixtures.js';
import { buildTestWindowsPath } from '../../support/parsedValueFixtures.js';

/** The check as Windows runs it: on the protected list of the environment built for `temp`. */
function checkWin32Environment(params: {
  temp: ResolvedFolder;
  oneDriveRealPaths: AbsolutePath[];
}): EnvironmentFailure | null {
  const environment = buildWin32Environment({
    ...exampleWin32EnvironmentValues,
    temp: params.temp,
    oneDriveRealPaths: params.oneDriveRealPaths,
  });

  return checkWin32EnvironmentRoots({
    environment: environment,
    homeRealPath: exampleWin32EnvironmentValues.home.realPath,
    homeOwner: exampleWin32EnvironmentValues.user,
    tempRealPath: params.temp.realPath,
  });
}

describe('checkWin32EnvironmentRoots', () => {
  test('accepts the temporary folder, whose own entry the list holds', () => {
    expect(
      checkWin32Environment({
        temp: exampleWin32EnvironmentValues.temp,
        oneDriveRealPaths: exampleWin32EnvironmentValues.oneDriveRealPaths,
      }),
    ).toBeNull();
  });

  test('refuses a temporary folder that is a OneDrive root too, which the list holds twice', () => {
    const oneDriveRoot = buildTestWindowsPath({ text: 'D:\\OneDrive' });

    expect(
      checkWin32Environment({
        temp: { path: oneDriveRoot, realPath: oneDriveRoot },
        oneDriveRealPaths: [oneDriveRoot],
      }),
    ).toEqual({ reason: 'tempHoldsProtectedFolder', path: 'D:\\OneDrive' });
  });
});
