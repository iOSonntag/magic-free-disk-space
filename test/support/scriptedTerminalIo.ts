import type { TerminalIo } from '../../src/cli/terminalIo.js';

export type ScriptedTerminalIo = TerminalIo & {
  outText(): string;
  errorText(): string;
  prompts: string[];
};

/** A terminal whose input is the given lines; `null` input ends it, as closing stdin does. */
export function createScriptedTerminalIo(params: {
  isTerminal: boolean;
  inputLines: string[];
}): ScriptedTerminalIo {
  const remainingLines = [...params.inputLines];
  const outChunks: string[] = [];
  const errorChunks: string[] = [];
  const prompts: string[] = [];

  return {
    isTerminal: params.isTerminal,
    prompts: prompts,
    writeOut: (text) => {
      outChunks.push(text);
    },
    writeError: (text) => {
      errorChunks.push(text);
    },
    readLine: async (prompt) => {
      prompts.push(prompt);

      return remainingLines.shift() ?? null;
    },
    outText: () => outChunks.join(''),
    errorText: () => errorChunks.join(''),
  };
}
