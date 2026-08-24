import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);

const {
  createValidationV2Input,
  getValidationV2ObjectLabel,
  getValidationV2RuleStatus,
  isCurrentValidationV2Result,
  isGmiLayer,
} = await import('../src/lib/validation-v2/uiIntegration.js');
const { runGmiValidationV2 } = await import('../src/lib/validation-v2/index.js');

function makeLayer(id, format = 'GMI') {
  return {
    id,
    name: `Synthetic ${id}`,
    data: {
      format,
      fieldAnalysis: {
        points: { Høydereferanse: {}, Tema: {} },
        lines: { Høydereferanse: {}, Tema: {} },
      },
      points: [{ attributes: { Høydereferanse: 'TOPP_INNVENDIG', Tema: 'VL' } }],
      lines: [{ attributes: { Høydereferanse: 'TOPP_INNVENDIG', Tema: 'SP' } }],
    },
  };
}

test('mode integration keeps Validator 1.0 as the default and isolates V2', async () => {
  const source = await readFile(
    new URL('../src/components/FieldValidationSidebar.js', import.meta.url),
    'utf8',
  );

  assert.match(source, /useState\('legacy'\)/);
  assert.match(source, /Validator 1\.0/);
  assert.match(source, /Validator 2\.0 \(beta\)/);
  assert.match(source, /LegacyFieldValidationSidebar/);
  assert.match(source, /ValidationV2Workspace/);
  assert.match(source, /validateFields/);
});

test('two selected layers produce explicit, layer-qualified V2 runs only for the selected dataset', () => {
  const layerA = makeLayer('layer-a');
  const layerB = makeLayer('layer-b');
  layerB.data.points[0].attributes.Tema = null;

  const inputA = createValidationV2Input(layerA);
  const resultA = runGmiValidationV2(inputA);
  assert.equal(inputA.layerId, 'layer-a');
  assert.equal(inputA.dataset, layerA.data);
  assert.equal(resultA.layerId, 'layer-a');
  assert(resultA.ruleResults.some((rule) => rule.findings.length === 0));
  assert.equal(resultA.ruleResults.flatMap((rule) => rule.findings)
    .every((finding) => finding.objectRef.layerId === 'layer-a'), true);

  const inputB = createValidationV2Input(layerB);
  const resultB = runGmiValidationV2(inputB);
  assert.equal(inputB.layerId, 'layer-b');
  assert.equal(inputB.dataset, layerB.data);
  assert.equal(resultB.layerId, 'layer-b');
  assert.notEqual(resultA.layerId, resultB.layerId);
  assert.equal(resultB.ruleResults.flatMap((rule) => rule.findings)
    .every((finding) => finding.objectRef.layerId === 'layer-b'), true);
  assert.equal(JSON.stringify(inputA.dataset).includes('layer-b'), false);
});

test('V2 results become stale when layer selection or dataset instance changes', () => {
  const layerA = makeLayer('layer-a');
  const inputA = createValidationV2Input(layerA);
  const resultA = runGmiValidationV2(inputA);
  const replacement = makeLayer('layer-a');
  const replacementInput = createValidationV2Input(replacement);

  assert.equal(
    isCurrentValidationV2Result(resultA, 'layer-a', inputA.datasetRevision),
    true,
  );
  assert.equal(
    isCurrentValidationV2Result(resultA, 'layer-b', inputA.datasetRevision),
    false,
  );
  assert.notEqual(inputA.datasetRevision, replacementInput.datasetRevision);
  assert.equal(
    isCurrentValidationV2Result(
      resultA,
      replacementInput.layerId,
      replacementInput.datasetRevision,
    ),
    false,
  );
});

test('dataset revisions are stable per object and opaque to filenames and content', () => {
  const layer = makeLayer('layer-a');
  const first = createValidationV2Input(layer);
  const second = createValidationV2Input(layer);
  const changedName = { ...layer, name: 'different-name' };
  const changedContent = {
    ...layer,
    data: { ...layer.data, points: [] },
  };

  assert.equal(first.datasetRevision, second.datasetRevision);
  assert.equal(first.datasetRevision, createValidationV2Input(changedName).datasetRevision);
  assert.notEqual(first.datasetRevision, createValidationV2Input(changedContent).datasetRevision);
  assert.equal(first.datasetRevision.includes(layer.name), false);
  assert.equal(first.datasetRevision.includes('TOPP_INNVENDIG'), false);
});

test('V2 is gated by authoritative parsed format metadata', () => {
  for (const format of ['SOSI', 'KOF', 'UNKNOWN', null]) {
    const layer = makeLayer(`unsupported-${format}`, format);
    assert.equal(isGmiLayer(layer), false);
    assert.equal(createValidationV2Input(layer), null);
  }
  assert.equal(isGmiLayer(makeLayer('gmi')), true);
});

test('V2 workspace consumes A5 only and has no map, table, legacy, or all-layer path', async () => {
  const workspaceSource = await readFile(
    new URL('../src/components/validation-v2/ValidationV2Workspace.js', import.meta.url),
    'utf8',
  );
  const boundarySource = await readFile(
    new URL('../src/components/validation-v2/ValidationV2ErrorBoundary.js', import.meta.url),
    'utf8',
  );

  assert.match(workspaceSource, /runGmiValidationV2/);
  assert.match(workspaceSource, /selectedLayerId/);
  assert.match(workspaceSource, /sourceFieldDiagnostics/);
  assert.doesNotMatch(workspaceSource, /validateFields|fieldValidation|legacy validator/i);
  assert.doesNotMatch(workspaceSource, /getVisibleLayersData|viewObjectInMap|LayerDataTable/);
  assert.doesNotMatch(workspaceSource, /Valider alle lag/);
  assert.doesNotMatch(workspaceSource, /error\.message/);
  assert.match(boundarySource, /could not|kunne ikke/i);
  assert.doesNotMatch(boundarySource, /error\.message/);
});

test('affected object labels stay geometry-local and do not expose coordinates', async () => {
  assert.equal(
    getValidationV2ObjectLabel({ geometryScope: 'point', sourceIndex: 0 }),
    'Punkt 1',
  );
  assert.equal(
    getValidationV2ObjectLabel({ geometryScope: 'line', sourceIndex: 0 }),
    'Linje 1',
  );
  const source = await readFile(
    new URL('../src/components/validation-v2/ValidationV2Workspace.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /coordinates|feature\.id|guid|operational/i);
  assert.doesNotMatch(source, /finding\.objectRef\.key/);
});

test('zero-applicable rules are not passed, while A5 status precedence and neutral states remain intact', async () => {
  const noPoints = makeLayer('no-points');
  noPoints.data.points = [];
  const noPointsResult = runGmiValidationV2(createValidationV2Input(noPoints));
  const pointTemaNoPoints = noPointsResult.ruleResults.find(
    (ruleResult) => ruleResult.rule.ruleId === 'innmaling.point.tema.required',
  );
  assert.equal(pointTemaNoPoints.evaluatedObjectCount, 0);
  assert.deepEqual(
    getValidationV2RuleStatus(pointTemaNoPoints).label,
    'Delvis oppfylt',
  );
  assert.notEqual(getValidationV2RuleStatus(pointTemaNoPoints).label, 'Oppfylt');

  const noLines = makeLayer('no-lines');
  noLines.data.lines = [];
  const noLinesResult = runGmiValidationV2(createValidationV2Input(noLines));
  const lineTemaNoLines = noLinesResult.ruleResults.find(
    (ruleResult) => ruleResult.rule.ruleId === 'innmaling.line.tema.required',
  );
  assert.equal(lineTemaNoLines.evaluatedObjectCount, 0);
  assert.equal(getValidationV2RuleStatus(lineTemaNoLines).label, 'Delvis oppfylt');

  const empty = makeLayer('empty');
  empty.data.points = [];
  empty.data.lines = [];
  const emptyResult = runGmiValidationV2(createValidationV2Input(empty));
  assert(emptyResult.ruleResults.every((ruleResult) => {
    return ruleResult.evaluatedObjectCount === 0 &&
      getValidationV2RuleStatus(ruleResult).label === 'Delvis oppfylt';
  }));

  const normalPass = runGmiValidationV2(createValidationV2Input(makeLayer('pass')));
  const heightRequiredPass = normalPass.ruleResults.find(
    (ruleResult) => ruleResult.rule.ruleId === 'innmaling.common.height-reference.valid',
  );
  assert.equal(heightRequiredPass.passCount, 2);
  assert.equal(getValidationV2RuleStatus(heightRequiredPass).label, 'Oppfylt');

  const failLayer = makeLayer('fail');
  failLayer.data.points[0].attributes.Tema = null;
  const failResult = runGmiValidationV2(createValidationV2Input(failLayer));
  const pointTemaFail = failResult.ruleResults.find(
    (ruleResult) => ruleResult.rule.ruleId === 'innmaling.point.tema.required',
  );
  assert.equal(pointTemaFail.failCount, 1);
  assert.equal(getValidationV2RuleStatus(pointTemaFail).label, 'Ikke oppfylt');

  const indeterminateLayer = makeLayer('indeterminate');
  indeterminateLayer.data.fieldAnalysis.points = {
    Høydereferanse: {},
    '.P_TEMA': {},
  };
  indeterminateLayer.data.points[0].attributes = {
    Høydereferanse: 'TOPP_INNVENDIG',
    '.P_TEMA': 'VL',
  };
  const indeterminateResult = runGmiValidationV2(
    createValidationV2Input(indeterminateLayer),
  );
  const pointTemaIndeterminate = indeterminateResult.ruleResults.find(
    (ruleResult) => ruleResult.rule.ruleId === 'innmaling.point.tema.required',
  );
  assert.equal(pointTemaIndeterminate.failCount, 0);
  assert.equal(pointTemaIndeterminate.indeterminateCount, 1);
  assert.equal(getValidationV2RuleStatus(pointTemaIndeterminate).label, 'Delvis oppfylt');

  const mixedStatus = getValidationV2RuleStatus({
    evaluatedObjectCount: 2,
    passCount: 1,
    failCount: 0,
    notEvaluatedCount: 1,
    indeterminateCount: 0,
  });
  assert.equal(mixedStatus.label, 'Oppfylt');

  const source = await readFile(
    new URL('../src/components/validation-v2/ValidationV2Workspace.js', import.meta.url),
    'utf8',
  );
  const integrationSource = await readFile(
    new URL('../src/lib/validation-v2/uiIntegration.js', import.meta.url),
    'utf8',
  );
  const presentationSource = `${source}\n${integrationSource}`;
  for (const label of [
    'Beta · GMI ·',
    'Ikke oppfylt',
    'Delvis oppfylt',
    'Oppfylt',
    'Punkter',
    'Ledninger',
  ]) {
    assert.match(presentationSource, new RegExp(label));
  }
  assert.match(source, /getValidationRules/);
  assert.match(source, /createValidationV2ViewController/);
  assert.match(source, /geometryView/);
  assert.match(source, /ruleResults/);
  assert.match(source, /role="tab"/);
  assert.match(source, /ValidationV2RuleList/);
  assert.match(source, /Andre felt i datasettet/);
  assert.match(source, /UNKNOWN_SOURCE_FIELD/);
});
