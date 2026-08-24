import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);

const { getHoveredTerrainLatLng, selectAnalysisActiveData } = await import(
  '../src/lib/analysis/profileAnalysisHover.js'
);
const mapInnerSource = await readFile(
  new URL('../src/components/MapInner.js', import.meta.url),
  'utf8',
);
const activeDataSelectorSource = await readFile(
  new URL('../src/lib/analysis/profileAnalysisHover.js', import.meta.url),
  'utf8',
);
const analysisLayerStart = mapInnerSource.indexOf(
  'function AnalysisPointsLayer()',
);
const analysisLayerEnd = mapInnerSource.indexOf(
  'function WmsLayerRefresher',
  analysisLayerStart,
);
const analysisLayerSource = mapInnerSource.slice(
  analysisLayerStart,
  analysisLayerEnd,
);

const makeState = ({ data, layers = {}, layerId = null, pipeIndex = 0, hover }) => ({
  data,
  layers,
  analysis: {
    layerId,
    selectedPipeIndex: pipeIndex,
    hoveredTerrainPoint: hover,
  },
});

const getSelectedHover = (state) => {
  const activeData = selectAnalysisActiveData(state);
  const line = activeData?.lines?.[state.analysis.selectedPipeIndex];
  return getHoveredTerrainLatLng(
    state.analysis.hoveredTerrainPoint,
    line?.coordinates,
    activeData,
  );
};

const baseData = {
  format: 'GMI',
  header: { COSYS_EPSG: 4326 },
  lines: [
    { coordinates: [{ x: 10, y: 60 }, { x: 20, y: 60 }] },
  ],
};

test('base analysis hover transitions from null to a projected identity marker', () => {
  const state = makeState({ data: baseData });

  assert.equal(getSelectedHover(state), null);

  state.analysis.hoveredTerrainPoint = { lineDist: 5, terrainZ: 100 };
  assert.doesNotThrow(() => getSelectedHover(state));
  assert.deepEqual(getSelectedHover(state), [60, 15]);
});

test('layered analysis hover uses the selected layer dataset and its UTM CRS', () => {
  const layerData = {
    format: 'SOSI',
    header: { COSYS_EPSG: 25832 },
    lines: [
      {
        coordinates: [
          { x: 597000, y: 6643000 },
          { x: 597010, y: 6643010 },
        ],
      },
    ],
  };
  const state = makeState({
    data: baseData,
    layers: { selected: { data: layerData } },
    layerId: 'selected',
    hover: null,
  });

  assert.equal(selectAnalysisActiveData(state), layerData);
  assert.equal(getSelectedHover(state), null);

  state.analysis.hoveredTerrainPoint = { lineDist: 5, terrainZ: 100 };
  const [lat, lng] = getSelectedHover(state);
  assert.ok(lat > 59.9 && lat < 60.0);
  assert.ok(lng > 10.7 && lng < 10.8);
  assert.notDeepEqual(getSelectedHover(state), [60, 15]);
});

test('a missing selected layer does not throw or fall back to base data', () => {
  const state = makeState({
    data: baseData,
    layerId: 'stale-layer',
    hover: { lineDist: 5, terrainZ: 100 },
  });

  assert.equal(selectAnalysisActiveData(state), undefined);
  assert.doesNotThrow(() => getSelectedHover(state));
  assert.equal(getSelectedHover(state), null);
});

test('changing the selected layer dataset reactively changes hover projection', () => {
  const oldLayerData = {
    format: 'SOSI',
    header: { COSYS_EPSG: 25832 },
    lines: [
      { coordinates: [{ x: 597000, y: 6643000 }, { x: 597010, y: 6643010 }] },
    ],
  };
  const newLayerData = {
    format: 'GMI',
    header: { COSYS_EPSG: 4326 },
    lines: [
      { coordinates: [{ x: 100, y: 20 }, { x: 110, y: 20 }] },
    ],
  };
  const state = makeState({
    data: baseData,
    layers: { selected: { data: oldLayerData } },
    layerId: 'selected',
    hover: { lineDist: 5, terrainZ: 100 },
  });

  const oldHover = getSelectedHover(state);
  state.layers.selected.data = newLayerData;

  assert.equal(selectAnalysisActiveData(state), newLayerData);
  assert.deepEqual(getSelectedHover(state), [20, 105]);
  assert.notDeepEqual(getSelectedHover(state), oldHover);
});

test('changing the selected pipe uses the new line for interpolation', () => {
  const data = {
    format: 'GMI',
    header: { COSYS_EPSG: 4326 },
    lines: [
      { coordinates: [{ x: 10, y: 60 }, { x: 20, y: 60 }] },
      { coordinates: [{ x: 30, y: 70 }, { x: 50, y: 70 }] },
    ],
  };
  const state = makeState({
    data,
    pipeIndex: 0,
    hover: { lineDist: 5, terrainZ: 100 },
  });

  assert.deepEqual(getSelectedHover(state), [60, 15]);
  state.analysis.selectedPipeIndex = 1;
  assert.deepEqual(getSelectedHover(state), [70, 35]);
});

test('AnalysisPointsLayer wires the reactive active dataset through hover projection', () => {
  assert.ok(analysisLayerStart >= 0);
  assert.ok(analysisLayerEnd > analysisLayerStart);
  assert.match(
    analysisLayerSource,
    /const activeData = useStore\(selectAnalysisActiveData\);/,
  );
  assert.match(
    activeDataSelectorSource,
    /const layerId = state\.analysis\.layerId;[\s\S]*return layerId !== null[\s\S]*state\.layers\[layerId\]\?\.data[\s\S]*state\.data/,
  );

  const activeDataDeclaration = analysisLayerSource.indexOf(
    'const activeData = useStore(selectAnalysisActiveData);',
  );
  const firstMemo = analysisLayerSource.indexOf('useMemo(');
  assert.ok(activeDataDeclaration >= 0 && activeDataDeclaration < firstMemo);
  assert.match(
    analysisLayerSource,
    /analysisSelectedPipeIndex === null[\s\S]*!activeData[\s\S]*!activeData\.lines/,
  );
  assert.match(
    analysisLayerSource,
    /const line = activeData\?\.lines\?\.\[analysisSelectedPipeIndex\]/,
  );
  assert.match(
    analysisLayerSource,
    /projectCoordinateToWgs84\([\s\S]*activeData/,
  );
  assert.match(
    analysisLayerSource,
    /getHoveredTerrainLatLng\([\s\S]*hoveredTerrainPoint,[\s\S]*lineCoords,[\s\S]*activeData/,
  );
  assert.match(
    analysisLayerSource,
    /\[hoveredTerrainPoint, lineCoords, activeData\]/,
  );
  assert.doesNotMatch(analysisLayerSource, /\bsourceProj\b/);
  assert.doesNotMatch(analysisLayerSource, /useStore\.getState\(\)\.layers/);
});
