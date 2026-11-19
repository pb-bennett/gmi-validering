import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { STREET_VIEW_BASE, openStreetView, streetViewUrl } from '../src/lib/map/streetView.mjs';

// Batch F: Google Street View from the shared map. URL generation and opening are tested without contacting Google.
test('the URL is the documented pano form with the drop position as latitude,longitude', () => {
  assert.equal(STREET_VIEW_BASE, 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=');
  assert.equal(streetViewUrl({ lat: 59.9138688, lng: 10.7522454 }), `${STREET_VIEW_BASE}59.9138688,10.7522454`);
  assert.equal(streetViewUrl({ latitude: 59.5, longitude: 10 }), `${STREET_VIEW_BASE}59.5,10`);
  assert.equal(streetViewUrl({ lat: 59.123456789, lng: 10.987654321 }), `${STREET_VIEW_BASE}59.1234568,10.9876543`, 'seven decimals');
  assert.equal(streetViewUrl({ lat: -33.8568, lng: 151.2153 }), `${STREET_VIEW_BASE}-33.8568,151.2153`);
  assert.equal(streetViewUrl({ lat: 0.00000001, lng: -0.00000001 }), `${STREET_VIEW_BASE}0,0`);
});

test('a wrapped world longitude is normalised; invalid positions give no URL', () => {
  assert.equal(streetViewUrl({ lat: 60, lng: 370.5 }), `${STREET_VIEW_BASE}60,10.5`);
  assert.equal(streetViewUrl({ lat: 60, lng: -190 }), `${STREET_VIEW_BASE}60,170`);
  for (const invalid of [null, {}, { lat: 91, lng: 10 }, { lat: Number.NaN, lng: 10 }, { lat: 60, lng: Infinity }, { lat: '60', lng: 'x' }]) {
    assert.equal(streetViewUrl(invalid), null, JSON.stringify(invalid));
  }
});

test('opening uses a new tab without an opener and reports a blocked tab', () => {
  const calls = [];
  const tab = { opener: 'app' };
  assert.equal(openStreetView('https://example.invalid/x', (...args) => { calls.push(args); return tab; }), true);
  assert.deepEqual(calls, [['https://example.invalid/x', '_blank']]);
  assert.equal(tab.opener, null, 'the new tab gets no handle back to the app');
  assert.equal(openStreetView('https://example.invalid/x', () => null), false, 'a blocked tab is reported');
  assert.equal(openStreetView(null, () => tab), false, 'nothing is opened without a URL');
});

test('no embedded map, API key or coverage service; the control lives in the shared map and is isolated from map gestures', async () => {
  const read = (file) => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
  const [control, map, lib] = await Promise.all([read('components/StreetViewControl.js'), read('components/MapInner.js'), read('lib/map/streetView.mjs')]);
  for (const source of [control, lib]) assert.doesNotMatch(source, /<iframe|maps\.googleapis|key=|StreetViewService|fetch\(/);
  assert.match(map, /<MeasureToolButton \/>[\s\S]{0,200}<StreetViewControl \/>/);
  assert.match(control, /L\.DomEvent\.disableClickPropagation\(element\)/);
  assert.match(control, /setPointerCapture/);
  assert.match(control, /document\.addEventListener\('click', click, true\)/, 'a picked point is consumed before FOTO placement or Leaflet sees the click');
  assert.match(control, /icon=\{PersonSimpleWalkIcon\}[^>]*label="Google Street View"/);
  assert.match(control, /Bruk kartets midtpunkt/, 'a pointer-free alternative');
});
