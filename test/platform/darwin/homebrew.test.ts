import { describe, expect, test } from 'bun:test';
import { HOMEBREW_ENTRIES } from '../../../src/platform/darwin/catalog/homebrew.js';
import { buildRiskAndPathById } from './catalogPins.js';

describe('HOMEBREW_ENTRIES', () => {
  test('pins the risk and the path of every entry', () => {
    expect(buildRiskAndPathById(HOMEBREW_ENTRIES)).toEqual({
      'homebrew-downloads': ['safe', 'Library/Caches/Homebrew/downloads'],
      'homebrew-api-cache': ['safe', 'Library/Caches/Homebrew/api'],
      'homebrew-bootsnap': ['safe', 'Library/Caches/Homebrew/bootsnap'],
      'homebrew-cellar-apple-silicon': ['careful', '/opt/homebrew/Cellar'],
      'homebrew-cellar-intel': ['careful', '/usr/local/Cellar'],
      'homebrew-caskroom-apple-silicon': ['careful', '/opt/homebrew/Caskroom'],
      'homebrew-caskroom-intel': ['careful', '/usr/local/Caskroom'],
      'homebrew-ruby-gems': ['review', '/opt/homebrew/lib/ruby/gems'],
    });
  });
});
