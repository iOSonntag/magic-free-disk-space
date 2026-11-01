import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BridgeEvent } from '../../src/bridge/runBridge.js';

/** Every event of the protocol fixture the app is tested with, parsed, in the order of its lines. */
export async function loadProtocolFixtureEvents(): Promise<unknown[]> {
  const fixtureText = await readFile(join(import.meta.dir, '../bridge/bridgeEvents.jsonl'), 'utf8');

  return fixtureText
    .split('\n')
    .filter((line) => line !== '')
    .map((line): unknown => JSON.parse(line));
}

/** The first event of `kind` in the protocol fixture; throws when the fixture has none. */
export async function loadProtocolFixtureEventOfKind(kind: BridgeEvent['kind']): Promise<unknown> {
  const events = await loadProtocolFixtureEvents();
  const event = events.find(
    (fixtureEvent) =>
      typeof fixtureEvent === 'object' &&
      fixtureEvent !== null &&
      'kind' in fixtureEvent &&
      fixtureEvent.kind === kind,
  );

  if (event === undefined) {
    throw new Error(`The protocol fixture has no ${kind} event`);
  }

  return event;
}
