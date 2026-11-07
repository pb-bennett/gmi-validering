import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { unzipSync, strFromU8 } from 'fflate';
import { exportFixture } from './helpers/photoExportFixtures.mjs';
import { geminiGoldenFixture, normalizeGeminiIdentifiers, readGeminiGolden } from './helpers/photoExportGolden.mjs';
import { formatPhotoExportTimestamp, photoExportNames, sanitizePhotoExportLabel, PHOTO_EXPORT_LABEL_MAX_LENGTH } from '../src/lib/photos/export/photoExportNaming.mjs';
import { PHOTO_EXPORT_PROFILES } from '../src/lib/photos/export/exportContract.mjs';
import { buildPhotoExportPackage } from '../src/lib/photos/export/photoExportPackage.mjs';
import { serializePhotoExport } from '../src/lib/photos/export/photoExportXml.mjs';

const instant = new Date('2026-11-07T14:35:00Z');
const fixedClock = { now: () => instant };
const unzip = async (plan) => unzipSync(new Uint8Array(await (await buildPhotoExportPackage(plan)).arrayBuffer()));

test('the timestamp is Oslo wall-clock time across summer time, winter time and midnight', () => {
  for (const [iso, expected] of [
    ['2026-11-07T14:35:00Z', '20261107-153500'],
    ['2026-07-01T14:35:09Z', '20260701-163509'],
    ['2026-03-29T00:59:59Z', '20260329-015959'],
    ['2026-03-29T01:00:00Z', '20260329-030000'],
    ['2026-12-31T23:00:00Z', '20270101-000000'],
  ]) assert.equal(formatPhotoExportTimestamp(new Date(iso)), expected, iso);
});

test('the timestamp does not follow the machine timezone', () => {
  // A child process, because the formatter is built on import and would otherwise keep this machine's zone.
  const script = `import { formatPhotoExportTimestamp as f } from ${JSON.stringify(new URL('../src/lib/photos/export/photoExportNaming.mjs', import.meta.url).href)}; console.log(f(new Date('2026-11-07T14:35:00Z')));`;
  for (const TZ of ['Asia/Tokyo', 'America/New_York', 'UTC']) {
    const { stdout, status } = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(status, 0);
    assert.equal(stdout.trim(), '20261107-153500', TZ);
  }
});

test('an empty label gives the timestamp alone, and ZIP and GML always share one basename', () => {
  for (const label of ['', '   ', undefined, null, '...', '/\\', '日本語']) {
    const names = photoExportNames({ label, date: instant });
    assert.equal(names.basename, '20261107-153500', String(label));
    assert.equal(names.zipFilename, '20261107-153500.zip');
    assert.equal(names.gmlFilename, '20261107-153500.gml');
  }
  const names = photoExportNames({ label: 'Torkopp PS', date: instant });
  assert.equal(names.zipFilename, '20261107-153500-Torkopp-PS.zip');
  assert.equal(names.gmlFilename, '20261107-153500-Torkopp-PS.gml');
  assert(Object.isFrozen(names));
});

test('the label as entered stays apart from the filename form', () => {
  const names = photoExportNames({ label: '  Grøft / nord  ', date: instant });
  assert.equal(names.label, '  Grøft / nord  ');
  assert.equal(names.sanitizedLabel, 'Groeft-nord');
});

test('labels are reduced to safe filename text', () => {
  for (const [label, expected] of [
    ['  Torkopp PS  ', 'Torkopp-PS'],
    ['Torkopp   -  PS', 'Torkopp-PS'],
    ['--Torkopp--', 'Torkopp'],
    ['fase_2.v3', 'fase-2-v3'],
    ['Skøyen Ærøy Åsane', 'Skoeyen-Aeroey-Aasane'],
    ['blåbærsyltetøy', 'blaabaersyltetoey'],
    ['Å\u0308 a\u030A', 'Aa-aa'],
    ['a\u030As', 'aas'],
    ['Crème brûlée', 'Creme-brulee'],
    ['ÅS', 'AaS'],
    ['../../etc/passwd', 'etc-passwd'],
    ['..\\..\\Windows\\System32', 'Windows-System32'],
    ['C:\\temp\\x.zip', 'C-temp-x-zip'],
    ['a<b>c:d"e/f\\g|h?i*j', 'a-b-c-d-e-f-g-h-i-j'],
    ['a\u0000b\u0007c\nd\te', 'a-b-c-d-e'],
    ['trailing dot.', 'trailing-dot'],
    ['／ｅｔｃ／', 'etc'],
    ['CON', 'CON'],
    ['🙂 prosjekt 🙂', 'prosjekt'],
  ]) assert.equal(sanitizePhotoExportLabel(label), expected, JSON.stringify(label));
});

test('every label yields a name that needs no further escaping', () => {
  const labels = ['..', '../..', '.gml', 'a/../b', '\\\\server\\share', 'NUL.txt', ' . ', 'æ'.repeat(500), '%2e%2e%2f', 'x'.repeat(5000), '\ud800'];
  for (const label of labels) {
    const { zipFilename, gmlFilename } = photoExportNames({ label, date: instant });
    assert.match(zipFilename, /^\d{8}-\d{6}(?:-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)?\.zip$/, label);
    assert.equal(gmlFilename, zipFilename.replace(/\.zip$/, '.gml'));
  }
});

test('long labels are bounded and never end on a separator', () => {
  assert.equal(sanitizePhotoExportLabel('x'.repeat(200)).length, PHOTO_EXPORT_LABEL_MAX_LENGTH);
  const cut = sanitizePhotoExportLabel(`${'x'.repeat(PHOTO_EXPORT_LABEL_MAX_LENGTH - 1)} tail`);
  assert.equal(cut, 'x'.repeat(PHOTO_EXPORT_LABEL_MAX_LENGTH - 1));
  // Bounded after transliteration, so letters that widen cannot overshoot.
  assert.equal(sanitizePhotoExportLabel('ø'.repeat(200)).length, PHOTO_EXPORT_LABEL_MAX_LENGTH);
});

for (const profile of Object.keys(PHOTO_EXPORT_PROFILES)) {
  test(`${profile}: the label names the package and changes nothing inside it`, async () => {
    const f = await exportFixture({ names: ['Grøft æ image.png', 'ordinary.png'] });
    try {
      const plain = await f.plan({ profile }, fixedClock);
      const labelled = await f.plan({ profile, label: 'Torkopp PS' }, fixedClock);
      assert.equal(labelled.profile, profile);
      assert.deepEqual(labelled.errors, []);
      assert.equal(plain.naming.gmlFilename, '20261107-153500.gml');
      assert.equal(labelled.naming.gmlFilename, '20261107-153500-Torkopp-PS.gml');
      assert.equal(labelled.naming.zipFilename, '20261107-153500-Torkopp-PS.zip');

      assert.deepEqual(labelled.attachments, plain.attachments);
      const zip = await unzip(labelled);
      assert.deepEqual(Object.keys(zip), [labelled.naming.gmlFilename, ...labelled.attachments.map((row) => row.path)]);
      const xml = strFromU8(zip[labelled.naming.gmlFilename]);
      assert.equal(xml, serializePhotoExport(labelled));
      assert(!xml.includes('Torkopp') && !xml.includes('20261107-153500'), 'the name stays out of the data');
      assert.equal(normalizeGeminiIdentifiers(xml), normalizeGeminiIdentifiers(serializePhotoExport(plain)));
      const separator = profile === 'gemini-legacy2019' ? '\\' : '/';
      for (const attachment of labelled.attachments) {
        assert(attachment.path.startsWith('Attachments/'));
        assert(xml.includes(`<app:fotolink>Attachments${separator}${attachment.filename}</app:fotolink>`));
        assert.deepEqual(zip[attachment.path], new Uint8Array(await labelled.assets.find((asset) => asset.assetId === attachment.assetId).file.arrayBuffer()));
      }
    } finally { f.session.clear(); }
  });
}

test('the Gemini golden output is the same with a label', async () => {
  const f = await geminiGoldenFixture('time-seconds');
  try {
    const plan = await f.plan({ profile: 'gemini-legacy2019', label: 'Grøft / nord' }, fixedClock);
    assert.equal(normalizeGeminiIdentifiers(serializePhotoExport(plan)), await readGeminiGolden('time-seconds'));
  } finally { f.session.clear(); }
});

test('preview and download use the one name the plan was given', async () => {
  const f = await exportFixture();
  try {
    let reads = 0;
    const clock = { now: () => new Date(instant.getTime() + 1000 * reads++) };
    const plan = await f.plan({ profile: 'legacy2019', label: 'Torkopp' }, clock);
    assert.equal(reads, 1, 'one clock read per generated export');
    const previewed = plan.naming.zipFilename;
    const first = await unzip(plan), second = await unzip(plan);
    assert.equal(reads, 1, 'building the package does not read the clock');
    assert.equal(plan.naming.zipFilename, previewed);
    assert.deepEqual(Object.keys(first), Object.keys(second));
    assert(plan.naming.gmlFilename in first);
    assert(Object.isFrozen(plan.naming));

    const next = await f.plan({ profile: 'legacy2019', label: 'Torkopp' }, clock);
    assert.equal(next.naming.zipFilename, '20261107-153501-Torkopp.zip', 'a new preview is a new export');
    assert.equal(plan.naming.zipFilename, previewed);
  } finally { f.session.clear(); }
});

test('the Gemini import guidance names the GML actually in the package', async () => {
  const f = await exportFixture();
  try {
    const plan = await f.plan({ profile: 'gemini-legacy2019', label: 'Torkopp PS' }, fixedClock);
    assert.match(plan.warnings.find((warning) => warning.code === 'compatibility-import').message, /Importer 20261107-153500-Torkopp-PS\.gml med Attachments-mappen/);
  } finally { f.session.clear(); }
});

test('a plan built without a label or a clock still gets a timestamped name', async () => {
  const f = await exportFixture();
  try {
    const { naming } = await f.plan();
    assert.match(naming.zipFilename, /^\d{8}-\d{6}\.zip$/);
    assert.equal(naming.label, '');
  } finally { f.session.clear(); }
});
