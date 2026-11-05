/**
 * Throws for code whose part of the mission is not built yet. The session deletes this file once
 * every part is built, so a stub left calling it fails the typecheck.
 */
export function throwPartNotBuilt(): never {
  throw new Error('This part is not built yet.');
}
