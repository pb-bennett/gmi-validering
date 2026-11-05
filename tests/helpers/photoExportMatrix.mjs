import assert from 'node:assert/strict';
import { exportFixture, syntheticContext } from './photoExportFixtures.mjs';
import { capturePhotoExportSnapshot } from '../../src/lib/photos/export/photoExportPlan.mjs';

// One vocabulary for the readiness/plan parity matrix. Every value is invented.
export const MATRIX_TIMES = Object.freeze({ none: null, date: '2026-05-12', minute: '2026-05-12T14:33', second: '2026-05-12T14:33:02',
  fraction: '2026-05-12T14:33:02.125', offset: '2026-05-12T14:33:02+02:00', utc: '2026-05-12T12:33:02Z' });
export const MATRIX_DIRECTIONS = Object.freeze({ none: null, zero: 0, fractional: 359.875, invalid: 400 });
export const MATRIX_PHOTOGRAPHERS = Object.freeze({ none: null, valid: 'Synthetic Artist', xmlInvalid: 'Synthetic\u0001Artist' });
export const MATRIX_CONTEXTS = Object.freeze({ valid: syntheticContext, missing: {}, invalid: { ...syntheticContext, horizontalMethod: 'not-a-code' } });
export const MATRIX_PROFILES = Object.freeze(['gemini-legacy2019', 'legacy2019', 'asbuilt52']);
export const MATRIX_CRS = Object.freeze(['EPSG:25832', 'EPSG:25833', 'EPSG:4326']);
// Which occurrences have an accepted position. Asset rules count once and occurrence rules per occurrence
// only where these differ, so each shape separates a different ownership boundary.
export const MATRIX_LAYOUTS = Object.freeze({
  single: { names: ['a.png'], placed: 'all' },
  twoAssets: { names: ['a.png', 'b.png'], placed: 'all' },
  repeated: { names: ['a.png'], repeated: true, placed: 'all' },
  repeatedOnePlaced: { names: ['a.png'], repeated: true, placed: 'first' },
  oneOfTwoPlaced: { names: ['a.png', 'b.png'], placed: 'first' },
  nonePlaced: { names: ['a.png'], placed: 'none' },
});

const position = (index) => ({ crs: 'EPSG:4326', longitude: 10.43555 + index * .001, latitude: 59.2251222222 });

// Canonical session state, returned both as the plan sees it (snapshot) and as readiness sees it (photos).
// An out-of-range direction cannot be entered, so "invalid" is overlaid on both views alike.
export async function matrixFixture({ layout = 'single', time = 'second', direction = 'zero', photographer = 'valid' } = {}) {
  const { placed, ...shape } = MATRIX_LAYOUTS[layout];
  const fixture = await exportFixture({ ...shape, unplaced: true, direction: null, time: MATRIX_TIMES[time], photographer: MATRIX_PHOTOGRAPHERS[photographer] });
  const { session, layerId, ids } = fixture;
  const targets = placed === 'all' ? ids : placed === 'first' ? ids.slice(0, 1) : [];
  if (targets.length) assert(session.applyPhotoEdits(session.beginPhotoEdits(layerId), targets.map((photoId, index) => ({ photoId, position: position(index) }))).ok);
  const degrees = MATRIX_DIRECTIONS[direction];
  if (degrees !== null && direction !== 'invalid') assert(session.fillMissingPhotoValues(layerId, 'direction', degrees).ok);
  const invalid = direction === 'invalid' ? { degrees } : null;
  return {
    ...fixture,
    snapshot() {
      const snapshot = capturePhotoExportSnapshot(session, layerId);
      return invalid ? { ...snapshot, occurrences: snapshot.occurrences.map((row) => ({ ...row, direction: invalid })) } : snapshot;
    },
    photos() {
      const photos = session.getLayerPhotos(layerId);
      return invalid ? photos.map((photo) => ({ ...photo, direction: { current: invalid } })) : photos;
    },
  };
}

// The full profile x time x direction x layout grid, then the remaining dimensions on the layouts where ownership differs.
export function matrixScenarios() {
  const scenarios = [];
  for (const layout of Object.keys(MATRIX_LAYOUTS)) for (const time of Object.keys(MATRIX_TIMES)) for (const direction of Object.keys(MATRIX_DIRECTIONS)) {
    for (const profile of MATRIX_PROFILES) scenarios.push({ layout, time, direction, photographer: 'valid', profile, context: 'valid', crs: 'EPSG:25832' });
  }
  for (const layout of ['single', 'repeated', 'repeatedOnePlaced', 'nonePlaced']) for (const time of ['none', 'second']) for (const direction of ['none', 'zero']) {
    for (const photographer of Object.keys(MATRIX_PHOTOGRAPHERS)) for (const profile of MATRIX_PROFILES) for (const context of Object.keys(MATRIX_CONTEXTS)) for (const crs of MATRIX_CRS) {
      scenarios.push({ layout, time, direction, photographer, profile, context, crs });
    }
  }
  // No profile chosen: the plan reports invalid-profile and still applies its capture-time check.
  for (const layout of ['single', 'repeatedOnePlaced', 'nonePlaced']) for (const time of ['none', 'minute', 'second']) for (const direction of ['none', 'invalid']) {
    for (const crs of MATRIX_CRS) scenarios.push({ layout, time, direction, photographer: 'xmlInvalid', profile: '', context: 'valid', crs });
  }
  return [...new Map(scenarios.map((scenario) => [JSON.stringify(scenario), scenario])).values()];
}

export const matrixConfiguration = ({ profile, crs, context }) => ({ profile, crs, context: MATRIX_CONTEXTS[context] });

// Visits each session state once and hands every scenario that shares it to the callback.
export async function forEachMatrixFixture(scenarios, visit) {
  const groups = Map.groupBy(scenarios, ({ layout, time, direction, photographer }) => JSON.stringify([layout, time, direction, photographer]));
  for (const group of groups.values()) {
    const fixture = await matrixFixture(group[0]);
    try { for (const scenario of group) await visit(fixture, scenario); }
    finally { fixture.session.clear(); }
  }
}

// invalid-context has no asset or occurrence owner, so its field is part of its identity.
export const diagnosticKey = ({ code, assetId, occurrenceId, field }) => JSON.stringify([code, assetId ?? null, occurrenceId ?? null, field ?? null]);
