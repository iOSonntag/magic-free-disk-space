import { describe, expect, test } from 'bun:test';
import { parseGitIndexPaths } from '../../src/tools/parseGitIndexPaths.js';
import { buildGitIndexBytes, buildGitIndexExtensionBytes } from '../support/flutterSdkFixtures.js';

const treeExtension = buildGitIndexExtensionBytes({
  signature: 'TREE',
  content: new TextEncoder().encode('\u00001 0\n'),
});

describe('parseGitIndexPaths', () => {
  test('reads the paths of version 2 with SHA-1 object names', () => {
    const indexBytes = buildGitIndexBytes({ version: 2, paths: ['README.md', 'src/main.ts'] });

    expect(parseGitIndexPaths(indexBytes)).toEqual(['README.md', 'src/main.ts']);
  });

  test('reads the paths of version 3 with an entry that sets the extended flag', () => {
    const indexBytes = buildGitIndexBytes({
      version: 3,
      paths: ['README.md', 'sparse/file.txt', 'src/main.ts'],
      extendedPaths: ['sparse/file.txt'],
    });

    expect(parseGitIndexPaths(indexBytes)).toEqual(['README.md', 'sparse/file.txt', 'src/main.ts']);
  });

  test('reads the paths of SHA-256 object names', () => {
    const indexBytes = buildGitIndexBytes({
      version: 3,
      paths: ['README.md', 'src/main.ts'],
      hashLength: 32,
      extendedPaths: ['src/main.ts'],
    });

    expect(parseGitIndexPaths(indexBytes)).toEqual(['README.md', 'src/main.ts']);
  });

  test('reads the paths before a TREE extension', () => {
    const indexBytes = buildGitIndexBytes({
      version: 2,
      paths: ['README.md'],
      extensions: [treeExtension],
    });

    expect(parseGitIndexPaths(indexBytes)).toEqual(['README.md']);
  });

  test('reads an index of zero entries', () => {
    expect(parseGitIndexPaths(buildGitIndexBytes({ version: 2, paths: [] }))).toEqual([]);
  });

  test('reads a path of 8 bytes whose padding is a full 8 NUL bytes', () => {
    const indexBytes = buildGitIndexBytes({
      version: 3,
      paths: ['abcd.txt'],
      extendedPaths: ['abcd.txt'],
    });

    // The header, 64 bytes before the path, the path, 8 NUL bytes, and the checksum.
    expect(indexBytes.length).toBe(12 + 64 + 8 + 8 + 20);
    expect(parseGitIndexPaths(indexBytes)).toEqual(['abcd.txt']);
  });

  test('decodes each path as UTF-8', () => {
    const accentedPath = `caf${String.fromCodePoint(0xe9)}/a.txt`;
    const indexBytes = buildGitIndexBytes({ version: 2, paths: [accentedPath] });

    expect(parseGitIndexPaths(indexBytes)).toEqual([accentedPath]);
  });

  test('returns null for version 4', () => {
    expect(parseGitIndexPaths(buildGitIndexBytes({ version: 4, paths: ['README.md'] }))).toBe(null);
  });

  test('returns null for a split index, with a link extension', () => {
    const indexBytes = buildGitIndexBytes({
      version: 2,
      paths: ['README.md'],
      extensions: [buildGitIndexExtensionBytes({ signature: 'link', content: new Uint8Array(20) })],
    });

    expect(parseGitIndexPaths(indexBytes)).toBe(null);
  });

  test('returns null for a sparse index, with an sdir extension', () => {
    const indexBytes = buildGitIndexBytes({
      version: 2,
      paths: ['README.md'],
      extensions: [
        treeExtension,
        buildGitIndexExtensionBytes({ signature: 'sdir', content: new Uint8Array(0) }),
      ],
    });

    expect(parseGitIndexPaths(indexBytes)).toBe(null);
  });

  test('returns null for a truncated entry', () => {
    const indexBytes = buildGitIndexBytes({ version: 2, paths: ['README.md'] });

    expect(parseGitIndexPaths(indexBytes.subarray(0, 12 + 40))).toBe(null);
    expect(parseGitIndexPaths(indexBytes.subarray(0, 12 + 62 + 4))).toBe(null);
  });

  test('returns null for a padding byte that is not NUL', () => {
    const indexBytes = buildGitIndexBytes({ version: 2, paths: ['READ.md'] });
    // 62 bytes before the path, the path of 7, then 3 NUL bytes: this sets the second.
    indexBytes[12 + 62 + 7 + 1] = 0x41;

    expect(parseGitIndexPaths(indexBytes)).toBe(null);
  });

  test('returns null for the extended flag in version 2', () => {
    const indexBytes = buildGitIndexBytes({
      version: 2,
      paths: ['README.md'],
      extendedPaths: ['README.md'],
    });

    expect(parseGitIndexPaths(indexBytes)).toBe(null);
  });

  test('returns null for an entry count the entries do not match', () => {
    const indexBytes = buildGitIndexBytes({ version: 2, paths: ['README.md', 'src/main.ts'] });
    const view = new DataView(indexBytes.buffer, indexBytes.byteOffset);

    view.setUint32(8, 3);
    expect(parseGitIndexPaths(indexBytes)).toBe(null);
    view.setUint32(8, 1);
    expect(parseGitIndexPaths(indexBytes)).toBe(null);
  });

  test('returns null for a checksum of the wrong length', () => {
    const indexBytes = buildGitIndexBytes({ version: 2, paths: ['README.md'] });
    const longerBytes = new Uint8Array(indexBytes.length + 4);
    longerBytes.set(indexBytes, 0);

    expect(parseGitIndexPaths(indexBytes.subarray(0, indexBytes.length - 1))).toBe(null);
    expect(parseGitIndexPaths(longerBytes)).toBe(null);
  });

  test('returns null for a bad signature and a short header', () => {
    const indexBytes = buildGitIndexBytes({ version: 2, paths: ['README.md'] });
    const badSignatureBytes = indexBytes.slice();
    badSignatureBytes[0] = 0x58;

    expect(parseGitIndexPaths(badSignatureBytes)).toBe(null);
    expect(parseGitIndexPaths(indexBytes.subarray(0, 11))).toBe(null);
  });
});
