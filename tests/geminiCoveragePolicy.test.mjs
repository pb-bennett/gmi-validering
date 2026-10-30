import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyGeminiMapExtent, GEMINI_COVERAGE_CONCURRENCY,
  GEMINI_MAP_SOFT_SIDE_METRES, GEMINI_MAP_SOFT_AREA_SQUARE_METRES,
  GEMINI_MAP_HARD_SIDE_METRES, GEMINI_MAP_HARD_AREA_SQUARE_METRES,
  GEMINI_ABSOLUTE_SIDE_METRES, GEMINI_ABSOLUTE_AREA_SQUARE_METRES } from '../src/lib/gemini-wfs/geminiCoveragePolicy.mjs';
const level = (width, height) => classifyGeminiMapExtent([579000, 6559000, 579000 + width, 6559000 + height]).level;

test('central thresholds leave conservative map headroom below the existing absolute server ceiling', () => {
  assert.equal(GEMINI_COVERAGE_CONCURRENCY, 2);
  assert.equal(GEMINI_MAP_SOFT_SIDE_METRES, 750); assert.equal(GEMINI_MAP_SOFT_AREA_SQUARE_METRES, 500000);
  assert.equal(GEMINI_MAP_HARD_SIDE_METRES, 1500); assert.equal(GEMINI_MAP_HARD_AREA_SQUARE_METRES, 2000000);
  assert.equal(GEMINI_ABSOLUTE_SIDE_METRES, 2000); assert.equal(GEMINI_ABSOLUTE_AREA_SQUARE_METRES, 4000000);
});

test('soft/hard thresholds apply independently to width, height and area with inclusive boundaries', () => {
  assert.equal(level(750, 600), 'ordinary'); assert.equal(level(750.01, 1), 'confirm');
  assert.equal(level(1, 750.01), 'confirm'); assert.equal(level(750, 750), 'confirm');
  assert.equal(level(1500, 1300), 'confirm'); assert.equal(level(1500.01, 1), 'blocked');
  assert.equal(level(1, 1500.01), 'blocked'); assert.equal(level(1500, 1400), 'blocked');
  assert.equal(level(1000, 500), 'confirm');
});

test('nonfinite or inverted dimensions cannot pass map size classification', () => {
  for (const [width, height] of [[0, 100], [-1, 100], [Infinity, 100], [100, NaN]]) assert.equal(level(width, height), 'blocked');
});
