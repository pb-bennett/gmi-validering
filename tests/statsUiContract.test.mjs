import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (relativePath) =>
  fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('statistics UI exposes the Norwegian uptake and kommune controls', () => {
  const modal = read('src/components/StatsModal.js');
  const map = read('src/components/stats/StatsMap.js');
  const statsRoute = read('src/lib/stats/statsRoute.mjs');
  const legacyStats = read('src/lib/stats/legacyStats.mjs');
  const detailed = read('src/components/DetailedStatsSection.js');
  const testMode = read('src/components/TestModeControl.js');
  const activation = read('src/lib/testModeActivation.mjs');

  for (const label of [
    'Utvikling over tid',
    'Dag',
    'Uke',
    'Måned',
    'Antall',
    'Kumulativt',
    'Totalt',
    'Per kommune',
    'Utvid diagram',
    'Lukk utvidet visning',
    'Kommuner',
    'Velg alle',
    'Fjern alle',
    'Søk kommune',
    'Uten registrert kommune',
  ]) {
    assert.match(modal, new RegExp(label));
  }
  assert.doesNotMatch(modal, /kommuneMode/);
  assert.doesNotMatch(modal, /Ekskluder/);
  assert.doesNotMatch(modal, /MAX_COMPARISON_KOMMUNER|Velg opptil 8/);
  assert.doesNotMatch(modal, /heatmap|Aktivitet per time|ukedag/i);
  assert.doesNotMatch(modal, /DetailedStatsSection/);
  assert.doesNotMatch(modal, /📤|🏘️/);
  assert.doesNotMatch(modal, /lg:grid-cols-\[15rem/);
  assert.doesNotMatch(modal, /<aside/);
  assert.match(detailed, /Detaljert statistikk er ikke aktivert ennå/);
  assert.match(testMode, /Testmodus er aktiv/);
  assert.match(testMode, /opplastinger registreres ikke/);
  assert.match(activation, /testmodus/);
  assert.match(activation, /'1'/);
  assert.doesNotMatch(testMode, /Aktiver testmodus/);
  assert.match(modal, /Opplastinger uten registrert kommune/);
  assert.match(modal, /Statistikk fra/);
  assert.match(modal, /formatAnalyticsStartDate/);
  assert.match(modal, /aria-expanded/);
  assert.match(modal, /selectedKommuneIds.length}\/\{availableKommuner.length}/);
  assert.match(modal, /selectedKommuneIds.length} av \{availableKommuner.length} valgt/);
  assert.match(modal, /Utvid kart/);
  assert.match(modal, /Fordeling/);
  assert.match(modal, /ranking/);
  assert.match(modal, /Lukk utvidet visning/);
  assert.match(modal, /onChange=\{\(event\) =>/);
  assert.match(modal, /expandedMap/);
  assert.match(modal, /<StatsMap[\s\S]*expanded=\{expandedMap}/);
  assert.match(map, /getInitialTimelineIndex/);
  assert.match(map, /min=\{0\}/);
  assert.match(map, /onChange=\{\(event\) =>/);
  assert.match(map, /setPlaying\(false\)/);
  assert.match(map, /getPlaybackIntervalMs/);
  assert.match(map, /invalidateMapSize/);
  assert.match(map, /ViewportOwnership/);
  assert.match(map, /dragstart/);
  assert.match(map, /movestart/);
  assert.match(map, /zoomstart/);
  assert.match(map, /programmaticViewportRef/);
  assert.match(map, /Vis alle punkter/);
  assert.match(map, /shouldAutoFitViewport/);
  assert.match(legacyStats, /ANALYTICS_START_DATE = '2026-02-19'/);
  assert.match(statsRoute, /analyticsStartDate: ANALYTICS_START_DATE/);
});
