import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [modal, css] = await Promise.all([
  readFile(new URL('../src/components/DataDisplayModal.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8'),
]);

const shortDesktop = css.slice(css.indexOf('@media (max-height: 1000px) and (min-width: 1024px)'));

test('tall desktop retains the existing modal height and raw-data presentation', () => {
  assert.match(modal, /data-inspector-dialog[^"\n]*h-\[82%\]/);
  assert.match(modal, /data-inspector-tall-raw text-xs/);
  assert.match(css, /\.data-inspector-highlights,\s*\.data-inspector-compact-raw\s*\{\s*display: none;/);
  assert.match(modal, /data-inspector-target space-y-4/);
});

test('short desktop constrains the frame and gives its body the primary scroll', () => {
  assert.match(shortDesktop, /\.data-inspector-dialog\s*\{[^}]*height: calc\(100dvh - 3rem\);[^}]*max-height: calc\(100dvh - 3rem\);[^}]*min-height: 0;/);
  assert.match(modal, /data-inspector-header flex-none/);
  assert.match(modal, /data-inspector-body min-h-0 flex-1 overflow-auto/);
  assert.match(shortDesktop, /\.data-inspector-body\s*\{[^}]*scrollbar-gutter: stable;/);
  assert.match(shortDesktop, /\.data-inspector-raw\s*\{\s*max-height: 10rem;/);
  assert.match(shortDesktop, /\.data-inspector-data-table\s*\{\s*max-height: 9\.5rem;/);
  assert.match(shortDesktop, /\.data-inspector-body \.data-inspector-data-table td\s*\{\s*padding-block: 0\.25rem;/);
  assert.equal((modal.match(/data-inspector-data-table max-h-60 overflow-auto/g) || []).length, 2);
});

test('short desktop puts canonical attributes before diagnostics and keeps raw data reachable', () => {
  for (const field of ['S_FCODE', 'Material', 'Dimensjon', 'InnvendigUtvendig', 'Rørform', 'Nett_type', 'Anleggsår']) {
    assert.ok(modal.includes(`'${field}'`), field);
  }
  assert.match(shortDesktop, /\.data-inspector-identity \{ order: 0; \}/);
  assert.match(shortDesktop, /\.data-inspector-attributes \{ order: 1; \}/);
  assert.match(shortDesktop, /\.data-inspector-diagnostic \{ order: 2; \}/);
  const gridRule = shortDesktop.match(/\.data-inspector-highlights\s*\{([^}]*)\}/)?.[1];
  assert.ok(gridRule);
  assert.match(gridRule, /display: grid;/);
  assert.match(gridRule, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(gridRule, /grid-auto-rows: min-content;/);
  assert.match(gridRule, /align-content: start;/);
  assert.match(gridRule, /height: auto;\s*min-height: 0;/);
  assert.doesNotMatch(gridRule, /(?:^|\s)(?:min-)?height:\s*(?:\d+(?:\.\d+)?(?:px|rem)|calc\()/);
  assert.match(shortDesktop, /\.data-inspector-target\s*\{[^}]*gap: 0\.375rem;/);
  assert.match(shortDesktop, /\.data-inspector-card\s*\{\s*padding: 0\.5rem 0\.75rem;/);
  assert.match(shortDesktop, /\.data-inspector-tall-raw \{ display: none; \}/);
  assert.match(shortDesktop, /\.data-inspector-compact-raw \{ display: block; \}/);
  assert.equal((modal.match(/<details className="data-inspector-compact-raw/g) || []).length, 4);
  assert.equal((modal.match(/<details className="data-inspector-compact-raw">\s*<summary[^>]*>Vis rådata<\/summary>\s*<pre className="data-inspector-raw/g) || []).length, 2);
  assert.equal((modal.match(/<pre className="data-inspector-tall-raw text-xs mt-2/g) || []).length, 2);
  assert.match(modal, /JSON\.stringify\(targetLine\.attributes, null, 2\)/);
  assert.match(modal, /JSON\.stringify\(targetPoint\.attributes, null, 2\)/);
});

test('close, selection, tabs and disclosure contracts remain in place', () => {
  assert.match(modal, /onClick=\{handleClose\}/);
  assert.match(modal, /aria-label="Lukk datautforsker"/);
  assert.match(modal, /setDataInspectorTarget\(null\)/);
  assert.match(modal, /setDataInspectorTarget\(\{\s*type: 'line'/);
  assert.match(modal, /setActiveTab\('lines'\)/);
  assert.match(modal, /setExpandedTargetPoints\(\(prev\) => !prev\)/);
  assert.match(modal, /setExpandedTargetTerrain\(\(prev\) => !prev\)/);
});
