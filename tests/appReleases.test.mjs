import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  APP_RELEASES,
  CURRENT_APP_RELEASE,
  CURRENT_APP_VERSION,
  LATEST_ANNOUNCED_RELEASE,
} from '../src/data/appReleases.mjs';

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const compareVersions = (left, right) => {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
};

const isValidIsoDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return date.toISOString().slice(0, 10) === value;
};

const loadPackageMetadata = async () => {
  const [packageJson, packageLock] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../package-lock.json', import.meta.url), 'utf8'),
  ]);
  return { packageJson: JSON.parse(packageJson), packageLock: JSON.parse(packageLock) };
};

test('release catalog is valid, complete, and newest first', () => {
  assert.deepEqual(
    APP_RELEASES.map((release) => release.version),
    ['1.1.0', '1.0.2', '1.0.1', '1.0.0'],
  );
  assert.equal(new Set(APP_RELEASES.map((release) => release.version)).size, APP_RELEASES.length);

  for (const release of APP_RELEASES) {
    assert.match(release.version, SEMVER_PATTERN);
    assert.ok(release.releasedOn === null || isValidIsoDate(release.releasedOn));
    assert.ok(compareVersions(release.version, '1.0.0') >= 0);
    assert.ok(release.title.length > 0);
    assert.ok(release.summary.length > 0);
    assert.ok(Array.isArray(release.changes) && release.changes.length > 0);
    assert.ok(Array.isArray(release.highlights));
    assert.equal(typeof release.announce, 'boolean');
  }

  for (let index = 1; index < APP_RELEASES.length; index++) {
    assert.ok(
      compareVersions(APP_RELEASES[index - 1].version, APP_RELEASES[index].version) > 0,
    );
  }
  assert.equal(CURRENT_APP_RELEASE, APP_RELEASES[0]);
  assert.equal(CURRENT_APP_VERSION, APP_RELEASES[0].version);
  assert.equal(LATEST_ANNOUNCED_RELEASE, APP_RELEASES.find((release) => release.announce));
  assert.equal(CURRENT_APP_VERSION, '1.1.0');
  assert.equal(CURRENT_APP_RELEASE.announce, true);
  assert.equal(APP_RELEASES.length, 4);
  assert.equal(APP_RELEASES[0].type, 'minor');
  assert.equal(APP_RELEASES[0].releasedOn, null);
  assert.equal(APP_RELEASES[0].title, 'Informasjon, nyheter og versjonshistorikk');
  assert.equal(APP_RELEASES[0].announce, true);
  assert.deepEqual(APP_RELEASES[0].news, [
    'GMI Validator har fått en ny informasjonsside med mer om hva verktøyet er, hvorfor det finnes og hvem det er laget for.',
    'Her finner du også nyheter, versjonshistorikk, planer for videre utvikling og informasjon om hvordan data behandles.',
  ]);
  assert.deepEqual(APP_RELEASES[0].changes, [
    'Ny Om-side',
    'Nyheter og versjonshistorikk direkte i appen',
    'Oversikt over planlagt videre utvikling',
    'Bedre informasjon om personvern og databehandling',
    'Offentlig kildekode lettere tilgjengelig',
  ]);
  assert.equal(APP_RELEASES[1].type, 'patch');
  assert.equal(APP_RELEASES[1].releasedOn, '2026-08-24');
  assert.equal(APP_RELEASES[1].title, 'Profilanalyse, stabilitetsretting');
  assert.equal(APP_RELEASES[1].summary, 'Rettet en feil som i enkelte tilfeller kunne føre til at Profilanalyse krasjet under bruk.');
  assert.equal(APP_RELEASES[1].announce, false);
  assert.equal(APP_RELEASES[2].type, 'patch');
  assert.equal(APP_RELEASES[2].releasedOn, '2026-08-19');
  assert.equal(APP_RELEASES[2].title, 'SOSI, stabilitetsretting');
  assert.equal(APP_RELEASES[2].summary, 'Rettet en feil som kunne føre til at SOSI-data ble vist feil etter innlasting.');
  assert.equal(APP_RELEASES[2].announce, false);
  assert.equal(APP_RELEASES[3].releasedOn, null);
  assert.equal(APP_RELEASES[3].title, 'Ny statistikkvisning');
  assert.match(APP_RELEASES[3].highlights[0].description, /filopplastinger/);
  assert.equal(APP_RELEASES[3].announce, false);
  assert.equal(LATEST_ANNOUNCED_RELEASE.version, '1.1.0');
  assert.doesNotMatch(JSON.stringify(APP_RELEASES), /1\.2\.0/);
});

test('catalog and package metadata agree on the application version', async () => {
  const { packageJson, packageLock } = await loadPackageMetadata();
  assert.equal(packageJson.version, CURRENT_APP_VERSION);
  assert.equal(packageLock.version, CURRENT_APP_VERSION);
  assert.equal(packageLock.packages[''].version, CURRENT_APP_VERSION);
});
