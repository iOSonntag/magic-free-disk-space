/**
 * Skips on Windows a suite whose code runs on macOS alone until `platform/win32` lands; the layer
 * that adds that platform deletes this file.
 */
export const AWAITS_WIN32_PLATFORM = process.platform === 'win32';
