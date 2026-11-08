/**
 * Whether two lists hold the same paths in any order, the recheck's test that a unit still names
 * exactly what its scan found.
 */
export function hasSamePaths(params: { left: string[]; right: string[] }): boolean {
  const left = new Set(params.left);
  const right = new Set(params.right);

  return left.size === right.size && [...left].every((path) => right.has(path));
}
