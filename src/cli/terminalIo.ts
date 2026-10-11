export type TerminalIo = {
  /** True only when both input and output are a terminal, so a prompt reaches a person. */
  isTerminal: boolean;
  writeOut(text: string): void;
  writeError(text: string): void;
  /** Returns `null` once the input has ended. */
  readLine(prompt: string): Promise<string | null>;
};

export function createTerminalIo(): TerminalIo {
  let inputLines: AsyncIterator<string> | null = null;

  return {
    isTerminal: process.stdin.isTTY === true && process.stdout.isTTY === true,
    writeOut: (text) => {
      process.stdout.write(text);
    },
    writeError: (text) => {
      process.stderr.write(text);
    },
    readLine: async (prompt) => {
      process.stdout.write(prompt);
      // Opened on the first prompt only: an open reader keeps a non-interactive run alive.
      inputLines ??= console[Symbol.asyncIterator]();

      const next = await inputLines.next();

      if (next.done === true) {
        return null;
      }

      return next.value;
    },
  };
}
