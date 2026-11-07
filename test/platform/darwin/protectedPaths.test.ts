import { expect, test } from 'bun:test';
import { validateRemoval } from '../../../src/delete/validateRemoval.js';
import { buildDarwinEnvironment } from '../../../src/platform/darwin/loadEnvironment.js';
import { describeAwaitingWin32Platform } from '../../support/awaitsWin32Platform.js';
import { buildTestCandidate } from '../../support/candidateFixtures.js';
import { buildTestAbsolutePath, buildTestUserIdentity } from '../../support/parsedValueFixtures.js';

const ENVIRONMENT = buildDarwinEnvironment({
  nowMs: 0,
  user: buildTestUserIdentity({ uid: 501 }),
  homeDir: buildTestAbsolutePath({ text: '/Users/tester' }),
  homeRealPath: buildTestAbsolutePath({ text: '/Users/tester' }),
  tempDir: buildTestAbsolutePath({ text: '/var/folders/xy/abc/T' }),
  tempRealPath: buildTestAbsolutePath({ text: '/private/var/folders/xy/abc/T' }),
  userCacheDir: buildTestAbsolutePath({ text: '/var/folders/xy/abc/C' }),
  userCacheRealPath: buildTestAbsolutePath({ text: '/private/var/folders/xy/abc/C' }),
  applicationDirs: [buildTestAbsolutePath({ text: '/Applications' })],
  applicationRealPaths: [buildTestAbsolutePath({ text: '/Applications' })],
});

function validatePath(params: { path: string }): ReturnType<typeof validateRemoval> {
  return validateRemoval({
    candidate: buildTestCandidate({ path: params.path, risk: 'safe' }),
    environment: ENVIRONMENT,
  });
}

describeAwaitingWin32Platform('the sensitive folders of the darwin platform', () => {
  test('refuses Mail, Messages, the Photos library and the device backups, whole and in every part', () => {
    for (const path of [
      '/Users/tester/Library/Mail',
      '/Users/tester/Library/Mail/V10/MailData/Envelope Index',
      '/Users/tester/Library/Messages',
      '/Users/tester/Library/Messages/Attachments/ab/12/photo.heic',
      '/Users/tester/Library/Messages/Caches/Previews',
      '/Users/tester/Pictures/Photos Library.photoslibrary',
      '/Users/tester/Pictures/Photos Library.photoslibrary/originals',
      '/Users/tester/Library/Application Support/MobileSync',
      '/Users/tester/Library/Application Support/MobileSync/Backup/00008030-0000',
    ]) {
      expect(validatePath({ path: path })).toMatchObject({ reason: 'protectedRoot' });
    }
  });

  test('approves the copies of Mail attachments, which live in Mail container', () => {
    expect(
      validatePath({
        path: '/Users/tester/Library/Containers/com.apple.mail/Data/Library/Mail Downloads/1234',
      }).kind,
    ).toBe('approved');
    expect(validatePath({ path: '/Users/tester/Pictures/Holiday.jpg' }).kind).toBe('approved');
  });

  test("approves Messages' preview caches, whole and in every part", () => {
    for (const path of [
      '/Users/tester/Library/Messages/Caches/Previews/Attachments',
      '/Users/tester/Library/Messages/StickerCache',
      '/Users/tester/Library/Messages/Caches/Previews/Attachments/ab/preview.jpg',
      '/Users/tester/Library/Messages/Caches/Previews/StickerCache/sticker.heic',
      '/Users/tester/Library/Messages/StickerCache/sticker.heic',
    ]) {
      expect(validatePath({ path: path }).kind).toBe('approved');
    }
  });

  test('refuses Messages outside its preview caches, and a folder holding one', () => {
    for (const path of [
      '/Users/tester/Library/Messages',
      '/Users/tester/Library/Messages/chat.db',
      '/Users/tester/Library/Messages/Caches/Other/file',
      '/Users/tester/Library/Messages/Caches/Previews',
      '/Users/tester/Library/Messages/Caches/previews/attachments/ab/preview.jpg',
      '/Users/tester/Library',
    ]) {
      expect(validatePath({ path: path })).toMatchObject({ reason: 'protectedRoot' });
    }
  });
});

describeAwaitingWin32Platform('the user cache folder of the darwin platform', () => {
  test('is an allowed root: its contents may go, never the folder itself', () => {
    expect(ENVIRONMENT.userCacheDir).toBe(buildTestAbsolutePath({ text: '/var/folders/xy/abc/C' }));
    expect(
      validatePath({ path: '/private/var/folders/xy/abc/C/com.apple.metal/shaders' }).kind,
    ).toBe('approved');
    expect(validatePath({ path: '/private/var/folders/xy/abc/C' })).toMatchObject({
      reason: 'protectedRoot',
    });
    expect(validatePath({ path: '/private/var/folders/xy/abc' })).toMatchObject({
      reason: 'protectedRoot',
    });
  });
});
