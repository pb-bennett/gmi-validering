import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { getGmiFieldValueDomain } from '../src/lib/validation-v2/fieldValueDomain.js';
import { getValidationRules } from '../src/lib/validation-v2/registry/rules.js';
import { getAuthoritativeValueTable } from '../src/lib/validation-v2/registry/fieldInformation.js';
import { checkGmiFieldDraft, describeGmiEditColumns } from '../src/lib/gmiEditFields.mjs';
import { gmiEditFieldPolicy, planGmiObjectForm } from '../src/lib/gmiEditView.mjs';
import { createGmiSourceDocument, getGmiSourceBytes, isGmiFieldEditReservedColumn, listGmiObjectCells } from '../src/lib/gmi-edit/index.mjs';
import { encodeSingleByte, GMI_EDIT_FIXTURE_DIR } from './helpers/gmiEditFixtures.mjs';
import { parseCalendarDate } from '../src/lib/validation-v2/calendarDate.js';

const domain = (canonicalFieldId, geometryScope = 'point') => getGmiFieldValueDomain({ canonicalFieldId, geometryScope });
function fixture(fields, count = 1) {
  const lines = ['[GMIFILE_ASCII]', '_VERSION 2', '_FILETYPE GMI', '_INDEX !!!!!!!!!!!!!!!!!!!!'];
  for (const [scope, marker] of [['point', 'P'], ['line', 'L']]) {
    lines.push(`[${marker}_]`, `_FIELDNAMES ${fields[scope].join(';')}`, `[+${marker}_]`);
    for (let index = 0; index < count; index++) {
      lines.push(`:${marker} ${index + 1}`, `_FIELDVALUES ${fields[scope].map(() => '').join(';')}`, '/XYZ', '581940 6566000 101');
      if (scope === 'line') lines.push('581945 6566001 101');
    }
  }
  lines.push('[END]', '');
  return encodeSingleByte(lines.join('\r\n'));
}

test('every enumerated domain offers exactly the governing rule lexemes, labelled from authoritative tables', () => {
  for (const rule of getValidationRules().filter((entry) => entry.allowedValues?.length)) {
    for (const scope of rule.geometryScopes) {
      const result = domain(rule.canonicalFieldId, scope);
      assert.equal(result.kind, 'enumeration');
      assert.equal(result.ruleId, rule.ruleId);
      assert.deepEqual(result.options.map(({ value }) => value), rule.allowedValues);
      assert.equal(result.upperCase, rule.allowedValues.every((value) => value === value.toUpperCase())
        && rule.allowedValues.some((value) => /\p{L}/u.test(value)), `${rule.ruleId}: uppercase is derived, not a per-field list`);
      const table = getAuthoritativeValueTable(rule.canonicalFieldId, scope);
      for (const option of result.options) {
        const row = table?.rows.find((entry) => entry.code === option.value);
        assert.equal(option.label, row?.meaning || option.value);
        assert.equal(option.longLabel, row?.longMeaning || row?.tema || null);
        assert(Object.isFrozen(option));
      }
      assert(Object.isFrozen(result.options));
      assert(Object.isFrozen(result));
    }
  }
  assert.equal(domain('measurementMethod').comparison, 'INTEGER_CODE_STRING');
  assert.equal(domain('sdr', 'line').comparison, 'numeric');
  assert.equal(domain('insideOutside').comparison, 'EXACT');
  assert.equal(domain('measurementMethod').upperCase, false);
  assert.equal(domain('insideOutside').upperCase, true);
  assert.equal(domain('sdr', 'point'), null);
  assert.equal(domain('unknown'), null);
});

test('G5 lone S_FCODE columns resolve through the existing schema to geometry-specific Tema domains', () => {
  const bytes = fixture({ point: ['S_FCODE', 'InnvendigUtvendig'], line: ['S_FCODE', 'InnvendigUtvendig'] });
  const document = createGmiSourceDocument(bytes);
  const view = { document };
  for (const scope of ['point', 'line']) {
    const columns = describeGmiEditColumns(view, scope).columns;
    assert.equal(columns[0].canonicalFieldId, 'tema');
    assert.strictEqual(columns[0].domain, domain('tema', scope));
    assert.strictEqual(columns[1].domain, domain('insideOutside', scope));
    assert.strictEqual(describeGmiEditColumns(view, scope).columns, columns, 'cached per document/scope');
  }
  assert.deepEqual(domain('insideOutside').options.map(({ value }) => value), ['ID', 'OD']);
  assert.notDeepEqual(domain('insideOutside').options, domain('insideOutside', 'line').options);
  assert.deepEqual(getGmiSourceBytes(document), bytes);
});

test('new modules contain no duplicate literal code arrays', async () => {
  for (const file of ['src/lib/validation-v2/fieldValueDomain.js', 'src/lib/gmiEditFields.mjs']) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\[\s*['"][^'"\r\n]+['"]\s*,\s*['"][^'"\r\n]+['"]/);
  }
});

test('format and unit hints preserve existing formats without introducing validation', () => {
  for (const [id, scope, kind, unit] of [
    ['captureDate', 'point', 'date', null], ['installationYear', 'line', 'year', null],
    ['dimension', 'line', 'integer', 'mm'], ['innerBottomToOuterUndersideDistance', 'point', 'decimal', 'm'],
    ['note', 'point', 'text', null], ['visibility', 'line', 'text', null],
  ]) {
    const result = domain(id, scope);
    assert.equal(result.kind, kind, id);
    assert.equal(result.unit, unit, id);
  }
  const column = { domain: domain('captureDate') };
  for (const date of ['11.11.2026', '2026-11-11', '20261111']) {
    assert(parseCalendarDate(date));
    assert.equal(checkGmiFieldDraft(column, date, 'ascii').lexeme, date);
    assert.equal(checkGmiFieldDraft(column, date, 'ascii').ok, true);
  }
  // Validator, rather than these hints, owns all format verdicts.
  assert.equal(checkGmiFieldDraft(column, 'not a date', 'ascii').ok, true);
  assert.equal(checkGmiFieldDraft({ domain: domain('dimension', 'line') }, '1.5', 'ascii').ok, true);
});

test('physical columns retain position, case, fallback and unsupported identity, independently for each geometry', () => {
  const fields = {
    point: ['S_FCODE', 'Tema', 'InnvendigUtvendig', 'S_HYPERLINK', 's_hyperlink_punkt', 'GUID', 'AnleggsID', 'DIM', 'Dato', 'custom', ''],
    line: ['tema', 'InnvendigUtvendig', 'SDR', 'Trykklasse', 'Ringstivhet', 'Material', 'Material', ''],
  };
  const bytes = fixture(fields);
  const document = createGmiSourceDocument(bytes);
  assert.equal(document.editable, true);
  const view = { document };
  const point = describeGmiEditColumns(view, 'point');
  const line = describeGmiEditColumns(view, 'line');
  assert.strictEqual(describeGmiEditColumns(view, 'point'), point);
  for (const [scope, description] of [['point', point], ['line', line]]) {
    assert.deepEqual(description.columns.map(({ sourceKey }) => sourceKey), fields[scope]);
    assert.deepEqual(description.columns.map(({ position }) => position), fields[scope].map((_, index) => index));
    assert.equal(description.columns.at(-1).reason, 'unnamed-field');
    assert.equal(description.columns.at(-1).operationKind, 'refused');
  }
  const column = (key) => point.columns.find(({ sourceKey }) => sourceKey === key);
  for (const key of ['S_FCODE', 'Tema']) {
    assert.equal(column(key).operationKind, 'linked-tema');
    assert.deepEqual(column(key).linkedSourceKeys, ['Tema', 'S_FCODE']);
    assert.equal(column(key).bindingState, 'MULTIPLE_ACCEPTED');
    assert.equal(column(key).domain.ruleId, domain('tema').ruleId);
  }
  assert.equal(column('S_FCODE').mappingKind, 'ACCEPTED_FALLBACK');
  for (const key of ['S_HYPERLINK', 's_hyperlink_punkt']) assert.equal(column(key).reason, 'field-owned-by-photo-delivery');
  assert.equal(column('GUID').reason, 'identifier-column');
  assert.equal(column('AnleggsID').reason, 'individual-only');
  assert.equal(column('DIM').validatorKind, 'recognized-unresolved');
  assert.equal(column('DIM').domain, null);
  assert.equal(column('Dato').validatorKind, 'disabled-alias');
  assert.equal(column('Dato').domain, null);
  assert.equal(column('custom').validatorKind, 'unknown');
  assert.equal(column('custom').editable, true);
  assert.equal(line.columns[0].mappingKind, 'CASE_NORMALIZED');
  assert.equal(line.columns[0].operationKind, 'generic');
  for (const key of ['SDR', 'Trykklasse', 'Ringstivhet']) {
    assert.equal(line.columns.find(({ sourceKey }) => sourceKey === key).operationKind, 'hydraulic');
  }
  for (const entry of line.columns.filter(({ sourceKey }) => sourceKey === 'Material')) assert.equal(entry.reason, 'duplicate-field-name');
  assert(point.absent.some(({ canonicalFieldId }) => canonicalFieldId === 'length'));
  assert(!line.absent.some(({ canonicalFieldId }) => canonicalFieldId === 'length'));
  assert(!point.absent.some(({ canonicalFieldId }) => canonicalFieldId === 'width'));
  assert(line.absent.some(({ canonicalFieldId }) => canonicalFieldId === 'dimension'));
  assert(!point.absent.some(({ canonicalFieldId }) => canonicalFieldId === 'dimension'));
  assert(!point.absent.some(({ canonicalFieldId }) => canonicalFieldId === 'captureDate'));
  assert.notDeepEqual(column('Tema').domain.options, line.columns[0].domain.options);
  assert.notDeepEqual(column('InnvendigUtvendig').domain.options, line.columns[1].domain.options);
  assert.deepEqual(getGmiSourceBytes(document), bytes);
});

test('strict drafts normalize code case, keep listed spellings and permit an explicit unchanged delivered value', () => {
  const column = { domain: domain('insideOutside') };
  assert.deepEqual(checkGmiFieldDraft(column, 'id', 'ascii'), { lexeme: 'ID', normalized: true, ok: true, problem: null, outOfDomain: false });
  assert.deepEqual(checkGmiFieldDraft(column, 'id', 'ascii', { currentLexeme: 'id' }),
    { lexeme: 'id', normalized: false, ok: true, problem: null, outOfDomain: true });
  for (const input of ['unknown', '', ' ID ']) {
    const result = checkGmiFieldDraft(column, input, 'ascii');
    assert.equal(result.ok, false);
    assert.equal(result.outOfDomain, true);
    assert.equal(result.problem.code, 'value-out-of-domain');
    const unchanged = checkGmiFieldDraft(column, input, 'ascii', { currentLexeme: input });
    assert.equal(unchanged.ok, true);
    assert.equal(unchanged.lexeme, input);
    assert.equal(unchanged.normalized, false);
  }
  assert.equal(checkGmiFieldDraft({ domain: domain('sdr', 'line') }, '11', 'ascii').ok, false);
  assert.equal(checkGmiFieldDraft({ domain: domain('measurementMethod') }, '010', 'ascii').ok, false);
  for (const [input, code] of [['a;b', 'lexeme-semicolon'], ['a\nb', 'lexeme-line-break'], ['a\tb', 'lexeme-control-character'], ['😀', 'lexeme-unrepresentable']]) {
    assert.equal(checkGmiFieldDraft(null, input, 'single-byte').problem.code, code);
  }
  assert.equal(checkGmiFieldDraft(null, 'æ', 'utf8-likely').problem.code, 'lexeme-non-ascii-in-utf8');
  assert.equal(checkGmiFieldDraft(null, '\u0081', 'single-byte').problem.code, 'lexeme-c1-control');
  assert.equal(checkGmiFieldDraft(null, 12, 'ascii').problem.code, 'lexeme-not-string');
  assert.equal(checkGmiFieldDraft(null, '', 'ascii').ok, true);
});

test('case variants keep distinct physical identity; linked Tema requires both direct and fallback columns', () => {
  const document = createGmiSourceDocument(fixture({ point: ['Tema', 'tema', ''], line: ['s_fcode', 'TEMA', ''] }));
  const point = describeGmiEditColumns({ document }, 'point');
  for (const column of point.columns.slice(0, 2)) {
    assert.equal(column.editable, true);
    assert.equal(column.operationKind, 'generic');
    assert.deepEqual(column.linkedSourceKeys, []);
  }
  const line = describeGmiEditColumns({ document }, 'line');
  for (const column of line.columns.slice(0, 2)) {
    assert.equal(column.operationKind, 'linked-tema');
    assert.deepEqual(column.linkedSourceKeys, ['TEMA', 's_fcode']);
  }
});

test('individual form retains unrestricted, unnormalized codes and existing date spellings', () => {
  for (const input of ['id', 'unlisted', '', ' ID ']) {
    const plan = planGmiObjectForm([{ field: 'InnvendigUtvendig', proposed: 'OD', original: 'OD', domain: domain('insideOutside') }],
      { InnvendigUtvendig: input }, 'ascii');
    assert.equal(plan.valid, true);
    assert.equal(plan.values.InnvendigUtvendig, input);
    assert.deepEqual(plan.needsOverwrite, ['InnvendigUtvendig']);
  }
  for (const input of ['11.11.2026', '2026-11-11', '20261111']) {
    assert.equal(planGmiObjectForm([{ field: 'Datafangstdato', proposed: '', original: '', domain: domain('captureDate') }],
      { Datafangstdato: input }, 'ascii').values.Datafangstdato, input);
  }
});

test('individual policy matches the prior policy for every synthetic corpus cell; read-only capabilities fail closed', async () => {
  let cells = 0;
  const prior = (cell) => {
    if (!cell) return { editable: false, reason: 'field-absent' };
    if (isGmiFieldEditReservedColumn(cell.field)) return { editable: false, reason: 'field-owned-by-photo-delivery' };
    if (!cell.editable) return { editable: false, reason: cell.reason || 'document-not-editable' };
    if (/^(s_)?(guid|uuid|objid|objekt_?id|lokal_?id|id)$/i.test(String(cell.field).trim())) return { editable: false, reason: 'identifier-column' };
    return { editable: true, reason: null };
  };
  assert.deepEqual(gmiEditFieldPolicy(null), prior(null));
  for (const name of (await readdir(GMI_EDIT_FIXTURE_DIR)).filter((file) => file.endsWith('.gmi'))) {
    const document = createGmiSourceDocument(new Uint8Array(await readFile(path.join(GMI_EDIT_FIXTURE_DIR, name))));
    if (!document.parser) continue;
    for (const [scope, collection] of [['point', document.parser.points], ['line', document.parser.linesParsed]]) {
      for (let index = 0; index < collection.length; index++) {
        for (const cell of listGmiObjectCells(document, scope, index) || []) {
          assert.deepEqual(gmiEditFieldPolicy(cell), prior(cell), `${name}:${scope}:${index}:${cell.field}`);
          cells++;
        }
      }
      if (!document.editable) assert(describeGmiEditColumns({ document }, scope).columns.every((column) => !column.editable));
    }
  }
  assert(cells > 100);
  // Existing AnleggsID editing remains available individually until G8.
  assert.equal(gmiEditFieldPolicy({ field: 'AnleggsID', editable: true }).editable, true);
});

test('capability binding is cached once per document on a large synthetic dataset', (t) => {
  const document = createGmiSourceDocument(fixture({ point: ['Tema', 'InnvendigUtvendig', ''], line: ['Tema', 'Material', 'SDR', ''] }, 10000));
  const start = performance.now();
  const first = describeGmiEditColumns({ document }, 'point');
  const firstMs = performance.now() - start;
  const cachedStart = performance.now();
  for (let index = 0; index < 1000; index++) assert.strictEqual(describeGmiEditColumns({ document }, 'point'), first);
  const line = describeGmiEditColumns({ document }, 'line');
  assert.strictEqual(describeGmiEditColumns({ document }, 'line'), line);
  t.diagnostic(`20,000 synthetic objects: first discovery ${firstMs.toFixed(2)} ms; 1,000 cached reads + line discovery ${(performance.now() - cachedStart).toFixed(2)} ms`);
});
