import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { completionGmlText } from './helpers/photoCompletionFixtures.mjs';
import { exportDialog, openCompletionFromExport, openExport, returnToExport } from './helpers/photoExportWizard.mjs';
import { gpsJpeg } from './helpers/photoGpsFixtures.mjs';
import { addImportFiles, createLayerWithoutPlacement, importDialog, retainGmlInWorkspace } from './helpers/photoImportWizard.mjs';
import { applyPhotoSourcePositions, clickSourceControl } from './helpers/photoSourceWorkflow.mjs';
import { KEYS, elementCentre, pressKey } from './helpers/photoWorkspace.mjs';

// Strict mode runs each effect, its cleanup and the effect again, but only under `next dev`. The cleanup's dialog.close() queues a
// native close that lands on the reopened dialog, so a dialog that trusts every close event shuts itself. The other suites run on a
// production build and cannot see this. Start `next dev`, then set PHOTO_DEV_UI_URL to it.
const app = process.env.PHOTO_DEV_UI_URL;
const hub = 'document.querySelector(".photo-completion-dialog[open]")';
const metadata = 'document.querySelector(".photo-metadata-dialog[open]")';
const editRow = `Array.from(${hub}.querySelectorAll('[data-completion-panel="captureTime"] button')).find((item) => item.innerText === 'Rediger…')`;
const settle = () => new Promise((resolve) => setTimeout(resolve, 800));
// Trusted input, as a person's click is. Chrome groups the close watchers of dialogs opened without one, so one Escape would close both.
const openRow = async (browser) => {
  await browser.waitFor(editRow);
  const { x, y } = await elementCentre(browser, editRow);
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  await browser.waitFor(metadata);
};
const stillOpen = async (browser, dialog, label) => { await settle(); assert(await browser.evaluate(`Boolean(${dialog})`), `${label} stays open`); };

test('next dev: no dialog on the export path closes itself, and each still closes when asked', { skip: !chromePath || !app, timeout: 300000 }, async () => {
  const browser = await openTestChrome();
  const directory = await mkdtemp(path.join(tmpdir(), 'gmi-dialog-dev-'));
  try {
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 900, deviceScaleFactor: 1, mobile: false });
    await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
    await browser.waitFor('document.querySelector("button[aria-label=Lukk]")', 120000);
    assert(await browser.evaluate(`Boolean(document.querySelector('nextjs-portal'))`), 'this check only means something on next dev');
    await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');

    const photo = path.join(directory, 'blank.jpg'), gml = path.join(directory, 'kilde.gml');
    await writeFile(photo, gpsJpeg({ noLocation: true }));
    await writeFile(gml, completionGmlText([{ name: 'blank.jpg' }]));
    await clickSourceControl(browser, 'Bilder', 'document');
    await browser.waitFor(importDialog);
    await addImportFiles(browser, [photo]);
    await createLayerWithoutPlacement(browser);
    await retainGmlInWorkspace(browser, gml);
    await applyPhotoSourcePositions(browser, 'gml');
    await browser.waitFor('document.querySelectorAll(".photo-camera-marker").length === 1', 60000);

    await openExport(browser);
    await stillOpen(browser, exportDialog, 'The export wizard');
    await openCompletionFromExport(browser);
    await stillOpen(browser, hub, 'Fullfør opplysninger');

    await browser.evaluate(`${hub}.querySelector('[data-task="captureTime"]').click()`);
    await openRow(browser);
    await stillOpen(browser, metadata, 'Rediger opptaksdata');

    await clickSourceControl(browser, 'Avbryt', metadata);
    await browser.waitFor(`!${metadata}`);
    await stillOpen(browser, hub, 'Fullfør opplysninger, after Avbryt');

    await openRow(browser);
    await stillOpen(browser, metadata, 'Rediger opptaksdata, the second time');
    await pressKey(browser, 'Escape', KEYS.Escape);
    await browser.waitFor(`!${metadata}`);
    await stillOpen(browser, hub, 'Fullfør opplysninger, after Escape');

    await openRow(browser);
    await settle();
    await browser.evaluate(`${metadata}.close()`);
    await browser.waitFor(`!${metadata}`);
    await stillOpen(browser, hub, 'Fullfør opplysninger, after a close the browser makes by itself');

    await returnToExport(browser);
    await stillOpen(browser, exportDialog, 'The export wizard, on return');
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});
