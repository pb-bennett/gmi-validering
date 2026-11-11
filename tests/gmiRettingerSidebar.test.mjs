import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('R6B has only Filter/Endringer, with one geometry owner and the existing guarded editing paths', async () => {
  const read = (file) => readFile(new URL(`../src/components/${file}`, import.meta.url), 'utf8');
  const [workspace, editor, styles, table] = await Promise.all([
    read('gmi-edit/GmiEditWorkspace.js'), read('gmi-edit/GmiObjectEditor.js'), read('gmi-edit/gmiEdit.css'), read('LayerDataTable.js'),
  ]);
  assert.match(workspace, /const \[tab, setTab\] = useState\('filter'\)/);
  assert.equal((workspace.match(/role="tab"/g) || []).length, 2);
  assert.doesNotMatch(workspace, /ObjectList|LIST_PAGE|changedOnly|setScope|data-object-key|Søk etter objekt|Objekttype/);
  assert.doesNotMatch(styles, /gmi-edit-object-list|gmi-edit-object-row|gmi-edit-list-controls|gmi-edit-search|gmi-edit-segmented|gmi-edit-changed-pill/);
  assert.match(workspace, /storedTab \|\| \(layer.data\?\.lines\?\.length/);
  for (const component of ['GmiLayerFilters', 'GmiChangeList', 'GmiBatchInspector', 'GmiBatchDialog', 'GmiConfirmDialog', 'GmiFullValidation', 'GmiExportDialog']) {
    assert(workspace.includes(`<${component}`), `${component} is preserved`);
  }
  assert.match(workspace, /clearGmiEditObjectRequest\(request\)/);
  assert.match(workspace, /select\(\{ scope: request.scope, sourceIndex: request.sourceIndex \}\)/);
  assert.match(workspace, /guard\(\(\) => \{\s*setSelected\(target\)/);
  assert.match(workspace, /onSelectObject=\{\(target, id\) => select\(target, id\)\}/);
  assert.match(editor, /Velg en rad i datatabellen/);
  assert.doesNotMatch(editor, /Velg et objekt i listen/);
  assert.match(table, /showObjectNumber\s*\r?\n.*\r?\n.*gmiObjectMatchesQuery/);
  assert.match(table, /typeof item.guid === 'string' && item.guid.toLowerCase\(\).includes\(query\)/);
});
