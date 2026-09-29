import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getFeatureHoverLabel, getFeatureHoverColor } from '../src/lib/map/featureHoverLabel.mjs';
import { createFeatureHoverController, HOVER_DELAY_MS } from '../src/lib/map/featureHoverController.mjs';

const line = (properties) => ({ geometry: { type: 'LineString' }, properties });
const point = (properties) => ({ geometry: { type: 'Point' }, properties });

test('canonical line labels omit missing data and preserve zero', () => {
  assert.equal(getFeatureHoverLabel(line({ S_FCODE: 'VL', Dimensjon: 32, Material: 'PE', Anleggsår: 2022 })), 'VL 32 · PE · 2022');
  assert.equal(getFeatureHoverLabel(line({ S_FCODE: 'SP', Dimensjon: 160, Material: 'PVC', Anleggsår: 1998 })), 'SP 160 · PVC · 1998');
  assert.equal(getFeatureHoverLabel(line({ S_FCODE: 'AFO', Dimensjon: 600, Material: 'BET', Anleggsår: 1974 })), 'AFO 600 · BET · 1974');
  assert.equal(getFeatureHoverLabel(line({ S_FCODE: 'VL', Dimensjon: 32, Anleggsår: 2022 })), 'VL 32 · 2022');
  assert.equal(getFeatureHoverLabel(line({ S_FCODE: 'VL', Dimensjon: 32, Material: 'PE' })), 'VL 32 · PE');
  assert.equal(getFeatureHoverLabel(line({ S_FCODE: 'VL' })), 'VL');
  assert.equal(getFeatureHoverLabel(line({ S_FCODE: 'VL', Dimensjon: 0, Material: 'null', Anleggsår: NaN })), 'VL 0');
  assert.equal(getFeatureHoverLabel(line({ Dimensjon: 32, Material: 'PE' })), null);
});

test('line labels append the exact canonical cause last and omit missing values', () => {
  const properties = { S_FCODE: 'VL', Dimensjon: 32, Material: 'PE', ['Anleggs\u00e5r']: 2022 };
  const base = getFeatureHoverLabel(line(properties));
  assert.equal(base, 'VL 32 · PE · 2022');
  const code = 'NYKODE-X';
  assert.equal(getFeatureHoverLabel(line({ ...properties, ['Stedfestings\u00e5rsak']: code })), base + ' · ' + code);
  assert.equal(getFeatureHoverLabel(line({ ...properties, ['Stedfestings\u00e5rsak']: '  NYKODE-X  ' })), base + ' ·   NYKODE-X  ');
  assert.equal(getFeatureHoverLabel(line({ ...properties, ['Stedfestings\u00e5rsak']: '' })), base);
  assert.equal(getFeatureHoverLabel(line({ ...properties, ['Stedfestings\u00e5rsak']: '-' })), base);

  // Canonical top-level attributes produce the same label regardless of source format.
  const canonical = { ...properties, ['Stedfestings\u00e5rsak']: code };
  assert.equal(
    getFeatureHoverLabel(line({ ...canonical, SOURCE_FORMAT: 'GMI' })),
    getFeatureHoverLabel(line({ ...canonical, SOURCE_FORMAT: 'SOSI' })),
  );
});

test('canonical point labels stay concise and skip redundant identity', () => {
  assert.equal(getFeatureHoverLabel(point({ S_FCODE: 'KUM', Type: 'Kum', Bredde: 1200, Material: 'BET', Anleggsår: 2021 })), 'KUM · 1200 · BET · 2021');
  assert.equal(getFeatureHoverLabel(point({ S_FCODE: 'SLU', Bredde: 650, Anleggsår: 2019 })), 'SLU · 650 · 2019');
  assert.equal(getFeatureHoverLabel(point({ S_FCODE: 'SV', Type: 'STENGEVENTIL', Anleggsår: 2022 })), 'SV · STENGEVENTIL · 2022');
  assert.equal(getFeatureHoverLabel(point({ S_FCODE: 'SV' })), 'SV');
  assert.equal(getFeatureHoverLabel(point({ Type: 'STENGEVENTIL', Anleggsår: 2022 })), 'STENGEVENTIL · 2022');
  assert.equal(getFeatureHoverLabel(point({ S_FCODE: 'KUM', Type: 'KUM', Bredde: 0 })), 'KUM · 0');
  assert.equal(getFeatureHoverLabel(point({ objekttypenavn: 'VAPåskrift', text: 'note' })), null);
  assert.equal(getFeatureHoverLabel(point({ S_FCODE: 'SYM' })), null);
});

test('point labels append canonical cause after identity while sparse points stay compact', () => {
  const sparse = point({ S_FCODE: 'SLU', Bredde: 650 });
  const label = getFeatureHoverLabel(sparse);
  assert.equal(label, 'SLU · 650');
  assert.equal(getFeatureHoverLabel(point({ ...sparse.properties, ['Stedfestings\u00e5rsak']: 'EKSISTERENDE' })), label + ' · EKSISTERENDE');
});

test('colour comes from the current owning layer regardless of highlight or order', () => {
  const feature = point({ S_FCODE: 'KUM', _layerId: 'a' });
  const layers = {
    a: { highlightAll: false, highlightStyle: { color: '#123ABC' } },
    b: { highlightAll: true, highlightStyle: { color: '#F59E0B' } },
  };
  assert.equal(getFeatureHoverColor(feature, layers), '#123ABC');
  layers.a.highlightStyle.color = '#45ABCD';
  assert.equal(getFeatureHoverColor(feature, layers), '#45ABCD');
  assert.equal(getFeatureHoverColor(feature, { b: layers.b, a: layers.a }), '#45ABCD');
  assert.equal(getFeatureHoverColor(point({ S_FCODE: 'KUM' }), layers), null);
});

test('single fake clock delays, replaces, cancels, and hides hover', () => {
  let now = 0;
  let nextId = 0;
  const pending = new Map();
  const events = [];
  const setTimer = (callback, delay) => {
    const id = ++nextId;
    pending.set(id, { callback, time: now + delay });
    return id;
  };
  const advance = (ms) => {
    now += ms;
    for (const [id, task] of [...pending]) {
      if (task.time <= now) { pending.delete(id); task.callback(); }
    }
  };
  const controller = createFeatureHoverController({
    show: (payload) => events.push(`show:${payload}`),
    hide: () => events.push('hide'),
    setTimer,
    clearTimer: (id) => pending.delete(id),
  });
  const a = {}, b = {};
  assert.equal(HOVER_DELAY_MS, 500);
  controller.enter(a, 'a');
  advance(499);
  assert.deepEqual(events, []);
  controller.leave(a);
  advance(1);
  assert.deepEqual(events, []);
  controller.enter(a, 'a');
  advance(200);
  controller.enter(b, 'b');
  assert.equal(pending.size, 1);
  controller.leave(a); // Stale mouseout must not cancel the new feature.
  advance(499);
  assert.deepEqual(events, []);
  advance(1);
  assert.deepEqual(events, ['show:b']);
  controller.enter(a, 'a');
  assert.deepEqual(events, ['show:b', 'hide']);
  advance(500);
  assert.deepEqual(events, ['show:b', 'hide', 'show:a']);
  controller.leave(a);
  assert.deepEqual(events.at(-1), 'hide');
  controller.enter(a, 'a');
  controller.cancel(); // Map movement, including pan and zoom.
  advance(500);
  assert.deepEqual(events, ['show:b', 'hide', 'show:a', 'hide']);
});

test('semantic layer and non-interactive tooltip retain popup and click handlers', () => {
  const map = readFileSync(new URL('../src/components/MapInner.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  assert.match(map, /interactive: false,[\s\S]*?className: 'gmi-compact-hover-tooltip'/);
  assert.match(map, /map\.on\('movestart dragstart zoomstart', cancel\)/);
  assert.match(map, /layer\.on\('mouseover'/);
  assert.match(map, /layer\.on\('mouseout'/);
  assert.match(map, /layer\.bindPopup\(/);
  assert.match(map, /interactive=\{false\}/);
  assert.match(css, /\.leaflet-tooltip\.gmi-compact-hover-tooltip\s*\{[^}]*pointer-events: none/s);
});
