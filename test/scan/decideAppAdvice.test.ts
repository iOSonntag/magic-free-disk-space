import { describe, expect, test } from 'bun:test';
import { decideAppAdvice } from '../../src/scan/decideAppAdvice.js';
import type { AdvisedApp } from '../../src/scan/scanPlatform.js';

function buildApp(params: { displayName: string; estimatedBytes: number | null }): AdvisedApp {
  return {
    displayName: params.displayName,
    installFolderPath: null,
    estimatedBytes: params.estimatedBytes,
  };
}

describe('decideAppAdvice', () => {
  test('lists the largest app first, then those without a size, each group by name', () => {
    const advice = decideAppAdvice({
      apps: [
        buildApp({ displayName: 'Zoom', estimatedBytes: null }),
        buildApp({ displayName: 'Blender', estimatedBytes: 900 }),
        buildApp({ displayName: 'audacity', estimatedBytes: null }),
        buildApp({ displayName: 'Steam', estimatedBytes: 4000 }),
        buildApp({ displayName: 'Arduino', estimatedBytes: 900 }),
      ],
    });

    expect(advice.map((app) => app.displayName)).toEqual([
      'Steam',
      'Arduino',
      'Blender',
      'audacity',
      'Zoom',
    ]);
  });

  test('leaves the apps it was given in their order', () => {
    const apps = [
      buildApp({ displayName: 'Zoom', estimatedBytes: null }),
      buildApp({ displayName: 'Steam', estimatedBytes: 4000 }),
    ];

    decideAppAdvice({ apps: apps });

    expect(apps.map((app) => app.displayName)).toEqual(['Zoom', 'Steam']);
  });

  test('gives no advice without apps', () => {
    expect(decideAppAdvice({ apps: [] })).toEqual([]);
  });
});
