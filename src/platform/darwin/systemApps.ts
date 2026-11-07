import { join } from 'node:path';
import { parseMacBundleId } from '../../catalog/catalogOwner.js';
import type { SystemApp } from '../../scan/scanPlatform.js';

/** Where macOS keeps its own apps, on the sealed system volume. */
const SYSTEM_APPLICATIONS_DIR = '/System/Applications';

/** Mail, which keeps its saved attachments open while it runs. */
const MAIL_APP: SystemApp = buildSystemApp({ bundleName: 'Mail.app', bundleId: 'com.apple.mail' });

/** Messages, which reads its previews and stickers while it runs. */
const MESSAGES_APP: SystemApp = buildSystemApp({
  bundleName: 'Messages.app',
  bundleId: 'com.apple.MobileSMS',
});

/** The apps of macOS that own catalog data, which no app folder lists. */
export const DARWIN_SYSTEM_APPS: SystemApp[] = [MAIL_APP, MESSAGES_APP];

/** Mail's bundle, whose running process holds its downloads back. */
export const MAIL_BUNDLE_PATHS: string[] = [MAIL_APP.bundlePath];

function buildSystemApp(params: { bundleName: string; bundleId: string }): SystemApp {
  return {
    bundlePath: join(SYSTEM_APPLICATIONS_DIR, params.bundleName),
    bundleId: parseMacBundleId({ text: params.bundleId }),
  };
}
