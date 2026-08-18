import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAP_PLAYBACK_MAX_INTERVAL_MS,
  MAP_PLAYBACK_MIN_INTERVAL_MS,
  getInitialTimelineIndex,
  getNextTimelineIndex,
  getPlaybackIntervalMs,
  getViewportModeAfterInteraction,
  invalidateMapSize,
  shouldAutoFitViewport,
  VIEWPORT_MODE_AUTO,
  VIEWPORT_MODE_USER,
} from '../src/lib/stats/mapTimeline.mjs';

test('map timeline defaults to the latest available period', () => {
  assert.equal(getInitialTimelineIndex(['A', 'B', 'C']), 2);
  assert.equal(getInitialTimelineIndex([]), -1);
});

test('map playback timing is bounded and targets a practical full-period duration', () => {
  assert.equal(getPlaybackIntervalMs(1), MAP_PLAYBACK_MAX_INTERVAL_MS);
  assert.equal(getPlaybackIntervalMs(201), MAP_PLAYBACK_MIN_INTERVAL_MS);
  assert.equal(getPlaybackIntervalMs(13), 1000);
  assert.equal(getPlaybackIntervalMs(2), MAP_PLAYBACK_MAX_INTERVAL_MS);
  assert.ok(getPlaybackIntervalMs(50) >= MAP_PLAYBACK_MIN_INTERVAL_MS);
  assert.ok(getPlaybackIntervalMs(50) <= MAP_PLAYBACK_MAX_INTERVAL_MS);
});

test('map playback advances to the latest period without overshooting', () => {
  assert.equal(getNextTimelineIndex(0, 2), 1);
  assert.equal(getNextTimelineIndex(1, 2), 2);
  assert.equal(getNextTimelineIndex(2, 2), 2);
});

test('programmatic viewport changes preserve auto mode while manual changes take ownership', () => {
  assert.equal(
    getViewportModeAfterInteraction(VIEWPORT_MODE_AUTO, { programmatic: true }),
    VIEWPORT_MODE_AUTO,
  );
  assert.equal(
    getViewportModeAfterInteraction(VIEWPORT_MODE_AUTO),
    VIEWPORT_MODE_USER,
  );
  assert.equal(
    getViewportModeAfterInteraction(VIEWPORT_MODE_USER, { programmatic: true }),
    VIEWPORT_MODE_USER,
  );
  assert.equal(
    getViewportModeAfterInteraction(VIEWPORT_MODE_USER),
    VIEWPORT_MODE_USER,
  );
});

test('auto-fit is suppressed for timeline, playback, and filter changes after manual ownership', () => {
  assert.equal(
    shouldAutoFitViewport({ mode: VIEWPORT_MODE_AUTO, hasMarkers: true }),
    true,
  );
  assert.equal(
    shouldAutoFitViewport({ mode: VIEWPORT_MODE_USER, hasMarkers: true }),
    false,
  );
  assert.equal(
    shouldAutoFitViewport({ mode: VIEWPORT_MODE_USER, hasMarkers: true, force: true }),
    true,
  );
  assert.equal(
    shouldAutoFitViewport({ mode: VIEWPORT_MODE_AUTO, hasMarkers: false }),
    false,
  );
});

test('map resize seam invalidates Leaflet after layout changes', () => {
  const calls = [];
  invalidateMapSize({
    invalidateSize(options) {
      calls.push(options);
    },
  });
  invalidateMapSize(null);
  assert.deepEqual(calls, [{ animate: false }]);
});
