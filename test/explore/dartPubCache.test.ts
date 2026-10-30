import { describe, expect, test } from 'bun:test';
import { buildDartPubCacheFindings } from '../../src/explore/dartPubCache/buildDartPubCacheFindings.js';
import { parseDartPubCacheGc } from '../../src/explore/dartPubCache/parseDartPubCacheGc.js';
import type { LocatedTool } from '../../src/tools/findTrustedTool.js';
import {
  buildDartGcDryRunText,
  buildDartGcPaths,
  DART_GC_NOTHING_UNUSED_TEXT,
  FIXTURE_HOME_DIR,
} from './probeOutputFixtures.js';

const tool: LocatedTool = { name: 'dart', path: '/opt/example/dart-sdk/bin/dart' };

const gcPaths = buildDartGcPaths({ homeDir: FIXTURE_HOME_DIR });

describe('parseDartPubCacheGc', () => {
  test('reads the paths after "Would delete:"', () => {
    expect(
      parseDartPubCacheGc({
        stdoutText: buildDartGcDryRunText({ homeDir: FIXTURE_HOME_DIR, gcPaths: gcPaths }),
      }),
    ).toEqual({ kind: 'succeeded', value: gcPaths });
  });

  test('reads an empty set when nothing is unused', () => {
    expect(parseDartPubCacheGc({ stdoutText: DART_GC_NOTHING_UNUSED_TEXT })).toEqual({
      kind: 'succeeded',
      value: [],
    });
  });

  test('rejects output with neither answer', () => {
    expect(parseDartPubCacheGc({ stdoutText: 'garbage\n' }).kind).toBe('failed');
  });

  test('rejects a listed path that is not absolute', () => {
    expect(parseDartPubCacheGc({ stdoutText: 'Would delete:\nrelative/path\n' }).kind).toBe(
      'failed',
    );
  });
});

describe('buildDartPubCacheFindings', () => {
  test('offers one unit for the whole set, with the count and three samples shown with ~', () => {
    const findings = buildDartPubCacheFindings({
      tool: tool,
      gcPaths: gcPaths,
      homeDir: FIXTURE_HOME_DIR,
      processCommands: null,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.unit).toEqual({ kind: 'dartPubCache', tool: tool, gcPaths: gcPaths });
    expect(findings[0]?.risk).toBe('review');
    expect(findings[0]?.displayPath).toBe(`${FIXTURE_HOME_DIR}/.pub-cache`);
    expect(findings[0]?.activity).toBe('idle');
    expect(findings[0]?.evidenceLines).toEqual([
      '`dart pub cache gc` would delete 4 cache entries, such as:',
      '~/.pub-cache/hosted-hashes/pub.dev/example_a-1.0.0.sha256',
      '~/.pub-cache/hosted/pub.dev/example_a-1.0.0',
      '~/.pub-cache/hosted/pub.dev/example_b-2.1.0',
      'and 1 more',
    ]);
  });

  test('offers nothing for an empty set', () => {
    expect(
      buildDartPubCacheFindings({
        tool: tool,
        gcPaths: [],
        homeDir: FIXTURE_HOME_DIR,
        processCommands: [],
      }),
    ).toEqual([]);
  });
});
