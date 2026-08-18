import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  claimStatisticsCue,
  getStatisticsCueCount,
} from '../src/lib/statisticsCue.mjs';

const read = (relativePath) =>
  fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

function createStorage(value) {
  const values = new Map(value === undefined ? [] : [['statisticsCueCount', value]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, nextValue) => values.set(key, nextValue),
    value: () => values.get('statisticsCueCount'),
  };
}

test('statistics cue claims the first three loads only', () => {
  const storage = createStorage();

  assert.equal(claimStatisticsCue(storage), true);
  assert.equal(storage.value(), '1');
  assert.equal(claimStatisticsCue(storage), true);
  assert.equal(storage.value(), '2');
  assert.equal(claimStatisticsCue(storage), true);
  assert.equal(storage.value(), '3');
  assert.equal(claimStatisticsCue(storage), false);
  assert.equal(storage.value(), '3');
});

test('statistics cue treats missing and malformed values as zero', () => {
  assert.equal(getStatisticsCueCount(null), 0);
  assert.equal(getStatisticsCueCount('not-a-count'), 0);
  assert.equal(getStatisticsCueCount('1.5'), 0);
  assert.equal(claimStatisticsCue(createStorage('not-a-count')), true);
});

test('statistics cue fails safely when session storage is unavailable', () => {
  assert.equal(claimStatisticsCue(null), false);
  assert.equal(
    claimStatisticsCue({
      getItem() {
        throw new Error('storage unavailable');
      },
      setItem() {
        throw new Error('storage unavailable');
      },
    }),
    false,
  );
});

test('statistics button keeps its label, badge, open behavior, and cue styles', () => {
  const page = read('src/app/page.js');
  const styles = read('src/app/globals.css');

  assert.match(page, /onClick=\{\(\) => setShowStats\(true\)\}/);
  assert.match(page, />Statistikk<\/span>/);
  assert.match(page, /statistics-button__badge/);
  assert.match(page, />Ny<\/span>/);
  assert.match(page, /window\.sessionStorage/);
  assert.match(page, /prefers-reduced-motion: reduce/);
  assert.match(styles, /statistics-button-entrance 1\.55s/);
  assert.match(styles, /scale\(0\.92\)/);
  assert.match(styles, /scale\(1\.1\)/);
  assert.match(styles, /statistics-button-ripple/);
  assert.match(styles, /#db2777|#ec4899/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(styles, /animation-iteration-count:\s*infinite|animation:\s*[^;]*infinite/);
});
