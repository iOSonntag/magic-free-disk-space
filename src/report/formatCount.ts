/** Formats a count with its noun, such as `1 item` or `3 items`. */
export function formatCount(params: { count: number; singular: string; plural: string }): string {
  if (params.count === 1) {
    return `1 ${params.singular}`;
  }

  return `${params.count} ${params.plural}`;
}
