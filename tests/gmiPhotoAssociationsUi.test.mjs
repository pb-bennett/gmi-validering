import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { gmiFile, realGrammarFamilies, sharedGuids, sharedFilename, sevenGuid } from './helpers/gmiPhotoFixtures.mjs';
import { extractHyperlinkFilenames } from '../src/lib/hyperlinkFilenames.mjs';

const app = process.env.PHOTO_UI_URL, corpus = process.env.GMI_PHOTO_CORPUS;
const dialog = 'document.querySelector(".photo-gmi-dialog")';
const spatial = 'document.querySelector(".photo-spatial-inspector")';
const inspector = 'document.querySelector(".photo-gmi-inspector")';
const link = (filename) => `h:1(link:"Attachments\\${filename}") `;

function actions(browser) {
  let welcomeResetInstalled = false;
  const click = (text, scope = 'document') => browser.evaluate(`(() => {
    const button=Array.from(${scope}.querySelectorAll('button')).find(e=>e.innerText.trim()===${JSON.stringify(text)});
    if(!button || button.disabled) throw new Error('Unavailable: '+${JSON.stringify(text)}); button.click(); })()`);
  const input = async (selector, files) => {
    const { root } = await browser.send('DOM.getDocument');
    const { nodeId } = await browser.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    assert(nodeId, selector); await browser.send('DOM.setFileInputFiles', { nodeId, files });
  };
  const summary = () => browser.evaluate(`Object.fromEntries(Array.from(${dialog}.querySelectorAll('dl > div')).map(e=>[e.querySelector('dt').innerText,Number(e.querySelector('dd').innerText)]))`);
  const open = async (gmi) => {
    await click('Koble GMI-referanser'); await browser.waitFor(`${dialog}?.open`);
    await input('input[aria-label="Velg GMI med bildereferanser"]', [gmi]);
    await browser.waitFor(`${dialog}.querySelector('.photo-gmi-summary')`);
  };
  const select = async (filename) => {
    await browser.evaluate(`document.querySelector(${JSON.stringify(`.photo-workspace-list button[aria-label="Vis ${filename}"]`)}).click()`);
    await browser.waitFor(`document.querySelector('.photo-workspace-inspector h3').innerText===${JSON.stringify(filename)}`);
  };
  const start = async () => {
    if (!welcomeResetInstalled) {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear();' });
      welcomeResetInstalled = true;
    }
    await browser.send('Page.navigate', { url: app + '?testmodus=1' });
    await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
    await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
  };
  const create = async (photos, gml) => {
    await click('Bilder'); await browser.waitFor('document.querySelector(".photo-collection-dialog[open]")');
    await input('input[aria-label="Velg bildefiler"]', photos);
    if (gml) { await input('input[aria-label="Velg GML med bildeposisjoner"]', [gml]); await browser.waitFor('document.querySelector(".photo-collection-dialog").innerText.includes("1 treff")'); }
    await browser.waitFor(`!document.querySelector('.photo-collection-notice [role=status]').innerText.includes('Lager miniatyrbilder')`, 60000);
    await click(`Opprett fotokartlag (${photos.length} bilder)`);
    await click('Bildemodul'); await browser.waitFor('document.querySelector(".photo-workspace-shell")');
  };
  return { click, input, summary, open, select, start, create };
}

test('GMI association workflow: confirmation/cancel, many-to-many, invalid/unmatched/ambiguous, revisions, append/recheck and position independence across desktop layouts',
  { skip: !chromePath || !app, timeout: 240000 }, async () => {
    const tempRoot = path.resolve(tmpdir()), directory = await mkdtemp(path.join(tempRoot, 'gmi-associations-ui-'));
    const browser = await openTestChrome(), { click, input, summary, open, select, start, create } = actions(browser);
    const unicode = '2025-11-19-10-29-53_f62b2a214bbb18b919f14b049484e1_Skjøte_hull_semsveien.jpg';
    const seven = extractHyperlinkFilenames(realGrammarFamilies[11]);
    const names = [sharedFilename, ...seven, unicode, 'line.jpeg'];
    const paths = names.map((name) => path.join(directory, name));
    // The GPS PNG helper is a fully decodable bitmap. The JPEG helper is an
    // EXIF-only structure and deliberately has no displayable pixels.
    const bytes = gpsPng();
    await Promise.all(paths.map((filename) => writeFile(filename, bytes)));
    for (const folder of ['A', 'B']) {
      await mkdir(path.join(directory, folder)); const filename = path.join(directory, folder, 'duplicate.jpg');
      await writeFile(filename, bytes); paths.push(filename);
    }
    const objects = [
      ...sharedGuids.map((guid, index) => ({ guid, parserId: index ? 22 : 20, label: `Shared-${index + 1}`, hyperlink: link(sharedFilename) })),
      { guid: sevenGuid, parserId: 257, tema: 'LOK', hyperlink: realGrammarFamilies[11] },
      { parserId: 400, type: 'DOVG', hyperlink: link(unicode) },
      { parserId: 401, type: 'DFOT', hyperlink: link('later.jpg') },
      { parserId: 402, hyperlink: String.raw`h:1(link:"Attachments\") ` },
      { parserId: 403, hyperlink: link('duplicate.jpg') },
      { parserId: 404, scope: 'line', type: 'arbitrary', hyperlink: link('line.jpeg') },
    ];
    const gmi = path.join(directory, 'associations.gmi'); await writeFile(gmi, Buffer.from(await gmiFile(objects).arrayBuffer()));
    const gml = path.join(directory, 'positions.gml');
    await writeFile(gml, `<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:app="http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101"><gml:boundedBy><gml:Envelope srsName="EPSG:5972"/></gml:boundedBy><gml:featureMember><app:Skråfoto gml:id="shared"><app:fotolink>${sharedFilename}</app:fotolink><app:fotograferingspunkt><gml:Point srsDimension="3"><gml:pos>581930 6566000 0</gml:pos></gml:Point></app:fotograferingspunkt></app:Skråfoto></gml:featureMember></gml:FeatureCollection>`);
    const evidence = () => browser.evaluate(`({ position:Array.from(${spatial}.querySelectorAll('p')).find(e=>e.innerText.includes('(WGS84)'))?.innerText,
      direction:document.querySelector('.photo-direction-accepted').innerText,
      candidates:Array.from(${spatial}.querySelectorAll('pre')).map(e=>e.textContent),
      image:document.querySelector('.photo-collection-original img')?.src })`);
    const showAssociations = async () => browser.evaluate(`${inspector}.querySelectorAll('details').forEach(e=>e.open=true)`);
    try {
      await browser.send('Emulation.setDeviceMetricsOverride', { width:1680, height:900, deviceScaleFactor:1, mobile:false });
      await start(); await create(paths, gml); await select(sharedFilename);
      await browser.waitFor(`${spatial}.innerText.includes('Gjeldende posisjon (GML)')`);
      await click('Juster retning');
      await browser.evaluate(`(() => {const input=document.querySelector('.photo-direction-editor input[type=number]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'123'); input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await click('Bruk retning'); await browser.waitFor('!document.querySelector(".photo-direction-editor")');
      const before = await evidence();
      await open(gmi);
      assert.deepEqual(await summary(), { 'Objekter analysert':8, 'Objekter med bildereferanser':7, 'Referanser funnet':14,
        'Matchet (referanser)':11, 'Matchet til bilder':10, 'Ikke matchet':1, 'Tvetydig':1, 'Ugyldig referanse':1 });
      for (const [width,height] of [[1680,900],[1366,768],[1280,720],[1024,768],[1440,600]]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width,height,deviceScaleFactor:1,mobile:false });
        const box = await browser.evaluate(`({dialog:${dialog}.getBoundingClientRect().toJSON(),footer:${dialog}.querySelector('footer').getBoundingClientRect().toJSON(),
          scroll:${dialog}.querySelector('.photo-gmi-content').scrollWidth,client:${dialog}.querySelector('.photo-gmi-content').clientWidth})`);
        assert(box.dialog.left>=0 && box.dialog.right<=width && box.dialog.top>=0 && box.dialog.bottom<=height);
        assert(box.footer.bottom<=height && box.scroll<=box.client+1);
        if (process.env.PHOTO_SCREENSHOT_DIR) {
          await mkdir(process.env.PHOTO_SCREENSHOT_DIR,{recursive:true});
          const { data } = await browser.send('Page.captureScreenshot',{format:'png'});
          await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR,`gmi-review-${width}x${height}.png`),Buffer.from(data,'base64'));
        }
      }
      await browser.evaluate(`${dialog}.querySelectorAll('details').forEach(e=>e.open=true)`);
      const details = await browser.evaluate(`${dialog}.innerText`);
      assert(details.includes('Målet er en mappe uten filnavn.')); assert(details.includes(unicode));
      assert(details.includes('associations.gmi')); assert(details.includes('2 mulige bilder i laget'));
      await click('Avbryt', dialog); await browser.waitFor(`!${dialog}`);
      assert.equal(await browser.evaluate(inspector), null); assert.equal(await browser.evaluate('document.querySelector(".photo-workspace-gmi-sources")'), null);
      assert.deepEqual(await evidence(), before);
      await open(gmi); await click('Bekreft GMI-koblinger', dialog); await browser.waitFor(`!${dialog}`);
      await showAssociations();
      assert((await browser.evaluate(`${inspector}.innerText`)).includes('2 objekter'));
      for (const guid of sharedGuids) assert((await browser.evaluate(`${inspector}.innerText`)).includes(guid));
      assert.deepEqual(await evidence(), before);
      assert.equal(await browser.evaluate(`document.querySelectorAll('button[aria-label="Fjern lag"]').length`), 0);
      for (const filename of seven) {
        await select(filename); await showAssociations();
        assert((await browser.evaluate(`${inspector}.innerText`)).includes(sevenGuid));
        assert((await browser.evaluate(`${spatial}.innerText`)).includes('Uplassert'));
      }
      await select(sharedFilename); await showAssociations();
      await click('Bruk EXIF-posisjon', spatial); assert((await browser.evaluate(`${spatial}.innerText`)).includes('Gjeldende posisjon (EXIF)'));
      assert((await browser.evaluate(`${inspector}.innerText`)).includes('2 objekter'));
      await click('Bruk GML-posisjon', spatial);
      await click('Flytt på kartet');
      const mapBox = await browser.evaluate('document.querySelector(".leaflet-container").getBoundingClientRect().toJSON()');
      const x = mapBox.left + mapBox.width / 2 + 60, y = mapBox.top + mapBox.height / 2 + 30;
      await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
      await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});
      await browser.waitFor('document.querySelector(".photo-proposed-marker")');
      await browser.evaluate('document.querySelector(".photo-proposed-marker").focus()');
      await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',windowsVirtualKeyCode:39});
      await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',windowsVirtualKeyCode:39});
      await click('Bruk plassering'); await browser.waitFor(`${spatial}.innerText.includes('Gjeldende posisjon (Manuell)')`);
      assert.equal(await browser.evaluate('document.querySelector(".photo-direction-accepted").innerText'), '123°');
      assert((await browser.evaluate(`${inspector}.innerText`)).includes('2 objekter'));
      await browser.evaluate('document.querySelector(".photo-preview-open").click()'); await browser.waitFor('document.querySelector(".photo-image-viewer[open]")');
      await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',windowsVirtualKeyCode:27});
      await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',windowsVirtualKeyCode:27});
      await browser.waitFor('!document.querySelector(".photo-image-viewer")');
      // Explicit append + recheck, with no automatic association on append.
      const later = path.join(directory, 'later.jpg'); await writeFile(later, bytes);
      await click('Legg til bilder'); await input('input[aria-label="Velg bildefiler"]', [later]);
      await click('Legg til 1 bilde i laget'); await select('later.jpg'); assert.equal(await browser.evaluate(inspector), null);
      await browser.evaluate('document.querySelector(".photo-workspace-gmi-sources > details").open=true');
      await click('Sjekk GMI-referanser på nytt'); await browser.waitFor(`${dialog}.querySelector('.photo-gmi-summary')`);
      assert.equal((await summary())['Ikke matchet'], 0); assert.equal((await summary()).Tvetydig, 1);
      await click('Bekreft GMI-koblinger', dialog); await browser.waitFor(inspector);
      await showAssociations(); assert((await browser.evaluate(`${inspector}.innerText`)).includes('TYPE: DFOT'));
      // Same byte revision reimport becomes a recheck, without duplicating objects.
      await open(gmi); await click('Bekreft GMI-koblinger', dialog); await browser.waitFor(`!${dialog}`);
      assert((await browser.evaluate(`${inspector}.innerText`)).includes('1 objekt'));
      const revised = path.join(directory,'revision.gmi');
      await writeFile(revised, Buffer.from(await gmiFile(objects.map((object)=>({...object,xyz:'581940 6566005 1'}))).arrayBuffer()));
      await open(revised); await click('Bekreft GMI-koblinger', dialog); await browser.waitFor(`!${dialog}`);
      await select(sharedFilename); await showAssociations();
      assert((await browser.evaluate(`${inspector}.innerText`)).includes('4 objekter'));
      assert((await browser.evaluate(`${inspector}.innerText`)).includes('revision.gmi'));
      await click('Fjern GMI-kilde'); await click('Fjern fra lag','document.querySelector(".photo-remove-confirmation")');
      await showAssociations(); assert((await browser.evaluate(`${inspector}.innerText`)).includes('2 objekter'));
      await click('Fjern GMI-kilde'); await click('Fjern fra lag','document.querySelector(".photo-remove-confirmation")');
      await browser.waitFor(`!${inspector}`);
      console.log(JSON.stringify({ gmiBrowserAcceptance:'synthetic images with pinned real reference evidence', layouts:['1680x900','1366x768','1280x720','1024x768','1440x600'],
        checks:'analysis/summary, explicit confirmation/cancel, 2-object photo, 7-photo object, Unicode, invalid directory, unmatched/ambiguous, unchanged positions/direction/preview, GML/EXIF/manual, lightbox, append/recheck, duplicate source, revisions, removal, no GMI map layer' }));
    } catch (error) {
      console.log(await browser.evaluate(`({dialog:${dialog}?.innerText, spatial:${spatial}?.innerText, errors:document.body.innerText.slice(-1500)})`));
      console.log(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown').map((event) => event.params.exceptionDetails.exception?.description));
      throw error;
    } finally {
      await browser.close();
      if(path.dirname(path.resolve(directory))!==tempRoot || !path.basename(directory).startsWith('gmi-associations-ui-')) throw new Error('Unsafe temporary fixture path');
      await rm(directory,{recursive:true,force:true});
    }
  });

test('private G01/G04 browser: real GMI sources and photos, 94/31 matched occurrences, directory rejection and many-to-many inspector',
  { skip: !chromePath || !app || !corpus, timeout: 240000 }, async () => {
    const browser = await openTestChrome(), { click, summary, open, select, start, create } = actions(browser);
    try {
      for (const [relative, matched, filename, expectedObjects] of [
        ['20260903/1200 Asbuild VA Leveranse Lerkeveien.gmi',94,sharedFilename,2],
        ['Gipø buss/Anleggsrapport/03 - INNMÅLINGER/As-built VA - Gipø Buss.gmi',31,'64320.JPEG',1],
      ]) {
        await start();
        const gmi = path.join(corpus, relative), folder = path.join(path.dirname(gmi),'Attachments');
        const photos = (await readdir(folder)).filter((name)=>/\.jpe?g$/i.test(name)).map((name)=>path.join(folder,name));
        await create(photos); await select(filename);
        await open(gmi);
        assert.equal((await summary())['Matchet (referanser)'],matched);
        assert.equal((await summary())['Ugyldig referanse'],matched===94 ? 1 : 0);
        await click('Bekreft GMI-koblinger',dialog); await browser.waitFor(inspector);
        await browser.evaluate(`${inspector}.querySelectorAll('details').forEach(e=>e.open=true)`);
        const text = await browser.evaluate(`${inspector}.innerText`);
        assert(text.includes(`${expectedObjects} ${expectedObjects===1?'objekt':'objekter'}`));
        assert(text.includes(path.basename(gmi)));
        assert((await browser.evaluate(`${spatial}.innerText`)).includes('Uplassert'));
        assert.equal(await browser.evaluate('document.querySelector(".photo-direction-accepted").innerText'),'Ikke angitt');
        assert.equal(await browser.evaluate(`document.querySelectorAll('button[aria-label="Fjern lag"]').length`),0);
        console.log(JSON.stringify({realGmiBrowser:relative,photos:photos.length,matchedReferences:matched,inspectedObjects:expectedObjects}));
      }
    } finally { await browser.close(); }
  });
