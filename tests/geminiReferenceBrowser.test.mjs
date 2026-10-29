import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));

test('M4 actual React/Leaflet sidebar and map acceptance, synthetic session only', {
  skip: !chromePath, timeout: 180000,
}, async (t) => {
  const temporaryRoot = path.resolve(tmpdir());
  const output = await mkdtemp(path.join(temporaryRoot, 'gmi-gemini-reference-'));
  let browser, server;
  try {
    // Bundle the real MapInner/LayerManager and their new children with the
    // already-installed Next webpack/SWC; no production route or test seam.
    const { webpack } = require('next/dist/compiled/webpack/webpack');
    await require('next/dist/build/swc').loadBindings();
    const compiler = webpack({ mode: 'development', devtool: false, target: 'web', context: root,
      entry: './tests/browser/geminiReferenceApp.js', output: { path: output, filename: 'app.js', publicPath: '/' },
      resolve: { alias: { '@': path.join(root, 'src') }, extensions: ['.js', '.mjs', '.json'] },
      module: { rules: [{ test: /\.css$|\.js$/, exclude: /node_modules/,
        use: path.join(root, 'tests/helpers/geminiPresentationLoader.cjs') },
      { test: /\.css$/, include: /node_modules/, use: path.join(root, 'tests/helpers/geminiPresentationLoader.cjs') }] },
      plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'development' }) })],
      performance: { hints: false },
    });
    await new Promise((resolve, reject) => compiler.run((error, stats) => {
      compiler.close(() => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve());
    }));
    const cssFile = path.join(root, 'src/app/globals.css');
    const styles = await require('postcss')([require('@tailwindcss/postcss')()]).process(await readFile(cssFile, 'utf8'), { from: cssFile });
    const leafletCss = await readFile(path.join(root, 'node_modules/leaflet/dist/leaflet.css'), 'utf8');
    server = createServer(async (request, response) => {
      try {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'");
        if (pathname === '/') {
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.end('<!doctype html><html lang="nb"><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script defer src="/app.js"></script></body></html>');
        } else if (pathname === '/app.css') {
          response.setHeader('Content-Type', 'text/css; charset=utf-8'); response.end(leafletCss + '\n' + styles.css);
        } else if (/^\/[a-z0-9_.-]+\.js$/i.test(pathname)) {
          response.setHeader('Content-Type', 'text/javascript; charset=utf-8'); response.end(await readFile(path.join(output, pathname.slice(1))));
        } else { response.statusCode = 404; response.end(); }
      } catch { response.statusCode = 404; response.end(); }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    browser = await openTestChrome();
    await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: "globalThis.__geminiBootstrapErrors = []; addEventListener('error', event => __geminiBootstrapErrors.push(event.message));" });
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await browser.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
    await browser.waitFor('globalThis.__geminiBootstrapErrors?.length || (globalThis.geminiAcceptance?.audit.map && document.querySelector(".photo-camera-marker"))');
    assert.deepEqual(await browser.evaluate('__geminiBootstrapErrors'), []);
    const card = 'section[aria-label="Eksisterende anlegg · Gemini VA"]';
    const line = '.gmi-gemini-reference-line', point = '.gmi-gemini-reference-point';
    const count = (selector) => browser.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
    const settleMap = async () => {
      await browser.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      await browser.waitFor('!geminiAcceptance.audit.map._animatingZoom && !geminiAcceptance.audit.map._panAnim?._inProgress');
    };
    const click = async (label) => {
      if (label === 'Zoom til Gemini-referanse') await settleMap();
      await browser.evaluate(`document.querySelector('button[aria-label=${JSON.stringify(label)}]').click()`);
      if (label === 'Zoom til Gemini-referanse') await settleMap();
    };
    const seeded = async (mode = 'pair') => {
      assert.equal(await browser.evaluate(`geminiAcceptance.seed(${JSON.stringify(mode)}).then(value => value.ok)`), true);
      await browser.waitFor(`document.querySelector(${JSON.stringify(card)})`);
    };
    await t.test('no dormant card; real session result renders title, counts, source and both GeoJSON batches', async () => {
      assert.equal(await count(card), 0); await seeded();
      await browser.waitFor(`document.querySelector(${JSON.stringify(point)})`);
      assert.equal(await count(line), 1); assert.equal(await count(point), 1);
      const text = await browser.evaluate(`document.querySelector(${JSON.stringify(card)}).innerText`);
      assert.match(text, /Eksisterende anlegg · Gemini VA/); assert.match(text, /Synthetic survey.gmi/);
      assert.equal(await count(`${card} [aria-label="Ledninger: 1"]`), 1);
      assert.equal(await count(`${card} [aria-label="Punkter: 1"]`), 1);
      assert.equal(await browser.evaluate('geminiAcceptance.audit.requests'), 2);
    });
    await t.test('pane below survey vectors/casing/markers/photos, CSS tokens and inspection-only paths', async () => {
      const panes = await browser.evaluate(`(() => {
        const map = geminiAcceptance.audit.map;
        return Object.fromEntries(['gemini-reference','layer-highlight-casing','overlayPane','markerPane','photo-markers'].map(name => [name, Number(getComputedStyle(map.getPane(name)).zIndex)]));
      })()`);
      assert.equal(panes['gemini-reference'], 380); assert.equal(panes['layer-highlight-casing'], 390);
      assert.equal(panes.overlayPane, 400); assert.equal(panes.markerPane, 600); assert.equal(panes['photo-markers'], 620);
      assert.equal(await browser.evaluate(`document.querySelector(${JSON.stringify(line)}).closest('.leaflet-pane').style.zIndex`), '380');
      assert.equal(await count(`${line}.leaflet-interactive, ${point}.leaflet-interactive`), 2);
      assert.equal(await browser.evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(line)})).stroke`), 'rgb(98, 116, 142)');
      assert(await browser.evaluate(`Boolean(document.querySelector('.leaflet-overlay-pane path.leaflet-interactive'))`));
      assert(await browser.evaluate(`(() => { let safe = true; geminiAcceptance.audit.map.eachLayer(layer => {
        if (layer.feature?.properties.kind === 'gemini-reference') safe &&= layer.options.interactive && !layer.options.bubblingMouseEvents && !layer.getPopup?.() && !layer.getTooltip?.() && !layer.dragging;
      }); return safe; })()`));
    });
    await t.test('independent accessible visibility controls preserve survey/photo/WMS and never fetch', async () => {
      const before = await browser.evaluate(`(() => { geminiAcceptance.originalResult = geminiAcceptance.geminiSession.getSnapshot().result;
        geminiAcceptance.pointNode = document.querySelector('${point}'); return { photo: document.querySelectorAll('.photo-camera-marker').length, requests: geminiAcceptance.audit.requests }; })()`);
      await click('Vis ledninger fra Gemini VA'); await browser.waitFor(`!document.querySelector('${line}')`);
      assert.equal(await count(point), 1);
      assert(await browser.evaluate(`geminiAcceptance.pointNode === document.querySelector('${point}')`), 'Unchanged point batch is not rebuilt');
      await click('Vis punkter fra Gemini VA'); await browser.waitFor(`!document.querySelector('${point}')`);
      assert.equal(await count(line), 0); assert.equal(await count(point), 0);
      await click('Vis ledninger fra Gemini VA'); await browser.waitFor(`document.querySelector('${line}')`);
      assert.equal(await count(point), 0); await click('Vis punkter fra Gemini VA');
      await browser.waitFor(`document.querySelector('${point}')`);
      assert.equal(await browser.evaluate('geminiAcceptance.audit.requests'), before.requests);
      assert.equal(await count('.photo-camera-marker'), before.photo);
      assert(await browser.evaluate('geminiAcceptance.useStore.getState().layers.survey.visible'));
      assert(await browser.evaluate('geminiAcceptance.useStore.getState().ui.mapOverlayVisibility.geminiWms'));
      assert(await browser.evaluate('geminiAcceptance.originalResult === geminiAcceptance.geminiSession.getSnapshot().result'));
      await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await browser.evaluate(`document.querySelector('button[aria-label="Vis ledninger fra Gemini VA"]').focus()`);
      assert(await browser.evaluate('document.activeElement.matches(":focus-visible")'));
      assert.notEqual(await browser.evaluate('getComputedStyle(document.activeElement).boxShadow'), 'none');
      await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      await browser.waitFor(`!document.querySelector('${line}')`); await click('Vis ledninger fra Gemini VA');
    });
    await t.test('zoom includes all returned vertices, preserves visibility, and viewport changes do not fetch', async () => {
      await click('Vis punkter fra Gemini VA');
      await click('Zoom til Gemini-referanse');
      await browser.waitFor('geminiAcceptance.geminiPresentation.getSnapshot().zoomRequest === null');
      assert(await browser.evaluate(`(() => { const map = geminiAcceptance.audit.map, bounds = map.getBounds();
        return geminiAcceptance.geminiSession.getSnapshot().result.lines.display.features.every(f => f.geometry.coordinates.every(c => bounds.contains([c[1],c[0]]))) &&
          geminiAcceptance.geminiSession.getSnapshot().result.points.display.features.every(f => bounds.contains([f.geometry.coordinates[1],f.geometry.coordinates[0]])); })()`));
      assert.equal(await count(point), 0); await click('Vis punkter fra Gemini VA');
      const requests = await browser.evaluate('geminiAcceptance.audit.requests');
      await browser.evaluate('void geminiAcceptance.audit.map.panBy([15,15], {animate:false})');
      assert.equal(await browser.evaluate('geminiAcceptance.audit.requests'), requests);
    });
    await t.test('photo marker remains clickable above reference, with its normal photo popup', async () => {
      const target = await browser.evaluate(`(() => { const marker=document.querySelector('.photo-camera-marker'), rect=marker.getBoundingClientRect();
        const x=rect.left+rect.width/2, y=rect.top+rect.height/2; return {x,y,reachable:Boolean(document.elementFromPoint(x,y)?.closest('.photo-camera-marker'))}; })()`);
      assert(target.reachable);
      await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: target.x, y: target.y, button: 'left', buttons: 1, clickCount: 1 });
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.x, y: target.y, button: 'left', buttons: 0, clickCount: 1 });
      await browser.waitFor('document.querySelector(".leaflet-popup")');
      assert.match(await browser.evaluate('document.querySelector(".leaflet-popup").innerText'), /Synthetic photo.heic/);
      await browser.evaluate('void geminiAcceptance.audit.map.closePopup()');
      await browser.waitFor('!document.querySelector(".leaflet-popup")');
    });
    await t.test('zoom intent survives an already-running Leaflet zoom animation', async () => {
      await settleMap();
      await browser.evaluate('void geminiAcceptance.audit.map.setZoom(geminiAcceptance.audit.map.getZoom() + 1, {animate:true})');
      await browser.waitFor('geminiAcceptance.audit.map._animatingZoom');
      await browser.evaluate('document.querySelector(\'button[aria-label="Zoom til Gemini-referanse"]\').click()');
      await browser.waitFor('geminiAcceptance.geminiPresentation.getSnapshot().zoomRequest === null');
      await settleMap();
      assert(await browser.evaluate(`(() => { const bounds = geminiAcceptance.audit.map.getBounds(), result = geminiAcceptance.geminiSession.getSnapshot().result;
        return result.lines.display.features.every(f => f.geometry.coordinates.every(c => bounds.contains([c[1],c[0]]))) &&
          result.points.display.features.every(f => bounds.contains([f.geometry.coordinates[1],f.geometry.coordinates[0]])); })()`));
    });
    await t.test('new complete pair replaces both batches with stable feature IDs; same-owner choices survive', async () => {
      await click('Vis ledninger fra Gemini VA');
      await browser.evaluate(`geminiAcceptance.oldPointNode = document.querySelector('${point}')`);
      await seeded('replacement');
      await browser.waitFor(`document.querySelectorAll('${point}').length === 2`);
      assert.equal(await count(line), 0);
      assert.equal(await browser.evaluate(`geminiAcceptance.oldPointNode.isConnected`), false);
      assert.equal(await count(`${card} [aria-label="Punkter: 2"]`), 1);
      assert(await browser.evaluate(`(() => { const ids = geminiAcceptance.geminiSession.getSnapshot().result.points.display.features.map(f => f.id); return new Set(ids).size === 2 && ids.every(id => typeof id === 'string'); })()`));
      await click('Vis ledninger fra Gemini VA');
    });
    await t.test('retained previous-good data stays rendered during loading and after simulated failure/staleness', async () => {
      await browser.evaluate(`(() => { geminiAcceptance.retained = geminiAcceptance.geminiSession.getSnapshot().result; geminiAcceptance.audit.mode='pending'; geminiAcceptance.pending=geminiAcceptance.geminiSession.refresh('survey'); })()`);
      await browser.waitFor(`document.querySelector('${card} [role="status"]').innerText.includes('Oppdaterer')`);
      assert.equal(await count(point), 2); assert.equal(await count(line), 1);
      await browser.evaluate('geminiAcceptance.geminiSession.cancel()');
      assert.equal(await browser.evaluate('geminiAcceptance.seed("error").then(value => value.ok)'), false);
      await browser.waitFor(`document.querySelector('${card} [role="status"]').innerText.includes('mislyktes')`);
      assert.equal(await count(point), 2); assert.equal(await count(line), 1);
      assert(await browser.evaluate('geminiAcceptance.retained === geminiAcceptance.geminiSession.getSnapshot().result'));
      await browser.evaluate(`geminiAcceptance.useStore.setState(state => ({layers:{...state.layers, survey:{...state.layers.survey, data:{...state.layers.survey.data}}}}))`);
      await browser.waitFor(`document.querySelector('${card} [role="status"]').innerText.includes('Utdatert')`);
      assert.equal(await count(point), 2);
    });
    await t.test('lines-only, single-point-only and empty pairs support zoom safely', async () => {
      for (const mode of ['line', 'point', 'empty']) {
        await seeded(mode);
        await browser.waitFor(`document.querySelectorAll('${point}').length === ${mode === 'point' ? 1 : 0} && document.querySelectorAll('${line}').length === ${mode === 'line' ? 1 : 0}`);
        assert.equal(await browser.evaluate('document.querySelector(\'button[aria-label="Zoom til Gemini-referanse"]\').disabled'), mode === 'empty');
        if (mode !== 'empty') {
          await click('Zoom til Gemini-referanse'); await browser.waitFor('geminiAcceptance.geminiPresentation.getSnapshot().zoomRequest === null');
          if (mode === 'point') assert(await browser.evaluate('geminiAcceptance.audit.map.getZoom() <= 20'));
        }
      }
    });
    await t.test('representative 267/162 and parser-cap 2000/2000 synthetic batches render with independent visibility', async () => {
      for (const [mode, lines, points] of [['representative', 267, 162], ['large', 2000, 2000]]) {
        const started = Date.now(); await seeded(mode);
        await browser.waitFor(`document.querySelectorAll('${line}').length === ${lines} && document.querySelectorAll('${point}').length === ${points}`);
        await click('Zoom til Gemini-referanse');
        await browser.waitFor('geminiAcceptance.geminiPresentation.getSnapshot().zoomRequest === null && !geminiAcceptance.audit.map._animatingZoom && !geminiAcceptance.audit.map._panAnim?._inProgress');
        await browser.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
        assert(await browser.evaluate(`(() => { const vector = document.querySelector('${line}').getBoundingClientRect(); const map = document.querySelector('.leaflet-container').getBoundingClientRect();
          return vector.width > 0 && vector.height > 0 && vector.right > map.left && vector.left < map.right && vector.bottom > map.top && vector.top < map.bottom; })()`), 'Reference strokes must actually intersect the visible map');
        t.diagnostic(`${mode}: ${lines} lines + ${points} points parsed and rendered in ${Date.now() - started} ms`);
        if (mode === 'representative' && process.env.GEMINI_SCREENSHOT_PATH) {
          const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(process.env.GEMINI_SCREENSHOT_PATH, Buffer.from(data, 'base64'));
        }
        const requests = await browser.evaluate('geminiAcceptance.audit.requests');
        await click('Vis ledninger fra Gemini VA'); await browser.waitFor(`!document.querySelector('${line}')`);
        assert.equal(await count(point), points);
        assert.equal(await browser.evaluate('geminiAcceptance.audit.requests'), requests);
        await click('Vis ledninger fra Gemini VA');
      }
    });
    await t.test('clear removes vectors/card, next result restores defaults, source removal and full reset clear presentation', async () => {
      await seeded(); await click('Vis ledninger fra Gemini VA');
      await browser.evaluate('geminiAcceptance.clear()'); await browser.waitFor(`!document.querySelector('${card}')`);
      assert.equal(await count(line), 0); assert.equal(await count(point), 0);
      await seeded(); await browser.waitFor(`document.querySelector('${line}')`);
      await browser.evaluate('geminiAcceptance.useStore.getState().removeLayer("survey")');
      await browser.waitFor(`!document.querySelector('${card}')`);
      assert.equal(await count(line), 0); assert.equal(await count(point), 0);
      assert.equal(await count('.photo-camera-marker'), 1);
      await browser.evaluate('geminiAcceptance.reset()');
      await browser.waitFor('!document.querySelector(".photo-camera-marker")');
      assert.equal(await count(line), 0); assert.equal(await count(point), 0);
      assert(await browser.evaluate('geminiAcceptance.geminiPresentation.getSnapshot().linesVisible && geminiAcceptance.geminiPresentation.getSnapshot().pointsVisible'));
    });
    assert.deepEqual(await browser.evaluate('geminiAcceptance.audit.errors'), []);
  } catch (error) {
    if (browser) t.diagnostic(JSON.stringify(await browser.evaluate(`({ errors: globalThis.geminiAcceptance?.audit.errors,
      text: document.body.innerText.slice(0, 500) })`)));
    if (browser) t.diagnostic(JSON.stringify(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown')
      .map((event) => event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text)));
    throw error;
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    if (path.dirname(path.resolve(output)) !== temporaryRoot || !path.basename(output).startsWith('gmi-gemini-reference-')) throw new Error('Unsafe test bundle path');
    await rm(output, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
