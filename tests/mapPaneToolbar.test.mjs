import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createMapPanePresentationState,
  getActiveBottomSurface,
  getMapToolbarMode,
  isMapLegendCompact,
  isMapPaneConstrained,
  MAP_LEGEND_COMPACT_WIDTH,
  MapToolbarMode,
  mapOwnsWorkspaceBottomRight,
  reduceMapPanePresentation,
} from '../src/lib/workspace/mapPanePresentation.mjs';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('toolbar width modes use the measured map pane and preserve the intended control priority', async () => {
  const [provider, toolbar, switcher] = await Promise.all([
    read('../src/components/MapPanePresentationProvider.js'),
    read('../src/components/MapPaneToolbar.js'),
    read('../src/components/TabSwitcher.js'),
  ]);
  assert.equal(getMapToolbarMode(920), MapToolbarMode.NORMAL);
  assert.equal(getMapToolbarMode(786), MapToolbarMode.CONSTRAINED);
  assert.equal(getMapToolbarMode(579), MapToolbarMode.NARROW);
  assert.equal(isMapPaneConstrained(786), true);
  assert.equal(isMapPaneConstrained(920), false);
  assert.equal(MAP_LEGEND_COMPACT_WIDTH, 1100);
  assert.equal(getMapToolbarMode(970), MapToolbarMode.NORMAL);
  assert.equal(isMapLegendCompact(970), true);
  assert.equal(getMapToolbarMode(1100), MapToolbarMode.NORMAL);
  assert.equal(isMapLegendCompact(1100), false);
  assert.equal(getMapToolbarMode(700), MapToolbarMode.CONSTRAINED);
  assert.equal(isMapLegendCompact(700), true);
  assert.match(provider, /new ResizeObserver\(updateMode\)/);
  assert.match(provider, /pane\.getBoundingClientRect\(\)\.width/);
  assert.match(provider, /data-map-pane="true"/);
  assert.match(toolbar, /useMapPanePresentation\(\)/);
  assert.doesNotMatch(toolbar, /ResizeObserver|getBoundingClientRect/);
  assert.match(toolbar, /flex-nowrap/);
  assert.match(toolbar, /paneMode === MapToolbarMode\.NORMAL && <TestModeControl \/>/);
  assert.match(toolbar, /showTestModeControls && <TestModeControl \/>/);
  assert.match(switcher, /compact \? 'Kart' : 'Kartoversikt'/);
  assert.match(switcher, /compact \? '3D' : '3D-visning'/);
  assert.match(switcher, /setActiveViewTab\('map'\)/);
  assert.match(switcher, /setActiveViewTab\('3d'\)/);
});

test('map-pane owner preserves legend state across delayed mounts and compact periods', async () => {
  const [page, provider, toolbar, mapView, legend] = await Promise.all([
    read('../src/app/page.js'),
    read('../src/components/MapPanePresentationProvider.js'),
    read('../src/components/MapPaneToolbar.js'),
    read('../src/components/MapView.js'),
    read('../src/components/MapLegend.js'),
  ]);
  const measure = (state, width) => reduceMapPanePresentation(state, {
    type: 'pane-measured',
    mode: getMapToolbarMode(width),
    legendCompact: isMapLegendCompact(width),
  });
  const toggleLegend = (state) => reduceMapPanePresentation(state, {
    type: 'legend-toggled',
  });

  // The page and toolbar exist first. The pane is already compact before the
  // data-dependent, dynamically imported legend mounts.
  let state = createMapPanePresentationState();
  state = measure(state, 970);
  assert.equal(state.mode, MapToolbarMode.NORMAL);
  assert.equal(state.legendCompact, true);
  assert.equal(state.legendCollapsed, true);

  // The late legend consumes the existing owner state, then a manual reopen
  // survives ResizeObserver repeats and constrained/narrow changes.
  state = toggleLegend(state);
  assert.equal(state.legendCollapsed, false);
  const sameCompactState = measure(state, 970);
  assert.strictEqual(sameCompactState, state);
  state = measure(state, 700);
  assert.equal(state.legendCollapsed, false);
  state = measure(state, 500);
  assert.equal(state.legendCollapsed, false);

  // Inspector-driven width changes end and restart the legend compact period. Neither
  // a table render nor a MapView/legend remount dispatches a reset action.
  state = measure(state, 1100);
  assert.equal(state.mode, MapToolbarMode.NORMAL);
  assert.equal(state.legendCompact, false);
  assert.equal(state.legendCollapsed, false);
  const stateAcrossTableAndLegendRemount = state;
  assert.strictEqual(stateAcrossTableAndLegendRemount, state);
  state = measure(state, 970);
  assert.equal(state.mode, MapToolbarMode.NORMAL);
  assert.equal(state.legendCompact, true);
  assert.equal(state.legendCollapsed, true);

  assert.match(page, /<MapPanePresentationProvider[\s\S]*?<MapPaneToolbar[\s\S]*?<MapView/);
  assert.match(provider, /useReducer\([\s\S]*?reduceMapPanePresentation/);
  assert.match(provider, /useLayoutEffect/);
  assert.match(provider, /data-map-pane-mode=\{presentation\.mode \?\? 'unmeasured'\}/);
  assert.match(provider, /legendCompact: isMapLegendCompact\(width\)/);
  assert.match(toolbar, /const \{ mode: paneMode \} = useMapPanePresentation\(\)/);
  assert.match(mapView, /dynamic\(\(\) => import\('\.\/MapLegend'\)/);
  assert.match(legend, /legendCollapsed: isCollapsed, toggleLegend/);
  assert.match(legend, /onClick=\{toggleLegend\}/);
  assert.doesNotMatch(toolbar, /ResizeObserver|getBoundingClientRect/);
  assert.doesNotMatch(legend, /ResizeObserver|getBoundingClientRect|useState/);
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
  const [page, provider, mapView, mapLegend, globals, controls3d, toolbar] = await Promise.all([
    read('../src/app/page.js'),
    read('../src/components/MapPanePresentationProvider.js'),
    read('../src/components/MapView.js'),
    read('../src/components/MapLegend.js'),
    read('../src/app/globals.css'),
    read('../src/components/3D/Controls3D.js'),
    read('../src/components/MapPaneToolbar.js'),
  ]);
  const primaryStart = page.indexOf('primary={(');
  const inspectorHostPosition = page.indexOf('id="validation-v2-field-inspector-root"', primaryStart);
  const primary = page.slice(primaryStart, inspectorHostPosition + 100);
  const mapPaneStart = primary.indexOf('<MapPanePresentationProvider');
  const inspectorHost = primary.indexOf('<div id="validation-v2-field-inspector-root"');
  const mapPaneEnd = primary.lastIndexOf('</MapPanePresentationProvider>', inspectorHost) + '</MapPanePresentationProvider>'.length;
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
  assert.match(provider, /observer\.observe\(pane\)/);
  assert.match(provider, /pane\.getBoundingClientRect\(\)\.width/);
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
  const sidebarWidth = 380;
  const inspectorWidth = 38 * 16;
  const mapWidthWithInspector = viewportWidth - sidebarWidth - inspectorWidth;
  const mapWidthWithoutInspector = viewportWidth - sidebarWidth;

  assert.equal(mapWidthWithInspector, 932);
  assert.equal(getMapToolbarMode(mapWidthWithInspector), MapToolbarMode.NORMAL);
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
  assert.match(inspector, /width: VALIDATION_V2_DOCKED_FIELD_DETAIL_WIDTH/);
  assert.match(modal, /maxWidth: VALIDATION_V2_FIELD_MODAL_MAX_WIDTH/);
  assert.match(content, /compactType=\{field\.canonicalFieldId === 'type'\}/);
});
