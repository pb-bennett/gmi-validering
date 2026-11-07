import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gpsPng } from './photoGpsFixtures.mjs';
import { gmiText } from './gmiPhotoFixtures.mjs';
import { closePhotoSources, savePhotoSource, setPhotoFiles, stagePhotoSource } from './photoSourceWorkflow.mjs';
import { createLayerWithPlacement, waitForThumbnails } from './photoImportWizard.mjs';

// Synthetic, non-customer workspace: EXIF GPS photos without a heading, one unplaced photo, and a GMI with a repeated reference.
export async function createWorkspaceFixtures(prefix = 'photo-workspace-edit-') {
  const root = path.resolve(tmpdir()), directory = await mkdtemp(path.join(root, prefix));
  const photo = (name, options) => ({ name, file: path.join(directory, name), bytes: gpsPng(options) });
  const photos = [
    photo('IMG_2.png', { longitude: [10, 26, 5], latitude: [59, 13, 30], captureTime: '2026:05:12 14:33:02' }),
    photo('IMG_10.png', { longitude: [10, 26, 6], latitude: [59, 13, 30.5] }),
    photo('shared.png', { noLocation: true }),
    photo('unplaced.png', { noLocation: true, captureTime: '2026:05:13 08:00:00' }),
  ];
  await Promise.all(photos.map((item) => writeFile(item.file, item.bytes)));
  const gmi = path.join(directory, 'Workspace survey.gmi');
  await writeFile(gmi, gmiText([0, 1].map((i) => ({ label: `K${i}`, hyperlink: 'h:1(link:"shared.png") ', xyz: `${581930 + i * 40} 6566000 1` }))));
  return { directory, photos, gmi, cleanup: async () => {
    if (path.dirname(path.resolve(directory)) !== root || !path.basename(directory).startsWith(prefix)) throw new Error('Unsafe fixture path');
    await rm(directory, { recursive: true, force: true });
  } };
}

// Opens the app, imports the photos with EXIF placement and attaches the GMI so the repeated asset has two occurrences.
export async function openWorkspace(browser, app, fixtures, { width = 1920, height = 1080 } = {}) {
  await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
  await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
  await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
  await browser.evaluate(`Array.from(document.querySelectorAll('button')).find((item) => item.innerText.trim() === 'Bilder').click()`);
  await browser.waitFor('document.querySelector(".photo-collection-dialog[open]")');
  await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', fixtures.photos.map((item) => item.file));
  await waitForThumbnails(browser);
  await browser.waitFor('document.querySelector(".photo-collection-dialog[open]")?.dataset.exifPending === "0"', 60000);
  await createLayerWithPlacement(browser, 'exif');
  await stagePhotoSource(browser, fixtures.gmi, 'gmi'); await savePhotoSource(browser, 'gmi'); await closePhotoSources(browser);
  await browser.waitFor('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length === 5');
}
