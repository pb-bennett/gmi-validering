import assert from 'node:assert/strict';

export const sourceWizard = 'document.querySelector(".photo-positioning-wizard")';
export const clickSourceControl = (browser, label, scope = sourceWizard) => browser.evaluate(`(() => {
  const button=Array.from(${scope}.querySelectorAll('button')).find(item=>item.innerText.trim()===${JSON.stringify(label)});
  if(!button || button.disabled) throw new Error('Unavailable source control: '+${JSON.stringify(label)}); button.click();
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
