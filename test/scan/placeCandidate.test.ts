import { expect, test } from 'bun:test';
import type { Risk } from '../../src/catalog/catalog.js';
import type { CandidatePlace } from '../../src/scan/placeCandidate.js';
import { compareCandidatePlaces, placeCandidate } from '../../src/scan/placeCandidate.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { buildTestCandidate, buildTestToolCandidate } from '../support/candidateFixtures.js';

const RISKS: Risk[] = ['safe', 'review', 'careful', 'never'];

describeAwaitingWin32Platform('placeCandidate', () => {
  test('groups a matched item by its risk, a never item under review', () => {
    expect(
      RISKS.map((risk) => placeCandidate(buildTestCandidate({ path: '/fixture/a', risk: risk }))),
    ).toEqual([
      { kind: 'section', section: 'caches', group: 'safe' },
      { kind: 'section', section: 'caches', group: 'review' },
      { kind: 'section', section: 'caches', group: 'careful' },
      { kind: 'section', section: 'caches', group: 'review' },
    ]);
  });

  test('groups a safe item a probe found under review, since its evidence wants reading first', () => {
    expect(
      RISKS.map((risk) =>
        placeCandidate(
          buildTestToolCandidate({ homeDir: '/fixture', version: '20.1.0', risk: risk }),
        ),
      ),
    ).toEqual([
      { kind: 'explore', section: 'developerTools', group: 'review' },
      { kind: 'explore', section: 'developerTools', group: 'review' },
      { kind: 'explore', section: 'developerTools', group: 'careful' },
      { kind: 'explore', section: 'developerTools', group: 'review' },
    ]);
  });

  test('puts an item in the section of its category', () => {
    expect(
      placeCandidate(buildTestCandidate({ path: '/fixture/movie.mov', category: 'userFiles' })),
    ).toMatchObject({ section: 'largeFiles' });
    expect(
      placeCandidate(buildTestCandidate({ path: '/fixture/Kept.app', category: 'leftovers' })),
    ).toMatchObject({ section: 'apps' });
  });
});

describeAwaitingWin32Platform('compareCandidatePlaces', () => {
  test('orders by section, then safe, review, and careful within one, Explore last', () => {
    const places: CandidatePlace[] = [
      { kind: 'explore', section: 'caches', group: 'review' },
      { kind: 'section', section: 'trash', group: 'safe' },
      { kind: 'section', section: 'caches', group: 'careful' },
      { kind: 'section', section: 'caches', group: 'review' },
      { kind: 'section', section: 'caches', group: 'safe' },
    ];

    expect(places.toSorted(compareCandidatePlaces)).toEqual([
      { kind: 'section', section: 'caches', group: 'safe' },
      { kind: 'section', section: 'caches', group: 'review' },
      { kind: 'section', section: 'caches', group: 'careful' },
      { kind: 'section', section: 'trash', group: 'safe' },
      { kind: 'explore', section: 'caches', group: 'review' },
    ]);
  });
});
