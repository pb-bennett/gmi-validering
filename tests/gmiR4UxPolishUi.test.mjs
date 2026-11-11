import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { gmiEditBatchFixture } from './helpers/gmiEditBatchFixture.mjs';

const app = process.env.PHOTO_UI_URL;
const inspector = `document.querySelector('[data-gmi-batch-inspector]')`;
const workspace = `document.querySelector('.gmi-edit-workspace')`;
const grid = `document.querySelector('[role=grid]')`;
const bar = `document.querySelector('[data-gmi-selection-bar]')`;
const risk = `document.querySelector('dialog[open][data-gmi-confirm=batch-risk]')`;
const box = (index) => `${grid}.querySelector('[data-table-row="${index}"] input[type=checkbox]')`;
const row = (index) => `${grid}.querySelector('[data-table-row="${index}"]')`;
const ID_OFFSET = 101; // :L numbers deliberately differ from file positions.

// S3: per severity element, its symbol and the WCAG contrast of its text and icon against the nearest opaque
// background, including any inherited opacity (the hypothetical case). Tokens are normalised through canvas.
const severityAppearance = (browser, selector) => browser.evaluate(`(() => {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1; const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const pixel = (layers) => { ctx.clearRect(0, 0, 1, 1); for (const [colour, alpha] of layers) { ctx.globalAlpha = alpha; ctx.fillStyle = colour; ctx.fillRect(0, 0, 1, 1); } ctx.globalAlpha = 1; return Array.from(ctx.getImageData(0, 0, 1, 1).data); };
  const lum = (rgba) => rgba.slice(0, 3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  const background = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (pixel([[c, 1]])[3] === 255) return c; } return '#fff'; };
  const opacity = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  const ratio = (fg, bg, alpha) => { const a = lum(pixel([[bg, 1], [fg, alpha]])), b = lum(pixel([[bg, 1]])); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
  const token = (name) => pixel([[getComputedStyle(document.documentElement).getPropertyValue(name).trim(), 1]]).join(',');
  return { yellow: token('--gmi-validation-compact-warning-text'), orangeText: token('--gmi-validation-warning-text'), orangeIcon: token('--gmi-validation-warning-icon'),
    items: Array.from(document.querySelectorAll(${JSON.stringify(selector)})).map(el => {
      const icon = el.querySelector('svg[data-severity-icon]'), bg = background(el), alpha = opacity(el);
      return { tone: el.dataset.validationTone || null, icon: icon?.dataset.severityIcon || null,
        text: ratio(getComputedStyle(el).color, bg, alpha), glyph: icon ? ratio(getComputedStyle(icon).color, bg, alpha) : null,
        color: pixel([[getComputedStyle(el).color, 1]]).join(','), iconColor: icon ? pixel([[getComputedStyle(icon).color, 1]]).join(',') : null,
        hypothetical: el.classList.contains('gmi-review-hypothetical') };
    }) };
})()`);
const assertSeverityContrast = (label, { items }) => {
  assert(items.length > 0, `${label}: no severity elements`);
  for (const item of items) {
    assert(item.text >= 4.5, `${label} ${item.tone} text contrast ${item.text.toFixed(2)}`);
    if (item.glyph !== null) assert(item.glyph >= 4.5, `${label} ${item.tone} icon contrast ${item.glyph.toFixed(2)}`);
  }
  return items.map((item) => `${item.tone}${item.hypothetical ? '(hyp)' : ''} ${item.text.toFixed(2)}/${item.glyph?.toFixed(2)}`).join(', ');
};

test('R4 UX polish production: accurate review, object numbers, focus, severity, staging feedback and layouts',
  { skip: !app || !chromePath, timeout: 300000 }, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gmi-r4-ux-'));
    const file = path.join(directory, 'Synthetic R4 UX.gmi');
    const rows = Array.from({ length: 48 }, (_, i) => i === 0 ? ['SP', 'PVC', '', '', 'SN8'] : i === 1 ? ['VL', 'PE', '11.0', '', ''] : ['VL', 'PE', '', '', '']);
    const source = Buffer.from(gmiEditBatchFixture({ rows })).toString('latin1')
      .replace(/^:L (\d+)$/gm, (_, n) => `:L ${Number(n) - 1 + ID_OFFSET}`)
      .replace('[+L_]', '[P_]\r\n_FIELDNAMES Tema;Type;\r\n[+L_]')
      .replace('[END]', '[+P_]\r\n:P 1\r\n_FIELDVALUES KUM;KBRE;\r\n/XYZ\r\n581940 6566000 101\r\n:P 2\r\n_FIELDVALUES KUM;KBRE;\r\n/XYZ\r\n581941 6566000 101\r\n[END]');
    await writeFile(file, Buffer.from(source, 'latin1'));
    const browser = await openTestChrome();
    const click = (label, root = 'document') => browser.evaluate(`(() => { const b = Array.from((${root}).querySelectorAll('button')).find(e => e.innerText.trim() === ${JSON.stringify(label)} || e.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!b || b.disabled) throw new Error('Unavailable: ' + ${JSON.stringify(label)}); b.click(); })()`);
    const input = (element, value) => browser.evaluate(`(() => { const i = ${element}; Object.getOwnPropertyDescriptor(i.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event(i.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`);
    const search = (value) => input(`document.querySelector('[aria-label="Søk i data"]')`, value);
    const text = (expression) => browser.evaluate(`${expression}.innerText`);
    const stageDisabled = () => browser.evaluate(`Array.from(${inspector}.querySelectorAll('button')).find(e => e.innerText === 'Legg til masseendring').disabled`);
    const headers = () => browser.evaluate(`Array.from(${grid}.querySelectorAll('[role=columnheader]')).map(e => e.innerText.trim())`);
    const shot = async (name) => { const { data } = await browser.send('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(tmpdir(), `gmi-r4-ux-${name}.png`), Buffer.from(data, 'base64')); };
    // Every rendered object number must equal the source :L number of that row's source index.
    const numbersMatchSource = () => browser.evaluate(`Array.from(${grid}.querySelectorAll('[data-table-row]')).every(r => r.querySelector('.gmi-object-number')?.innerText.trim() === String(Number(r.dataset.tableRow) + ${ID_OFFSET}))`);
    const preview = async () => {
      const label = await browser.evaluate(`(() => { const b = Array.from(${inspector}.querySelectorAll('button')); return b.some(e => e.innerText === 'Oppdater forhåndsvisning') ? 'Oppdater forhåndsvisning' : 'Forhåndsvis endringer'; })()`);
      await click(label, inspector);
      await browser.waitFor(`${inspector}.querySelector('[data-gmi-batch-counts][data-state=valid]') && ${inspector}.getAttribute('aria-busy') === 'false'`);
    };
    try {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm = () => true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk');
      await setPhotoFiles(browser, 'input[type=file]', [file]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate(`document.querySelector('[title="Synthetic R4 UX.gmi"]').click()`);
      await click('Åpne datatabell'); await click('Ledninger', `document.querySelector('[data-table-geometry]')`);
      await browser.waitFor(`${grid}?.getAttribute('aria-rowcount') === '49'`);
      assert(!(await headers()).includes('Nr.'), 'the ordinary application table is unchanged');
      assert.equal(await browser.evaluate(`Boolean(document.querySelector('[data-gmi-table-size]'))`), false);
      await browser.evaluate(`document.querySelector('[data-gmi-edit-action]').click()`);
      await browser.waitFor(box(0));

      await t.test('object numbers come from source identity through sorting, search and virtualization', async () => {
        assert.deepEqual((await headers()).slice(0, 3), ['', '', 'Nr.']);
        assert.equal(await numbersMatchSource(), true);
        // Numeric columns may start descending; click until the highest number leads.
        for (let i = 0; i < 3 && await browser.evaluate(`${grid}.querySelector('[data-table-row]').dataset.tableRow !== '47'`); i++) await click('Sorter etter objektnummer');
        await browser.waitFor(`${grid}.querySelector('[data-table-row]').dataset.tableRow === '47'`);
        assert.equal(await numbersMatchSource(), true);
        await browser.evaluate(`${grid}.scrollTop = ${grid}.scrollHeight`);
        await browser.waitFor(`${grid}.querySelector('[data-table-row="0"]')`);
        assert.equal(await numbersMatchSource(), true, 'virtualized rows after scrolling');
        await click('Sorter etter Tema'); assert.equal(await numbersMatchSource(), true);
        await click('Sorter etter Tema'); await click('Sorter etter Tema');
        await search('l138'); await browser.waitFor(`${grid}.getAttribute('aria-rowcount') === '2'`);
        assert.equal(await browser.evaluate(`${row(37)}.querySelector('.gmi-object-number mark')?.innerText`), '138');
        assert.equal(await browser.evaluate(`${box(37)}.getAttribute('aria-label')`), 'Velg ledning 138');
        await search('VL'); await browser.waitFor(`${grid}.getAttribute('aria-rowcount') === '48'`, 10000);
        await search('');
      });

      await t.test('selection toolbar: counts separate from actions; real buttons; teal primary entry', async () => {
        await search('l138'); await browser.waitFor(box(37)); await browser.evaluate(`${box(37)}.click()`);
        await search('143'); await browser.waitFor(box(42)); await browser.evaluate(`${box(42)}.click()`);
        await search(''); await browser.waitFor(box(0));
        await browser.evaluate(`${box(0)}.click(); ${box(1)}.click()`);
        await browser.waitFor(`${bar}?.innerText.includes('4 valgt')`);
        const style = await browser.evaluate(`(() => {
          const buttons = Array.from(${bar}.querySelectorAll('button'));
          const entry = buttons.find(e => e.innerText.trim() === 'Rediger valgte (4)');
          const secondary = buttons.find(e => e.innerText.trim() === 'Fjern utvalg');
          const pressed = buttons.find(e => e.getAttribute('aria-pressed') === 'true');
          const s = (e) => getComputedStyle(e);
          return { entryBg: s(entry).backgroundColor, entryHeight: entry.getBoundingClientRect().height, entryWeight: s(entry).fontWeight,
            secondaryBorder: s(secondary).borderTopWidth, secondaryRadius: s(secondary).borderTopLeftRadius, pressed: pressed.innerText.trim(), pressedBg: s(pressed).backgroundColor,
            accent: getComputedStyle(${box(0)}).accentColor, barHeight: ${bar}.getBoundingClientRect().height };
        })()`);
        assert.equal(style.entryBg, 'rgb(0, 117, 149)'); assert(style.entryHeight >= 26 && style.entryHeight <= 32, JSON.stringify(style));
        assert.equal(style.secondaryBorder, '1px'); assert.notEqual(style.secondaryRadius, '0px');
        assert.equal(style.pressed, 'Filtrert visning'); assert.equal(style.pressedBg, 'rgb(0, 117, 149)');
        assert.equal(style.accent, 'rgb(0, 117, 149)'); assert(style.barHeight <= 40, `compact bar ${style.barHeight}`);
        await shot('selection-bar');
      });

      await t.test('review: excluded objects show no change, unrelated rows stay neutral, re-adding invalidates', async () => {
        await click('Rediger valgte (4)', bar); await browser.waitFor(inspector);
        assert.match(await text(bar), /Masseendring pågår/, 'entry action becomes a mode indicator');
        await browser.evaluate(`(() => { const s=${inspector}.querySelector('select'); s.value='SDR'; s.dispatchEvent(new Event('change', {bubbles:true})); })()`);
        await input(`${inspector}.querySelector('[aria-label="Ny verdi"]')`, '11.0');
        await preview();
        const summary = await text(`${inspector}.querySelector('[data-gmi-batch-counts]')`);
        assert.match(summary, /SDR/); assert.match(summary, /Fyll manglende verdier/); assert.match(summary, /2 av 4 ledninger endres/);
        assert.match(summary, /Hoppes over: 2/); assert.match(summary, /0 nye FEIL/); assert.match(summary, /0 nye SJEKK/);
        assert.match(await text(row(1)), /Har allerede verdi «11.0»/);
        assert.match(await text(row(0)), /SDR anbefales ikke for selvfallsledninger \(Tema SP\)/);
        await shot('preview');
        await click('Filtrert visning', bar);
        await search('l138'); await browser.waitFor(box(37)); await browser.evaluate(`${box(37)}.click()`);
        await browser.waitFor(`${row(37)}.innerText.includes('Utelatt av deg')`);
        assert.doesNotMatch(await text(row(37)), /→|11/, 'no hypothetical value for a user-excluded object');
        assert.equal(await browser.evaluate(`${row(37)}.dataset.reviewOutcome`), 'excluded');
        await search(''); await browser.waitFor(row(5));
        assert.doesNotMatch(await text(row(5)), /forhåndsvisning|Endres|Hoppes|Utelatt|—/, 'unrelated rows have empty review cells');
        const counts = await text(`${inspector}.querySelector('[data-gmi-batch-counts]')`);
        assert.match(counts, /1 av 3 ledninger endres/); assert.match(counts, /Utelatt av deg: 1/);
        await search('l138'); await browser.waitFor(box(37)); await browser.evaluate(`${box(37)}.click()`);
        await browser.waitFor(`${inspector}.innerText.includes('Utvalget er utvidet')`);
        assert.equal(await stageDisabled(), true);
        assert.match(await text(row(37)), /Ugyldig forhåndsvisning/); assert.doesNotMatch(await text(row(37)), /→/);
        await search('');
        await preview();
        assert.match(await text(`${inspector}.querySelector('[data-gmi-batch-counts]')`), /2 av 4 ledninger endres/);
      });

      await t.test('manual override: obvious button, labelled hypothetical, severity-first risk approval', async () => {
        await browser.evaluate(`${inspector}.querySelector('.gmi-batch-advanced input').click()`);
        await browser.waitFor(`${row(0)}.querySelector('.gmi-manual-toggle')`);
        const manual = await browser.evaluate(`(() => { const b = ${row(0)}.querySelector('.gmi-manual-toggle'); const s = getComputedStyle(b); return { tag: b.tagName, text: b.innerText.trim(), border: s.borderTopColor, color: s.color, pressed: b.getAttribute('aria-pressed') }; })()`);
        assert.deepEqual(manual, { tag: 'BUTTON', text: 'Inkluder manuelt', border: 'rgb(0, 117, 149)', color: 'rgb(0, 117, 149)', pressed: 'false' });
        assert.match(await text(row(0)), /Hvis inkludert:/);
        // S3: hypothetical findings keep ≥4.5:1 (no opacity) on the selected row, with the matching symbol.
        for (const scheme of ['light', 'dark']) {
          await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
          const hypothetical = await severityAppearance(browser, '.gmi-review-finding.gmi-review-hypothetical');
          console.log(`S3 hypothetical ${scheme}: ${assertSeverityContrast(`hypothetical ${scheme}`, hypothetical)}`);
          assert(hypothetical.items.every((item) => item.hypothetical && item.icon === item.tone), JSON.stringify(hypothetical.items));
        }
        await browser.send('Emulation.setEmulatedMedia', { features: [] });
        assert.equal(await browser.evaluate(`${row(1)}.querySelector('.gmi-manual-toggle')`), null, 'populated values cannot be manually included in fill mode');
        assert.match(await text(`${inspector}.querySelector('[data-gmi-batch-counts]')`), /0 nye FEIL/, 'hypotheticals are not counted');
        await click('Inkluder manuelt', row(0));
        await browser.waitFor(`${row(0)}.innerText.includes('Manuelt inkludert')`);
        assert.doesNotMatch(await text(row(0)), /Hvis inkludert/);
        const chips = await browser.evaluate(`Array.from(${inspector}.querySelectorAll('.gmi-severity-count')).map(e => ({ text: e.innerText.trim(), tone: e.dataset.validationTone || null, color: getComputedStyle(e).color }))`);
        assert.deepEqual(chips.map(({ text: label, tone }) => [label, tone]), [['1 ny FEIL', 'error'], ['1 ny SJEKK', 'warning']]);
        assert.notEqual(chips[0].color, chips[1].color);
        // S3: FEIL ⓧ / SJEKK ⚠ symbols; compact SJEKK pills use the yellow-700 alias, table cells keep the shared orange.
        for (const scheme of ['light', 'dark']) {
          await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
          const pills = await severityAppearance(browser, '.gmi-severity-count[data-validation-tone]');
          const cells = await severityAppearance(browser, '.gmi-review-finding:not(.gmi-review-hypothetical)');
          console.log(`S3 pills ${scheme}: ${assertSeverityContrast(`pills ${scheme}`, pills)}; table ${assertSeverityContrast(`table ${scheme}`, cells)}`);
          for (const item of [...pills.items, ...cells.items]) assert.equal(item.icon, item.tone, JSON.stringify(item));
          const [error, warning] = ['error', 'warning'].map((tone) => pills.items.find((item) => item.tone === tone));
          assert.equal(warning.color, pills.yellow, 'SJEKK pill text'); assert.equal(warning.iconColor, pills.yellow, 'SJEKK pill icon');
          assert.notEqual(error.color, warning.color);
          for (const cell of cells.items.filter((item) => item.tone === 'warning')) assert.equal(cell.color, cells.orangeText, 'Data Table SJEKK keeps the shared orange');
        }
        await browser.send('Emulation.setEmulatedMedia', { features: [] });
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          await shot(`severity-${width}x${height}`);
        }
        await browser.waitFor(`${inspector}.getAttribute('aria-busy') === 'false'`);
        await click('Legg til masseendring', inspector); await browser.waitFor(risk);
        // Risk dialog: panels keep the shared orange/red palette with the shared symbols.
        const groups = await severityAppearance(browser, 'dialog[open] .gmi-risk-group');
        console.log(`S3 risk groups: ${assertSeverityContrast('risk groups', groups)}`);
        assert.deepEqual(groups.items.map((item) => [item.tone, item.icon]), [['error', 'error'], ['warning', 'warning']]);
        assert.equal(groups.items[1].color, groups.orangeText); assert.equal(groups.items[1].iconColor, groups.orangeIcon);
        const dialog = await browser.evaluate(`(() => {
          const d = ${risk}; const groups = Array.from(d.querySelectorAll('.gmi-risk-group')).map(e => e.dataset.validationTone);
          const approve = Array.from(d.querySelectorAll('button')).find(e => e.innerText.trim() === 'Godkjenn og legg til');
          return { groups, text: d.innerText, approveBg: getComputedStyle(approve).backgroundColor, focused: document.activeElement.innerText.trim(), tone: d.dataset.tone };
        })()`);
        assert.deepEqual(dialog.groups, ['error', 'warning'], 'FEIL before SJEKK');
        assert.match(dialog.text, /Ledning 101: Både SDR og Ringstivhet er utfylt/);
        assert.match(dialog.text, /Ledning 101: SDR anbefales ikke for selvfallsledninger \(Tema SP\)/, 'actual applicability reason');
        assert.notEqual(dialog.approveBg, 'rgb(0, 117, 149)', 'risk approval differs from ordinary confirmation');
        assert.equal(dialog.focused, 'Tilbake til utvalget', 'cancel is the default focus'); assert.equal(dialog.tone, 'risk');
        await shot('risk');
        await click('Tilbake til utvalget', risk);
        assert.equal(await browser.evaluate(`${workspace}.querySelectorAll('[data-change-set]').length`), 0);
        await browser.waitFor(`${inspector}.getAttribute('aria-busy') === 'false'`);
        await click('Legg til masseendring', inspector); await browser.waitFor(risk);
        await click('Godkjenn og legg til', risk);
        await browser.waitFor(`${inspector}.querySelector('[data-gmi-change-detail]')`);
      });

      await t.test('staging feedback: readable staged details that match the ChangeSet; original untouched', async () => {
        const staged = await text(inspector);
        assert.match(staged, /Lagt til i arbeidskopien/); assert.match(staged, /Fyll SDR · 11/); assert.match(staged, /3 ledninger/);
        assert.match(staged, /I arbeidskopien · ikke lastet ned/);
        const objects = await browser.evaluate(`Array.from(${inspector}.querySelectorAll('[data-gmi-change-detail-cells] tbody tr')).map(r => Array.from(r.children).map(c => c.innerText.trim()))`);
        assert.deepEqual(objects, [['Ledning 101', 'tom', '11.0'], ['Ledning 138', 'tom', '11.0'], ['Ledning 143', 'tom', '11.0']]);
        const history = await browser.evaluate(`Array.from(${workspace}.querySelectorAll('[data-change-set] .gmi-edit-change-objects button')).map(e => e.innerText)`);
        assert.deepEqual(history, ['Ledning 101', 'Ledning 138', 'Ledning 143']);
        assert.match(await text(`${workspace}.querySelector('[data-change-set]')`), /SDR → 11/);
        assert.equal(await browser.evaluate(`${workspace}.querySelector('[data-gmi-edit-counts]').innerText`), '1 retting · 3 felt i 3 objekter');
        assert.equal(await readFile(file, 'latin1'), source);
        await shot('staged');
      });

      await t.test('Foreslått review focuses the edited field without rewriting the saved column order', async () => {
        await click('Vis i Foreslått', inspector);
        await browser.waitFor(`document.querySelector('[data-gmi-table-view=proposed]')`);
        await browser.waitFor(`${grid}.querySelector('[role=columnheader][data-focus-column]')`);
        assert.deepEqual((await headers()).slice(2, 4), ['Nr.', 'SDR']);
        const saved = await browser.evaluate(`(() => { const order = JSON.parse(localStorage.getItem('gmi-validator-storage')).state.ui.layerDataTable.columnOrderByLayer; return Object.values(order)[0].ledninger; })()`);
        assert.notEqual(saved[0], 'SDR', "persisted order is the user's own");
        await click('SDR først'); await browser.waitFor(`!${grid}.querySelector('[role=columnheader][data-focus-column]')`);
        assert.notEqual((await headers())[3], 'SDR');
        await click('SDR først'); await browser.waitFor(`${grid}.querySelector('[role=columnheader][data-focus-column]')`);
        await click('Kun endrede', `document.querySelector('.gmi-edit-table-modes')`);
        await browser.waitFor(`${grid}.getAttribute('aria-rowcount') === '4' || document.querySelector('[data-gmi-selection-bar]')`);
        assert((await headers()).includes('SDR'));
        await click('Foreslått', `document.querySelector('.gmi-edit-table-modes')`);
        await shot('proposed-focus');
      });

      await t.test('history details open in the inspector; geometry replacement is contextual and cancellable', async () => {
        await click('Ny masseendring for utvalget', inspector);
        await click('Avslutt', inspector); await browser.waitFor(`!${inspector}`);
        await click('Vis detaljer for 3 ledninger', workspace);
        await browser.waitFor(`document.querySelector('[data-gmi-change-detail][data-variant=history]')`);
        const detail = `document.querySelector('[data-gmi-change-detail][data-variant=history]')`;
        assert.equal(await browser.evaluate(`${detail}.querySelectorAll('tbody tr').length`), 3);
        assert.match(await text(detail), /Manuelt inkludert|manuelt inkludert/);
        await click('Lukk detaljer', detail); await browser.waitFor(`!${detail}`);
        await click('Punkter', `document.querySelector('[data-table-geometry]')`);
        await browser.waitFor(box(0)); await browser.evaluate(`${box(0)}.click()`);
        const replace = 'document.querySelector("dialog[open][data-gmi-confirm=selection]")';
        await browser.waitFor(replace);
        assert.match(await text(replace), /Erstatt 4 valgte ledninger med ett punkt\?/);
        assert.match(await text(replace), /fjernes de 4 valgte ledningene fra utvalget, og utvalget består av ett punkt/);
        await click('Avbryt', replace); await browser.waitFor(`${bar}.innerText.includes('4 valgt')`);
        await click('Ledninger', `document.querySelector('[data-table-geometry]')`);
      });

      await t.test('icon table-size toggle and laptop layouts with a live preview', async () => {
        await click('Rediger valgte (4)', bar); await browser.waitFor(inspector);
        await browser.evaluate(`(() => { const s=${inspector}.querySelector('select'); s.value='SDR'; s.dispatchEvent(new Event('change', {bubbles:true})); })()`);
        await input(`${inspector}.querySelector('[aria-label="Ny verdi"]')`, '13.6'); await browser.evaluate(`${inspector}.querySelectorAll('input[type=radio]')[1].click()`);
        await preview();
        const toggle = `document.querySelector('[data-gmi-table-size]')`;
        assert.deepEqual(await browser.evaluate(`({ text: ${toggle}.innerText.trim(), label: ${toggle}.getAttribute('aria-label'), tip: ${toggle}.dataset.iconTooltip, svg: Boolean(${toggle}.querySelector('svg')) })`),
          { text: '', label: 'Større tabell', tip: 'Større tabell: vis flere rader (kart og inspektør blir lavere)', svg: true });
        await click('Større tabell');
        await browser.waitFor(`${toggle}.dataset.gmiTableSize === 'expanded'`);
        for (const [width, height] of [[1920, 1080], [1366, 768], [1280, 720]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          await browser.waitFor(`document.documentElement.clientWidth === ${width}`);
          const bounds = await browser.evaluate(`(() => { const g=${grid}.getBoundingClientRect(), i=${inspector}.closest('aside').getBoundingClientRect(), s=${inspector}.querySelector('[data-gmi-batch-counts]').getBoundingClientRect();
            return { scroll: document.documentElement.scrollWidth, tableHeight: g.height, inspectorWidth: i.width, inspectorHeight: i.height, summaryTop: s.top - i.top }; })()`);
          assert(bounds.scroll <= width, JSON.stringify(bounds)); assert(bounds.tableHeight >= 10 * 28, JSON.stringify(bounds));
          assert(bounds.inspectorWidth >= 380); assert(bounds.summaryTop < 140, 'the proposed correction is visible without scrolling');
          await shot(`expanded-${width}x${height}`);
        }
        await click('Mindre tabell');
        await browser.waitFor(`${toggle}.dataset.gmiTableSize === 'normal'`);
        for (const [width, height] of [[1920, 1080], [1366, 768], [1280, 720]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          await browser.waitFor(`document.documentElement.clientWidth === ${width}`);
          assert(await browser.evaluate(`document.documentElement.scrollWidth <= ${width}`));
          await shot(`normal-${width}x${height}`);
        }
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-counts]').dataset.state`), 'valid', 'layout changes keep the preview');
      });
      assert.equal(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown').length, 0);
      assert.equal(await readFile(file, 'latin1'), source);
    } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
  });
