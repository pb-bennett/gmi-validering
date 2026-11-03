import assert from 'node:assert/strict';
import test from 'node:test';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { createWorkspaceFixtures } from './helpers/photoWorkspaceFixtures.mjs';
import { clickSourceControl, setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { createLayerWithPlacement, waitForThumbnails } from './helpers/photoImportWizard.mjs';

const app = process.env.PHOTO_UI_URL;
test('deleting the final FOTO layer during animated zoom and remounting the map has no runtime exceptions',
  { skip: !chromePath || !app, timeout: 30000 }, async () => {
    const fixtures = await createWorkspaceFixtures('photo-map-teardown-');
    const browser = await openTestChrome();
    const importPhoto = async () => {
      await clickSourceControl(browser, 'Bilder', 'document');
      await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', [fixtures.photos[0].file]);
      await waitForThumbnails(browser);
      await createLayerWithPlacement(browser, 'exif');
      await browser.waitFor('document.querySelector(".photo-camera-marker")');
    };
    try {
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
      await importPhoto();
      await clickSourceControl(browser, 'Tilbake til appen', 'document');
      await browser.waitFor('!document.querySelector(".leaflet-zoom-anim")');
      // Use the actual zoom and layer-deletion controls. rAF keeps deletion
      // inside the 250 ms animation, without a race against polling intervals.
      await browser.evaluate(`(async () => {
        const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
        document.querySelector('.leaflet-control-zoom-in').click();
        for (let i = 0; i < 30 && !document.querySelector('.leaflet-zoom-anim'); i++) await frame();
        if (!document.querySelector('.leaflet-zoom-anim')) throw new Error('Zoom animation did not start');
        document.querySelector('button[aria-label^="Fjern fotokartlag"]').click();
        const remove = () => Array.from(document.querySelectorAll('button')).find(button => button.innerText.trim() === 'Fjern');
        for (let i = 0; i < 5 && !remove(); i++) await frame();
        if (!document.querySelector('.leaflet-zoom-anim')) throw new Error('Zoom ended before deletion');
        remove().click();
      })()`);
      await browser.waitFor('!document.querySelector(".leaflet-container")');
      await importPhoto();
      await browser.evaluate('new Promise(resolve => setTimeout(resolve, 400))');
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-camera-marker").length'), 1);
      assert.deepEqual(browser.events.filter(event => event.method === 'Runtime.exceptionThrown')
        .map(event => event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text), []);
    } finally {
      await browser.close();
      await fixtures.cleanup();
    }
  });
