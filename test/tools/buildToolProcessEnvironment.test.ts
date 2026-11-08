import { describe, expect, test } from 'bun:test';
import { buildToolProcessEnvironment } from '../../src/tools/buildToolProcessEnvironment.js';

const fixtureBaseEnvironment = {
  HOME: '/fixture/home',
  TMPDIR: '/fixture/tmp',
  LANG: 'en_US.UTF-8',
  PATH: '/fixture/tool:/usr/bin:/bin',
};

describe('buildToolProcessEnvironment', () => {
  test('adds nothing for dart, so the base environment is the whole environment', () => {
    const environment = buildToolProcessEnvironment({
      toolName: 'dart',
      baseEnvironment: fixtureBaseEnvironment,
    });

    expect(environment).toEqual(fixtureBaseEnvironment);
  });

  test('adds the offline switch for mise after the base environment', () => {
    const environment = buildToolProcessEnvironment({
      toolName: 'mise',
      baseEnvironment: fixtureBaseEnvironment,
    });

    expect(environment).toEqual({ ...fixtureBaseEnvironment, MISE_OFFLINE: '1' });
  });

  test('turns colour off for both brews, whatever their brew.env files say', () => {
    const appleSilicon = buildToolProcessEnvironment({
      toolName: 'brewAppleSilicon',
      baseEnvironment: fixtureBaseEnvironment,
    });
    const intel = buildToolProcessEnvironment({
      toolName: 'brewIntel',
      baseEnvironment: fixtureBaseEnvironment,
    });

    expect(appleSilicon.HOMEBREW_NO_COLOR).toBe('1');
    expect(intel.HOMEBREW_NO_COLOR).toBe('1');
  });
});
