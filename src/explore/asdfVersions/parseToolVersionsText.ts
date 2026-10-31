/** One line of a `.tool-versions`: a tool and the versions it names, in their order. */
export type ToolVersionsLine = { toolName: string; versions: string[] };

const COMMENT_START = '#';

const WORD_SEPARATOR_PATTERN = /\s+/;

/**
 * The tool lines of a `.tool-versions` text, the one parse of the format. `#` starts a comment,
 * and a line that names no version is skipped.
 */
export function parseToolVersionsText(params: { text: string }): ToolVersionsLine[] {
  const lines: ToolVersionsLine[] = [];

  for (const line of params.text.split('\n')) {
    const commentIndex = line.indexOf(COMMENT_START);
    const content = commentIndex === -1 ? line : line.slice(0, commentIndex);
    const [toolName, ...versions] = content
      .trim()
      .split(WORD_SEPARATOR_PATTERN)
      .filter((word) => word !== '');

    if (toolName === undefined || versions.length === 0) {
      continue;
    }

    lines.push({ toolName: toolName, versions: versions });
  }

  return lines;
}
