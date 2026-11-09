import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runGmiValidationV2 } from '../src/lib/validation-v2/validationRunner.js';
import { getValidationRule } from '../src/lib/validation-v2/registry/rules.js';
import { buildFieldDiagnostics, renderValidationV2Diagnostic } from '../src/lib/validation-v2/diagnostics.js';

test('shared semantic colours alias the established Validator palette; Rettinger and Validator consume them', async () => {
  const source = (file) => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
  const css = await source('app/globals.css');
  for (const [tone, palette] of [['error', 'red'], ['warning', 'orange'], ['success', 'green']]) {
    for (const [role, shade] of [['bg', '50'], ['text', '800'], ['border', '200'], ['icon', '700']]) {
      assert(css.includes(`--gmi-validation-${tone}-${role}: var(--color-${palette}-${shade})`));
    }
    assert(css.includes(`[data-validation-tone='${tone}']`));
  }
  assert.match(css, /\.photo-icon-tooltip\[data-validation-tone\][^}]*background: var\(--validation-bg\)[^}]*color: var\(--validation-text\)/);
  const local = await source('components/gmi-edit/gmiEdit.css');
  assert.match(local, /\.gmi-edit-finding\.photo-icon-button[^}]*color: var\(--validation-icon\)/);
  assert.doesNotMatch(local.match(/\.gmi-edit-finding[^}]*}/g).join('\n'), /#[0-9a-f]{3,8}/i);
  for (const file of ['ValidationV2RuleList.js', 'ValidationV2FieldDetailContent.js']) {
    assert.match(await source(`components/validation-v2/${file}`), /data-validation-tone/);
  }
});

test('shared Datafangstdato explanations follow the evaluated reason and preserve date classifications', () => {
  const attributes = [
    { Datafangstdato: '19.11.2026', Anleggsår: '2026' },
    { Datafangstdato: '31.02.2026', Anleggsår: '2026' },
    { Datafangstdato: '01.01.2025', Anleggsår: '2026' },
    { Datafangstdato: '01.01.2020', Anleggsår: '2019' },
    { Datafangstdato: '09.11.2021', Anleggsår: '2019' },
    { Datafangstdato: '', Anleggsår: '2026' },
  ];
  const dataset = { points: attributes.map((value) => ({ attributes: value })), lines: [] };
  const input = { layerId: 'polish-date', dataset, datasetRevision: 'date-revision', sourceFormat: 'gmi', referenceDate: '2026-11-09' };
  const result = runGmiValidationV2(input);
  const rule = getValidationRule('innmaling.common.capture-date.required');
  const outcomes = result.outcomes.filter((outcome) => outcome.ruleId === rule.ruleId);
  assert.deepEqual(outcomes.map(({ state, reasonCode }) => [state, reasonCode]), [
    ['FAIL', 'DATE_FUTURE'], ['FAIL', 'DATE_FORMAT_INVALID'], ['FAIL', 'DATE_BEFORE_INSTALLATION'],
    ['CHECK', 'DATE_OLDER_THAN_FIVE_YEARS'], ['PASS', null], ['FAIL', 'REQUIRED_VALUE_MISSING'],
  ]);
  const render = (index) => {
    const rr = result.ruleResults.find((entry) => entry.rule.ruleId === rule.ruleId);
    const single = { ...result, ruleResults: [{ ...rr, findings: rr.findings.filter((finding) => finding.objectRef.sourceIndex === index) }], schemaFindings: [] };
    const model = buildFieldDiagnostics({ result: single, rule, geometryScope: 'point' });
    return model.diagnostics.map(renderValidationV2Diagnostic).join('\n');
  };
  assert.equal(render(0), 'Datafangstdato er 19.11.2026, som ligger i fremtiden. Kontroller datoen.');
  assert.match(render(1), /ikke en gyldig dato.*DD.MM.ÅÅÅÅ/);
  assert.match(render(2), /ligger før Anleggsår/);
  assert.match(render(3), /mer enn fem år gammel/);
  assert.match(render(5), /mangler Datafangstdato/);
  for (const index of [1, 2, 3, 5]) assert.doesNotMatch(render(index), /fremtiden/);
  const later = runGmiValidationV2({ ...input, referenceDate: '2026-11-20' });
  assert.equal(later.outcomes.find((entry) => entry.ruleId === rule.ruleId).state, 'PASS', 'reference date remains an engine input, not a hard-coded UI comparison');
});
