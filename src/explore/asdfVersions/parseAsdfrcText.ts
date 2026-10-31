// asdf reads `~/.asdfrc` with go-ini under its default options: these readers follow the line
// rules of go-ini's `readKeyName` and `readValue`, with `=` and `:` as the key delimiters.

const LEGACY_VERSION_FILE_KEY = 'legacy_version_file';

const TRIPLE_QUOTE = '"""';

const DOUBLE_QUOTE = '"';

const BACKTICK = '`';

const SURROUNDING_QUOTES = ["'", '"'];

const NO_KEY_LINE_START_PATTERN = /^[#;[]/;

const KEY_DELIMITER_PATTERN = /[=:]/;

const INLINE_COMMENT_PATTERN = /[#;]/;

type AsdfrcKeyLine = {
  key: string;
  valueText: string;
};

/** Whether any line of a `~/.asdfrc` text sets `legacy_version_file` to `yes` in any case. */
export function isAsdfLegacyVersionFileOn(params: { text: string }): boolean {
  for (const line of params.text.split('\n')) {
    const keyLine = readAsdfrcKeyLine({ line: line });

    if (keyLine === null || keyLine.key !== LEGACY_VERSION_FILE_KEY) {
      continue;
    }

    const value = readAsdfrcValue({ valueText: keyLine.valueText });

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

function findKeyQuote(params: { line: string }): string | null {
  if (params.line.length > 6 && params.line.startsWith(TRIPLE_QUOTE)) {
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

/** The value of a key line, or `null` when a backtick or `"""` opens it and does not close it. */
function readAsdfrcValue(params: { valueText: string }): string | null {
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
  const commentIndex = trimmedText.search(INLINE_COMMENT_PATTERN);
  const value = commentIndex === -1 ? trimmedText : trimmedText.slice(0, commentIndex).trim();

  for (const quote of SURROUNDING_QUOTES) {
    if (isSurroundedByQuote({ value: value, quote: quote })) {
      return value.slice(1, -1);
    }
  }

  return value;
}

function findValueQuote(params: { text: string }): string | null {
  if (params.text.length > 3 && params.text.startsWith(TRIPLE_QUOTE)) {
    return TRIPLE_QUOTE;
  }

  if (params.text.startsWith(BACKTICK)) {
    return BACKTICK;
  }

  return null;
}

function isSurroundedByQuote(params: { value: string; quote: string }): boolean {
  return (
    params.value.length >= 2 &&
    params.value.startsWith(params.quote) &&
    params.value.endsWith(params.quote) &&
    params.value.split(params.quote).length === 3
  );
}
