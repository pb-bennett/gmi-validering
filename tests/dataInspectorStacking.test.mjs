import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [modal, page, sidebar, shell, stats, legend, toolbar, appInfo, globalDrop] = await Promise.all([
  readFile(new URL('../src/components/DataDisplayModal.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/page.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/Sidebar.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/WorkspaceShell.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/StatsModal.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/MapLegend.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/MapPaneToolbar.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/AppInfoModal.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/GlobalFileDrop.js', import.meta.url), 'utf8'),
]);

test('Datautforsker is a viewport-fixed sibling of the workspace, above app chrome', () => {
  assert.match(modal, /data-inspector-overlay fixed inset-0 z-\[10060\]/);
  assert.ok(page.indexOf('<WorkspaceShell') >= 0);
  assert.ok(page.indexOf('<DataDisplayModal />') > page.indexOf('<WorkspaceShell'));
  assert.match(shell, /<main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">/);
  assert.match(sidebar, /className="relative z-\[10000\]/);
  assert.match(stats, /fixed inset-0 z-\[10003\]/);
  assert.match(appInfo, /fixed inset-0 z-\[10050\]/);
  assert.match(globalDrop, /fixed inset-0 z-\[10005\]/);
  assert.match(page, /fixed inset-0 z-\[10001\]/);
  assert.match(page, /zIndex: 10002/);
  assert.match(legend, /absolute bottom-20 right-4 z-1000/);
  assert.match(toolbar, /absolute inset-x-2 top-2 z-\[1200\]/);
});

test('the modal is not wrapped in a lower stacking layer or a portal host', () => {
  assert.doesNotMatch(page, /createPortal\(\s*<DataDisplayModal/);
  assert.doesNotMatch(modal, /createPortal|createRoot/);
  assert.match(page, /<div className="h-screen w-screen overflow-hidden flex bg-gmi-surface-soft">/);
});

test('stacking change retains close, selection, and content contracts', () => {
  assert.match(modal, /onClick=\{handleClose\}/);
  assert.match(modal, /aria-label="Lukk datautforsker"/);
  assert.match(modal, /setDataInspectorTarget\(null\)/);
  assert.match(modal, /setDataInspectorTarget\(\{\s*type: 'line'/);
  assert.match(modal, /data-inspector-body min-h-0 flex-1 overflow-auto/);
  assert.match(modal, /data-inspector-highlights/);
  assert.match(modal, /Vis rådata/);
});
