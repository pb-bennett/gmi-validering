import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { serveGeminiWorkflowApp } from './helpers/geminiUiHarness.mjs';

const card = 'section[aria-label="Eksisterende anlegg · Gemini WFS"]';
test('Gemini WFS filters in real React/Leaflet, synthetic service only', { skip: !chromePath, timeout: 240000 }, async (t) => {
  const app = await serveGeminiWorkflowApp('./tests/browser/geminiFilterApp.js'); let browser;
  try {
    browser = await openTestChrome();
    const size = (width, height) => browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await size(1366, 768);
    const run = (source) => browser.evaluate(source);
    const frames = () => run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const load = async () => { await browser.send('Page.navigate', { url: app.url }); await browser.waitFor('globalThis.geminiFilter?.audit.map'); };
    const connect = async (mode, resource) => {
      assert.equal(await run(`geminiFilter.connect(${JSON.stringify(mode ?? 'mixed')}, ${JSON.stringify(resource ?? 'va-basis')})`), true);
      await browser.waitFor(`document.querySelector(${JSON.stringify(card)})`); await frames();
    };
    const fit = async () => { await run('void geminiFilter.audit.map.fitBounds([[59.2240,10.4340],[59.2258,10.4376]],{animate:false})'); await frames(); };
    // Visible reference layers by provider ID; casing and primary are checked separately.
    const state = () => run(`(() => { const out = {}; geminiFilter.audit.map.eachLayer((layer) => {
      if (layer.feature?.properties?.kind !== 'gemini-reference') return;
      const id = JSON.parse(layer.feature.id).at(-1).split('.')[1], shown = getComputedStyle(layer.getElement()).display !== 'none';
      (out[id] ??= []).push(shown); }); return out; })()`);
    const shown = async () => Object.entries(await state()).filter(([, value]) => value.every(Boolean)).map(([id]) => id).sort();
    const requests = () => run('geminiFilter.audit.requests');
    const summary = () => run(`document.querySelector('[data-gemini-filter-summary]')?.textContent.trim() ?? null`);
    const notice = () => run(`document.querySelector('[data-gemini-status-notice]')?.textContent ?? null`);
    const expand = async () => { await run(`(() => { const b = document.querySelector('${card} button[aria-label="Vis detaljer for Gemini WFS"]'); if (b) b.click(); })()`); await frames(); };
    const tab = async (side) => { await run(`document.querySelector('[data-gemini-filter-tab=${side}]').click()`); await frames(); };
    const tabs = () => run(`Array.from(document.querySelectorAll('${card} [role=tab]')).map(b => [b.textContent, b.getAttribute('aria-label'), b.getAttribute('aria-selected'), b.tabIndex, !!b.querySelector('svg')])`);
    const open = async (id) => { await run(`(() => { const b = document.querySelector('[data-gemini-filter="${id}"] > button'); if (b.getAttribute('aria-expanded') === 'false') b.click(); })()`); await frames(); };
    const box = (id, key) => `document.querySelector('[data-gemini-filter="${id}"] [data-filter-value="${key}"] input')`;
    const toggle = async (id, key) => { await open(id); await run(`${box(id, key)}.click()`); await frames(); };
    const button = async (label) => { await run(`(Array.from(document.querySelectorAll('${card} button')).find(b => (b.getAttribute('aria-label') ?? b.textContent) === ${JSON.stringify(label)})).click()`); await frames(); };
    const pixel = (id) => run(`(() => { let target; geminiFilter.audit.map.eachLayer(l => { if (l.feature?.id && l.feature.id.includes('.${id}"')) target = l; });
      const map = geminiFilter.audit.map, v = target.getLatLngs?.(); const at = v ? { lat: v[0].lat + .3*(v[1].lat-v[0].lat), lng: v[0].lng + .3*(v[1].lng-v[0].lng) } : target.getLatLng();
      const p = map.latLngToContainerPoint(at), r = map.getContainer().getBoundingClientRect(); return { x: r.left+p.x, y: r.top+p.y }; })()`);
    const click = async (point) => { for (const [type, buttons] of [['mouseMoved', 0], ['mousePressed', 1], ['mouseReleased', 0]])
      await browser.send('Input.dispatchMouseEvent', { type, ...point, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: 1 }); await frames(); };
    const popup = () => run(`!!document.querySelector('.gmi-gemini-popup')`);
    const key = async (name, code, text) => { for (const type of ['keyDown', 'keyUp']) await browser.send('Input.dispatchKeyEvent', { type, key: name, code, ...(name === 'Tab' ? { windowsVirtualKeyCode: 9 } : {}), ...(text && type === 'keyDown' ? { text } : {}) }); await frames(); };

    await load(); await connect(); await fit();
    await t.test('default shows exact Drift only, with collapsed totals and line casings hidden too', async () => {
      assert.deepEqual(await shown(), ['kum', 'ov', 'vl']);
      const all = await state();
      assert.deepEqual(all.old, [false, false]); assert.deepEqual(all.none, [false, false]); assert.deepEqual(all.gone, [false]);
      assert.equal(await summary(), 'Filter viser 2 av 4 ledn. · 1 av 2 punkt · 3 skjult');
      assert.equal(await notice(), null);
      assert.equal(await run(`document.querySelectorAll('${card} [data-gemini-filter]').length`), 0);
    });
    await t.test('two tabs own their groups, counts and totals', async () => {
      await expand();
      assert.deepEqual(await run(`Array.from(document.querySelectorAll('[data-gemini-filter] > button')).map(b => b.firstChild.textContent)`),
        ['Status', 'Anleggstype', 'Eierskap', 'Materiale', 'Dimensjon']);
      assert.deepEqual(await tabs(), [['Ledninger2/4', 'Ledninger, 2 av 4 vises, filter er aktivt', 'true', 0, true], ['Punkter1/2', 'Punkter, 1 av 2 vises, filter er aktivt', 'false', -1, true]]);
      await tab('points');
      assert.deepEqual(await run(`Array.from(document.querySelectorAll('[data-gemini-filter] > button')).map(b => b.firstChild.textContent)`), ['Status', 'Eierskap']);
      await open('status');
      assert.deepEqual(await run(`Array.from(document.querySelectorAll('[data-gemini-filter=status] label')).map(l => [l.children[1].textContent, l.children[2].textContent, l.children[0].checked])`),
        [['Drift', '1', true], ['Fjernet', '1', false]]);
      assert.deepEqual(await run(`(() => { const p = document.querySelector('${card} [role=tabpanel]'), t = document.querySelector('${card} [role=tab][aria-selected=true]');
        return [t.getAttribute('aria-controls') === p.id, p.getAttribute('aria-labelledby') === t.id, t.dataset.geminiFilterTab]; })()`), [true, true, 'points']);
      await tab('lines');
      assert.equal(await run(`document.querySelectorAll('[data-gemini-filter] > button[aria-expanded=true]').length`), 0, 'Disclosure belongs to its tab');
      await open('status'); await open('material');
      assert.equal(await run(`document.querySelectorAll('[data-gemini-filter] > button[aria-expanded=true]').length`), 2);
      assert.deepEqual(await run(`Array.from(document.querySelectorAll('[data-gemini-filter=status] label')).map(l => [l.children[1].textContent, l.children[2].textContent, l.children[0].checked])`),
        [['Drift', '2', true], ['Nedlagt', '1', false], ['Mangler verdi', '1', false]]);
      assert.equal(await run(`getComputedStyle(${box('status', 't:drift')}).accentColor`), 'rgb(0, 117, 149)');
      assert.equal(await run(`document.querySelector('${card}').scrollWidth <= document.querySelector('${card}').clientWidth`), true);
    });
    await t.test('keyboard toggles a focused checkbox with visible focus', async () => {
      await run(`${box('status', 't:nedlagt')}.focus()`);
      await key(' ', 'Space', ' ');
      assert.deepEqual(await shown(), ['kum', 'old', 'ov', 'vl']);
      assert.equal(await run(`document.activeElement === ${box('status', 't:nedlagt')}`), true);
      await key('Tab', 'Tab'); await run(`${box('status', 't:nedlagt')}.focus()`);
      assert.notEqual(await run(`(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle + s.boxShadow; })()`), 'nonenone');
      await key(' ', 'Space', ' ');
      assert.deepEqual(await shown(), ['kum', 'ov', 'vl']);
    });
    await t.test('keyboard moves between tabs with visible focus; tabs never change the map or send requests', async () => {
      const before = await requests(), map = await state(), filters = await run('JSON.stringify(geminiFilter.geminiPresentation.getSnapshot())');
      const selected = () => run(`[document.activeElement.dataset.geminiFilterTab, document.activeElement.getAttribute('aria-selected'), document.querySelector('[data-gemini-filter-panel]').dataset.geminiFilterPanel]`);
      await run(`document.querySelector('[data-gemini-filter-tab=lines]').focus()`);
      await key('ArrowRight', 'ArrowRight'); assert.deepEqual(await selected(), ['points', 'true', 'points']);
      assert.notEqual(await run('getComputedStyle(document.activeElement).boxShadow'), 'none');
      await key('ArrowRight', 'ArrowRight'); assert.deepEqual(await selected(), ['lines', 'true', 'lines']);
      await key('ArrowLeft', 'ArrowLeft'); assert.deepEqual(await selected(), ['points', 'true', 'points']);
      await key('Home', 'Home'); assert.deepEqual(await selected(), ['lines', 'true', 'lines']);
      await key('End', 'End'); assert.deepEqual(await selected(), ['points', 'true', 'points']);
      await key('Tab', 'Tab');
      assert.equal(await run(`document.activeElement === document.querySelector('[data-gemini-filter=status] > button')`), true, 'Tab leaves the tab list for the panel');
      await key('Home', 'Home'); assert.equal(await run(`document.querySelector('[data-gemini-filter-panel]').dataset.geminiFilterPanel`), 'points', 'Arrow handling stays on the tabs');
      await tab('lines');
      assert.deepEqual(await state(), map); assert.equal(await requests(), before);
      assert.equal(await run('JSON.stringify(geminiFilter.geminiPresentation.getSnapshot())'), filters);
    });
    await t.test('Status and Eierskap are independent per tab, and the other tab shows its active filter', async () => {
      await tab('points'); await toggle('status', 't:fjernet');
      assert.deepEqual(await shown(), ['gone', 'kum', 'ov', 'vl']);
      assert.equal(await summary(), 'Filter viser 2 av 4 ledn. · 2 av 2 punkt · 2 skjult');
      assert.deepEqual((await tabs()).map(([, label,,, icon]) => [label, icon]), [['Ledninger, 2 av 4 vises, filter er aktivt', true], ['Punkter, 2 av 2 vises', false]]);
      await toggle('owner', 't:kommunal'); assert.deepEqual(await shown(), ['ov', 'vl']);
      await tab('lines'); await toggle('status', 't:nedlagt'); assert.deepEqual(await shown(), ['old', 'ov', 'vl']);
      await open('owner'); assert.equal(await run(`${box('owner', 't:kommunal')}.checked`), true);
      await button('Skjul alle: Eierskap'); assert.deepEqual(await shown(), []);
      await button('Vis alle: Eierskap'); await tab('points'); await button('Vis alle: Eierskap');
      assert.deepEqual(await shown(), ['gone', 'kum', 'old', 'ov', 'vl']);
      // Hiding a side never changes its filter or its totals.
      await button('Vis punkter fra Gemini WFS'); assert.deepEqual(await shown(), ['old', 'ov', 'vl']);
      assert.equal((await tabs())[1][0], 'Punkter2/2');
      await button('Vis punkter fra Gemini WFS');
      await button('Nullstill filtre'); assert.deepEqual(await shown(), ['kum', 'ov', 'vl']);
      assert.deepEqual((await tabs()).map(([text,, selected]) => [text, selected]), [['Ledninger2/4', 'false'], ['Punkter1/2', 'true']]);
      await tab('lines');
    });
    await t.test('combined filters, line-only isolation, show/hide all and reset send no requests and keep layer objects', async () => {
      const before = await requests();
      await run(`(() => { const all = []; geminiFilter.audit.map.eachLayer(l => { if (l.feature?.properties?.kind === 'gemini-reference') all.push(l); }); geminiFilter.layers = all;
        geminiFilter.result = geminiFilter.geminiSession.getSnapshot().result; geminiFilter.json = JSON.stringify(geminiFilter.result); geminiFilter.survey = geminiFilter.useStore.getState().layers; })()`);
      await toggle('material', 't:pvc'); assert.deepEqual(await shown(), ['kum', 'vl']);
      await button('Skjul alle: Materiale'); assert.deepEqual(await shown(), ['kum']);
      await open('dimension'); await button('Skjul alle: Dimensjon'); await open('type'); await button('Skjul alle: Anleggstype');
      assert.deepEqual(await shown(), ['kum']);
      await button('Nullstill filtre'); assert.deepEqual(await shown(), ['kum', 'ov', 'vl']);
      await button('Vis alle: Status'); assert.equal((await shown()).length, 5); assert.equal(await summary(), 'Filter viser 4 av 4 ledn. · 1 av 2 punkt · 1 skjult');
      await tab('points'); await button('Vis alle: Status'); assert.equal((await shown()).length, 6); assert.equal(await summary(), null);
      await tab('lines'); await toggle('owner', 't:kommunal'); assert.deepEqual(await shown(), ['gone', 'kum', 'none']);
      await tab('points'); await toggle('owner', 't:kommunal'); assert.deepEqual(await shown(), ['none']);
      await tab('lines');
      await button('Nullstill filtre');
      assert.equal(await requests(), before);
      assert.equal(await run(`geminiFilter.layers.every(l => geminiFilter.audit.map.hasLayer(l)) && geminiFilter.result === geminiFilter.geminiSession.getSnapshot().result
        && geminiFilter.json === JSON.stringify(geminiFilter.result) && geminiFilter.survey === geminiFilter.useStore.getState().layers`), true);
    });
    await t.test('hidden objects cannot be clicked, hovered or focused', async () => {
      await click(await pixel('old')); assert.equal(await popup(), false);
      await click(await pixel('gone')); assert.equal(await popup(), false);
      await new Promise((resolve) => setTimeout(resolve, 700));
      assert.equal(await run(`!!document.querySelector('.gmi-compact-hover-tooltip, [class*=gmi-compact-hover]:not(:empty)')`), false);
      assert.equal(await run(`(() => { let el; geminiFilter.audit.map.eachLayer(l => { if (l.feature?.id?.includes('.gone"')) el = l.getElement(); }); el.focus(); return document.activeElement === el; })()`), false);
    });
    await t.test('an open hover label closes when its object is filtered away', async () => {
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...(await pixel('vl')), button: 'none', buttons: 0 });
      await browser.waitFor(`document.querySelector('.gmi-compact-hover-label')`);
      await run(`geminiFilter.geminiPresentation.setFilterValue('lines', 'status', 't:drift', false)`);
      await browser.waitFor(`!document.querySelector('.gmi-compact-hover-label')`);
      await button('Nullstill filtre');
    });
    await t.test('popups survive unrelated filters and close when their line or point becomes hidden', async () => {
      for (const id of ['vl', 'kum']) {
        await click(await pixel(id)); await browser.waitFor(`document.querySelector('.gmi-gemini-popup')`);
        await run(`geminiFilter.popupNode = document.querySelector('.gmi-gemini-popup')`);
        await toggle('material', 't:pvc');
        assert.equal(await run(`geminiFilter.popupNode.isConnected && document.querySelectorAll('.gmi-gemini-selected').length === 1`), true);
        await toggle('material', 't:pvc');
        // The same value on the other tab leaves the popup open; on its own tab it closes it.
        const [own, other] = id === 'kum' ? ['points', 'lines'] : ['lines', 'points'];
        await tab(other); await toggle('status', 't:drift');
        assert.equal(await run('geminiFilter.popupNode.isConnected'), true);
        await tab(own); await toggle('status', 't:drift');
        await browser.waitFor(`!document.querySelector('.gmi-gemini-popup')`);
        await tab('lines');
        assert.equal(await run(`document.querySelectorAll('.gmi-gemini-selected').length`), 0);
        await button('Nullstill filtre'); await fit();
      }
    });
    await t.test('marking, side and master visibility combine without revealing filtered objects', async () => {
      await run('geminiFilter.geminiPresentation.setMarking({ highlightAll: true })'); await frames();
      assert.deepEqual((await state()).old, [false, false]);
      await button('Vis ledninger fra Gemini WFS'); assert.deepEqual(await shown(), ['kum']);
      await toggle('status', 't:nedlagt');
      await button('Vis ledninger fra Gemini WFS'); assert.deepEqual(await shown(), ['kum', 'old', 'ov', 'vl']);
      await button('Nullstill filtre');
      await run(`document.querySelector('${card} input[aria-label="Vis Gemini WFS-kilden"]').click()`); await frames(); assert.deepEqual(await shown(), []);
      await run(`document.querySelector('${card} input[aria-label="Vis Gemini WFS-kilden"]').click()`); await frames(); assert.deepEqual(await shown(), ['kum', 'ov', 'vl']);
      await run('geminiFilter.geminiPresentation.setMarking({ highlightAll: false })'); await frames();
    });
    await t.test('new areas, refresh, failed refresh and area removal keep filters', async () => {
      await toggle('material', 't:pvc'); await tab('points'); await toggle('status', 't:fjernet'); await tab('lines');
      assert.equal(await run('geminiFilter.area()'), true); await frames();
      assert.deepEqual(await shown(), ['gone', 'kum', 'new', 'vl'], 'New values follow the group rule');
      await run('geminiFilter.audit.mode = "mixed"; geminiFilter.geminiSession.refresh().then(() => {})');
      await browser.waitFor(`geminiFilter.geminiSession.getSnapshot().status === 'ready'`); await frames();
      assert.deepEqual(await shown(), ['gone', 'kum', 'vl']);
      await run('geminiFilter.audit.mode = "error"; geminiFilter.geminiSession.refresh().then(() => {})');
      await browser.waitFor(`geminiFilter.geminiSession.getSnapshot().status === 'error'`); await frames();
      assert.deepEqual(await shown(), ['gone', 'kum', 'vl']);
      await run('geminiFilter.useStore.setState({ layers: {}, layerOrder: [] })'); await frames();
      assert.equal(await run('geminiFilter.geminiSession.getSnapshot().coverages.length'), 1);
      assert.deepEqual(await shown(), ['gone', 'kum', 'vl']);
      await run('geminiFilter.useStore.getState().resetAll(); void 0'); await frames();
      assert.equal(await run(`geminiFilter.geminiPresentation.getSnapshot().filters.groups.lines.material.overrides['t:pvc']`), false);
    });
    await t.test('reload, reconnect and service switching restore only that service; nothing private is stored', async () => {
      await load(); await connect(); await expand();
      assert.deepEqual(await shown(), ['gone', 'kum', 'vl']);
      assert.equal((await tabs())[0][2], 'true');
      assert.equal(await run(`document.querySelectorAll('[data-gemini-filter] > button[aria-expanded=true]').length`), 0, 'Disclosure is not persisted');
      await run('geminiFilter.geminiSession.disconnect()'); await frames(); await connect(); assert.deepEqual(await shown(), ['gone', 'kum', 'vl']);
      await connect('mixed', 'second'); assert.deepEqual(await shown(), ['kum', 'ov', 'vl']);
      await connect('mixed', 'va-basis'); assert.deepEqual(await shown(), ['gone', 'kum', 'vl']);
      const stored = await run(`localStorage.getItem('gmi-gemini-wfs-filters-v1')`);
      assert.doesNotMatch(stored, /username|password|coordinates|581|lines\.|points\./);
      await expand(); await button('Nullstill filtre');
      await load(); await connect(); assert.deepEqual(await shown(), ['kum', 'ov', 'vl']);
    });
    await t.test('schema 1 choices apply to both tabs after reload and are then independent', async () => {
      const url = JSON.parse(await run(`localStorage.getItem('gmi-gemini-wfs-filters-v1')`)).feeds.find((feed) => feed.url.includes('va-basis')).url;
      const none = { base: 'default', overrides: {} };
      const old = { schema: 1, feeds: [{ url, statusRecognised: true, groups: { status: { base: 'all', overrides: { 't:drift': false } },
        type: none, owner: { base: 'default', overrides: { m: false } }, material: none, dimension: none } }] };
      await run(`localStorage.setItem('gmi-gemini-wfs-filters-v1', ${JSON.stringify(JSON.stringify(old))})`);
      await load(); await connect(); await expand();
      assert.deepEqual(await shown(), ['gone', 'none', 'old']);
      await tab('points'); await toggle('status', 't:drift'); assert.deepEqual(await shown(), ['gone', 'kum', 'none', 'old']);
      await load(); await connect(); await expand(); assert.deepEqual(await shown(), ['gone', 'kum', 'none', 'old']);
      await button('Nullstill filtre'); await load(); await connect(); assert.deepEqual(await shown(), ['kum', 'ov', 'vl']);
    });
    await t.test('removed-only extent keeps the default; an unrecognised feed shows all with a message', async () => {
      await connect('removed'); assert.deepEqual(await shown(), []);
      assert.equal(await notice(), 'Ingen innlastede objekter har status Drift.');
      await connect('unknown', 'odd-feed'); assert.deepEqual(await shown(), ['odd']);
      assert.match(await notice(), /ikke gjenkjent/);
    });
    await t.test('storage failure is stated and filtering continues', async () => {
      await connect();
      await run(`globalThis.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }`);
      await expand(); await toggle('status', 't:drift');
      assert.deepEqual(await shown(), ['kum']);
      assert.equal(await run(`!!document.querySelector('[data-gemini-filter-storage]')`), true);
      await run('Storage.prototype.setItem = globalThis.originalSetItem'); await button('Nullstill filtre');
      assert.equal(await run(`!!document.querySelector('[data-gemini-filter-storage]')`), false);
    });
    await t.test('expanded card at laptop sizes', async () => {
      for (const side of ['points', 'lines']) {
        await tab(side);
        for (const id of side === 'lines' ? ['status', 'type', 'owner', 'material', 'dimension'] : ['status', 'owner']) await open(id);
      }
      for (const [side, width, height] of [['lines', 1280, 720], ['points', 1280, 720], ['lines', 1366, 768], ['points', 1366, 768]]) {
        await tab(side); await size(width, height); await frames();
        await run(`document.querySelector('${card}').scrollIntoView({ block: 'start' })`); await frames();
        assert.equal(await run(`document.querySelector('${card}').scrollWidth <= document.querySelector('${card}').clientWidth`), true);
        if (process.env.GEMINI_FILTER_SCREENSHOT_DIR) {
          const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(path.join(process.env.GEMINI_FILTER_SCREENSHOT_DIR, `gemini-filter-${side}-${width}x${height}.png`), Buffer.from(data, 'base64'));
        }
      }
    });
    await t.test('2000 lines and 2000 points toggle without rebuilding', async () => {
      await connect('large'); await fit();
      assert.equal(await summary(), 'Filter viser 1000 av 2000 ledn. · 1000 av 2000 punkt · 2000 skjult');
      const times = [];
      for (const checked of [true, false]) times.push(await run(`new Promise(resolve => { const start = performance.now();
        for (const side of ['lines', 'points']) geminiFilter.geminiPresentation.setFilterValue(side, 'status', 't:nedlagt', ${checked});
        requestAnimationFrame(() => setTimeout(() => resolve(Math.round(performance.now() - start)))); })`));
      t.diagnostic(`4000 objects, 2000 changed: show ${times[0]} ms, hide ${times[1]} ms`);
      assert(times.every((time) => time < 3000), `Toggle times ${times}`);
      assert.equal(await summary(), 'Filter viser 1000 av 2000 ledn. · 1000 av 2000 punkt · 2000 skjult');
    });
    assert.deepEqual(await run('geminiFilter.audit.errors'), []);
  } finally { await browser?.close(); await app.close(); }
});
