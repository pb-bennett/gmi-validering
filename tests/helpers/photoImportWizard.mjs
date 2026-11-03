import { stagePhotoSource, savePhotoSource, closePhotoSources } from './photoSourceWorkflow.mjs';
import { setPhotoFiles, clickSourceControl } from './photoSourceWorkflow.mjs';
export const importDialog = 'document.querySelector(".photo-collection-dialog[open]")';
export const clickImport = (browser, text) => clickSourceControl(browser,text,importDialog);
export async function addImportFiles(browser, files, {folder=false}={}) {
 await setPhotoFiles(browser,folder?'input[aria-label="Velg mappe"]':'input[aria-label="Velg bildefiler"]',files);
}
export const waitForThumbnails = (browser) => browser.waitFor(`${importDialog}?.dataset.thumbnailsPending === '0'`,60000);
export async function chooseImportPlacement(browser, kind) {
 if(await browser.evaluate(`${importDialog}?.querySelector('[aria-current="step"]')?.textContent.includes('Bilder')`)) await clickImport(browser,'Neste');
 await browser.evaluate(`(() => {const input=${importDialog}.querySelector('input[name="import-placement"][value="${kind}"]'); if(!input||input.disabled)throw new Error('Unavailable placement ${kind}');input.click();})()`);
}
export async function createLayerWithoutPlacement(browser) {
 await waitForThumbnails(browser);
 await browser.waitFor(`${importDialog}.dataset.exifPending === '0'`,60000);
 await chooseImportPlacement(browser,'none'); await clickImport(browser,await browser.evaluate(`${importDialog}.querySelector('.photo-import-footer .gmi-primary-control').textContent`));
 await browser.waitFor('!document.querySelector(".photo-collection-dialog[open]") && document.querySelector(".photo-workspace-shell")');
}
export async function createLayerWithPlacement(browser,kind) {
 if(kind!=='gmi-layer') await chooseImportPlacement(browser,kind);
 await clickImport(browser,'Neste');
 await browser.waitFor(`${importDialog}?.querySelector('.photo-import-review')`);
 await browser.waitFor(`!${importDialog}.querySelector('.photo-import-footer .gmi-primary-control').disabled`);
 await clickImport(browser,await browser.evaluate(`${importDialog}.querySelector('.photo-import-footer .gmi-primary-control').textContent`));
 await browser.waitFor('!document.querySelector(".photo-collection-dialog[open]") && document.querySelector(".photo-workspace-shell")');
}

export async function retainGmlInWorkspace(browser, file) {
 await stagePhotoSource(browser,file,'gml'); await savePhotoSource(browser,'gml'); await closePhotoSources(browser);
}
