import { describe, expect, test } from 'bun:test';
import { AI_MODEL_ENTRIES } from '../../../src/platform/darwin/catalog/aiModels.js';
import { buildRiskAndPathById } from './catalogPins.js';

describe('AI_MODEL_ENTRIES', () => {
  test('pins the risk and the path of every entry', () => {
    expect(buildRiskAndPathById(AI_MODEL_ENTRIES)).toEqual({
      'ollama-models': ['review', '.ollama/models'],
      'lm-studio-models': ['review', '.lmstudio/models'],
      'huggingface-hub': ['review', '.cache/huggingface/hub'],
      'huggingface-datasets': ['review', '.cache/huggingface/datasets'],
      'huggingface-xet': ['safe', '.cache/huggingface/xet'],
    });
  });

  test('the downloaded models are probed one by one, the datasets and the Xet cache deleted whole', () => {
    expect(AI_MODEL_ENTRIES.map((entry) => [entry.id, entry.removal.kind])).toEqual([
      ['ollama-models', 'explore'],
      ['lm-studio-models', 'explore'],
      ['huggingface-hub', 'explore'],
      ['huggingface-datasets', 'delete'],
      ['huggingface-xet', 'delete'],
    ]);
  });
});
