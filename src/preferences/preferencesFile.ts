import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PREFERENCES_HOME_RELATIVE_DIR } from '../catalog/protectedPaths.js';
import type { Result } from '../result.js';
import { getErrorCode } from '../system/getErrorCode.js';
import { loadFileText } from '../system/loadFileText.js';
import { isJsonObject, parseJsonValue } from '../system/parseJsonValue.js';

/** The choices the app saves through the bridge. */
export type Preferences = { isUpdateCheckEnabled: boolean };

export type PreferencesSaveFailure = {
  reason: 'directoryUnavailable' | 'writeFailed';
  code: string;
};

const DEFAULT_PREFERENCES: Preferences = { isUpdateCheckEnabled: true };

const PREFERENCES_FILE_NAME = 'preferences.json';

/** The file holds a few keys; a larger one is no file this app wrote. */
const PREFERENCES_FILE_MAX_BYTES = 65_536;

/** Never throws: a missing, unreadable, or malformed file, or a missing or mistyped key, is the default. */
export async function loadPreferences(params: { homeDir: string }): Promise<Preferences> {
  const fileJson = await loadPreferencesJson({ homeDir: params.homeDir });

  return parsePreferences(fileJson);
}

function parsePreferences(fileJson: Record<string, unknown>): Preferences {
  const isUpdateCheckEnabled =
    typeof fileJson.isUpdateCheckEnabled === 'boolean'
      ? fileJson.isUpdateCheckEnabled
      : DEFAULT_PREFERENCES.isUpdateCheckEnabled;

  return { isUpdateCheckEnabled: isUpdateCheckEnabled };
}

/**
 * Sets `isUpdateCheckEnabled` and keeps every other key of the file, so a key of another release
 * survives. Replaces the file by a rename, so a reader never sees half of it. Never throws.
 */
export async function saveIsUpdateCheckEnabled(params: {
  homeDir: string;
  isEnabled: boolean;
}): Promise<Result<null, PreferencesSaveFailure>> {
  const directoryPath = join(params.homeDir, PREFERENCES_HOME_RELATIVE_DIR);

  try {
    await mkdir(directoryPath, { recursive: true, mode: 0o700 });
  } catch (error) {
    return {
      kind: 'failed',
      failure: { reason: 'directoryUnavailable', code: getErrorCode(error) },
    };
  }

  const fileJson = await loadPreferencesJson({ homeDir: params.homeDir });
  const savedJson = { ...fileJson, isUpdateCheckEnabled: params.isEnabled };
  const temporaryPath = join(directoryPath, `${PREFERENCES_FILE_NAME}.${randomUUID()}.tmp`);

  try {
    await writeFile(temporaryPath, `${JSON.stringify(savedJson, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    await rename(temporaryPath, join(directoryPath, PREFERENCES_FILE_NAME));
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);

    return { kind: 'failed', failure: { reason: 'writeFailed', code: getErrorCode(error) } };
  }

  return { kind: 'succeeded', value: null };
}

export function buildPreferencesPath(params: { homeDir: string }): string {
  return join(params.homeDir, PREFERENCES_HOME_RELATIVE_DIR, PREFERENCES_FILE_NAME);
}

/** The file's JSON object, or `{}` when there is no readable file or it holds no object. */
async function loadPreferencesJson(params: { homeDir: string }): Promise<Record<string, unknown>> {
  const fileText = await loadFileText({
    path: buildPreferencesPath({ homeDir: params.homeDir }),
    maxBytes: PREFERENCES_FILE_MAX_BYTES,
  });

  if (fileText.kind === 'failed') {
    return {};
  }

  const parsedJson = parseJsonValue({ text: fileText.value });

  if (parsedJson.kind === 'failed' || !isJsonObject(parsedJson.value)) {
    return {};
  }

  return parsedJson.value;
}
