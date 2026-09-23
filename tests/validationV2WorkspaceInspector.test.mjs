import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('normal sidebar width is preserved and shared by the Validator and docked inspector', async () => {
  const [page, shell, sidebar, validatorSidebar, inspector] = await Promise.all([
    read('../src/app/page.js'),
    read('../src/components/WorkspaceShell.js'),
    read('../src/components/Sidebar.js'),
    read('../src/components/FieldValidationSidebar.js'),
    read('../src/components/validation-v2/ValidationV2FieldInspector.js'),
  ]);
  assert.match(sidebar, /onWidthChange\(newWidth\)/);
  assert.match(sidebar, /width: `\$\{width\}px`/);
  assert.match(page, /const \[sidebarWidth, setSidebarWidth\] = useState\(380\)/);
  assert.match(page, /width=\{sidebarWidth\}[\s\S]*?onWidthChange=\{setSidebarWidth\}/);
  assert.match(page, /sidebar=\{fieldValidationOpen \? \([\s\S]*?<FieldValidationSidebar[\s\S]*?canDockInspector=\{canDockInspector\}/);
  assert.match(shell, /style=\{\{ width: `\$\{sidebarWidth\}px` \}\}/);
  assert.match(inspector, /style=\{\{ width: VALIDATION_V2_DOCKED_FIELD_DETAIL_WIDTH \}\}/);
  assert.match(validatorSidebar, /ValidationV2Workspace[\s\S]*sidebarWidth=\{sidebarWidth\}/);
});

test('the 380px Validator sidebar keeps its expanded metrics and Vis action on one compact row', async () => {
  const ruleList = await read('../src/components/validation-v2/ValidationV2RuleList.js');
  assert.match(ruleList, /flex flex-nowrap items-center gap-1/);
  assert.match(ruleList, /flex min-w-0 flex-1 flex-nowrap items-center gap-x-2/);
  assert.match(ruleList, /text-\[10px\] font-medium/);
  assert.match(ruleList, /text-\[11px\] font-bold/);
  assert.match(ruleList, /<span>Vis<\/span>/);
});

test('workspace shell places a full-height left list beside a shared upper row and full-width bottom dock', async () => {
  const shell = await read('../src/components/WorkspaceShell.js');
  const page = await read('../src/app/page.js');
  assert.match(shell, /<main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">/);
  assert.match(shell, /height: '62%', flex: '0 0 62%'/);
  assert.match(shell, /height: '38%'/);
  assert.match(page, /bottomDockOpen=\{layerDataTableOpen\}/);
  assert.match(page, /bottomDock=\{<LayerDataTable \/>\}/);
  assert.match(page, /id="validation-v2-field-inspector-root" className="contents"/);
  assert.match(page, /<MapView onZoomChange=\{setZoomLevel\} \/>/);
  assert.match(page, /<Viewer3D \/>/);
  assert.doesNotMatch(page, /layerDataTableOpen\s*\?\s*<ValidationV2FieldInspector/);
});

test('selected field and active tab stay local to the Validator workspace and survive field switches', async () => {
  const workspace = await read('../src/components/validation-v2/ValidationV2Workspace.js');
  assert.match(workspace, /const \[selectedValidatorField, setSelectedValidatorField\] = useState\(null\)/);
  assert.match(workspace, /const \[activeFieldTab, setActiveFieldTab\] = useState\('result'\)/);
  assert.match(workspace, /createPortal\([\s\S]*?inspectorHost/);
  assert.match(workspace, /layerId: selectedLayerId,[\s\S]*?datasetRevision: selectedRevision/);
  assert.match(workspace, /selectedValidatorField\.geometryScope === activeGeometry/);
  assert.match(workspace, /setActiveFieldTab\('result'\)/);
  assert.match(workspace, /previousWorkspaceIdentityRef\.current === workspaceIdentity/);
  const openField = workspace.slice(workspace.indexOf('const openFieldInfo'), workspace.indexOf('const closeFieldInspector'));
  assert.match(openField, /setSelectedValidatorField\(/);
  assert.doesNotMatch(openField, /setActiveFieldTab/);
  assert.doesNotMatch(workspace, /fieldInfoContext|setFieldInfoContext/);
  assert.doesNotMatch(workspace, /useStore\([^\n]*(?:selectedValidatorField|activeFieldTab)/);
});

test('desktop inspector is a non-modal region; constrained widths retain the dialog fallback', async () => {
  const [workspace, inspector, modal, page, layout] = await Promise.all([
    read('../src/components/validation-v2/ValidationV2Workspace.js'),
    read('../src/components/validation-v2/ValidationV2FieldInspector.js'),
    read('../src/components/validation-v2/ValidationV2FieldInfoModal.js'),
    read('../src/app/page.js'),
    read('../src/components/validation-v2/fieldDetailLayout.js'),
  ]);
  assert.match(inspector, /<aside[\s\S]*role="complementary"[\s\S]*aria-labelledby=/);
  assert.match(inspector, /aria-label="Lukk feltinspektør"/);
  assert.doesNotMatch(inspector, /aria-modal|role="dialog"|getFocusableElements|addEventListener\('keydown'/);
  assert.match(workspace, /canDockInspector \? \([\s\S]*?<ValidationV2FieldInspector/);
  assert.match(workspace, /\) : \([\s\S]*?<ValidationV2FieldInfoModal/);
  assert.match(modal, /role="dialog"[\s\S]*aria-modal="true"/);
  assert.match(modal, /getFocusableElements\(dialog\)/);
  assert.match(page, /viewportWidth - sidebarWidth >= 480 \+ inspectorWidthPx/);
  assert.match(page, /VALIDATION_V2_DOCKED_FIELD_DETAIL_WIDTH_REM \* 16/);
  assert.match(layout, /VALIDATION_V2_DOCKED_FIELD_DETAIL_WIDTH_REM = 28;/);
  assert.match(layout, /VALIDATION_V2_FIELD_MODAL_MAX_WIDTH = '44rem';/);
  assert.equal(380 + 480 + 28 * 16, 1308);
  assert.match(inspector, /VALIDATION_V2_DOCKED_FIELD_DETAIL_WIDTH/);
  assert.match(inspector, /compactTopArea/);
  assert.match(inspector, /px-3 py-2/);
  assert.match(modal, /maxWidth: VALIDATION_V2_FIELD_MODAL_MAX_WIDTH/);
});

test('closing the inspector leaves list presentation and the independent bottom dock untouched', async () => {
  const workspace = await read('../src/components/validation-v2/ValidationV2Workspace.js');
  const shell = await read('../src/components/WorkspaceShell.js');
  const store = await read('../src/lib/store.js');
  const closeField = workspace.slice(workspace.indexOf('const closeFieldInspector'), workspace.indexOf('const selectLayer'));
  assert.match(closeField, /setSelectedValidatorField\(null\)/);
  assert.doesNotMatch(closeField, /dispatchPresentation|setActiveFieldTab|closeLayerDataTable/);
  assert.match(shell, /bottomDockOpen &&/);
  assert.match(store, /openLayerDataTable:[\s\S]*?isOpen: true/);
  assert.match(store, /toggleAnalysisModal:[\s\S]*?isOpen: newIsOpen[\s\S]*?isOpen: newIsOpen\s*\? false/);
  assert.match(store, /closeLayerDataTable:[\s\S]*?isOpen: false/);
});

test('2D map resize invalidation and parent-sized 3D canvas remain in place', async () => {
  const [mapInner, viewer, page] = await Promise.all([
    read('../src/components/MapInner.js'),
    read('../src/components/3D/Viewer3D.js'),
    read('../src/app/page.js'),
  ]);
  assert.match(mapInner, /new ResizeObserver/);
  assert.match(mapInner, /map\.invalidateSize\(\{ animate: false \}\)/);
  assert.match(viewer, /<Canvas[\s\S]*?style=\{\{ width: '100%', height: '100%' \}\}/);
  assert.match(page, /<MapView onZoomChange=\{setZoomLevel\} \/>[\s\S]*?<Viewer3D \/>/);
});
