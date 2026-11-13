import assert from 'node:assert/strict';

export const sourceWizard = 'document.querySelector(".photo-positioning-wizard")';
// Former FOTO sidebar actions now live in the workspace Verktøy menu.
export const PHOTO_TOOL_LABELS = Object.freeze({
  'Legg til bilder': 'Legg til bilder…', 'Koble og posisjoner bilder': 'Koble og posisjoner bilder…', Eksporter: 'Eksporter…',
  'Juster plassering og retning': 'Juster plassering og retning', 'Kilder og koblinger': 'Kilder og koblinger', 'Fjern bilder fra laget': 'Fjern bilder fra laget…',
  'Fullfør opplysninger': 'Fullfør opplysninger…', 'Fordel bilder til GMI/GML': 'Fordel bilder til GMI/GML',
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

export async function closePhotoSources(browser) {
  await browser.evaluate(`${sourceWizard}.querySelector('header button').click()`);
  await browser.waitFor(`!${sourceWizard}`);
}

export async function stagePhotoSource(browser, file, kind = 'gml') {
  if (!await browser.evaluate(`Boolean(${sourceWizard})`)) await openPhotoSources(browser);
  if (!await browser.evaluate(`Boolean(${sourceWizard}.querySelector('input[name=photo-external-source]'))`)) {
    const add = await browser.evaluate(`Array.from(${sourceWizard}.querySelectorAll('button')).some(button=>button.innerText.trim()==='Legg til en kilde')`);
    await clickSourceControl(browser, add ? 'Legg til en kilde' : 'Tilbake');
  }
  await browser.evaluate(`${sourceWizard}.querySelector('input[name=photo-external-source][value=${kind}]').click()`);
  await setPhotoFiles(browser, `input[aria-label="Velg ${kind.toUpperCase()}-kilde"]`, [file]);
  await browser.waitFor(`${sourceWizard}.querySelector('section[aria-label="Kontroller koblinger"]') && !${sourceWizard}.innerText.includes('Analyserer kilden')`);
}

export async function savePhotoSource(browser, kind = 'gml') {
  const labels = kind === 'gmi' ? ['Behold kilde og koblinger', 'Oppdater koblinger'] : ['Behold GML-kilden', 'Oppdater treff'];
  const label = await browser.evaluate(`Array.from(${sourceWizard}.querySelectorAll('button')).map(button=>button.innerText.trim()).find(label=>${JSON.stringify(labels)}.includes(label))`);
  assert(label, 'source checkpoint action');
  await clickSourceControl(browser, label);
  await browser.waitFor(`${sourceWizard}?.querySelector('.photo-source-saved') && !${sourceWizard}.innerText.includes('Forkast uspart kilde')`);
}

// Existing regression suites explicitly establish the accepted baseline they test.
// This uses the same review/summary/apply path as a user, never internal session APIs.
export async function applyPhotoSourcePositions(browser, kind = 'gml', { photoId = null, filename = null, sourceFilename = null } = {}) {
  const entered = !await browser.evaluate('Boolean(document.querySelector(".photo-workspace-shell"))');
  if (entered) {
    await clickSourceControl(browser, 'Bildemodul', 'document');
    await browser.waitFor('document.querySelector(".photo-workspace-shell")');
  }
  if (!await browser.evaluate(`Boolean(${sourceWizard})`)) await openPhotoSources(browser);
  if (!await browser.evaluate(`Boolean(${sourceWizard}.querySelector('section[aria-label="Kontroller posisjoner"]'))`))
    await clickSourceControl(browser, 'Kontroller tilgjengelige posisjoner');
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
  const label = await browser.evaluate(`${sourceWizard}.querySelector('footer .photo-positioning-primary').innerText`);
  assert.match(label, /^Bruk valgte posisjoner for [1-9]/);
  await clickSourceControl(browser, label);
  await browser.waitFor(`!${sourceWizard}`);
  if (entered) {
    await clickSourceControl(browser, 'Tilbake til appen', 'document');
    await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
  }
}
