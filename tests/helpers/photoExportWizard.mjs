import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { clickSourceControl } from './photoSourceWorkflow.mjs';

// The one place browser suites touch the export interface. It drives PhotoExportDialog today, and M6c
// points it at the wizard, so that the diff in the suites shows only real changes in behaviour.
export const exportDialog = 'document.querySelector(".photo-export-dialog")';
const previewSection = `${exportDialog}.querySelector('section[aria-label="Eksportforhåndsvisning"]')`;
// Failure limit only: a passing wait returns at once. The 148-photo corpus needs most of it.
const SLOW = 120000;

// React ignores a plain value write on an input, so this goes through the native setter.
const setControl = (browser, label, value) => browser.evaluate(`(() => {
  const element = ${exportDialog}.querySelector(${JSON.stringify(`[aria-label="${label}"]`)});
  const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)});
  element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
})()`);

export async function openExport(browser) {
  await clickSourceControl(browser, 'Eksporter…', 'document');
  await browser.waitFor(exportDialog);
}

export const chooseFormat = (browser, profile) => setControl(browser, 'Eksportprofil', profile);
export const setLabel = (browser, label) => setControl(browser, 'Eksportetikett', label);
// `field` is the visible name of an AsBuilt context field, such as 'Prosjektnavn'.
export const setContextField = (browser, field, value) => setControl(browser, `Eksport ${field}`, value);

export async function buildPreview(browser) {
  await clickSourceControl(browser, 'Lag eksportforhåndsvisning', exportDialog);
  await browser.waitFor(`${previewSection} && !${exportDialog}.innerText.includes('Bygger forhåndsvisning')`, SLOW);
}

export const previewNames = (browser) => browser.evaluate(`(() => {
  const { exportZip, exportGml } = ${exportDialog}.querySelector('[data-export-zip]').dataset;
  return { zip: exportZip, gml: exportGml };
})()`);

export const canDownload = (browser) => browser.evaluate(`!Array.from(${exportDialog}.querySelectorAll('button')).find((item) => item.textContent === 'Last ned testpakke').disabled`);

// Saves the ZIP into `directory` and returns the previewed names with the unpacked entries.
export async function downloadZip(browser, directory) {
  const names = await previewNames(browser);
  await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });
  await clickSourceControl(browser, 'Last ned testpakke', exportDialog);
  await browser.waitFor(`${exportDialog}.innerText.includes('ZIP-pakken er klar')`, SLOW);
  const file = path.join(directory, names.zip);
  for (let attempt = 0; attempt < 300; attempt++) {
    try { return { ...names, entries: unzipSync(new Uint8Array(await readFile(file))) }; }
    catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  throw new Error('ZIP download not completed');
}

export async function closeExport(browser) {
  await clickSourceControl(browser, 'Lukk eksport', exportDialog);
  await browser.waitFor(`!${exportDialog}`);
}
