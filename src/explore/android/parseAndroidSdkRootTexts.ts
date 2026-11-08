import { isJsonObject, parseJsonValue } from '../../system/parseJsonValue.js';

const FLUTTER_ANDROID_SDK_KEY = 'android-sdk';

const LOCAL_PROPERTIES_SDK_DIR_KEY = 'sdk.dir';

// `key=value`, `key:value`, or `key value`, as Java properties allow.
const PROPERTY_LINE_PATTERN = /^([^=:\s]+)\s*[=:\s]\s*(.*)$/;

// An escape of a properties value: a `\uXXXX` code unit, or a backslash before any one character.
const PROPERTY_ESCAPE_PATTERN = /\\(u[0-9a-fA-F]{4}|.)/g;

/** The characters Java's properties write as a letter after a backslash. */
const PROPERTY_LETTER_ESCAPES: Record<string, string> = { t: '\t', n: '\n', r: '\r', f: '\f' };

/** The `android-sdk` string of Flutter's JSON settings; `null` when it is no JSON object or has none. */
export function parseFlutterSettingsAndroidSdk(params: { text: string }): string | null {
  const settings = parseJsonValue({ text: params.text });

  if (settings.kind === 'failed' || !isJsonObject(settings.value)) {
    return null;
  }

  const androidSdk = settings.value[FLUTTER_ANDROID_SDK_KEY];

  return typeof androidSdk === 'string' ? androidSdk : null;
}

/**
 * The last `sdk.dir` of a `local.properties`, with its escapes undone, such as `\:` for `:` and
 * the `é` that Android Studio writes for each character past ASCII; `null` when it has none.
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
      sdkDir = decodePropertyEscapes(match[2] ?? '');
    }
  }

  return sdkDir;
}

/** Undoes every escape in one pass, so an escaped backslash before `u` stays a backslash. */
function decodePropertyEscapes(text: string): string {
  return text.replace(PROPERTY_ESCAPE_PATTERN, (_escape, escaped: string) => {
    if (escaped.length > 1) {
      return String.fromCharCode(Number.parseInt(escaped.slice(1), 16));
    }

    return PROPERTY_LETTER_ESCAPES[escaped] ?? escaped;
  });
}
