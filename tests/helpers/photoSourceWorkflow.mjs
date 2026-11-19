import assert from 'node:assert/strict';

export const sourceWizard = 'document.querySelector(".photo-positioning-wizard")';
// Former FOTO sidebar actions now live in the workspace Verktøy menu.
export const PHOTO_TOOL_LABELS = Object.freeze({
  'Legg til bilder': 'Legg til bilder…', 'Koble og posisjoner bilder': 'Koble og posisjoner bilder…', Eksporter: 'Eksporter…',
  'Juster plassering og retning': 'Juster plassering og retning', 'Kilder og koblinger': 'Kilder og koblinger', 'Fjern bilder fra laget': 'Fjern bilder fra laget…',
  'Fullfør opplysninger': 'Fullfør opplysninger…',
  'Velg bilder som ikke skal med': 'Velg bilder som ikke skal med…',
});
// Delivery colouring is the workspace default; provenance-specific checks choose «Plasseringskilde» explicitly.
export const setPhotoColourMode = (browser, value) => browser.evaluate(`(() => { const select = document.querySelector('.photo-map-display-card select');
  if (!select) throw new Error('No colour selector'); if (select.value === ${JSON.stringify(value)}) return;
  select.value = ${JSON.stringify(value)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
// Visible text first, then the accessible name of icon-only controls; workspace tools open through Verktøy.
export const clickSourceControl = (browser, label, scope = sourceWizard) => browser.evaluate(`(async () => {
  const label=${JSON.stringify(label)}, root=${scope}, tools=${JSON.stringify(PHOTO_TOOL_LABELS)};
  const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));
  const find=()=>{const buttons=Array.from(root.querySelectorAll('button'));
    return buttons.find(item=>item.innerText.trim()===label) || buttons.find(item=>item.getAttribute('aria-label')===label);};
  let button=find();
  // Pass 1B moved the new-photo-layer import out of the shared header into the layer list («Legg til bilder»).
  // Outside the workspace the old «Bilder» entry is the same action; inside it there is no such shortcut.
  if(!button && label==='Bilder' && root===document && !document.querySelector('.photo-workspace-shell'))
    button=document.querySelector('.layer-manager-add-actions button[aria-haspopup=dialog]');
  const tool=tools[label] || (Object.values(tools).includes(label) ? label : null);
  if((!button || button.closest('.photo-tools-popup')) && tool && root===document && document.querySelector('.photo-tools-trigger')){
    const trigger=document.querySelector('.photo-tools-trigger');
    if(trigger.getAttribute('aria-expanded')!=='true') trigger.click();
    for(let i=0;i<30 && !document.querySelector('.photo-tools-popup');i++) await frame();
    button=Array.from(document.querySelectorAll('.photo-tools-popup [role=menuitem]')).find(item=>item.querySelector('.photo-tools-item-label').innerText.trim()===tool);
  }
  if(!button || button.disabled || button.getAttribute('aria-disabled')==='true') throw new Error('Unavailable source control: '+label);
  button.click();
})()`);

export async function setPhotoFiles(browser, selector, files) {
  const { root } = await browser.send('DOM.getDocument');
  const { nodeId } = await browser.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  assert(nodeId, selector);
  await browser.send('DOM.setFileInputFiles', { nodeId, files });
}

export async function openPhotoSources(browser) {
  await clickSourceControl(browser, 'Koble og posisjoner bilder', 'document');
  await browser.waitFor(`${sourceWizard}?.open`);
}

// Closes the wizard: after «Lagre endringer» it closes at once; before it, a draft is discarded through the guard.
export async function closePhotoSources(browser) {
  await browser.evaluate(`${sourceWizard}.querySelector('header button').click()`);
  if (await browser.evaluate('Boolean(document.querySelector("dialog[open][data-gmi-confirm=positioning-draft]"))')) await browser.evaluate("Array.from(document.querySelector('[data-gmi-confirm=positioning-draft]').querySelectorAll('button')).find(e=>e.innerText==='Forkast endringer').click()");
  await browser.waitFor(`!${sourceWizard}`);
}

// A wizard left open on «Endringer lagret» is closed and opened again, so the next transaction starts fresh.
async function freshPhotoSources(browser) {
  if (await browser.evaluate(`Boolean(${sourceWizard}?.dataset.saved)`)) await closePhotoSources(browser);
  if (!await browser.evaluate(`Boolean(${sourceWizard})`)) await openPhotoSources(browser);
}

export async function stagePhotoSource(browser, file, kind = 'gml') {
  await freshPhotoSources(browser);
  while (await browser.evaluate(`${sourceWizard}.dataset.step !== '1'`)) await clickSourceControl(browser, 'Tilbake');
  await browser.evaluate(`${sourceWizard}.querySelector('input[name=photo-external-source][value=${kind}]').click()`);
  await setPhotoFiles(browser, `input[aria-label="Velg ${kind.toUpperCase()}-kilde"]`, [file]);
  await browser.waitFor(`${sourceWizard}.querySelector('section[aria-label="Kontroller koblinger"]') && !${sourceWizard}.innerText.includes('Analyserer kilden')`);
}

// B: «Ta med kilden» / «Ta med kilde og koblinger» stage the reviewed source in the wizard draft. Nothing is saved.
export async function includePhotoSource(browser, kind = 'gml') {
  const label = kind === 'gmi' ? 'Ta med kilde og koblinger' : 'Ta med kilden';
  await clickSourceControl(browser, label);
  await browser.waitFor(`!${sourceWizard}?.querySelector('[data-positioning-stage]') && !${sourceWizard}.innerText.includes('Forkast kilden')`);
}

// Kontroll → «Lagre endringer» → the wizard stays open on «Endringer lagret» with its receipt.
export async function saveSourceWizardChanges(browser, { keepPositions = false } = {}) {
  if (await browser.evaluate(`${sourceWizard}.dataset.step !== '4'`)) {
    for (let i = 0; i < 4 && await browser.evaluate(`${sourceWizard}.dataset.step !== '3'`); i++) await clickSourceControl(browser, 'Neste');
    await browser.waitFor(`${sourceWizard}.dataset.step === '3'`);
    if (keepPositions) await clickSourceControl(browser, 'Behold alle gjeldende');
    await clickSourceControl(browser, 'Neste');
    await browser.waitFor(`${sourceWizard}.dataset.step === '4'`);
  }
  const stepLabels = `Array.from(${sourceWizard}.querySelectorAll('.photo-import-steps > li')).map((li) => li.innerText.replace(/\\s+/g, ' ').trim())`;
  const before = await browser.evaluate(stepLabels);
  await clickSourceControl(browser, 'Lagre endringer');
  await browser.waitFor(`${sourceWizard}?.dataset.saved && ${sourceWizard}.querySelector('[data-positioning-receipt]')`);
  // B1.3: Endringer lagret shows the steps the saved workflow had; a skipped Koblinger step does not reappear.
  const after = await browser.evaluate(stepLabels);
  if (after.length !== before.length) throw new Error(`Receipt steps ${JSON.stringify(after)} differ from the workflow's ${JSON.stringify(before)}`);
}

// A source saved on its own, as a connection-only (or metadata-only) transaction: include it, keep every current
// position, and save. The wizard is left open on its receipt.
export async function savePhotoSource(browser, kind = 'gml') {
  await includePhotoSource(browser, kind);
  await saveSourceWizardChanges(browser, { keepPositions: true });
}

// Existing regression suites explicitly establish the accepted baseline they test.
// This uses the same review/summary/apply path as a user, never internal session APIs.
export async function applyPhotoSourcePositions(browser, kind = 'gml', { photoId = null, filename = null, sourceFilename = null } = {}) {
  const entered = !await browser.evaluate('Boolean(document.querySelector(".photo-workspace-shell"))');
  if (entered) {
    await clickSourceControl(browser, 'Åpne FOTO', 'document');
    await browser.waitFor('document.querySelector(".photo-workspace-shell")');
  }
  await freshPhotoSources(browser);
  if (!await browser.evaluate(`Boolean(${sourceWizard}.querySelector('section[aria-label="Kontroller posisjoner"]'))`))
    while (await browser.evaluate(`${sourceWizard}.dataset.step !== '3'`)) await clickSourceControl(browser, 'Neste');
  await browser.waitFor(`${sourceWizard}.querySelector('section[aria-label="Kontroller posisjoner"]')`);
  if (photoId || filename) {
    await clickSourceControl(browser, 'Behold alle gjeldende');
    await browser.evaluate(`(() => {
      const rows=Array.from(${sourceWizard}.querySelectorAll('li[data-photo-id]'));
      const row=rows.find(item=>${photoId ? `item.dataset.photoId===${JSON.stringify(photoId)}` : `item.querySelector('.photo-positioning-filename strong').innerText===${JSON.stringify(filename)}`});
      if(!row)throw new Error('Missing target photo');
      const select=row.querySelector('select'); const option=Array.from(select.options).find(item=>item.text.startsWith(${JSON.stringify(kind.toUpperCase())}) && (!${JSON.stringify(sourceFilename)} || item.text.includes(${JSON.stringify(sourceFilename)})));
      if(!option)throw new Error('Missing source position'); select.value=option.value; select.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
  } else if (sourceFilename) {
    await clickSourceControl(browser, 'Behold alle gjeldende');
    const targets = await browser.evaluate(`Array.from(${sourceWizard}.querySelectorAll('select')).flatMap(select=>{
      const option=Array.from(select.options).find(item=>item.text.startsWith('GML:') && item.text.includes(${JSON.stringify(sourceFilename)}));
      return option ? [{label:select.getAttribute('aria-label'),value:option.value}] : []; })`);
    for (const target of targets) await browser.evaluate(`(() => {const select=Array.from(${sourceWizard}.querySelectorAll('select')).find(item=>item.getAttribute('aria-label')===${JSON.stringify(target.label)});
      select.value=${JSON.stringify(target.value)}; select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  } else await clickSourceControl(browser, `Foreslå ${kind.toUpperCase()} for viste`);
  await clickSourceControl(browser, 'Neste');
  assert.match(await browser.evaluate(`${sourceWizard}.querySelector('[data-kontroll="positions"]').innerText`), /[1-9]d* (bilde|bilder|plassering|plasseringer) valgt/);
  await saveSourceWizardChanges(browser);
  await clickSourceControl(browser, 'Lukk');
  await browser.waitFor(`!${sourceWizard}`);
  if (entered) {
    await clickSourceControl(browser, 'Lukk FOTO', 'document');
    await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
  }
}
