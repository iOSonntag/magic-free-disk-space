/**
 * Returns the text with every control character written out as `\u{…}`, so a file name cannot
 * move the cursor, clear lines, or start new ones in the terminal. Covers the C0 and C1 controls,
 * DEL, and the bidirectional marks that reorder the text after them.
 */
export function formatDisplayText(params: { text: string }): string {
  let displayText = '';

  for (const character of params.text) {
    const codePoint = character.codePointAt(0) ?? 0;

    displayText += isControlCodePoint({ codePoint: codePoint })
      ? `\\u{${codePoint.toString(16)}}`
      : character;
  }

  return displayText;
}

function isControlCodePoint(params: { codePoint: number }): boolean {
  const codePoint = params.codePoint;

  return (
    codePoint < 0x20 ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    codePoint === 0x200e ||
    codePoint === 0x200f ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069)
  );
}
