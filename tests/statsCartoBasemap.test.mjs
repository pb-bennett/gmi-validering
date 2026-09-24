import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CARTO_BASEMAP_ATTRIBUTION,
  getCartoBasemapUrl,
} from '../src/lib/stats/cartoBasemap.mjs';

test('Stats CARTO URL keeps the Positron raster style and encodes a configured key', () => {
  assert.equal(
    getCartoBasemapUrl(' a+b /? '),
    'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=a%2Bb%20%2F%3F',
  );
  assert.equal(getCartoBasemapUrl(undefined), null);
  assert.equal(getCartoBasemapUrl('  '), null);
});

test('StatsMap gates raster requests on configuration and retains visible attribution', () => {
  const source = readFileSync('src/components/stats/StatsMap.js', 'utf8');
  assert.match(source, /process\.env\.NEXT_PUBLIC_CARTO_BASEMAP_KEY/);
  assert.match(source, /\{cartoTileUrl && \([\s\S]*?<AttributionControl position="topleft" prefix=\{false\} \/>[\s\S]*?<TileLayer[\s\S]*?url=\{cartoTileUrl\}[\s\S]*?attribution=\{CARTO_BASEMAP_ATTRIBUTION\}/);
  assert.match(source, /!cartoTileUrl && \(/);
  assert.match(CARTO_BASEMAP_ATTRIBUTION, /OpenStreetMap/);
  assert.match(CARTO_BASEMAP_ATTRIBUTION, /CARTO/);
  assert.doesNotMatch(source, /attribution=""/);
});
