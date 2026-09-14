import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { GMIParser } from '../src/lib/parsing/gmiParser.js';
import {
  buildFieldDiagnostics,
  buildValidationV2FieldDataPresentation,
  getValidationRule,
  getValidationV2FieldDataSummary,
  renderValidationV2ResultHeading,
  runGmiValidationV2,
} from '../src/lib/validation-v2/index.js';
import { getDatasetRevision } from '../src/lib/validation-v2/datasetRevision.js';

function makeDataset(points = [], lines = []) {
  const keys = (items) => Object.fromEntries([...new Set(items.flatMap((attributes) => Object.keys(attributes)))].map((key) => [key, {}]));
  return {
    points: points.map((attributes) => ({ attributes })),
    lines: lines.map((attributes) => ({ attributes })),
    fieldAnalysis: { points: keys(points), lines: keys(lines) },
  };
}

function run(dataset, layerId = 'field-data-presentation') {
  return runGmiValidationV2({ layerId, dataset, datasetRevision: getDatasetRevision(dataset), sourceFormat: 'gmi', referenceDate: '2026-09-11' });
}

function summarize(dataset, result, canonicalFieldId, geometryScope, layerId = 'field-data-presentation') {
  const rule = getValidationRule(result.ruleResults.find((item) => item.rule.canonicalFieldId === canonicalFieldId && item.rule.geometryScopes.includes(geometryScope))?.rule.ruleId);
  return getValidationV2FieldDataSummary({ layerId, dataset, result, geometryScope, canonicalFieldId, rule });
}

test('inside/outside distribution uses exact source meanings and shows missing as Mangler with actual status', () => {
  const dataset = makeDataset([
    ...Array.from({ length: 387 }, () => ({ InnvendigUtvendig: null })),
    ...Array.from({ length: 83 }, () => ({ InnvendigUtvendig: 'ID' })),
  ]);
  const result = run(dataset);
  const summary = summarize(dataset, result, 'insideOutside', 'point');
  const presentation = buildValidationV2FieldDataPresentation(summary);
  assert.deepEqual(presentation.columns, ['Levert verdi', 'Betydning', 'Antall', 'Andel', 'Resultat']);
  const missing = presentation.rows.find((row) => row.isMissing);
  const accepted = presentation.rows.find((row) => row.deliveredValue === '"ID"');
  assert.deepEqual([missing.deliveredValue, missing.meaning, missing.count, missing.share.toFixed(1), missing.status], ['Mangler', '—', 387, '82.3', 'Feil']);
  assert.deepEqual([accepted.meaning, accepted.count, accepted.share.toFixed(1), accepted.status], ['Innvendig dim', 83, '17.7', 'Pass']);
  assert.equal(accepted.style.row, 'bg-white');
  assert.equal(missing.style.row, 'border-l-2 border-l-red-400 bg-red-50/50');
  assert.doesNotMatch(JSON.stringify(presentation), /<null>/);
  const counts = result.ruleResults.find((item) => item.rule.canonicalFieldId === 'insideOutside').geometryBreakdown.point;
  assert.deepEqual([counts.failCount, counts.checkCount, counts.passCount], [387, 0, 83]);
});

test('Byggemetode UK keeps its authoritative meaning and Sjekk treatment', () => {
  const dataset = makeDataset([{ Tema: 'KUM', Byggemetode: 'UK' }]);
  const result = run(dataset, 'construction-method-presentation');
  const presentation = buildValidationV2FieldDataPresentation(summarize(dataset, result, 'constructionMethod', 'point', 'construction-method-presentation'));
  assert.deepEqual(presentation.rows.map((row) => [row.deliveredValue, row.meaning, row.status]), [['"UK"', 'Ukjent', 'Sjekk']]);
  assert.equal(presentation.rows[0].style.row, 'border-l-2 border-l-orange-400 bg-orange-50/50');
});

test('Type distribution shows the source meaning without the Regel Tema mapping', () => {
  const dataset = makeDataset([{ Tema: 'DIV', Type: 'DB11' }]);
  const result = run(dataset, 'type-presentation');
  const presentation = buildValidationV2FieldDataPresentation(summarize(dataset, result, 'type', 'point', 'type-presentation'));
  assert.equal(presentation.rows[0].meaning, 'Bend 11gr');
  assert.equal(presentation.rows[0].status, 'Pass');
  assert.doesNotMatch(JSON.stringify(presentation), /Gjelder for tema|DIV/);
});

test('Material and Rørform use source meanings from the selected geometry tables', () => {
  const dataset = makeDataset([], [{ Tema: 'VL', Material: 'PE100', Rørform: 'S' }]);
  const result = run(dataset, 'line-source-meanings');
  const material = buildValidationV2FieldDataPresentation(summarize(dataset, result, 'material', 'line', 'line-source-meanings'));
  const pipeShape = buildValidationV2FieldDataPresentation(summarize(dataset, result, 'pipeShape', 'line', 'line-source-meanings'));
  assert.equal(material.rows[0].meaning, 'Polyet. høy dens');
  assert.equal(pipeShape.rows[0].meaning, 'Sirkulær');
});

test('invalid supplied values get explicit Ugyldig verdi and Feil; code-only tables do not gain invented meanings', () => {
  const dataset = makeDataset([], [{ Tema: 'VL', Material: 'PE100', SDR: 'BAD' }]);
  const result = run(dataset, 'invalid-code-presentation');
  const presentation = buildValidationV2FieldDataPresentation(summarize(dataset, result, 'sdr', 'line', 'invalid-code-presentation'));
  assert.equal(presentation.hasMeaning, true);
  assert.deepEqual(presentation.rows.map((row) => [row.meaning, row.status, row.isInvalid]), [['Ugyldig verdi', 'Feil', true]]);
  assert.equal(presentation.rows[0].style.text, 'font-semibold text-red-800');

  const validDataset = makeDataset([], [{ Tema: 'VL', Material: 'PE100', SDR: '6.0' }]);
  const validResult = run(validDataset, 'code-only-presentation');
  const codeOnly = buildValidationV2FieldDataPresentation(summarize(validDataset, validResult, 'sdr', 'line', 'code-only-presentation'));
  assert.equal(codeOnly.hasMeaning, false);
  assert.deepEqual(codeOnly.columns, ['Levert verdi', 'Antall', 'Andel', 'Resultat']);
  assert.equal(codeOnly.rows[0].meaning, null);
});

test('one missing code bucket splits Feil and Sjekk rows while retaining actual counts', () => {
  const dataset = makeDataset([{ Tema: 'DIV', Type: null }, { Tema: 'KUM', Type: null }]);
  const result = run(dataset, 'missing-type-statuses');
  const presentation = buildValidationV2FieldDataPresentation(summarize(dataset, result, 'type', 'point', 'missing-type-statuses'));
  assert.deepEqual(presentation.rows.map((row) => [row.deliveredValue, row.meaning, row.count, row.status]), [
    ['Mangler', '—', 1, 'Feil'], ['Mangler', '—', 1, 'Sjekk'],
  ]);
  assert.equal(presentation.rows[1].style.row, 'border-l-2 border-l-orange-400 bg-orange-50/50');
  assert.deepEqual(presentation.rows.map((row) => row.qualifier?.label), ['Tema DIV', 'Tema KUM']);
  assert.match(presentation.rows[0].qualifier.explanation, /Type er .*Feil/);
  assert.match(presentation.rows[1].qualifier.explanation, /Type er .*Sjekk/);
  assert.doesNotMatch(JSON.stringify(presentation.rows.map((row) => row.qualifier)), /REQUIRED_VALUE_MISSING|innmaling\.|objectRef|ruleId/);
});

test('Adkomst distinguishes contextual missing Sjekk from non-applicable missing Pass', () => {
  const dataset = makeDataset([
    ...Array.from({ length: 64 }, () => ({ Tema: 'KUM', Adkomst: null })),
    ...Array.from({ length: 406 }, () => ({ Tema: 'DIV', Adkomst: null })),
  ]);
  const result = run(dataset, 'access-context-presentation');
  const presentation = buildValidationV2FieldDataPresentation(summarize(dataset, result, 'access', 'point', 'access-context-presentation'));
  assert.deepEqual(presentation.rows.map((row) => [row.deliveredValue, row.count, row.status, row.qualifier?.label]), [
    ['Mangler', 64, 'Sjekk', 'Tema KUM'],
    ['Mangler', 406, 'Pass', 'Ikke aktuelt'],
  ]);
  assert.match(presentation.rows[1].qualifier.explanation, /ikke aktuelt.*ikke Feil eller Sjekk/i);
});

test('simple one-context distributions stay compact without qualifiers', () => {
  const dataset = makeDataset([{ Tema: 'DIV', Type: 'DB11' }]);
  const result = run(dataset, 'simple-no-qualifier');
  const presentation = buildValidationV2FieldDataPresentation(summarize(dataset, result, 'type', 'point', 'simple-no-qualifier'));
  assert.equal(presentation.rows[0].qualifier, null);
});

test('contextual line failures expose only explanatory Tema, Material and RÃ¸rform dimensions', () => {
  const dataset = makeDataset([], [
    { Tema: 'VL', Material: 'PE100', ['R\u00f8rform']: 'S', VertikalDimensjon: null },
    { Tema: 'OV', Material: 'BET', ['R\u00f8rform']: 'E', VertikalDimensjon: null },
  ]);
  const result = run(dataset, 'line-context-qualifier');
  const presentation = buildValidationV2FieldDataPresentation(summarize(dataset, result, 'verticalDimension', 'line', 'line-context-qualifier'));
  const labels = presentation.rows.map((row) => row.qualifier?.label).filter(Boolean).join(' ');
  assert.match(labels, /form|Material|Tema/);
  assert.doesNotMatch(labels, /innmaling\.|object|reason/i);
});

test('context explanation control supports hover, focus and click without a permanent column', async () => {
  const modal = await readFile(new URL('../src/components/validation-v2/ValidationV2FieldInfoModal.js', import.meta.url), 'utf8');
  assert.match(modal, /role="tooltip"/);
  assert.match(modal, /onMouseEnter=.*setHovered/);
  assert.match(modal, /onFocus=.*setFocused/);
  assert.match(modal, /onClick=.*setClickedOpen/);
  assert.match(modal, /aria-label={`Forklaring .* hvorfor raden er \$\{status\}`}/);
  assert.doesNotMatch(modal, />Hvorfor<\/th>/);
  const tooltip = modal.match(/role="tooltip" className="([^"]+)"/);
  assert(tooltip);
  assert.match(tooltip[1], /whitespace-normal/);
  assert.match(tooltip[1], /break-normal/);
  assert.match(tooltip[1], /\[overflow-wrap:normal\]/);
  assert.match(tooltip[1], /hyphens-none/);
  assert.match(tooltip[1], /w-72/);
  assert.match(tooltip[1], /min-w-\[min\(16rem,calc\(100vw-2rem\)\)\]/);
  assert.match(tooltip[1], /max-w-\[calc\(100vw-2rem\)\]/);
  assert.match(modal, /<code className="break-all">\{row\.interpretedValue\}<\/code>/);
});

test('parser transformations stay accessible on demand instead of becoming a default column', async () => {
  const gmi = '[GMIFILE_ASCII]\n_VERSION 2\n[L_]\n_FIELDNAMES Tema;Dimensjon\n[+L_]\n:L 1\n_FIELDVALUES VL;001\n/XYZ\n1500 2500 10\n';
  const dataset = new GMIParser(gmi).toObject();
  const result = run(dataset, 'parser-transform-presentation');
  const presentation = buildValidationV2FieldDataPresentation(summarize(dataset, result, 'dimension', 'line', 'parser-transform-presentation'));
  assert.deepEqual(presentation.columns, ['Levert verdi', 'Antall', 'Andel', 'Resultat']);
  assert.equal(presentation.rows[0].deliveredValue, '"001"');
  assert.equal(presentation.rows[0].interpretedValue, '1');
  const modal = await readFile(new URL('../src/components/validation-v2/ValidationV2FieldInfoModal.js', import.meta.url), 'utf8');
  const detailsPanel = modal.slice(modal.indexOf('function DiagnosticResultPanel'), modal.indexOf('export default function ValidationV2FieldInfoModal'));
  assert.match(detailsPanel, /Tolket verdi/);
  assert.doesNotMatch(detailsPanel, /<th[^>]*>Parserverdi<\/th>/);
});

test('distribution presentation does not change Resultat counts or headline semantics', () => {
  const dataset = makeDataset([{ Tema: 'DIV', Type: null }, { Tema: 'KUM', Type: null }, { Tema: 'DIV', Type: 'DB11' }]);
  const result = run(dataset, 'headline-stability');
  const typeRule = getValidationRule('innmaling.point.type.valid');
  const beforeCounts = result.ruleResults.find((item) => item.rule.ruleId === typeRule.ruleId).geometryBreakdown.point;
  const model = buildFieldDiagnostics({ result, rule: typeRule, field: { canonicalFieldId: 'type', displayName: 'Type' }, geometryScope: 'point' });
  const heading = renderValidationV2ResultHeading({ field: { canonicalFieldId: 'type', displayName: 'Type' }, ...model });
  const presentation = buildValidationV2FieldDataPresentation(summarize(dataset, result, 'type', 'point', 'headline-stability'));
  const afterCounts = result.ruleResults.find((item) => item.rule.ruleId === typeRule.ruleId).geometryBreakdown.point;
  assert.equal(afterCounts, beforeCounts);
  assert.deepEqual([afterCounts.failCount, afterCounts.checkCount, afterCounts.passCount], [1, 1, 1]);
  assert.equal(heading, 'Feil i Type');
  assert.equal(presentation.rows.reduce((total, row) => total + row.count, 0), 3);
});
