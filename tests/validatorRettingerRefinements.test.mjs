import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = (path) => readFile(new URL('../src/' + path, import.meta.url), 'utf8');

test('U1 shared control spacing preserves reference-date event handling and explanatory labels', async () => {
  const source = await read('components/validation-v2/ValidationV2Workspace.js');
  assert.match(source, /htmlFor="validation-v2-date"[^>]*title="Datoen kontrollen regnes mot/);
  assert.match(source, /Kontrolldato/);
  assert.match(source, /aria-label="Kontrolldato"/);
  assert.match(source, /if \(event.target.value\) useStore.getState\(\).setGmiValidatorReferenceDate\(event.target.value\)/);
});

test('U2 severity shapes and U5 contextual redo retain their single owners', async () => {
  const icon = await read('components/gmi-edit/GmiSeverityIcon.js');
  assert.match(icon, /error: XCircleIcon, warning: WarningIcon, success: CheckCircleIcon/);
  assert.match(icon, /weight="regular" aria-hidden="true"/);
  for (const file of ['GmiObjectEditor', 'GmiBatchInspector']) {
    assert.match(await read('components/gmi-edit/' + file + '.js'), /import GmiSeverityIcon/);
  }
  const workspace = await read('components/gmi-edit/GmiEditWorkspace.js');
  assert.match(workspace, /view\?\.redo.at\(-1\)\?\.id === notice.redoId/);
  assert.match(workspace, /data-gmi-context-redo="notice" onClick=\{redoInContext\}/);
  assert.match(await read('components/gmi-edit/GmiChangeList.js'), /if \(!redoCount\) return null/);
});
