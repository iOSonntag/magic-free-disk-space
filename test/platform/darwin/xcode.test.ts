import { describe, expect, test } from 'bun:test';
import { XCODE_ENTRIES } from '../../../src/platform/darwin/catalog/xcode.js';
import { buildRiskAndPathById } from './catalogPins.js';

describe('XCODE_ENTRIES', () => {
  test('pins the risk and the path of every entry', () => {
    expect(buildRiskAndPathById(XCODE_ENTRIES)).toEqual({
      'xcode-derived-data': ['safe', 'Library/Developer/Xcode/DerivedData'],
      'xcode-ios-device-support': ['safe', 'Library/Developer/Xcode/iOS DeviceSupport'],
      'xcode-watchos-device-support': ['safe', 'Library/Developer/Xcode/watchOS DeviceSupport'],
      'xcode-tvos-device-support': ['safe', 'Library/Developer/Xcode/tvOS DeviceSupport'],
      'xcode-macos-device-support': ['safe', 'Library/Developer/Xcode/macOS DeviceSupport'],
      'xcode-visionos-device-support': ['safe', 'Library/Developer/Xcode/visionOS DeviceSupport'],
      'xcode-test-devices': ['safe', 'Library/Developer/XCTestDevices'],
      'xcode-documentation-cache': ['safe', 'Library/Developer/Xcode/DocumentationCache'],
      'xcode-dvt-downloads': ['review', 'Library/Developer/DVTDownloads'],
      'xcode-previews': ['safe', 'Library/Developer/Xcode/UserData/Previews'],
      'xcode-archives': ['careful', 'Library/Developer/Xcode/Archives'],
      'xcode-user-data': ['careful', 'Library/Developer/Xcode/UserData'],
      'xcode-cache': ['safe', 'Library/Caches/com.apple.dt.Xcode'],
      'core-simulator-logs': ['safe', 'Library/Logs/CoreSimulator'],
      'core-simulator-caches': ['safe', 'Library/Developer/CoreSimulator/Caches'],
      'core-simulator-devices': ['careful', 'Library/Developer/CoreSimulator/Devices'],
      'simulator-runtimes': ['careful', '/Library/Developer/CoreSimulator'],
      'command-line-tools': ['review', '/Library/Developer/CommandLineTools'],
    });
  });
});
