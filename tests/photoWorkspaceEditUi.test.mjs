import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { createWorkspaceFixtures, openWorkspace } from './helpers/photoWorkspaceFixtures.mjs';
import { KEYS, clickText, commandBar, discardEdits, dragSelectedMarker, editKnob, editTarget, elementCentre, enterEditMode, mouseDrag, openTool,
  pressKey, rotateSelected, saveEdits, selectPhotoRow } from './helpers/photoWorkspace.mjs';
import { PHOTO_POSITION_SOURCES } from '../src/lib/photos/photoMarkerPresentation.mjs';

const app = process.env.PHOTO_UI_URL;
const CTRL = 2, SHIFT = 8;
const tile = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#f0eee3"/><path d="M0 45L256 110V210L0 145Z" fill="#d9e1c8"/></svg>');
const inspector = 'document.querySelector(".photo-workspace-inspector")';
const row = (id) => `document.querySelector('.photo-workspace-list li[data-photo-id="${id}"]')`;
const marker = (id) => `document.querySelector('.leaflet-marker-icon[data-photo-id="${id}"]')`;
const editCount = () => `Number(document.querySelector('[data-edit-count]')?.innerText.match(/\\d+/)?.[0] || 0)`;

test('FOTO workspace: tools, tooltips, filters, inspector, metadata dialog, transactional Edit mode and map display',
  { skip: !chromePath || !app, timeout: 420000 }, async (t) => {
    const fixtures = await createWorkspaceFixtures();
    const browser = await openTestChrome();
    const wait = (ms) => browser.evaluate(`new Promise(resolve => setTimeout(resolve, ${ms}))`);
    const screenshot = async (name) => {
      if (!process.env.PHOTO_SCREENSHOT_DIR) return;
      await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
    };
    const exceptions = () => browser.events.filter((event) => event.method === 'Runtime.exceptionThrown');
    const ids = {};
    const blur = () => browser.evaluate('document.activeElement?.blur?.()');
    const setInput = (selector, value) => browser.evaluate(`(() => { const element = ${selector};
      const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, ${JSON.stringify(value)});
      element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); })()`);
    const tooltipText = () => browser.evaluate('document.querySelector(".photo-icon-tooltip")?.textContent || null');
    const hover = async (expression) => { const point = await elementCentre(browser, expression); await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, button: 'none', buttons: 0 }); };
    const unhover = () => browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 1070, button: 'none', buttons: 0 });
    // Keyboard modality first, so programmatic focus matches :focus-visible exactly like Tab.
    const keyboardFocus = async (expression) => { await pressKey(browser, 'Shift', { code: 'ShiftLeft', keyCode: 16 }); await browser.evaluate(`(${expression}).focus()`); };
    // The inspector's detailed groups start collapsed; a user opens them to read provenance.
    const openInspectorDetails = () => browser.evaluate(`${inspector}.querySelectorAll('details').forEach((e) => { e.open = true; })`);
    const fingerprint = () => browser.evaluate(`JSON.stringify({ rows: Array.from(document.querySelectorAll('.photo-workspace-row')).map((e) => e.getAttribute('aria-label')),
      markers: Array.from(document.querySelectorAll('.leaflet-marker-icon[data-photo-id]')).map((e) => [e.dataset.photoId, e.dataset.lat, e.dataset.lng, e.querySelector('[data-position-source]')?.dataset.positionSource, e.querySelector('.photo-direction-indicator')?.dataset.degrees || null]).sort() })`);
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `const imageSrc=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
        Object.defineProperty(HTMLImageElement.prototype,'src',{...imageSrc,set(value){imageSrc.set.call(this,String(value).includes('cache.kartverket.no/')||String(value).includes('geonorge.no/')?${JSON.stringify(tile)}:value);}});` });
      await openWorkspace(browser, app, fixtures);
      for (const item of await browser.evaluate('Array.from(document.querySelectorAll(".photo-workspace-list li[data-photo-id]")).map((e) => [e.dataset.photoId, e.querySelector(".photo-workspace-filename").innerText, e.querySelector(".photo-workspace-context")?.innerText || ""])')) {
        const [id, name, context] = item;
        if (name === 'shared.png') ids[context.endsWith('1/2') ? 'shared1' : 'shared2'] = id;
        else ids[name.replace(/\.png$/, '')] = id;
      }
      assert.deepEqual(Object.keys(ids).sort(), ['IMG_10', 'IMG_2', 'shared1', 'shared2', 'unplaced']);

      await t.test('quiet left pane: back arrow, compact counts, Verktøy, filter/sort; toast instead of a permanent banner', async () => {
        const text = await browser.evaluate('document.querySelector(".photo-workspace-collection").innerText');
        for (const removed of ['Velg alle viste', 'Kilder og koblinger ·', 'Opptaksmetadata for', 'Lukk importmelding', 'Vis på kartet', 'Eksporter', 'Legg til bilder']) assert(!text.includes(removed), removed);
        // Unique assets · placements, and unplaced separately; no third competing count.
        assert.match(text, /4 bilder · 5 plasseringer/);
        assert.match(text, /3 uplassert/);
        assert.doesNotMatch(text, /\d+ plassert ·/);
        const back = await browser.evaluate(`(() => { const b = document.querySelector('.photo-workspace-back'); return { label: b.getAttribute('aria-label'), tip: b.dataset.iconTooltip, title: b.getAttribute('title'), text: b.innerText.trim() }; })()`);
        assert.deepEqual(back, { label: 'Tilbake til appen', tip: 'Tilbake til appen', title: null, text: '' });
        assert(await browser.evaluate(`parseFloat(getComputedStyle(document.querySelector('.photo-workspace-back')).borderTopWidth) >= 1`), 'back arrow has a visible button treatment');
        const tools = await browser.evaluate(`(() => { const b = document.querySelector('.photo-tools-trigger'); return { label: b.getAttribute('aria-label'), tip: b.dataset.iconTooltip, text: b.innerText.trim(), icons: b.querySelectorAll('svg').length }; })()`);
        assert.deepEqual(tools, { label: 'Verktøy', tip: 'Verktøy', text: '', icons: 2 }, 'Verktøy is a wrench + chevron icon button');
        assert.equal(await browser.evaluate('document.querySelector(".photo-workspace-toast")?.getAttribute("role")'), 'status');
        assert.match(await browser.evaluate('document.querySelector(".photo-workspace-toast").innerText'), /Fotolaget er opprettet/);
        const listTop = await browser.evaluate(`document.querySelector('.photo-workspace-list').getBoundingClientRect().top - document.querySelector('.photo-workspace-collection').getBoundingClientRect().top`);
        assert(listTop < 150, `list starts ${listTop}px below the pane top`);
        assert.equal(await browser.evaluate('Math.round(document.querySelector(".workspace-left").getBoundingClientRect().width)'), 316);
        await screenshot('01-workspace-1920');
        await browser.waitFor('!document.querySelector(".photo-workspace-toast")', 9000);
      });

      await t.test('Verktøy menu: grouping, icons, placeholder Fullfør opplysninger…, keyboard and no photo-specific items', async () => {
        await browser.evaluate('document.querySelector(".photo-tools-trigger").click()');
        await browser.waitFor('document.querySelector(".photo-tools-popup[role=menu]")');
        const menu = await browser.evaluate(`(() => { const m = document.querySelector('.photo-tools-popup');
          return { groups: Array.from(m.querySelectorAll('[role=group]')).map((g) => g.getAttribute('aria-label')), separators: m.querySelectorAll('[role=separator]').length,
            items: Array.from(m.querySelectorAll('[role=menuitem]')).map((i) => ({ label: i.querySelector('.photo-tools-item-label').innerText, svg: Boolean(i.querySelector('svg')),
              disabled: i.getAttribute('aria-disabled'), tip: i.dataset.iconTooltip || null, className: i.className.replace(' photo-tools-item-destructive', '') })),
            focused: document.activeElement?.dataset.tool }; })()`);
        assert.deepEqual(menu.groups, ['Bilder', 'Posisjoner og kilder', 'Eksport', 'Fjerning']);
        assert.equal(menu.separators, 3);
        assert.deepEqual(menu.items.map((item) => item.label), ['Legg til bilder…', 'Juster plassering og retning', 'Koble og posisjoner bilder…', 'Kilder og koblinger', 'Fullfør opplysninger…', 'Eksporter…', 'Fjern bilder fra laget…']);
        assert(menu.items.every((item) => item.svg && item.disabled === null && item.tip === null), 'every item: icon, enabled, no tooltip');
        assert.equal(new Set(menu.items.map((item) => item.className)).size, 1, 'Fullfør opplysninger… is styled exactly like every other item');
        assert(!menu.items.some((item) => /opptaksdata/i.test(item.label)));
        assert.equal(menu.focused, 'add');
        await pressKey(browser, 'ArrowDown', KEYS.ArrowDown);
        assert.equal(await browser.evaluate('document.activeElement.dataset.tool'), 'edit');
        await pressKey(browser, 'End', { code: 'End', keyCode: 35 });
        assert.equal(await browser.evaluate('document.activeElement.dataset.tool'), 'remove');
        await screenshot('02-tools-menu');
        await pressKey(browser, 'Escape', KEYS.Escape);
        await browser.waitFor('!document.querySelector(".photo-tools-popup")');
        assert(await browser.evaluate('document.activeElement === document.querySelector(".photo-tools-trigger")'));
        await openTool(browser, 'Fullfør opplysninger…');
        await wait(150);
        assert.equal(await browser.evaluate('Boolean(document.querySelector(".photo-tools-popup") || document.querySelector("dialog[open]"))'), false, 'placeholder closes the menu and opens nothing');
      });

      await t.test('icon-only controls: hover and focus tooltips, no title, state-aware eye; text controls have none', async () => {
        await hover('document.querySelector(".photo-workspace-back")');
        await wait(150); assert.equal(await tooltipText(), null, 'hover waits for the delay');
        await browser.waitFor('document.querySelector(".photo-icon-tooltip")');
        assert.equal(await tooltipText(), 'Tilbake til appen');
        assert.equal(await browser.evaluate('document.querySelector(".photo-icon-tooltip").getAttribute("aria-hidden")'), 'true');
        assert.equal(await browser.evaluate('document.querySelector(".photo-workspace-back").hasAttribute("aria-describedby")'), false);
        await unhover(); await browser.waitFor('!document.querySelector(".photo-icon-tooltip")');
        const eye = 'document.querySelector(".photo-workspace-visibility")';
        await keyboardFocus(eye);
        assert.equal(await tooltipText(), 'Skjul fotolag', 'keyboard focus shows the tooltip immediately');
        assert.match(await browser.evaluate(`${eye}.getAttribute('aria-label')`), /^Skjul fotolaget Bilder på kartet$/);
        await pressKey(browser, 'Escape', KEYS.Escape);
        assert.equal(await tooltipText(), null, 'Escape dismisses only the tooltip');
        await browser.evaluate(`${eye}.click()`);
        await browser.waitFor(`${eye}.getAttribute('aria-label').startsWith('Vis fotolaget')`);
        assert.equal(await browser.evaluate(`${eye}.dataset.iconTooltip`), 'Vis fotolag');
        assert.equal(await browser.evaluate('document.querySelectorAll(".leaflet-marker-icon[data-photo-id]").length'), 0);
        await browser.evaluate(`${eye}.click()`);
        await browser.waitFor(`${eye}.getAttribute('aria-label').startsWith('Skjul fotolaget')`);
        await blur();
        await hover('document.querySelector(".photo-tools-trigger")');
        await browser.waitFor('document.querySelector(".photo-icon-tooltip")');
        assert.equal(await tooltipText(), 'Verktøy', 'the icon-only Verktøy trigger has a hover tooltip');
        await unhover(); await browser.waitFor('!document.querySelector(".photo-icon-tooltip")');
        for (const selector of ['.photo-inspector-action']) {
          assert.equal(await browser.evaluate(`document.querySelector('${selector}').dataset.iconTooltip ?? null`), null);
          await hover(`document.querySelector('${selector}')`); await wait(450);
          assert.equal(await tooltipText(), null, `${selector} has visible text and no tooltip`);
        }
        await unhover();
        // Generic guard: every focusable control without visible text is a documented icon-only control.
        const offenders = await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-collection, .photo-workspace-inspector, .photo-map-display-card, .photo-workspace-toast, .photo-edit-command-bar')).flatMap((region) =>
          Array.from(region.querySelectorAll('button, [role=button], [role=slider], [role=radio]'))).filter((e) => !e.innerText.trim() && !(e.dataset.iconTooltip && e.getAttribute('aria-label')) || (!e.innerText.trim() && e.hasAttribute('title'))).map((e) => e.outerHTML.slice(0, 120))`);
        assert.deepEqual(offenders, []);
      });

      await t.test('filters and sort apply to list and map; the selected occurrence stays pinned and rendered', async () => {
        await selectPhotoRow(browser, ids.IMG_10);
        await browser.evaluate('document.querySelector("button[aria-label^=\\"Filtrer bilder\\"]").click()');
        await browser.waitFor('document.querySelector(".photo-filter-panel")');
        const labels = await browser.evaluate('Array.from(document.querySelectorAll(".photo-filter-panel label")).map((e) => e.innerText.trim())');
        for (const expected of ['Alle (5)', 'Plassert (2)', 'Uplassert (3)', 'EXIF (2)', 'GMI (0)', 'GML (0)', 'Manuell (0)', 'Retning (2)', 'Opptakstid (5)', 'Flere plasseringer (2)']) assert(labels.includes(expected), expected);
        assert(!labels.some((label) => label.startsWith('Endret')), 'Endret only exists in Edit mode');
        await browser.evaluate('document.querySelector(".photo-filter-panel input[value=unplaced]").click()');
        await browser.evaluate('document.querySelector("button[aria-label^=\\"Filtrer bilder\\"]").click()');
        await browser.waitFor('document.querySelector(".photo-filter-summary")');
        assert.match(await browser.evaluate('document.querySelector(".photo-filter-summary").innerText'), /Viser 3 av 5 · Uplassert/);
        assert.equal(await browser.evaluate('document.querySelector("button[aria-label^=\\"Filtrer bilder\\"]").getAttribute("aria-label")'), 'Filtrer bilder – 1 filter aktivt');
        assert(await browser.evaluate(`${row(ids.IMG_10)} && document.querySelector('.photo-workspace-pinned-heading')?.innerText.includes('Valgt bilde (skjult av filteret)')`));
        assert.deepEqual(await browser.evaluate('Array.from(document.querySelectorAll(".leaflet-marker-icon[data-photo-id]")).map((e) => e.dataset.photoId)'), [ids.IMG_10], 'only the pinned selection remains on the map');
        await selectPhotoRow(browser, ids.unplaced);
        assert.equal(await browser.evaluate(`Boolean(${row(ids.IMG_10)})`), false, 'a filter change never clears selection, but a new selection unpins the old one');
        await browser.evaluate('document.querySelector(".photo-filter-clear").click()');
        await browser.waitFor('!document.querySelector(".photo-filter-summary") && document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length === 5');
        await browser.evaluate('document.querySelector("button[aria-label^=\\"Sorter bilder\\"]").click()');
        await browser.waitFor('document.querySelector(".photo-sort-menu")');
        assert.deepEqual(await browser.evaluate('Array.from(document.querySelectorAll(".photo-sort-menu [role=menuitemradio]")).map((e) => e.innerText)'),
          ['Filnavn A–Å', 'Filnavn Å–A', 'Opptakstid, eldst først', 'Opptakstid, nyest først', 'Uplasserte først', 'Posisjonskilde', 'GMI-objekt / AnleggsID']);
        await clickText(browser, 'Filnavn Å–A');
        await browser.waitFor('!document.querySelector(".photo-sort-menu")');
        assert.deepEqual(await browser.evaluate('Array.from(document.querySelectorAll(".photo-workspace-filename")).map((e) => e.innerText)'), ['unplaced.png', 'shared.png', 'shared.png', 'IMG_10.png', 'IMG_2.png']);
        assert.equal(await browser.evaluate('document.querySelector("button[aria-label^=\\"Sorter bilder\\"]").getAttribute("aria-label")'), 'Sorter bilder: Filnavn Å–A');
        await browser.evaluate('document.querySelector("button[aria-label=\\"Nullstill filter og sortering\\"]").click()');
        await browser.waitFor('!document.querySelector("button[aria-label=\\"Nullstill filter og sortering\\"]")');
        assert.deepEqual(await browser.evaluate('Array.from(document.querySelectorAll(".photo-workspace-filename")).map((e) => e.innerText)'), ['IMG_2.png', 'IMG_10.png', 'shared.png', 'shared.png', 'unplaced.png']);
        // Roving list keyboard: ArrowDown/Up move selection.
        await selectPhotoRow(browser, ids.IMG_2);
        await keyboardFocus(`${row(ids.IMG_2)}.querySelector('button')`);
        await pressKey(browser, 'ArrowDown', KEYS.ArrowDown);
        await browser.waitFor(`${row(ids.IMG_10)}.querySelector('button').getAttribute('aria-pressed') === 'true'`);
        assert.equal(await browser.evaluate('document.activeElement.closest("li").dataset.photoId'), ids.IMG_10);
      });

      await t.test('inspector is read-only with one contextual action; occurrence switcher selects siblings', async () => {
        const buttons = await browser.evaluate(`Array.from(${inspector}.querySelectorAll('button')).filter((b) => !b.closest('.photo-occurrence-switcher')
          && !/^(Vis |Zoom til )/.test(b.getAttribute('aria-label') || '')).map((b) => ({ text: b.innerText.trim(), section: b.closest('section[aria-label]')?.getAttribute('aria-label') }))`);
        assert.deepEqual(buttons, [{ text: 'Rediger opptaksdata…', section: 'Opptak' }]);
        assert.equal(await browser.evaluate(`Array.from(${inspector}.querySelectorAll('button')).some((b) => /Lagre|Nullstill|Flytt|Plasser|Juster|Bruk /.test(b.innerText))`), false);
        assert.equal(await browser.evaluate(`${inspector}.querySelectorAll('input, select, textarea').length`), 0);
        const sections = await browser.evaluate(`Array.from(${inspector}.querySelectorAll('.photo-inspector-section h3')).map((h) => h.firstChild.textContent)`);
        assert.deepEqual(sections, ['Plassering', 'Opptak', 'Koblinger', 'Fil']);
        const locate = `${inspector}.querySelector('.photo-inspector-locate')`;
        assert.deepEqual(await browser.evaluate(`({ label: ${locate}.getAttribute('aria-label'), tip: ${locate}.dataset.iconTooltip })`), { label: 'Zoom til IMG_10.png på kartet', tip: 'Zoom til bildet' });
        assert(await browser.evaluate(`${inspector}.querySelector('.photo-collection-original').getBoundingClientRect().height >= 300`), 'large preview');
        await selectPhotoRow(browser, ids.unplaced);
        assert.deepEqual(await browser.evaluate(`({ disabled: ${locate}.getAttribute('aria-disabled'), tip: ${locate}.dataset.iconTooltip })`), { disabled: 'true', tip: 'Zoom til bildet – bildet er ikke plassert' });
        await selectPhotoRow(browser, ids.shared1);
        const switcher = await browser.evaluate(`Array.from(${inspector}.querySelectorAll('.photo-occurrence-switcher button')).map((b) => [b.innerText, b.getAttribute('aria-pressed')])`);
        assert.deepEqual(switcher, [['1 · KUM · AnleggsID K0', 'true'], ['2 · KUM · AnleggsID K1', 'false']]);
        // Progressive disclosure: detailed groups start collapsed, and their summaries still say what is inside.
        assert.deepEqual(await browser.evaluate(`Array.from(${inspector}.querySelectorAll('details[data-disclosure]')).map((e) => [e.dataset.disclosure, e.open])`),
          [['placement-provenance', false], ['placement-alternatives', false], ['placement-technical', false], ['links', false], ['file', false]]);
        assert.match(await browser.evaluate(`${inspector}.querySelector('section[aria-label=Koblinger] summary').innerText`), /Koblinger\s*2\s*denne plasseringen: KUM · AnleggsID K0/);
        assert.equal(await browser.evaluate(`${inspector}.innerText.includes('Denne plasseringen')`), false, 'association cards are collapsed by default');
        assert(await browser.evaluate(`${inspector}.textContent.includes('Denne plasseringen')`), 'collapsed information is retained');
        await browser.evaluate(`${inspector}.querySelector('section[aria-label=Koblinger] summary').click()`);
        assert(await browser.evaluate(`${inspector}.innerText.includes('Denne plasseringen')`));
        await browser.evaluate(`${inspector}.querySelector('section[aria-label=Koblinger] summary').click()`);
        await browser.evaluate(`${inspector}.querySelectorAll('.photo-occurrence-switcher button')[1].click()`);
        await browser.waitFor(`${row(ids.shared2)}.querySelector('button').getAttribute('aria-pressed') === 'true'`);
        await screenshot('03-inspector-repeated');
      });

      await t.test('Rediger opptaksdata… opens a focused dialog: evidence choice, manual date/time/timezone, cancel', async () => {
        await selectPhotoRow(browser, ids.IMG_2);
        await clickText(browser, 'Rediger opptaksdata…');
        const dialog = 'document.querySelector(".photo-metadata-dialog[open]")';
        await browser.waitFor(dialog);
        assert.match(await browser.evaluate(`${dialog}.innerText`), /EXIF: 12\.05\.2026 14:33:02/);
        assert.match(await browser.evaluate(`${dialog}.innerText`), /Gjelder bildet\./);
        await browser.evaluate(`${dialog}.querySelector('input[value="evidence:exif:captureTime"]').click()`);
        await clickText(browser, 'Lagre', dialog);
        await browser.waitFor(`!${dialog}`);
        assert.match(await browser.evaluate(`${inspector}.innerText`), /Opptakstid\s+12\.05\.2026 14:33:02 · tidssone ukjent/);
        await openInspectorDetails();
        assert.match(await browser.evaluate(`${inspector}.innerText`), /Opptakstid fra\s+EXIF DateTimeOriginal/);
        assert.match(await browser.evaluate('document.querySelector(".photo-workspace-toast")?.innerText || ""'), /Opptaksdata lagret for IMG_2\.png/);
        await clickText(browser, 'Rediger opptaksdata…'); await browser.waitFor(dialog);
        await browser.evaluate(`${dialog}.querySelector('input[value="other"]').click()`);
        await browser.waitFor(`${dialog}.querySelector('input[type=date]')`);
        assert.equal(await browser.evaluate(`${dialog}.querySelector('select').value`), '', 'unknown timezone stays the default');
        assert.equal(await browser.evaluate(`${dialog}.querySelector('input[type=time]').step`), '1');
        await setInput(`${dialog}.querySelector('input[type=date]')`, '2026-05-14');
        await setInput(`${dialog}.querySelector('input[type=time]')`, '10:11:12');
        await setInput(`${dialog}.querySelector('select')`, '+02:00');
        await clickText(browser, 'Lagre', dialog);
        await browser.waitFor(`!${dialog}`);
        assert.match(await browser.evaluate(`${inspector}.innerText`), /14\.05\.2026 10:11:12 \(\+02:00\)/);
        await openInspectorDetails();
        assert.match(await browser.evaluate(`${inspector}.innerText`), /Opptakstid fra\s+Manuell/);
        await clickText(browser, 'Rediger opptaksdata…'); await browser.waitFor(dialog);
        await browser.evaluate(`${dialog}.querySelector('input[value="remove"]').click()`);
        await pressKey(browser, 'Escape', KEYS.Escape);
        await browser.waitFor(`!${dialog}`);
        assert.match(await browser.evaluate(`${inspector}.innerText`), /14\.05\.2026 10:11:12/, 'Escape cancels without writing');
      });

      let entry;
      await t.test('entering Edit mode: outline, command bar, forced visibility, staged-only changes', async () => {
        await selectPhotoRow(browser, ids.IMG_10);
        entry = await fingerprint();
        await enterEditMode(browser);
        assert(await browser.evaluate('document.querySelector(".leaflet-container").classList.contains("photo-edit-mode")'));
        assert(await browser.evaluate('Boolean(document.querySelector(".photo-workspace-editing-pill"))'));
        assert.deepEqual(await browser.evaluate(`({ disabled: document.querySelector('.photo-workspace-visibility').getAttribute('aria-disabled'), tip: document.querySelector('.photo-workspace-visibility').dataset.iconTooltip })`),
          { disabled: 'true', tip: 'Fotolaget vises mens du redigerer' });
        assert.equal(await browser.evaluate(`${commandBar}.querySelector('[role=toolbar]').getAttribute('aria-label')`), 'Juster plassering og retning');
        assert.match(await browser.evaluate(`${commandBar}.innerText`), /Avslutt redigering/);
        assert.deepEqual(await browser.evaluate(`Array.from(${commandBar}.querySelectorAll('.photo-edit-icon')).map((b) => [b.getAttribute('aria-label'), b.getAttribute('aria-disabled'), b.dataset.iconTooltip, b.getAttribute('aria-keyshortcuts')])`),
          [['Angre', 'true', 'Angre – ingen endringer å angre', 'Control+Z'], ['Gjør om', 'true', 'Gjør om – ingenting å gjøre om', 'Control+Shift+Z Control+Y']]);
        // Unavailable controls stay focusable; a reason that differs from the name is exposed as a described tooltip.
        const undo = `${commandBar}.querySelector('[aria-label="Angre"]')`;
        await keyboardFocus(undo);
        assert.deepEqual(await browser.evaluate(`(() => { const tip = document.querySelector('.photo-icon-tooltip');
          return { text: tip?.textContent, role: tip?.getAttribute('role'), hidden: tip?.getAttribute('aria-hidden'), described: (${undo}.getAttribute('aria-describedby') || '').split(' ').includes(tip?.id) }; })()`),
          { text: 'Angre – ingen endringer å angre', role: 'tooltip', hidden: null, described: true });
        await browser.evaluate(`${undo}.click()`);
        await pressKey(browser, 'Escape', KEYS.Escape);
        assert.equal(await tooltipText(), null);
        assert(await browser.evaluate(`Boolean(${commandBar})`), 'Escape on a visible tooltip is consumed and does not leave Edit mode');
        assert.equal(await browser.evaluate(`${undo}.hasAttribute('aria-describedby')`), false);
        await blur();
        assert(await browser.evaluate(`Boolean(${editTarget}) && ${editTarget}.dataset.photoId === ${JSON.stringify(ids.IMG_10)}`), 'the actual selected marker is the drag target');
        assert.equal(await browser.evaluate(`document.querySelectorAll('.leaflet-photo-markers-pane [data-photo-id="${ids.IMG_10}"]').length`), 0, 'no duplicate marker');
        assert.equal(await browser.evaluate(`${editKnob}.getAttribute('aria-label')`), 'Legg til retning for IMG_10.png');
        assert(await browser.evaluate(`${editKnob}.classList.contains('photo-edit-knob-ghost') && !${editTarget}.querySelector('.photo-direction-indicator')`), 'ghost knob never draws an implicit north');
      });

      await t.test('drag moves only the selected photo, stages at gesture end and shows manual provenance and displacement', async () => {
        const before = await elementCentre(browser, editTarget);
        await dragSelectedMarker(browser, 90, 45);
        await browser.waitFor(`${editCount()} === 1`);
        const after = await elementCentre(browser, editTarget);
        assert(Math.abs(after.x - before.x - 90) < 3 && Math.abs(after.y - before.y - 45) < 3, JSON.stringify({ before, after }));
        assert.equal(await browser.evaluate(`${editTarget}.querySelector('[data-position-source]').dataset.positionSource`), 'manual');
        assert(await browser.evaluate(`Boolean(${editTarget}.querySelector('.photo-marker-staged-dot'))`));
        assert(await browser.evaluate(`document.querySelector('.photo-edit-connector-selected')?.getTotalLength() > 50`));
        assert.match(await browser.evaluate(`${commandBar}.innerText`), /Flyttet ca\. \d/);
        assert.match(await browser.evaluate(`${inspector}.innerText`), /Lagret\s+59\.\d+° N/);
        await openInspectorDetails();
        assert.match(await browser.evaluate(`${inspector}.innerText`), /Grunnlag\s+Endret – ikke lagret/);
        assert(await browser.evaluate(`Boolean(${row(ids.IMG_10)}.querySelector('.photo-workspace-changed'))`));
        assert(!await browser.evaluate(`${commandBar}.querySelector('.photo-edit-icon').hasAttribute('aria-disabled')`), 'undo available');
        assert.equal(exceptions().length, 0);
      });

      await t.test('rotation knob: pointer gesture with live readout, keyboard ±1/±15, dashed staged arrow', async () => {
        await rotateSelected(browser, 135, { release: false });
        assert.match(await browser.evaluate('document.querySelector(".photo-edit-knob-readout").innerText'), /^13[3-7]° SØ$/);
        assert(await browser.evaluate('document.querySelector(".leaflet-container").classList.contains("photo-edit-rotating")'));
        assert.equal(await browser.evaluate('document.querySelector(".photo-icon-tooltip")'), null, 'no tooltip during a gesture');
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 0, y: 0, button: 'left', buttons: 0, clickCount: 1 });
        await browser.waitFor(`${editKnob}.hasAttribute('aria-valuenow')`);
        const degrees = Number(await browser.evaluate(`${editKnob}.getAttribute('aria-valuenow')`));
        assert(Math.abs(degrees - 135) <= 2, String(degrees));
        assert.equal(await browser.evaluate(`${editKnob}.getAttribute('aria-label')`), 'Retning for IMG_10.png');
        assert.match(await browser.evaluate(`${editKnob}.getAttribute('aria-valuetext')`), /^13\d grader, sørøst$/);
        assert.equal(await browser.evaluate(`${editTarget}.querySelector('.photo-direction-indicator').dataset.staged`), 'true');
        await keyboardFocus(editKnob);
        assert.equal(await tooltipText(), 'Endre retning');
        await pressKey(browser, 'ArrowRight', KEYS.ArrowRight);
        await browser.waitFor(`${editKnob}.getAttribute('aria-valuenow') === '${degrees + 1}'`);
        await pressKey(browser, 'ArrowRight', { ...KEYS.ArrowRight, modifiers: SHIFT });
        await browser.waitFor(`${editKnob}.getAttribute('aria-valuenow') === '${degrees + 16}'`);
        await pressKey(browser, 'PageDown', { code: 'PageDown', keyCode: 34 });
        await browser.waitFor(`${editKnob}.getAttribute('aria-valuenow') === '${degrees + 1}'`);
        assert.equal(await browser.evaluate(`${editKnob}.getAttribute('aria-valuenow')`), String(degrees + 1));
        await blur();
        assert.equal(await browser.evaluate(editCount()), 1, 'move and direction on one occurrence count once');
      });

      await t.test('numeric direction creates a direction for a photo without one; click-to-place never places on a pan', async () => {
        await selectPhotoRow(browser, ids.IMG_2);
        assert(await browser.evaluate(`${editKnob}.classList.contains('photo-edit-knob-ghost')`));
        const field = `${commandBar}.querySelector('input[type=number]')`;
        await browser.evaluate(`${field}.focus()`);
        await setInput(field, '45');
        await pressKey(browser, 'Enter', KEYS.Enter);
        await browser.waitFor(`${editTarget}.querySelector('.photo-direction-indicator')?.dataset.degrees === '45'`);
        assert.equal(await browser.evaluate(editCount()), 2);
        await blur();
        await selectPhotoRow(browser, ids.unplaced);
        await browser.waitFor('document.querySelector(".leaflet-container").classList.contains("photo-edit-placing")');
        assert.match(await browser.evaluate(`${commandBar}.innerText`), /Klikk i kartet for å plassere unplaced\.png/);
        assert.equal(await browser.evaluate('getComputedStyle(document.querySelector(".leaflet-container")).cursor'), 'crosshair');
        const map = await browser.evaluate('document.querySelector(".leaflet-container").getBoundingClientRect().toJSON()');
        const start = { x: map.left + map.width * 0.3, y: map.top + map.height * 0.7 };
        await mouseDrag(browser, start, { x: start.x + 70, y: start.y - 30 });
        await wait(250);
        assert.equal(await browser.evaluate(editCount()), 2, 'a pan never places');
        await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1 });
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: start.x, y: start.y, button: 'left', buttons: 0, clickCount: 1 });
        await browser.waitFor(`${editCount()} === 3 && ${editTarget}?.dataset.photoId === ${JSON.stringify(ids.unplaced)}`);
        assert.match(await browser.evaluate(`${row(ids.unplaced)}.innerText`), /Manuell/);
      });

      await t.test('repeated occurrences stay independent; Plasser i kartsenter is a non-drag alternative', async () => {
        await selectPhotoRow(browser, ids.shared1);
        assert.match(await browser.evaluate(`${commandBar}.innerText`), /Dette bildet har 2 plasseringer\. Du endrer bare denne\./);
        await clickText(browser, 'Plasser i kartsenter', commandBar);
        await browser.waitFor(`${editCount()} === 4`);
        assert.match(await browser.evaluate(`${row(ids.shared1)}.innerText`), /Manuell/);
        assert.match(await browser.evaluate(`${row(ids.shared2)}.innerText`), /Uplassert/, 'the sibling occurrence is untouched');
      });

      await t.test('undo/redo by button and shortcut; selection follows; redo is cleared by a new edit', async () => {
        await blur();
        await pressKey(browser, 'z', { code: 'KeyZ', keyCode: 90, modifiers: CTRL });
        await browser.waitFor(`${editCount()} === 3`);
        assert.equal(await browser.evaluate(`document.querySelector('.photo-workspace-row[aria-pressed=true]').closest('li').dataset.photoId`), ids.shared1, 'undo selects the affected occurrence');
        assert.match(await browser.evaluate(`${commandBar}.querySelector('[aria-live]').innerText`), /Angret flytting av shared\.png/);
        await pressKey(browser, 'Z', { code: 'KeyZ', keyCode: 90, modifiers: CTRL | SHIFT });
        await browser.waitFor(`${editCount()} === 4`);
        await pressKey(browser, 'z', { code: 'KeyZ', keyCode: 90, modifiers: CTRL });
        await browser.waitFor(`${editCount()} === 3`);
        await pressKey(browser, 'y', { code: 'KeyY', keyCode: 89, modifiers: CTRL });
        await browser.waitFor(`${editCount()} === 4`);
        await browser.evaluate(`${commandBar}.querySelector('[aria-label="Angre"]').click()`);
        await browser.waitFor(`${editCount()} === 3`);
        assert(!await browser.evaluate(`${commandBar}.querySelector('[aria-label="Gjør om"]').hasAttribute('aria-disabled')`));
        await selectPhotoRow(browser, ids.IMG_10);
        await dragSelectedMarker(browser, -20, 10);
        await wait(150);
        assert.equal(await browser.evaluate(`${commandBar}.querySelector('[aria-label="Gjør om"]').getAttribute('aria-disabled')`), 'true', 'a new edit after undo clears redo');
        // Typing in the numeric field keeps native undo; the session undo is not triggered.
        await browser.evaluate(`${commandBar}.querySelector('input[type=number]').focus()`);
        await pressKey(browser, 'z', { code: 'KeyZ', keyCode: 90, modifiers: CTRL });
        await wait(150);
        assert.equal(await browser.evaluate(editCount()), 3);
        await blur();
      });

      await t.test('Escape order: cancel an active drag first, then the boundary; one Escape never discards', async () => {
        const before = await elementCentre(browser, editTarget);
        await dragSelectedMarker(browser, 60, 60, { release: false });
        await pressKey(browser, 'Escape', KEYS.Escape);
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: before.x + 60, y: before.y + 60, button: 'left', buttons: 0, clickCount: 1 });
        await wait(200);
        const after = await elementCentre(browser, editTarget);
        assert(Math.abs(after.x - before.x) < 2 && Math.abs(after.y - before.y) < 2, 'cancelled drag restores the marker');
        assert.equal(await browser.evaluate('Boolean(document.querySelector(".photo-edit-boundary[open]"))'), false, 'the cancelling Escape is consumed');
        assert.equal(await browser.evaluate(editCount()), 3);
        const heading = await browser.evaluate(`${editKnob}.getAttribute('aria-valuenow')`);
        await rotateSelected(browser, 300, { release: false });
        await pressKey(browser, 'Escape', KEYS.Escape);
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 0, y: 0, button: 'left', buttons: 0, clickCount: 1 });
        await wait(150);
        assert.equal(await browser.evaluate(`${editKnob}.getAttribute('aria-valuenow')`), heading, 'cancelled rotation restores the heading');
        await pressKey(browser, 'Escape', KEYS.Escape);
        await browser.waitFor('document.querySelector(".photo-edit-boundary[open]")');
        assert.match(await browser.evaluate('document.querySelector(".photo-edit-boundary").innerText'), /Du har ulagrede endringer på 3 bilder/);
        assert.equal(await browser.evaluate('document.activeElement.innerText'), 'Fortsett redigering');
        await screenshot('04-boundary');
        await pressKey(browser, 'Escape', KEYS.Escape);
        await browser.waitFor('!document.querySelector(".photo-edit-boundary[open]")');
        assert(await browser.evaluate(`Boolean(${commandBar})`), 'still editing');
      });

      await t.test('Back, Verktøy and Rediger opptaksdata… all hit the boundary; the shared header has no Bilder button', async () => {
        assert.equal(await browser.evaluate(`Array.from(document.querySelectorAll('.workspace-left > header button')).some((b) => /Bilder/.test(b.innerText))`), false);
        for (const [name, action] of [
          ['back', () => browser.evaluate('document.querySelector(".photo-workspace-back").click()')],
          ['tools', () => openTool(browser, 'Eksporter…')],
          ['metadata', () => clickText(browser, 'Rediger opptaksdata…')],
        ]) {
          await action();
          await browser.waitFor('document.querySelector(".photo-edit-boundary[open]")');
          assert.equal(await browser.evaluate('Boolean(document.querySelector(".photo-collection-dialog[open], .photo-metadata-dialog[open], .photo-export-dialog[open]"))'), false, name);
          await clickText(browser, 'Fortsett redigering', 'document.querySelector(".photo-edit-boundary")');
          await browser.waitFor('!document.querySelector(".photo-edit-boundary[open]")');
        }
        assert(await browser.evaluate(`Boolean(${commandBar})`));
        await screenshot('05-edit-staged-1920');
      });

      await t.test('discard leaves canonical state identical to entry', async () => {
        await discardEdits(browser);
        await wait(200);
        assert.equal(await fingerprint(), entry);
        assert.equal(await browser.evaluate('document.querySelector(".leaflet-container").classList.contains("photo-edit-mode")'), false);
      });

      await t.test('save commits several photos once; accepted arrows show while unselected; no undo after save', async () => {
        await selectPhotoRow(browser, ids.IMG_10);
        await enterEditMode(browser);
        await dragSelectedMarker(browser, 40, -30);
        await browser.waitFor(`${editCount()} === 1`);
        await browser.evaluate(`${commandBar}.querySelector('input[type=number]').focus()`);
        await setInput(`${commandBar}.querySelector('input[type=number]')`, '200');
        await pressKey(browser, 'Enter', KEYS.Enter);
        await selectPhotoRow(browser, ids.IMG_2);
        await browser.evaluate(`${commandBar}.querySelector('input[type=number]').focus()`);
        await setInput(`${commandBar}.querySelector('input[type=number]')`, '90');
        await pressKey(browser, 'Enter', KEYS.Enter);
        await browser.waitFor(`${editCount()} === 2`);
        await saveEdits(browser);
        assert.match(await browser.evaluate('document.querySelector(".photo-workspace-toast").innerText'), /Endringer lagret for 2 bilder/);
        await selectPhotoRow(browser, ids.unplaced);
        const arrows = await browser.evaluate(`[${JSON.stringify(ids.IMG_10)}, ${JSON.stringify(ids.IMG_2)}].map((id) => { const e = document.querySelector('.leaflet-marker-icon[data-photo-id="' + id + '"]');
          return [e.classList.contains('photo-camera-marker-selected'), e.querySelector('.photo-direction-indicator')?.dataset.degrees, e.querySelector('.photo-direction-indicator')?.dataset.staged,
            e.querySelector('.photo-direction-indicator path:nth-child(2)')?.getAttribute('stroke')]; })`);
        assert.deepEqual(arrows, [[false, '200', 'false', '#0F172B'], [false, '90', 'false', '#0F172B']]);
        assert.equal(await browser.evaluate(`${marker(ids.IMG_10)}.querySelector('[data-position-source]').dataset.positionSource`), 'manual');
        assert.match(await browser.evaluate(`${row(ids.IMG_10)}.innerText`), /Manuell · 200° S$/m);
        await selectPhotoRow(browser, ids.IMG_10);
        await openInspectorDetails();
        assert.match(await browser.evaluate(`${inspector}.innerText`), /Grunnlag\s+Manuelt plassert/);
        assert.match(await browser.evaluate(`${inspector}.innerText`), /Andre mulige posisjoner \(1\)/, 'EXIF evidence is kept as a candidate');
        await pressKey(browser, 'z', { code: 'KeyZ', keyCode: 90, modifiers: CTRL });
        await wait(150);
        assert.match(await browser.evaluate(`${row(ids.IMG_10)}.innerText`), /Manuell · 200° S$/m, 'there is no undo into a saved session');
        await enterEditMode(browser);
        assert.equal(await browser.evaluate(`${commandBar}.querySelector('[aria-label="Angre"]').getAttribute('aria-disabled')`), 'true');
        await clickText(browser, 'Avslutt redigering');
        await browser.waitFor(`!${commandBar}`);
      });

      await t.test('map display: thumbnails at zoom ≥ 16 with provenance border, arrows, selected ring, hover preview and fallback', async () => {
        await browser.evaluate('document.querySelector(".photo-map-display-modes [data-mode=thumbnails]").click()');
        assert.equal(await browser.evaluate('localStorage.getItem("gmi-photo-map-display")'), 'thumbnails');
        await browser.waitFor('document.querySelectorAll(".photo-thumb-marker").length === 2');
        const thumbs = await browser.evaluate(`Array.from(document.querySelectorAll('.photo-thumb-marker')).map((e) => { const box = e.querySelector('.photo-thumb'), style = getComputedStyle(box), image = box.querySelector('img');
          return { id: e.dataset.photoId, size: [Math.round(box.getBoundingClientRect().width), Math.round(box.getBoundingClientRect().height)], border: style.borderTopColor, fit: image ? getComputedStyle(image).objectFit : null,
            arrow: e.querySelector('.photo-direction-indicator')?.dataset.degrees, selected: e.classList.contains('photo-marker-selected'), shadow: style.boxShadow, title: e.getAttribute('title'), label: e.getAttribute('aria-label') }; })`);
        const colour = (kind) => PHOTO_POSITION_SOURCES.find((source) => source.kind === kind).color;
        const rgb = (hex) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
        for (const thumb of thumbs) {
          assert.deepEqual(thumb.size, [44, 44]);
          assert.equal(thumb.border, rgb(colour(thumb.id === ids.IMG_10 ? 'manual' : 'exif')), 'thin provenance border in the accepted source colour');
          assert.equal(thumb.fit, 'cover');
          assert.equal(thumb.title, null, 'aria-label instead of a duplicate native title');
          assert.match(thumb.label, /^Vis bilde: /);
        }
        assert.deepEqual(thumbs.map((thumb) => thumb.arrow).sort(), ['200', '90']);
        assert(thumbs.find((thumb) => thumb.id === ids.IMG_10).selected && /rgb\(15, 23, 43\)/.test(thumbs.find((thumb) => thumb.id === ids.IMG_10).shadow), 'navy selection ring outside the border');
        await hover(`document.querySelector('.photo-thumb-marker[data-photo-id="${ids.IMG_2}"]')`);
        await browser.waitFor('document.querySelector(".photo-thumb-preview img")');
        assert.equal(await browser.evaluate('getComputedStyle(document.querySelector(".photo-thumb-preview img")).objectFit'), 'contain');
        assert.equal(await browser.evaluate('document.querySelector(".photo-thumb-preview-name").innerText'), 'IMG_2.png');
        await screenshot('06-thumbnails-hover');
        await unhover(); await browser.waitFor('!document.querySelector(".photo-thumb-preview")');
        // Touch device: (hover: none). No hover preview; a tap selects and the inspector shows the full image.
        await browser.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
        assert.equal(await browser.evaluate('matchMedia("(hover: hover) and (pointer: fine)").matches'), false);
        await hover(`document.querySelector('.photo-thumb-marker[data-photo-id="${ids.IMG_2}"]')`);
        await wait(500);
        assert.equal(await browser.evaluate('Boolean(document.querySelector(".photo-thumb-preview"))'), false, 'no hover preview on touch');
        const point = await elementCentre(browser, `document.querySelector('.photo-thumb-marker[data-photo-id="${ids.IMG_2}"]')`);
        await browser.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] });
        await browser.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await browser.waitFor(`${row(ids.IMG_2)}.querySelector('button').getAttribute('aria-pressed') === 'true'`);
        await browser.send('Emulation.setTouchEmulationEnabled', { enabled: false });
        for (let i = 0; i < 3; i++) { await browser.evaluate('document.querySelector(".leaflet-control-zoom-out").click()'); await wait(350); }
        await browser.waitFor('document.querySelectorAll(".photo-thumb-marker").length === 0 && document.querySelectorAll(".photo-camera-marker[data-photo-id]").length === 2');
        assert.match(await browser.evaluate('document.querySelector(".photo-map-display-card").innerText'), /Miniatyrer vises fra zoom 16/);
        assert.equal(await browser.evaluate('document.querySelectorAll(".photo-camera-marker .photo-direction-indicator").length'), 2, 'arrows remain in the marker fallback');
        for (let i = 0; i < 3; i++) { await browser.evaluate('document.querySelector(".leaflet-control-zoom-in").click()'); await wait(350); }
        await browser.waitFor('document.querySelectorAll(".photo-thumb-marker").length === 2');
      });

      await t.test('identical coordinates: stack badge and click cycling', async () => {
        await enterEditMode(browser);
        for (const id of [ids.shared1, ids.shared2]) {
          await selectPhotoRow(browser, id);
          await clickText(browser, 'Plasser i kartsenter', commandBar);
        }
        await browser.waitFor(`${editCount()} === 2`);
        await saveEdits(browser);
        await selectPhotoRow(browser, ids.unplaced);
        await browser.waitFor('document.querySelector(".photo-marker-stack")');
        assert.equal(await browser.evaluate('document.querySelectorAll(".photo-marker-stack").length'), 1);
        assert.equal(await browser.evaluate('document.querySelector(".photo-marker-stack").innerText'), '2');
        const top = await browser.evaluate('document.querySelector(".photo-marker-stack").closest(".leaflet-marker-icon").dataset.photoId');
        const click = async () => { const p = await elementCentre(browser, 'document.querySelector(".photo-marker-stack").closest(".leaflet-marker-icon")');
          await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
          await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 }); };
        await click();
        await browser.waitFor(`${row(top)}.querySelector('button').getAttribute('aria-pressed') === 'true'`);
        await click();
        const other = top === ids.shared1 ? ids.shared2 : ids.shared1;
        await browser.waitFor(`${row(other)}.querySelector('button').getAttribute('aria-pressed') === 'true'`);
        assert(await browser.evaluate(`Boolean(document.querySelector('.photo-thumb-marker.photo-marker-sibling[data-photo-id="${top}"]'))`), 'the sibling occurrence gets the dashed ring');
      });

      await t.test('1280×720 laptop layout: widths, command bar clear of map controls', async () => {
        await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
        await wait(600);
        await enterEditMode(browser);
        await selectPhotoRow(browser, ids.IMG_10);
        await dragSelectedMarker(browser, 20, 20);
        await browser.waitFor(`${editCount()} === 1`);
        const layout = await browser.evaluate(`(() => { const box = (e) => e.getBoundingClientRect(); const bar = box(document.querySelector('.photo-edit-command-bar')), map = box(document.querySelector('.leaflet-container'));
          const hits = (a, b) => b.width && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          const controls = Array.from(document.querySelectorAll('.leaflet-control, .photo-map-display-card, .layer-highlight-trigger, button')).filter((e) => !e.closest('.photo-edit-command-bar') && e.closest('.photo-workspace-primary') && !e.closest('.leaflet-marker-pane, .leaflet-photo-markers-pane, .leaflet-photo-placement-pane, .photo-workspace-inspector'));
          const overlaps = controls.filter((e) => hits(bar, box(e))).map((e) => e.className || e.innerText);
          const toast = document.querySelector('.photo-workspace-toast');
          const toastOverlaps = toast ? controls.filter((e) => !toast.contains(e) && hits(box(toast), box(e))).map((e) => e.className || e.innerText) : [];
          return { left: Math.round(box(document.querySelector('.workspace-left')).width), inspector: Math.round(box(document.querySelector('.photo-workspace-inspector')).width),
            inside: bar.left >= map.left && bar.right <= map.right, overlaps, toastOverlaps, scroll: document.documentElement.scrollWidth > innerWidth }; })()`);
        assert(layout.left >= 292 && layout.left <= 300, String(layout.left));
        assert(layout.inspector >= 380 && layout.inspector <= 400, String(layout.inspector));
        assert(layout.inside && !layout.overlaps.length && !layout.toastOverlaps.length && !layout.scroll, JSON.stringify(layout));
        await screenshot('07-edit-1280');
        await discardEdits(browser);
        await browser.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
      });

      await t.test('pending changes on Back: save, then leave the workspace; preference survives reload', async () => {
        await enterEditMode(browser);
        await selectPhotoRow(browser, ids.IMG_2);
        await dragSelectedMarker(browser, 25, 0);
        await browser.waitFor(`${editCount()} === 1`);
        await browser.evaluate('document.querySelector(".photo-workspace-back").click()');
        await browser.waitFor('document.querySelector(".photo-edit-boundary[open]")');
        await clickText(browser, 'Lagre endringer', 'document.querySelector(".photo-edit-boundary")');
        await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
        assert.equal(exceptions().length, 0, JSON.stringify(exceptions().map((event) => event.params.exceptionDetails.text)));
        await browser.send('Page.reload');
        await browser.waitFor('document.readyState === "complete"');
        assert.equal(await browser.evaluate('localStorage.getItem("gmi-photo-map-display")'), 'thumbnails');
      });
    } finally {
      await browser.close();
      await fixtures.cleanup();
    }
  });
