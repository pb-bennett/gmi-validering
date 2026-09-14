import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  getActiveBottomSurface,
  getMapToolbarMode,
  MapToolbarMode,
  mapOwnsWorkspaceBottomRight,
} from '../src/lib/workspace/mapPanePresentation.mjs';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('toolbar width modes use the measured map pane and preserve the intended control priority', async () => {
  const [toolbar, switcher] = await Promise.all([
    read('../src/components/MapPaneToolbar.js'),
    read('../src/components/TabSwitcher.js'),
  ]);
  assert.equal(getMapToolbarMode(920), MapToolbarMode.NORMAL);
  assert.equal(getMapToolbarMode(786), MapToolbarMode.CONSTRAINED);
  assert.equal(getMapToolbarMode(579), MapToolbarMode.NARROW);
  assert.match(toolbar, /new ResizeObserver\(updateMode\)/);
  assert.match(toolbar, /toolbarRef\.current\?\.closest\('\[data-map-pane\]'\)/);
  assert.match(toolbar, /getBoundingClientRect\(\)\.width/);
  assert.match(toolbar, /flex-nowrap/);
  assert.match(toolbar, /paneMode === MapToolbarMode\.NORMAL && <TestModeControl \/>/);
  assert.match(toolbar, /showTestModeControls && <TestModeControl \/>/);
  assert.match(switcher, /compact \? 'Kart' : 'Kartoversikt'/);
  assert.match(switcher, /compact \? '3D' : '3D-visning'/);
  assert.match(switcher, /setActiveViewTab\('map'\)/);
  assert.match(switcher, /setActiveViewTab\('3d'\)/);
});

test('overflow is keyboard-dismissible, restores focus, and retains the full reset label', async () => {
  const toolbar = await read('../src/components/MapPaneToolbar.js');
  assert.match(toolbar, /aria-label="Flere kartverktøy"/);
  assert.match(toolbar, /aria-expanded=\{overflowOpen\}/);
  assert.match(toolbar, /event\.key !== 'Escape'/);
  assert.match(toolbar, /overflowTriggerRef\.current\?\.focus\(\)/);
  assert.match(toolbar, /pointerdown/);
  assert.equal((toolbar.match(/<TestModeControl \/>/g) || []).length, 2);
  assert.match(toolbar, /<span>Nullstill og last opp ny<\/span>/);
  assert.match(toolbar, /onReset\(\)/);
  assert.match(toolbar, /onShare\(\)/);
  assert.match(toolbar, /aria-label="Del app"/);
  assert.match(toolbar, /aria-label="Nullstill og last opp ny"/);
});

test('map controls are descendants of the map pane, beside rather than inside the inspector', async () => {
  const [page, mapView, mapLegend, globals, controls3d, toolbar] = await Promise.all([
    read('../src/app/page.js'),
    read('../src/components/MapView.js'),
    read('../src/components/MapLegend.js'),
    read('../src/app/globals.css'),
    read('../src/components/3D/Controls3D.js'),
    read('../src/components/MapPaneToolbar.js'),
  ]);
  const primaryStart = page.indexOf('primary={(');
  const inspectorHostPosition = page.indexOf('id="validation-v2-field-inspector-root"', primaryStart);
  const primary = page.slice(primaryStart, inspectorHostPosition + 100);
  const mapPaneStart = primary.indexOf('<div data-map-pane="true"');
  const inspectorHost = primary.indexOf('<div id="validation-v2-field-inspector-root"');
  const mapPaneEnd = primary.lastIndexOf('</div>', inspectorHost);
  const mapPane = primary.slice(mapPaneStart, mapPaneEnd);
  assert.ok(mapPaneStart >= 0 && mapPaneEnd > mapPaneStart);
  assert.match(primary.slice(0, mapPaneStart), /<div className="flex h-full min-h-0 min-w-0 flex-1">/);
  assert.match(mapPane, /className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col"/);
  assert.match(mapPane, /<MapPaneToolbar/);
  assert.match(mapPane, /className=\{statisticsCueActive[\s\S]*?aria-label="Vis bruksstatistikk"/);
  assert.match(mapPane, /<MapView onZoomChange=\{setZoomLevel\} \/>/);
  assert.match(primary.slice(inspectorHost), /<div id="validation-v2-field-inspector-root" className="contents" \/>/);
  assert.ok(inspectorHost > mapPaneEnd, 'inspector host is a sibling after the map pane');
  assert.doesNotMatch(page, /right:\s*dockedInspectorOpen/);
  assert.match(page, /const mapOwnsBottomRight = mapOwnsWorkspaceBottomRight\(/);
  assert.match(page, /rightSurfaceOpen: dockedInspectorOpen/);
  assert.match(page, /<StatsModal isOpen=\{showStats\}/);
  assert.match(toolbar, /const pane = toolbarRef\.current\?\.closest\('\[data-map-pane\]'\)/);
  assert.match(toolbar, /observer\.observe\(pane\)/);
  assert.match(toolbar, /pane\.getBoundingClientRect\(\)\.width/);
  assert.match(toolbar, /className="absolute inset-x-2 top-2/);
  assert.match(page, /position: 'absolute',[\s\S]*?bottom: '16px',[\s\S]*?right: '16px'/);
  assert.match(mapView, /className="relative h-full w-full"/);
  assert.match(mapLegend, /absolute bottom-20 right-4/);
  assert.match(globals, /\.leaflet-top\.leaflet-right \.leaflet-control-layers/);
  assert.match(controls3d, /absolute top-14 left-4/);
  assert.match(controls3d, /absolute bottom-20 right-4/);
  assert.doesNotMatch(page, /position: 'fixed'/);
});

test('inspector width is removed from the map-pane measurement and changes toolbar mode', () => {
  const viewportWidth = 1920;
  const sidebarWidth = 430;
  const inspectorWidth = 44 * 16;
  const mapWidthWithInspector = viewportWidth - sidebarWidth - inspectorWidth;
  const mapWidthWithoutInspector = viewportWidth - sidebarWidth;

  assert.equal(mapWidthWithInspector, 786);
  assert.equal(getMapToolbarMode(mapWidthWithInspector), MapToolbarMode.CONSTRAINED);
  assert.equal(getMapToolbarMode(mapWidthWithoutInspector), MapToolbarMode.NORMAL);
});

test('statistics trigger follows general ownership of the workspace bottom-right corner', () => {
  assert.equal(getActiveBottomSurface({ layerDataTableOpen: false, analysisOpen: false }), null);
  assert.equal(mapOwnsWorkspaceBottomRight({}), true);
  assert.equal(mapOwnsWorkspaceBottomRight({ rightSurfaceOpen: false, bottomSurface: null }), true);

  assert.equal(mapOwnsWorkspaceBottomRight({ rightSurfaceOpen: true, bottomSurface: null }), false);
  const table = getActiveBottomSurface({ layerDataTableOpen: true, analysisOpen: false });
  assert.equal(table, 'layer-table');
  assert.equal(mapOwnsWorkspaceBottomRight({ rightSurfaceOpen: false, bottomSurface: table }), false);
  const profile = getActiveBottomSurface({ layerDataTableOpen: false, analysisOpen: true });
  assert.equal(profile, 'profile-analysis');
  assert.equal(mapOwnsWorkspaceBottomRight({ rightSurfaceOpen: false, bottomSurface: profile }), false);
  assert.equal(mapOwnsWorkspaceBottomRight({ rightSurfaceOpen: true, bottomSurface: table }), false);
  assert.equal(mapOwnsWorkspaceBottomRight({ rightSurfaceOpen: true, bottomSurface: profile }), false);

  const futureDock = getActiveBottomSurface({ layerDataTableOpen: false, analysisOpen: false, otherBottomSurface: 'future-dock' });
  assert.equal(mapOwnsWorkspaceBottomRight({ rightSurfaceOpen: false, bottomSurface: futureDock }), false);
  assert.equal(mapOwnsWorkspaceBottomRight({ rightSurfaceOpen: false, bottomSurface: null }), true);
});

test('StatsModal remains independently open when workspace bottom-right ownership changes', async () => {
  const page = await read('../src/app/page.js');
  const statsModal = page.slice(page.indexOf('<StatsModal'), page.indexOf('/>', page.indexOf('<StatsModal')) + 2);
  const trigger = page.slice(page.indexOf('{mapOwnsBottomRight &&'), page.indexOf('<div className="relative flex h-full', page.indexOf('{mapOwnsBottomRight &&')));
  assert.match(statsModal, /isOpen=\{showStats\}/);
  assert.match(statsModal, /onClose=\{\(\) => setShowStats\(false\)\}/);
  assert.match(trigger, /onClick=\{\(\) => setShowStats\(true\)\}/);
  assert.doesNotMatch(trigger, /setShowStats\(false\)/);
});

test('start-screen Testmodus host and map toolbar are mutually exclusive and share one control', async () => {
  const [page, toolbar, testControl, workspace, sidebar] = await Promise.all([
    read('../src/app/page.js'),
    read('../src/components/MapPaneToolbar.js'),
    read('../src/components/TestModeControl.js'),
    read('../src/components/validation-v2/ValidationV2Workspace.js'),
    read('../src/components/FieldValidationSidebar.js'),
  ]);
  const uploadBranch = page.slice(page.indexOf("{parsingStatus !== 'done'"), page.indexOf('{/* Main App Layout'));
  const mapBranch = page.slice(page.indexOf("{parsingStatus === 'done'"));
  assert.match(uploadBranch, /Last opp og valider GMI-filer[\s\S]*?<TestModeControl \/>[\s\S]*?<FileUpload \/>/);
  assert.match(mapBranch, /<MapPaneToolbar/);
  assert.match(page, /useEffect\(\(\) => \{[\s\S]*?isTestModeActivation\(params\)[\s\S]*?updateSettings\(\{ testMode: true \}\)/);
  assert.doesNotMatch(page.slice(page.indexOf('useEffect(() => {'), page.indexOf('const updateViewportWidth')), /parsingStatus|MapPaneToolbar/);
  assert.match(toolbar, /paneMode === MapToolbarMode\.NORMAL && <TestModeControl \/>/);
  assert.match(toolbar, /showTestModeControls && <TestModeControl \/>/);
  assert.match(testControl, /if \(!hydrated \|\| !testMode\) return null/);
  assert.match(testControl, /Utviklerverkt/);
  assert.match(sidebar, /onDockedInspectorChange=\{onDockedInspectorChange\}/);
  assert.match(workspace, /onDockedInspectorChange\?\.\(dockedInspectorVisible\)/);
});

test('Resultat and Regel share a readable width while source tables may scroll horizontally', async () => {
  const [content, inspector, modal] = await Promise.all([
    read('../src/components/validation-v2/ValidationV2FieldDetailContent.js'),
    read('../src/components/validation-v2/ValidationV2FieldInspector.js'),
    read('../src/components/validation-v2/ValidationV2FieldInfoModal.js'),
  ]);
  assert.equal((content.match(/mx-auto w-full max-w-2xl px-2\.5/g) || []).length, 1);
  assert.match(content, /activeTab === TABS\.RESULT[\s\S]*DiagnosticResultPanel[\s\S]*ModernRulePanel/);
  assert.match(content.slice(content.indexOf('function ModernRulePanel'), content.indexOf('function LegacyResultPanel')), /<div className="space-y-5">/);
  assert.match(content, /overflow-x-auto overflow-y-clip/);
  assert.match(inspector, /width: VALIDATION_V2_FIELD_DETAIL_WIDTH/);
  assert.match(modal, /maxWidth: VALIDATION_V2_FIELD_DETAIL_WIDTH/);
  assert.match(content, /compactType=\{field\.canonicalFieldId === 'type'\}/);
});
