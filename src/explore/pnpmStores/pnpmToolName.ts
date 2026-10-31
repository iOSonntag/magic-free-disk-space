/** The name pnpm goes by in its install folders, its packages, and the pins of a project. */
export const PNPM_TOOL_NAME = 'pnpm';

/**
 * Whether a text names pnpm: it holds `pnpm` in any case, as a backend key such as `npm:pnpm` or
 * its folder `npm-pnpm` does.
 */
export function hasPnpmToolName(params: { text: string }): boolean {
  return params.text.toLowerCase().includes(PNPM_TOOL_NAME);
}
