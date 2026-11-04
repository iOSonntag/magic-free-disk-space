/** The command lines of a process listing, one per line, trimmed, without the empty ones. */
export function parseProcessCommandLines(params: { stdoutText: string }): string[] {
  const lines = params.stdoutText.split('\n');
  const trimmedLines = lines.map((line) => line.trim());

  return trimmedLines.filter((line) => line !== '');
}
