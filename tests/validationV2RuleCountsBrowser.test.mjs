import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));

test('real rule card: compact colours, accessible counts, expand/Vis and result updates at laptop widths', {
  skip: !chromePath, timeout: 180000,
}, async () => {
  const temporaryRoot = path.resolve(tmpdir());
  const output = await mkdtemp(path.join(temporaryRoot, 'gmi-rule-counts-'));
  let server, browser;
  try {
    const { webpack } = require('next/dist/compiled/webpack/webpack');
    await require('next/dist/build/swc').loadBindings();
    const compiler = webpack({ mode: 'development', devtool: false, target: 'web', context: root,
      entry: './tests/browser/validationRuleCountsApp.js', output: { path: output, filename: 'app.js' },
      resolve: { extensions: ['.js', '.mjs', '.json'] },
      module: { rules: [{ test: /\.js$/, exclude: /node_modules/,
        use: path.join(root, 'tests/helpers/geminiPresentationLoader.cjs') }] },
      plugins: [new webpack.DefinePlugin({ 'process.env.NODE_ENV': JSON.stringify('development') })],
      performance: { hints: false },
    });
    await new Promise((resolve, reject) => compiler.run((error, stats) => {
      compiler.close(() => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve());
    }));
    const cssFile = path.join(root, 'src/app/globals.css');
    const styles = await require('postcss')([require('@tailwindcss/postcss')()]).process(await readFile(cssFile, 'utf8'), { from: cssFile });
    server = createServer(async (request, response) => {
      if (request.url === '/app.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(await readFile(path.join(output, 'app.js'))); }
      else if (request.url === '/app.css') { response.setHeader('Content-Type', 'text/css'); response.end(styles.css); }
      else { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end('<!doctype html><html lang="nb"><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>'); }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    browser = await openTestChrome();
    await browser.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
    await browser.waitFor('document.querySelector("button[aria-expanded]")');
    for (const [width, height] of [[1366, 768], [1280, 720]]) {
      await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      for (const scheme of ['light', 'dark']) {
        await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
        const actual = await browser.evaluate(`(() => {
          const header = document.querySelector('button[aria-expanded]'), summary = header.querySelector('[title][aria-hidden]');
          const spans = Array.from(summary.querySelectorAll('[data-validation-tone]'));
          const bounds = summary.getBoundingClientRect(), chevron = header.lastElementChild.getBoundingClientRect();
          const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'); canvas.width = canvas.height = 1;
          const lum = (color) => { ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); const c = Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return c[0] * .2126 + c[1] * .7152 + c[2] * .0722; };
          const bg = lum(getComputedStyle(header).backgroundColor);
          const softBg = lum(getComputedStyle(document.documentElement).getPropertyValue('--gmi-surface-soft'));
          return { label: header.getAttribute('aria-label'), title: summary.title, text: summary.textContent,
            values: spans.map(s => s.textContent), tones: spans.map(s => s.dataset.validationTone),
            colors: spans.map(s => getComputedStyle(s).color),
            contrasts: spans.map(s => { const fg = lum(getComputedStyle(s).color); return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05); }),
            softContrasts: spans.map(s => { const fg = lum(getComputedStyle(s).color); return (Math.max(fg, softBg) + .05) / (Math.min(fg, softBg) + .05); }),
            totalColor: getComputedStyle(summary).color, whiteSpace: getComputedStyle(summary).whiteSpace,
            numeric: getComputedStyle(summary).fontVariantNumeric, height: bounds.height,
            gap: chevron.left - bounds.right, fits: header.scrollWidth <= header.clientWidth,
            iconWeight: header.lastElementChild.querySelector('svg').getAttribute('data-weight') };
        })()`);
        assert.match(actual.label, /73 objekter i kontrollgrunnlaget: 5 FEIL, 1 SJEKK, 67 OK/);
        assert.equal(actual.title, '73 objekter i kontrollgrunnlaget: 5 FEIL, 1 SJEKK, 67 OK.');
        assert.equal(actual.text, '5 · 1 · 67');
        assert.deepEqual(actual.values, ['5', '1', '67']);
        assert.deepEqual(actual.tones, ['error', 'warning', 'success']);
        assert.equal(new Set(actual.colors).size, 3);
        assert(actual.colors.every((color) => color !== actual.totalColor));
        assert(actual.contrasts.every((contrast) => contrast >= 4.5), `${scheme}: ${actual.contrasts}`);
        assert(actual.softContrasts.every((contrast) => contrast >= 4.5), `expanded/hover ${scheme}: ${actual.softContrasts}`);
        assert.equal(actual.whiteSpace, 'nowrap'); assert.match(actual.numeric, /tabular-nums/);
        assert(actual.height < 20); assert(actual.gap >= 8); assert(actual.fits);
        const examples = await browser.evaluate(`Array.from(document.querySelectorAll('button[aria-expanded]')).slice(1).map(header => {
          const summary = header.querySelector('.gmi-validation-rule-counts'), name = header.children[1];
          return { text: summary.textContent, title: summary.title, label: header.getAttribute('aria-label'),
            values: Array.from(summary.querySelectorAll('[data-validation-tone]')).map(s => [s.dataset.validationTone, s.textContent]),
            fits: header.scrollWidth <= header.clientWidth, height: summary.getBoundingClientRect().height,
            truncated: name.scrollWidth > name.clientWidth, overflow: getComputedStyle(name).textOverflow };
        })`);
        const cases = [
          [['error', '24'], ['success', '145']], [['error', '1'], ['warning', '1'], ['success', '167']],
          [['success', '169']], [['error', '7']], [['error', '19'], ['warning', '16'], ['success', '134']],
          [['warning', '24'], ['success', '145']], [], [['error', '1'], ['success', '2']],
        ];
        examples.forEach((example, index) => {
          assert.deepEqual(example.values, cases[index]);
          assert.equal(example.text, cases[index].length ? cases[index].map(([, value]) => value).join(' · ') : 'Ingen resultater');
          assert(!/[()]/.test(example.text)); assert(example.fits); assert(example.height < 20);
        });
        assert.match(examples[2].title, /169 objekter.*0 FEIL, 0 SJEKK, 169 OK/);
        assert.match(examples[6].label, /0 objekter.*0 FEIL, 0 SJEKK, 0 OK.*Ingen tellbare resultater/);
        assert.match(examples[7].title, /10 objekter.*1 FEIL, 0 SJEKK, 2 OK.*Ikke evaluert: 7/);
        assert(examples[4].truncated); assert.equal(examples[4].overflow, 'ellipsis');
        const palette = await browser.evaluate(`(() => {
          const probe = document.createElement('span'); document.body.append(probe);
          const colors = Object.fromEntries(['yellow-700', 'orange-700', 'red-700', 'green-700'].map(name => {
            probe.style.color = 'var(--color-' + name + ')'; return [name, getComputedStyle(probe).color];
          })); probe.remove(); return colors;
        })()`);
        assert.equal(actual.colors[0], palette['red-700']);
        assert.equal(actual.colors[1], palette['yellow-700']);
        assert.equal(actual.colors[2], palette['green-700']);
        // Tailwind OKLCH hue: golden yellow (~66°) is farther from red (~28°)
        // than the previous orange (~38°), while contrast is checked above.
        const hue = (color) => Number(color.match(/oklch\([\d.]+ [\d.]+ ([\d.]+)/)?.[1]);
        assert(hue(actual.colors[1]) - hue(actual.colors[0]) > 30);
        console.log(`${width} ${scheme}: header colours ${actual.colors.join(', ')}; contrast ${actual.contrasts.map(v => v.toFixed(2)).join(', ')}; soft ${actual.softContrasts.map(v => v.toFixed(2)).join(', ')}`);
        if (process.env.GMI_COUNTS_SCREENSHOT_DIR) {
          await mkdir(process.env.GMI_COUNTS_SCREENSHOT_DIR, { recursive: true });
          const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(path.join(process.env.GMI_COUNTS_SCREENSHOT_DIR, `counts-${width}-${scheme}.png`), Buffer.from(data, 'base64'));
        }
      }
    }
    await browser.evaluate('document.querySelector("button[aria-expanded]").click()');
    await browser.waitFor('document.querySelector("[role=region]")');
    assert.match(await browser.evaluate('document.querySelector("[role=region]").textContent'), /Objekter73Feil5Sjekk1Pass67Vis/);
    assert.equal(await browser.evaluate(`(() => {
      const count = document.querySelector('[role=region] [data-validation-tone="warning"]');
      const probe = document.createElement('span'); probe.style.color = 'var(--color-orange-700)'; document.body.append(probe);
      const unchanged = getComputedStyle(count).color === getComputedStyle(probe).color; probe.remove(); return unchanged;
    })()`), true, 'expanded warning details retain the shared orange palette');
    assert.match(await browser.evaluate('document.querySelector("button[aria-expanded]").textContent'), /5 · 1 · 67/);
    await browser.evaluate('document.querySelector("button[title=Vis]").click()');
    await browser.waitFor('document.querySelector("output").textContent');
    assert.match(await browser.evaluate('document.querySelector("output").textContent'), /Innvendig/);
    await browser.evaluate('document.querySelector("main > button").click()');
    await browser.waitFor('document.querySelector("button[aria-expanded] .gmi-validation-rule-counts").textContent === "73"');
    assert.equal(await browser.evaluate('document.querySelector("button[aria-expanded] .gmi-validation-rule-counts [data-validation-tone]").dataset.validationTone'), 'success');
    assert.match(await browser.evaluate('document.querySelector("button[aria-expanded]").getAttribute("aria-label")'), /73 objekter.*0 FEIL, 0 SJEKK, 73 OK/);
    assert.match(await browser.evaluate('document.querySelector("[role=region]").textContent'), /Objekter73Pass73Vis/);
    await browser.evaluate('document.querySelector("button[aria-expanded]").click()');
    await browser.waitFor('!document.querySelector("[role=region]")');
    await browser.evaluate('document.querySelector("main > button").click()');
    await browser.waitFor('document.querySelector("button[aria-expanded] .gmi-validation-rule-counts").textContent === "5 · 1 · 67"');
  } finally {
    await browser?.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    if (path.dirname(path.resolve(output)) !== temporaryRoot || !path.basename(output).startsWith('gmi-rule-counts-')) throw new Error('Unsafe test bundle path');
    await rm(output, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
