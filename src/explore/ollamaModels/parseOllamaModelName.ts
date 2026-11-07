/** A model's tag by the registry it came from, as the path of its manifest names it. */
export type OllamaModelName = { host: string; namespace: string; model: string; tag: string };

/** The v2 layout writes the `:` of a name as `%3A`. */
const ENCODED_COLON_PATTERN = /%3a/gi;

/**
 * The name of the manifest at `<host>/<namespace>/<model>/<tag>` below a manifests folder, from
 * those four folder names; `null` for a path of another depth.
 */
export function parseOllamaModelName(params: { pathNames: string[] }): OllamaModelName | null {
  const [host, namespace, model, tag, ...otherNames] = params.pathNames.map((name) =>
    name.replaceAll(ENCODED_COLON_PATTERN, ':'),
  );

  if (
    host === undefined ||
    namespace === undefined ||
    model === undefined ||
    tag === undefined ||
    otherNames.length > 0
  ) {
    return null;
  }

  return { host: host, namespace: namespace, model: model, tag: tag };
}
