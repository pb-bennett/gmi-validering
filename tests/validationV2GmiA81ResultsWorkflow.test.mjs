import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);

const api = await import('../src/lib/validation-v2/index.js');
const {
  ValidationV2AggregateStatus,
  ValidationV2SortMode,
  ValidationV2StatusFilter,
  createValidationV2PresentationState,
  filterValidationV2RulePresentations,
  getFieldInformation,
  getValidationV2AggregateStatus,
  getValidationV2PresentationRules,
  getValidationV2RulePresentations,
  reduceValidationV2PresentationState,
  sortValidationV2RulePresentations,
  getValidationRules,
} = api;
const { createValidationV2ViewController } = await import(
  '../src/lib/validation-v2/validationViewController.js'
);

function counts({ passCount = 0, failCount = 0, indeterminateCount = 0, notEvaluatedCount = 0 } = {}) {
  return {
    evaluatedCount: passCount + failCount + indeterminateCount + notEvaluatedCount,
    passCount,
    failCount,
    notEvaluatedCount,
    indeterminateCount,
  };
}

function syntheticRuleResult(ruleId, canonicalFieldId, pointCounts, geometryScopes = ['point', 'line']) {
  return {
    rule: { ruleId, canonicalFieldId, geometryScopes },
    geometryBreakdown: { point: pointCounts, line: counts() },
  };
}

test('aggregate status follows the approved truth table without mutation', () => {
  const cases = [
    [{ passCount: 3 }, 'MET', 'Oppfylt', 'green'],
    [{ failCount: 3 }, 'NOT_MET', 'Ikke oppfylt', 'red'],
    [{ passCount: 2, failCount: 1 }, 'PARTIALLY_MET', 'Delvis oppfylt', 'amber'],
    [{ passCount: 2, indeterminateCount: 1 }, 'PARTIALLY_MET', 'Delvis oppfylt', 'amber'],
    [{ indeterminateCount: 2 }, 'PARTIALLY_MET', 'Delvis oppfylt', 'amber'],
    [{ failCount: 1, indeterminateCount: 2 }, 'NOT_MET', 'Ikke oppfylt', 'red'],
    [{ passCount: 1, notEvaluatedCount: 2 }, 'MET', 'Oppfylt', 'green'],
    [{ notEvaluatedCount: 2 }, 'PARTIALLY_MET', 'Delvis oppfylt', 'amber'],
    [{}, 'PARTIALLY_MET', 'Delvis oppfylt', 'amber'],
  ];

  for (const [input, expectedEnum, label, visualToken] of cases) {
    const original = counts(input);
    const result = getValidationV2AggregateStatus(original);
    assert.equal(result.enum, ValidationV2AggregateStatus[expectedEnum]);
    assert.equal(result.label, label);
    assert.equal(result.visualToken, visualToken);
    assert.equal(result.applicableCount, (input.passCount || 0) + (input.failCount || 0) + (input.indeterminateCount || 0));
    assert.deepEqual(original, counts(input));
  }
});

test('all active rules resolve exact canonical short labels', () => {
  const expected = [
    'Høydereferanse', 'Anleggsår', 'Datafangstdato', 'Innmålt av', 'Saksnummer',
    'Nøyaktighet XY', 'Nøyaktighet høyde Z', 'Maksavvik horisontalt',
    'Maksavvik vertikalt', 'Stedfestingsforhold', 'Stedfestingsårsak', 'Synbarhet',
    'Tema', 'Innvendig/utvendig', 'Tykkelse', 'NOBB/VAVVS-nummer',
    'NOBB/VAVVS-nummer ramme', 'Dimensjon', 'Nett-type', 'Rørform',
  ];
  const rules = getValidationRules();
  const labels = [...new Set(rules.map((rule) => getFieldInformation(rule.canonicalFieldId).displayName))];
  assert.deepEqual(labels, expected);
  assert.equal(labels.some((label) => /er gyldig|er oppgitt/.test(label)), false);
  assert.equal(getFieldInformation('tema'), getFieldInformation('tema'));
  assert.deepEqual(getFieldInformation('tema').appliesTo, ['point', 'line']);
});

test('presentation filtering and sorting only inspect short names and preserve ties', () => {
  const results = [
    syntheticRuleResult('red', 'heightReference', counts({ failCount: 1 })),
    syntheticRuleResult('amber', 'installationYear', counts({ indeterminateCount: 1 })),
    syntheticRuleResult('green', 'captureDate', counts({ passCount: 1 })),
  ];
  const presentations = getValidationV2RulePresentations(results, 'point');
  assert.deepEqual(
    sortValidationV2RulePresentations(presentations).map((item) => item.displayName),
    ['Høydereferanse', 'Anleggsår', 'Datafangstdato'],
  );
  assert.deepEqual(
    sortValidationV2RulePresentations(presentations, ValidationV2SortMode.REGISTRY)
      .map((item) => item.displayName),
    ['Høydereferanse', 'Anleggsår', 'Datafangstdato'],
  );
  assert.deepEqual(
    sortValidationV2RulePresentations(presentations, ValidationV2SortMode.NAME_DESC)
      .map((item) => item.displayName),
    ['Høydereferanse', 'Datafangstdato', 'Anleggsår'],
  );
  assert.deepEqual(
    filterValidationV2RulePresentations(presentations, { searchQuery: 'HØYDE', statusFilter: ValidationV2StatusFilter.ALL })
      .map((item) => item.displayName),
    ['Høydereferanse'],
  );
  assert.deepEqual(
    filterValidationV2RulePresentations(presentations, { statusFilter: ValidationV2StatusFilter.ATTENTION })
      .map((item) => item.status.enum),
    ['NOT_MET', 'PARTIALLY_MET'],
  );
  assert.deepEqual(
    filterValidationV2RulePresentations(presentations, { statusFilter: ValidationV2StatusFilter.NOT_MET })
      .map((item) => item.displayName),
    ['Høydereferanse'],
  );

  const sameStatus = sortValidationV2RulePresentations([
    { ...presentations[2], registryIndex: 2 },
    { ...presentations[0], registryIndex: 0 },
  ], ValidationV2SortMode.ATTENTION);
  assert.deepEqual(sameStatus.map((item) => item.registryIndex), [0, 2]);
});

test('point and line presentation universes are the reviewed active counts', () => {
  const results = getValidationRules().map((rule) => syntheticRuleResult(
    rule.ruleId,
    rule.canonicalFieldId,
    counts({ passCount: 1 }),
    rule.geometryScopes,
  ));
  assert.equal(getValidationV2PresentationRules(results, 'point').length, 17);
  assert.equal(getValidationV2PresentationRules(results, 'line').length, 18);
});

test('one-open reducer behavior retains visible expansion and closes hidden/context state', () => {
  let state = createValidationV2PresentationState();
  state = reduceValidationV2PresentationState(state, { type: 'TOGGLE_RULE', expansionKey: 'point:a' });
  assert.equal(state.expandedRuleKey, 'point:a');
  state = reduceValidationV2PresentationState(state, { type: 'TOGGLE_RULE', expansionKey: 'point:b' });
  assert.equal(state.expandedRuleKey, 'point:b');
  state = reduceValidationV2PresentationState(state, { type: 'SET_SORT', sortMode: ValidationV2SortMode.NAME_ASC });
  assert.equal(state.expandedRuleKey, 'point:b');
  state = reduceValidationV2PresentationState(state, {
    type: 'SET_SEARCH', searchQuery: 'x', visibleExpansionKeys: ['point:b'],
  });
  assert.equal(state.expandedRuleKey, 'point:b');
  state = reduceValidationV2PresentationState(state, {
    type: 'SET_STATUS_FILTER', statusFilter: ValidationV2StatusFilter.NOT_MET, visibleExpansionKeys: [],
  });
  assert.equal(state.expandedRuleKey, null);
  state = reduceValidationV2PresentationState(state, { type: 'TOGGLE_RULE', expansionKey: 'point:c' });
  state = reduceValidationV2PresentationState(state, { type: 'GEOMETRY_CHANGED' });
  assert.equal(state.expandedRuleKey, null);
  state = reduceValidationV2PresentationState(state, { type: 'TOGGLE_RULE', expansionKey: 'point:d' });
  state = reduceValidationV2PresentationState(state, { type: 'NEW_RESULT' });
  assert.equal(state.expandedRuleKey, null);
  assert.equal(state.searchQuery, '');
  assert.equal(state.statusFilter, ValidationV2StatusFilter.ALL);
  assert.equal(state.sortMode, ValidationV2SortMode.NAME_ASC);
});

test('presentation actions and geometry changes never invoke the runner', () => {
  let runCount = 0;
  const controller = createValidationV2ViewController(() => {
    runCount += 1;
    return { ruleResults: [], summary: {} };
  });
  controller.selectGeometry('line');
  const results = [syntheticRuleResult('r', 'tema', counts({ passCount: 1 }))];
  getValidationV2PresentationRules(results, 'point', { searchQuery: 'tema' });
  filterValidationV2RulePresentations(getValidationV2RulePresentations(results, 'point'), {
    statusFilter: ValidationV2StatusFilter.ATTENTION,
  });
  sortValidationV2RulePresentations(getValidationV2RulePresentations(results, 'point'));
  controller.selectGeometry('point');
  assert.equal(runCount, 0);
});

test('A8.1A source contracts expose compact accessible rows and no object list', async () => {
  const workspace = await readFile(new URL(
    '../src/components/validation-v2/ValidationV2Workspace.js', import.meta.url,
  ), 'utf8');
  const list = await readFile(new URL(
    '../src/components/validation-v2/ValidationV2RuleList.js', import.meta.url,
  ), 'utf8');
  const toolbar = await readFile(new URL(
    '../src/components/TabSwitcher.js', import.meta.url,
  ), 'utf8');
  assert.match(workspace, /Søk i kontroller/);
  assert.match(workspace, /statusFilter/);
  assert.match(workspace, /sortMode/);
  assert.doesNotMatch(workspace, /FindingGroups|groupValidationV2Findings|finding\.objectRef/);
  assert.match(list, /aria-expanded/);
  assert.match(list, /aria-controls/);
  assert.match(list, /role="region"/);
  assert.match(list, /Objekter i grunnlaget/);
  assert.match(list, /aria-label={`Status: \$\{presentation\.status\.label\}`}/);
  assert.doesNotMatch(list, /Objekt 1|Objekt 2|objectRef\.sourceIndex|>\{presentation\.status\.label\}</);
  assert.match(workspace, /RESET_PRESENTATION/);
  assert.match(workspace, /validation-v2-filter-panel/);
  assert.doesNotMatch(workspace, /<select[^>]+value=\{presentationState\.(statusFilter|sortMode)\}/);
  assert.match(toolbar, /<TestModeControl \/>/);
});
