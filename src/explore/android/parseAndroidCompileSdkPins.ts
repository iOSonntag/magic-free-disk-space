import type { ProjectPinFileText } from '../projectPins/projectPins.js';

export type AndroidCompileSdkPinsApiLevels = { kind: 'apiLevels'; apiLevels: Set<number> };

/** A Gradle file sets a `compileSdk` no number names, or none in its `android {` block. */
export type AndroidCompileSdkPinsEveryPlatform = { kind: 'everyPlatform' };

export type AndroidCompileSdkPins =
  | AndroidCompileSdkPinsApiLevels
  | AndroidCompileSdkPinsEveryPlatform;

type CompileSdkMention = { kind: 'apiLevel'; apiLevel: number } | { kind: 'everyPlatform' };

// The whole word, so `compileSdkPreview` or `pluginCompileSdk` is no mention.
const COMPILE_SDK_WORD_PATTERN = /(?<![\w$])compileSdk(?:Version)?(?![\w$])/g;

const ANDROID_BLOCK_PATTERN = /(?<![\w$])android\s*\{/;

// After the word, an optional `=` or `(`, then a number or `"android-<N>"`, such as `= 34` or `(34)`.
const COMPILE_SDK_API_LEVEL_PATTERN = /^[ \t]*[=(]?[ \t]*(?:(\d+)(?![\w.])|(["'])android-(\d+)\2)/;

// What ends or continues an expression after a mention behind a `.`, which makes the mention a read.
const EXPRESSION_CONTINUATION_PATTERN = /^[ \t]*(?:$|==|[)\]},;.?:+\-*/%<>!&|^])/;

/**
 * The API levels the Gradle files compile against: each `compileSdk` or `compileSdkVersion` that
 * sets a value, wherever it stands. A value no number names, or an `android {` block that sets
 * none, pins every platform.
 */
export function parseAndroidCompileSdkPins(params: {
  files: ProjectPinFileText[];
}): AndroidCompileSdkPins {
  const apiLevels = new Set<number>();

  for (const file of params.files) {
    const mentions = listCompileSdkMentions({ text: file.text });

    if (mentions.length === 0 && ANDROID_BLOCK_PATTERN.test(file.text)) {
      return { kind: 'everyPlatform' };
    }

    for (const mention of mentions) {
      switch (mention.kind) {
        case 'everyPlatform':
          return { kind: 'everyPlatform' };
        case 'apiLevel':
          apiLevels.add(mention.apiLevel);
          break;
      }
    }
  }

  return { kind: 'apiLevels', apiLevels: apiLevels };
}

function listCompileSdkMentions(params: { text: string }): CompileSdkMention[] {
  const mentions: CompileSdkMention[] = [];

  for (const line of params.text.split(/\r?\n/)) {
    for (const match of line.matchAll(COMPILE_SDK_WORD_PATTERN)) {
      const rest = line.slice(match.index + match[0].length);
      const isAfterDot = line[match.index - 1] === '.';

      if (isAfterDot && EXPRESSION_CONTINUATION_PATTERN.test(rest)) {
        continue;
      }

      mentions.push(parseCompileSdkValue({ rest: rest }));
    }
  }

  return mentions;
}

function parseCompileSdkValue(params: { rest: string }): CompileSdkMention {
  const match = COMPILE_SDK_API_LEVEL_PATTERN.exec(params.rest);
  const apiLevelText = match?.[1] ?? match?.[3];

  if (apiLevelText === undefined) {
    return { kind: 'everyPlatform' };
  }

  return { kind: 'apiLevel', apiLevel: Number(apiLevelText) };
}
