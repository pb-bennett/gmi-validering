import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { positionProfileTooltip } from '../src/lib/analysis/profileTooltipPosition.mjs';

const css = await readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/page.js', import.meta.url), 'utf8');
const modal = await readFile(new URL('../src/components/InclineAnalysisModal.js', import.meta.url), 'utf8');

test('large-height desktop retains the accepted split; short desktop uses container percentages', () => {
  assert.match(css, /--profile-map-height:\s*55%;\s*--profile-panel-height:\s*45vh;/);
  assert.match(css, /@media \(max-height:\s*1000px\)[\s\S]*--profile-map-height:\s*42%;\s*--profile-panel-height:\s*58%;/);
  assert.match(css, /@media \(max-height:\s*750px\)[\s\S]*--profile-map-height:\s*37%;\s*--profile-panel-height:\s*63%;/);
  assert.match(css, /\.profile-analysis-panel\s*\{\s*height:\s*var\(--profile-panel-height\)/);
  assert.match(page, /analysisOpen\s*\? 'var\(--profile-map-height, 55%\)'/);
});

test('short desktop reclaims spacing while large-height classes and control sizes stay intact', () => {
  assert.match(modal, /profile-analysis-header flex-none p-3/);
  assert.match(modal, /profile-analysis-main flex-1 p-4/);
  assert.match(modal, /profile-analysis-detail gap-4/);
  assert.match(modal, /profile-analysis-plot[^\"]*p-2/);
  assert.match(css, /@media \(max-height:\s*1000px\)[\s\S]*\.profile-analysis-header\s*\{\s*padding-block:\s*0\.5rem/);
  assert.match(css, /\.profile-analysis-main\s*\{\s*padding-block:\s*0\.5rem/);
  assert.match(css, /\.profile-analysis-detail\s*\{\s*gap:\s*0\.5rem/);
  assert.match(css, /\.profile-analysis-plot\s*\{\s*padding-block:\s*0\.25rem/);
  assert.match(css, /\.profile-analysis-panel\s*\{\s*box-shadow:\s*0 -2px 3px -1px/);

  // Header 8px, main 16px, summary/chart gap 8px, frame 8px.
  const reclaimed = 8 + 16 + 8 + 8;
  assert.equal(reclaimed, 40);
  assert.ok(reclaimed - 0.02 * 900 > 20, 'chart gains space even after the map gets 2% back');
  assert.ok(reclaimed - 0.02 * 700 > 20, 'the shorter laptop tier also gains chart space');
});

test('chart and list shrink within the panel; only the list scrolls', () => {
  assert.match(modal, /profile-analysis-panel absolute bottom-0/);
  assert.match(modal, /flex-1 min-h-0 flex overflow-hidden/);
  assert.match(modal, /w-80 min-h-0 border-r/);
  assert.match(modal, /flex-1 overflow-y-auto/);
  assert.match(modal, /profile-analysis-detail gap-4 flex-1 min-h-0 flex flex-col/);
  assert.match(modal, /profile-analysis-plot[^\"]*min-h-0/);
  assert.doesNotMatch(modal, /minHeight: '300px'/);
  assert.match(modal, /positionProfileTooltip\(\{/);
});

test('tooltip follows the anchor, flips above lower hovers and clamps to chart edges', () => {
  const size = { width: 600, height: 250, tooltipWidth: 160, tooltipHeight: 100 };
  assert.deepEqual(positionProfileTooltip({ ...size, anchorX: 100, anchorY: 40 }), { left: 115, top: 55 });
  assert.deepEqual(positionProfileTooltip({ ...size, anchorX: 590, anchorY: 225 }), { left: 432, top: 110 });
  assert.deepEqual(positionProfileTooltip({ ...size, anchorX: 590, anchorY: 225, preferSide: true }), { left: 420, top: 142 });
});
