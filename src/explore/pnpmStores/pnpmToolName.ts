/** The name pnpm goes by in its install folders, its packages, and the pins of a project. */
export const PNPM_TOOL_NAME = 'pnpm';

/**
 * Whether a mise tool key, a `tools` value of keys, a folder of mise's installs, or a manager name
 * names pnpm: any text that holds it in any case, whatever its backend, such as `npm-pnpm`.
 */
export function hasPnpmToolName(params: { text: string }): boolean {
  return params.text.toLowerCase().includes(PNPM_TOOL_NAME);
}
