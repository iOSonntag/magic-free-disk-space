/**
 * Throws for code whose part of the mission is not built yet. The session deletes this file once
 * every part is built, so a stub left calling it fails the typecheck.
 */
export function throwPartNotBuilt(): never {
  throw new Error('This part is not built yet.');
}

/**
 * Returns `placeholder`, the quiet answer of a stub that every run reaches, such as a probe each
 * scan starts or a platform value read at startup, where a throw would break today's runs. Deleted
 * with this file, so a stub left answering it fails the typecheck.
 */
export function stubPartNotBuilt<T>(placeholder: T): T {
  return placeholder;
}
