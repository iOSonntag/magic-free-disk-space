/** Ollama's models folder below the home folder, where it keeps every model unless `OLLAMA_MODELS` moves it. */
export const OLLAMA_MODELS_PATH_NAMES = ['.ollama', 'models'];

/** The folders of Ollama's manifests: the first layout, and the one of its v2 names. */
export const OLLAMA_MANIFEST_FOLDER_NAMES = ['manifests', 'manifests-v2'];

/** The folder of the blobs that the manifests name by digest, each file named `sha256-<hex>`. */
export const OLLAMA_BLOBS_FOLDER_NAME = 'blobs';
