import type { ProjectPinFileKind, ProjectPinFileText } from '../projectPins/projectPins.js';

export const FVM_PIN_FILE_KINDS: ProjectPinFileKind[] = ['fvmrc'];

/** Every version counts as pinned, since a `.fvmrc` could not be read as FVM reads it. */
export type FvmPinsEvery = { kind: 'everyVersion' };

export type FvmPinsVersions = { kind: 'versions'; versions: Set<string> };

export type FvmPins = FvmPinsEvery | FvmPinsVersions;

/**
 * The versions the `.fvmrc` files pin: `flutter` or the `flutterSdkVersion` FVM writes, and each
 * version of `flavors`. A file that is no JSON object, or names none, pins every version.
 */
export function parseFvmrcPins(params: { files: ProjectPinFileText[] }): FvmPins {
  const versions = new Set<string>();

  for (const file of params.files) {
    const fileVersions = parseFvmrcVersions({ text: file.text });

    if (fileVersions === null) {
      return { kind: 'everyVersion' };
    }

    for (const version of fileVersions) {
      versions.add(version);
    }
  }

  return { kind: 'versions', versions: versions };
}

function parseFvmrcVersions(params: { text: string }): string[] | null {
  const config = parseJsonObject({ text: params.text });

  if (config === null) {
    return null;
  }

  const versions: string[] = [];
  const mainVersion = config.flutterSdkVersion ?? config.flutter;

  if (typeof mainVersion === 'string') {
    versions.push(mainVersion);
  }

  if (isJsonObject(config.flavors)) {
    for (const flavorVersion of Object.values(config.flavors)) {
      if (typeof flavorVersion !== 'string') {
        return null;
      }

      versions.push(flavorVersion);
    }
  }

  return versions.length > 0 ? versions : null;
}

function parseJsonObject(params: { text: string }): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(params.text);

    return isJsonObject(value) ? value : null;
  } catch {
    return null;
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
