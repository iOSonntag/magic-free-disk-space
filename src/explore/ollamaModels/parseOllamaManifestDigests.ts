import type { Result } from '../../result.js';
import { isJsonObject, parseJsonValue } from '../../system/parseJsonValue.js';

const OLLAMA_DIGEST_PATTERN = /^sha256:[0-9a-fA-F]{64}$/;

/**
 * The digests of the blobs an Ollama manifest names: its config's, then its layers'. Fails for a
 * manifest whose digests cannot all be read, and for a manifest list, which names other manifests
 * instead of blobs, so no blob it reaches can be known.
 */
export function parseOllamaManifestDigests(params: { text: string }): Result<string[], string> {
  const parsed = parseJsonValue({ text: params.text });

  if (parsed.kind === 'failed') {
    return parsed;
  }

  if (!isJsonObject(parsed.value)) {
    return { kind: 'failed', failure: 'The manifest is not a JSON object.' };
  }

  const manifests = parsed.value.manifests;

  if (manifests !== undefined && manifests !== null && !isEmptyArray(manifests)) {
    return { kind: 'failed', failure: 'The manifest lists other manifests.' };
  }

  const configDigest = parseConfigDigest(parsed.value.config);

  if (configDigest.kind === 'failed') {
    return configDigest;
  }

  const layers = parsed.value.layers;

  if (!Array.isArray(layers)) {
    return { kind: 'failed', failure: 'The manifest has no list of layers.' };
  }

  const layerDigests = layers.map((layer) =>
    isJsonObject(layer) ? parseDigest(layer.digest) : null,
  );
  const readableLayerDigests = layerDigests.filter((digest) => digest !== null);

  if (readableLayerDigests.length !== layers.length) {
    return { kind: 'failed', failure: 'A layer of the manifest has no valid digest.' };
  }

  if (configDigest.value === null) {
    return { kind: 'succeeded', value: readableLayerDigests };
  }

  return { kind: 'succeeded', value: [configDigest.value, ...readableLayerDigests] };
}

/** The config's digest; `null` for a manifest without a config, or with an empty digest. */
function parseConfigDigest(config: unknown): Result<string | null, string> {
  if (config === undefined || config === null) {
    return { kind: 'succeeded', value: null };
  }

  if (!isJsonObject(config)) {
    return { kind: 'failed', failure: 'The config of the manifest is not a JSON object.' };
  }

  if (config.digest === undefined || config.digest === '') {
    return { kind: 'succeeded', value: null };
  }

  const digest = parseDigest(config.digest);

  if (digest === null) {
    return { kind: 'failed', failure: 'The config of the manifest has no valid digest.' };
  }

  return { kind: 'succeeded', value: digest };
}

/** The digest in lower case, as the names of the blob files spell it. */
function parseDigest(value: unknown): string | null {
  if (typeof value !== 'string' || !OLLAMA_DIGEST_PATTERN.test(value)) {
    return null;
  }

  return value.toLowerCase();
}

function isEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}
