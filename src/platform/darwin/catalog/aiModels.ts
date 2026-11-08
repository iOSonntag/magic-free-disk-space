import type { CatalogEntry } from '../../../catalog/catalog.js';

/**
 * AI models that tools downloaded to run on this Mac. The Hugging Face entries take its folders one
 * by one, so its token files beside them are never offered.
 */
export const AI_MODEL_ENTRIES: CatalogEntry[] = [
  {
    id: 'ollama-models',
    category: 'aiModels',
    title: 'Ollama models',
    explanation:
      'Local AI models Ollama downloaded. Remove the ones you no longer use with ollama rm.',
    regeneration: 'Ollama downloads a model again when you pull or run it again.',
    risk: 'review',
    root: 'home',
    path: '.ollama/models',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: {
      kind: 'explore',
      probe: 'ollamaModels',
      advice:
        'Local AI models Ollama downloaded. Remove the ones you no longer use with ollama rm.',
    },
  },
  {
    id: 'lm-studio-models',
    category: 'aiModels',
    title: 'LM Studio models',
    explanation:
      'Local AI models LM Studio downloaded. Remove the ones you no longer use in its My Models view.',
    regeneration: 'LM Studio downloads a model again when you get it again.',
    risk: 'review',
    root: 'home',
    path: '.lmstudio/models',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: {
      kind: 'explore',
      probe: 'lmStudioModels',
      advice:
        'Local AI models LM Studio downloaded. Remove the ones you no longer use in its My Models view.',
    },
  },
  {
    id: 'huggingface-hub',
    category: 'aiModels',
    title: 'Hugging Face models and datasets',
    explanation:
      'Models and datasets the Hugging Face libraries downloaded for your programs. Remove the ones you no longer use with hf cache delete.',
    regeneration: 'The Hugging Face libraries download them again when a program loads them.',
    risk: 'review',
    root: 'home',
    path: '.cache/huggingface/hub',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: {
      kind: 'explore',
      probe: 'huggingFaceRepos',
      advice:
        'Models and datasets the Hugging Face libraries downloaded for your programs. Remove the ones you no longer use with hf cache delete.',
    },
  },
  {
    id: 'huggingface-datasets',
    category: 'aiModels',
    title: 'Hugging Face dataset cache',
    explanation:
      'Datasets the Hugging Face datasets library converted to load them faster in your programs.',
    regeneration: 'The datasets library converts a dataset again when a program loads it.',
    risk: 'review',
    root: 'home',
    path: '.cache/huggingface/datasets',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: { kind: 'delete' },
  },
  {
    id: 'huggingface-xet',
    category: 'aiModels',
    title: 'Hugging Face Xet cache',
    explanation:
      'Lists of file parts that the Xet storage of Hugging Face keeps for a few weeks to skip the parts it already uploaded, and the work of an upload that stopped. Your downloaded models and datasets stay.',
    regeneration:
      'Xet fetches the lists again on the next upload, and a stopped upload starts over.',
    risk: 'safe',
    root: 'home',
    path: '.cache/huggingface/xet',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: { kind: 'delete' },
  },
];
