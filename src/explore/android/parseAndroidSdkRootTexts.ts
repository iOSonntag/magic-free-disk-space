const FLUTTER_ANDROID_SDK_KEY = 'android-sdk';

const LOCAL_PROPERTIES_SDK_DIR_KEY = 'sdk.dir';

// `key=value`, `key:value`, or `key value`, as Java properties allow.
const PROPERTY_LINE_PATTERN = /^([^=:\s]+)\s*[=:\s]\s*(.*)$/;

/** The `android-sdk` string of Flutter's JSON settings; `null` when it is no JSON object or has none. */
export function parseFlutterSettingsAndroidSdk(params: { text: string }): string | null {
  try {
    const settings: unknown = JSON.parse(params.text);

    if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
      return null;
    }

    const androidSdk: unknown = Reflect.get(settings, FLUTTER_ANDROID_SDK_KEY);

    return typeof androidSdk === 'string' ? androidSdk : null;
  } catch {
    return null;
  }
}

/**
 * The last `sdk.dir` of a `local.properties`, with its escapes undone, such as `\:` for `:`;
 * `null` when it has none.
 */
export function parseAndroidLocalPropertiesSdkDir(params: { text: string }): string | null {
  let sdkDir: string | null = null;

  for (const rawLine of params.text.split('\n')) {
    const line = rawLine.trim();

    if (line.startsWith('#') || line.startsWith('!')) {
      continue;
    }

    const match = PROPERTY_LINE_PATTERN.exec(line);

    if (match?.[1] === LOCAL_PROPERTIES_SDK_DIR_KEY) {
      sdkDir = (match[2] ?? '').replace(/\\(.)/g, '$1');
    }
  }

  return sdkDir;
}
