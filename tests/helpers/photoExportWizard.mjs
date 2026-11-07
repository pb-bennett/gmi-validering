import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { clickSourceControl } from './photoSourceWorkflow.mjs';

// The one place browser suites touch the export interface, so that the suites show behaviour and not the wizard's markup.
export const exportDialog = 'document.querySelector(".photo-export-wizard")';
const deliveryStep = `${exportDialog}.querySelector('[data-export-step="delivery"]')`;
const packageStep = `${exportDialog}?.querySelector('[data-export-step="package"]')`;
const advance = `${exportDialog}.querySelector('[data-export-advance]')`;
const completionDialog = 'document.querySelector(".photo-completion-dialog[open]")';
// Failure limit only: a passing wait returns at once. The 148-photo corpus needs most of it.
const SLOW = 120000;

// React ignores a plain value write on an input, so this goes through the native setter.
const setControl = (browser, root, selector, value) => browser.evaluate(`(() => {
  const element = ${root}.querySelector(${JSON.stringify(selector)});
  const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)});
  element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
})()`);

export async function openExport(browser) {
  await clickSourceControl(browser, 'Eksporter…', 'document');
  await browser.waitFor(exportDialog);
}

// Settings live on Leveranse, so reaching one from Pakke means going back, which discards the plan.
export async function backToDelivery(browser) {
  if (!await browser.evaluate(`Boolean(${packageStep})`)) return;
  await clickSourceControl(browser, 'Gå tilbake til Leveranse', exportDialog);
  await browser.waitFor(deliveryStep);
}

export const selectedFormat = (browser) => browser.evaluate(`${exportDialog}.querySelector('input[name="photo-export-format"]:checked')?.value ?? null`);

export async function chooseFormat(browser, profile) {
  await backToDelivery(browser);
  const radio = `${exportDialog}.querySelector('input[name="photo-export-format"][value="${profile}"]')`;
  await browser.evaluate(`(() => { const more = ${radio}.closest('details'); if (more && !more.open) more.querySelector('summary').click(); ${radio}.click(); })()`);
  await browser.waitFor(`${radio}.checked`);
}

export async function setLabel(browser, label) {
  await backToDelivery(browser);
  await setControl(browser, exportDialog, '[aria-label="Eksportetikett"]', label);
}

export const deliveryState = (browser) => browser.evaluate(`${exportDialog}.querySelector('[data-delivery-state]')?.dataset.deliveryState ?? null`);
export const canAdvance = (browser) => browser.evaluate(`!${advance}.disabled`);
export const packageState = (browser) => browser.evaluate(`${packageStep}?.dataset.packageState ?? null`);

// `Neste`, or `Fortsett uten opptakstid`: the same control. It builds the plan, so a new call is always a new plan.
export async function buildPreview(browser) {
  await backToDelivery(browser);
  if (!await canAdvance(browser)) throw new Error(`Export cannot advance from ${await deliveryState(browser)}`);
  await browser.evaluate(`${advance}.click()`);
  await browser.waitFor(`${packageStep} && ${packageStep}.dataset.packageState !== 'building'`, SLOW);
}

export const previewNames = (browser) => browser.evaluate(`(() => {
  const { exportZip, exportGml } = ${exportDialog}.querySelector('[data-export-zip]').dataset;
  return { zip: exportZip, gml: exportGml };
})()`);

export const canDownload = (browser) => browser.evaluate(`(() => { const button = Array.from(${exportDialog}.querySelectorAll('button')).find((item) => item.textContent === 'Last ned ZIP'); return Boolean(button && !button.disabled); })()`);

export async function readZip(directory, name) {
  const file = path.join(directory, name);
  for (let attempt = 0; attempt < 300; attempt++) {
    try { return unzipSync(new Uint8Array(await readFile(file))); }
    catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  throw new Error('ZIP download not completed');
}

// Saves the ZIP into `directory` and returns the previewed names with the unpacked entries.
export async function downloadZip(browser, directory) {
  const names = await previewNames(browser);
  await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });
  await clickSourceControl(browser, 'Last ned ZIP', exportDialog);
  await browser.waitFor(`${packageStep}?.dataset.packageState === 'done'`, SLOW);
  return { ...names, entries: await readZip(directory, names.zip) };
}

export async function closeExport(browser) {
  await clickSourceControl(browser, 'Lukk eksport', exportDialog);
  await browser.waitFor(`!${exportDialog}`);
}

// The hub remembers where it was opened from, so `returnToExport` is the way back, and it always lands on Leveranse.
export async function openCompletionFromExport(browser) {
  await clickSourceControl(browser, 'Fullfør opplysninger…', exportDialog);
  await browser.waitFor(`${completionDialog} && !${exportDialog}`);
}

export async function returnToExport(browser) {
  await clickSourceControl(browser, 'Tilbake til eksport', completionDialog);
  await browser.waitFor(`${deliveryStep} && !${completionDialog}`);
}

// The hub owns the AsBuilt context. `values` is keyed by context field, such as `projectName`.
export async function fillContextInHub(browser, values) {
  await browser.evaluate(`${completionDialog}.querySelector('[data-task="context"]').click()`);
  await browser.waitFor(`${completionDialog}.querySelector('[data-completion-panel="context"]')`);
  for (const [field, value] of Object.entries(values)) {
    await setControl(browser, completionDialog, `[data-context-field="${field}"] input, [data-context-field="${field}"] select`, value);
  }
}
