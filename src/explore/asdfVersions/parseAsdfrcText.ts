// asdf reads `~/.asdfrc` with go-ini under its default options: these readers follow the line
// rules of go-ini's `readKeyName`, `readValue`, and `readContinuationLines`, with `=` and `:` as
// the key delimiters.

const LEGACY_VERSION_FILE_KEY = 'legacy_version_file';

const TRIPLE_QUOTE = '"""';

const DOUBLE_QUOTE = '"';

const SINGLE_QUOTE = "'";

const BACKTICK = '`';

const CONTINUATION_MARK = '\\';

const TRIPLE_QUOTED_KEY_MIN_LINE_LENGTH = 7;

const TRIPLE_QUOTED_VALUE_MIN_TEXT_LENGTH = 4;

const NO_KEY_LINE_START_PATTERN = /^[#;[]/;

const KEY_DELIMITER_PATTERN = /[=:]/;

const INLINE_COMMENT_PATTERN = /[#;]/;

type KeyOpeningQuote = typeof TRIPLE_QUOTE | typeof DOUBLE_QUOTE | typeof BACKTICK;

type ValueOpeningQuote = typeof TRIPLE_QUOTE | typeof BACKTICK;

type PlainValueSurroundingQuote = typeof SINGLE_QUOTE | typeof DOUBLE_QUOTE;

const PLAIN_VALUE_SURROUNDING_QUOTES: PlainValueSurroundingQuote[] = [SINGLE_QUOTE, DOUBLE_QUOTE];

type AsdfrcKeyLine = {
  key: string;
  valueText: string;
};

/** Whether any line of a `~/.asdfrc` text sets `legacy_version_file` to `yes` in any case. */
export function isAsdfLegacyVersionFileOn(params: { text: string }): boolean {
  const lines = params.text.split('\n');

  for (const [lineIndex, line] of lines.entries()) {
    const keyLine = readAsdfrcKeyLine({ line: line });

    if (keyLine === null || keyLine.key !== LEGACY_VERSION_FILE_KEY) {
      continue;
    }

    const value = readAsdfrcValue({
      valueText: keyLine.valueText,
      followingLines: lines.slice(lineIndex + 1),
    });

    if (value !== null && value.toLowerCase() === 'yes') {
      return true;
    }
  }

  return false;
}

/** The key of a line and the text after its delimiter, or `null` when the line holds no key. */
function readAsdfrcKeyLine(params: { line: string }): AsdfrcKeyLine | null {
  const line = params.line.trimStart();

  if (line === '' || NO_KEY_LINE_START_PATTERN.test(line)) {
    return null;
  }

  const keyQuote = findKeyQuote({ line: line });

  if (keyQuote === null) {
    const delimiterIndex = line.search(KEY_DELIMITER_PATTERN);

    if (delimiterIndex <= 0) {
      return null;
    }

    return {
      key: line.slice(0, delimiterIndex).trim(),
      valueText: line.slice(delimiterIndex + 1),
    };
  }

  const closingQuoteIndex = line.indexOf(keyQuote, keyQuote.length);

  if (closingQuoteIndex === -1) {
    return null;
  }

  const keyEndIndex = closingQuoteIndex + keyQuote.length;
  const delimiterOffset = line.slice(keyEndIndex).search(KEY_DELIMITER_PATTERN);

  if (delimiterOffset === -1) {
    return null;
  }

  return {
    key: line.slice(keyQuote.length, closingQuoteIndex).trim(),
    valueText: line.slice(keyEndIndex + delimiterOffset + 1),
  };
}

function findKeyQuote(params: { line: string }): KeyOpeningQuote | null {
  if (
    params.line.length >= TRIPLE_QUOTED_KEY_MIN_LINE_LENGTH &&
    params.line.startsWith(TRIPLE_QUOTE)
  ) {
    return TRIPLE_QUOTE;
  }

  if (params.line.startsWith(DOUBLE_QUOTE)) {
    return DOUBLE_QUOTE;
  }

  if (params.line.startsWith(BACKTICK)) {
    return BACKTICK;
  }

  return null;
}

/**
 * The value of a key line, continued into the following lines when it ends in `\`, or `null`
 * when a backtick or `"""` opens it and does not close it on its line.
 */
function readAsdfrcValue(params: { valueText: string; followingLines: string[] }): string | null {
  const text = params.valueText.trimStart();
  const valueQuote = findValueQuote({ text: text });

  if (valueQuote !== null) {
    const quotedText = text.slice(valueQuote.length);
    const closingQuoteIndex = quotedText.lastIndexOf(valueQuote);

    if (closingQuoteIndex === -1) {
      return null;
    }

    return quotedText.slice(0, closingQuoteIndex);
  }

  const trimmedText = text.trim();

  if (trimmedText.endsWith(CONTINUATION_MARK)) {
    return readContinuedValue({
      firstText: trimmedText.slice(0, -CONTINUATION_MARK.length),
      followingLines: params.followingLines,
    });
  }

  const commentIndex = trimmedText.search(INLINE_COMMENT_PATTERN);
  const value = commentIndex === -1 ? trimmedText : trimmedText.slice(0, commentIndex).trim();

  for (const quote of PLAIN_VALUE_SURROUNDING_QUOTES) {
    if (isSurroundedByQuote({ value: value, quote: quote })) {
      return value.slice(1, -1);
    }
  }

  return value;
}

function findValueQuote(params: { text: string }): ValueOpeningQuote | null {
  if (
    params.text.length >= TRIPLE_QUOTED_VALUE_MIN_TEXT_LENGTH &&
    params.text.startsWith(TRIPLE_QUOTE)
  ) {
    return TRIPLE_QUOTE;
  }

  if (params.text.startsWith(BACKTICK)) {
    return BACKTICK;
  }

  return null;
}

/**
 * The continued value: each trimmed following line joins it, until a blank line, the end of the
 * text, or a line that leaves no trailing `\`.
 */
function readContinuedValue(params: { firstText: string; followingLines: string[] }): string {
  let value = params.firstText;

  for (const line of params.followingLines) {
    const nextText = line.trim();

    if (nextText === '') {
      return value;
    }

    value += nextText;

    if (!value.endsWith(CONTINUATION_MARK)) {
      return value;
    }

    value = value.slice(0, -CONTINUATION_MARK.length);
  }

  return value;
}

function isSurroundedByQuote(params: {
  value: string;
  quote: PlainValueSurroundingQuote;
}): boolean {
  return (
    params.value.length >= 2 &&
    params.value.startsWith(params.quote) &&
    params.value.endsWith(params.quote) &&
    params.value.split(params.quote).length === 3
  );
}
