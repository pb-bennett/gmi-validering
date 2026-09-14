import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as api from '../src/lib/validation-v2/index.js';
import { getAuthoritativeValueTable } from '../src/lib/validation-v2/registry/fieldInformation.js';
import { AUTHORITATIVE_VALUE_TABLES } from '../src/data/validation-v2/authoritative-value-tables.js';

function presentation(canonicalFieldId, geometryScope = 'point') {
  const rule = api.getValidationRules().find((candidate) => candidate.canonicalFieldId === canonicalFieldId && candidate.geometryScopes.includes(geometryScope));
  assert(rule, `missing rule for ${canonicalFieldId}/${geometryScope}`);
  const field = api.composeFieldInformation({ canonicalFieldId, geometryScope, rule });
  return { rule, field, view: api.composeFieldRulePresentation({ field, rule }) };
}

test('Regel keeps technical identifiers out of primary presentation', () => {
  const { view } = presentation('constructionMethod');
  assert.equal(view.summary.includes('applicability'), false);
  assert.equal(view.technicalDetails.some((row) => row.label === 'Felt-ID' && row.value === 'constructionMethod'), true);
  assert.equal(view.technicalDetails.find((row) => row.label === 'Gjelder').value, 'Punkt');
});

test('Regel presents conditional applicability and construction-method UK guidance', () => {
  const { view } = presentation('constructionMethod');
  assert.deepEqual(view.applicabilityGuidance.values, ['KOTREKUM', 'KUM', 'KUMI', 'LOK', 'MKS', 'MKV', 'PMK', 'PMKAF', 'PMKOV', 'PMKSP', 'PMKVL', 'RED', 'SAN', 'SANI', 'SLG', 'SLI', 'SLS', 'SLU']);
  assert(view.evaluationGuidance.some((row) => row.status === 'Sjekk' && row.text.includes('UK')));
  assert.deepEqual(view.allowedValues.columns, ['code', 'meaning']);
  assert.deepEqual(view.allowedValues.rows.map((row) => row.code), ['B', 'BU', 'E', 'E0', 'E1', 'G', 'K', 'M', 'MU', 'P', 'S', 'SU', 'UK', 'V', 'W']);
  assert.equal(view.allowedValues.rows.find((row) => row.code === 'UK').meaning, 'Ukjent');
  assert.equal(view.allowedValues.rows.find((row) => row.code === 'UK').validator, 'Sjekk');
});

test('identical code/value pairs are represented once and missing metadata is omitted', () => {
  const { view } = presentation('constructionMethod');
  const b = view.allowedValues.rows.find((row) => row.code === 'B');
  assert.equal(b.meaning, 'Prefabr. betong');
  assert.equal(view.allowedValues.source.page, 15);
  assert.equal(view.technicalDetails.some((row) => row.value === 'Ikke dokumentert i kontrollert kildemateriale'), false);
});

test('authoritative source-table metadata is retained without changing registry behavior', () => {
  const table = getAuthoritativeValueTable('constructionMethod');
  assert.equal(table.source.document, 'Innmålingsinstruks Vedlegg A');
  assert.equal(table.source.version, '3.2 / August 2026');
  assert.equal(table.source.section, 'Kodeverk / Byggemetode');
  assert.equal(table.rows[2].meaning, 'Prefabr. PEH/PEM');
  assert.deepEqual(api.getValidationRule('innmaling.point.construction-method.valid').allowedValues, table.rows.map((row) => row.code));
  const lineInsideOutside = presentation('insideOutside', 'line').view.allowedValues;
  assert.equal(lineInsideOutside.source.page, 21);
  assert.equal(lineInsideOutside.rows[0].longMeaning, 'Ledningens dimensjon er innvendig');
});

test('representative fields receive appropriate user-facing sections', () => {
  const access = presentation('access').view;
  const hyperlink = presentation('attachmentLink').view;
  const date = presentation('captureDate').view;
  const type = presentation('type').view;
  const sdr = presentation('sdr', 'line').view;
  const simple = presentation('caseNumber').view;
  assert(access.applicabilityGuidance.text.includes('KUM'));
  assert(hyperlink.summary.includes('bilder'));
  assert(date.summary.includes('Datafangstdato'));
  assert(type.applicabilityGuidance);
  assert.equal(type.allowedValues.rows[0].code, 'BBAK');
  assert.equal(type.allowedValues.rows[0].tema, 'BAS');
  assert.equal(type.allowedValues.columns.includes('tema'), true);
  assert(sdr.applicabilityGuidance.text.includes('Tema'));
  assert.equal(simple.applicabilityGuidance, null);
});

test('Resultat aggregate semantics remain unchanged by Regel presentation composition', () => {
  const result = api.getValidationV2AggregateStatus({ passCount: 1, failCount: 0, checkCount: 0, indeterminateCount: 0 });
  assert.equal(result.label, 'Pass');
});

test('Målemetode and MålemetodeHøyde retain complete tables and the separate p.7 subsets', () => {
  const method = presentation('measurementMethod').view.allowedValues;
  const height = presentation('heightMeasurementMethod').view.allowedValues;
  assert.equal(method.heading, 'Gyldige koder');
  assert.deepEqual(method.columns, ['code', 'shortMeaning', 'longMeaning']);
  assert.equal(method.rows.length, 69);
  assert.equal(method.rows.find((row) => row.code === '12').longMeaning, 'Målt i terrenget med teodolitt og elektronisk avstandsmåler');
  assert.equal(method.rows.find((row) => row.code === '99').longMeaning, 'Målemetode er ukjent');
  assert.deepEqual(method.groups[0].rows.map((row) => row.code), ['11', '92', '96', '97']);
  assert.equal(method.groups[0].rows.find((row) => row.code === '97').longMeaning.endsWith('Denne skal brukes dersom man måler med 96 og ikke får «RTK Fix»'), true);
  assert.equal(method.source.page, '23–25');
  assert.equal(method.groups[0].source.page, 7);
  assert.equal(height.rows.length, 35);
  assert.equal(height.rows.find((row) => row.code === '23').shortMeaning, 'Autograf - vanlig registrering');
  assert.deepEqual(height.groups[0].rows.map((row) => row.code), ['11', '15', '96']);
  assert.equal(height.groups[0].source.page, 7);
  for (const [field, ruleId] of [['measurementMethod', 'innmaling.common.measurement-method.required'], ['heightMeasurementMethod', 'innmaling.common.height-measurement-method.required']]) {
    assert.deepEqual(getAuthoritativeValueTable(field).rows.map((row) => row.code), api.getValidationRule(ruleId).allowedValues);
  }
});

test('Stedfestingsforhold retains the separate source short and long descriptions', () => {
  const { view, rule } = presentation('positioningCondition', 'line');
  assert.deepEqual(view.allowedValues.columns, ['code', 'shortMeaning', 'longMeaning']);
  assert.equal(view.allowedValues.rows.length, 10);
  assert.equal(view.allowedValues.rows[0].shortMeaning, 'Delvis lukket grøft');
  assert.equal(view.allowedValues.rows[0].longMeaning, 'Grøften er delvis fylt igjen og stedfesting foregår på omfylte masser, hvor z-verdien til objektet er beregnet i forhold til objektets faktiske beliggenhet.');
  assert.deepEqual(view.allowedValues.rows.map((row) => row.code), rule.allowedValues);
  assert.equal(view.allowedValues.source.page, '7–8');
});

test('Synbarhet shows the exact p.8 source wording without changing its retired validator registry', () => {
  const { view, rule } = presentation('visibility');
  assert.equal(view.allowedValues.heading, 'Koder i instruksen');
  assert.equal(view.allowedValues.validatorCodesMatch, false);
  assert.deepEqual(view.allowedValues.rows, [
    { code: '0', meaning: 'Fullt ut synlig/gjenfinnbar i terrenget', validator: null },
    { code: '1', meaning: 'Dårlig gjenfinnbar i terreng', validator: null },
    { code: '2', meaning: 'Middels synlig i flybilde/modell', validator: null },
    { code: '3', meaning: 'Dårlig/ikke synlig i flybilde/modell', validator: null },
  ]);
  assert.equal(view.allowedValues.source.page, 8);
  assert.deepEqual(rule.allowedValues, []);
});

test('Tema point and line source tables remain distinct, ordered, traceable, and registry-aligned', () => {
  const point = presentation('tema', 'point').view.allowedValues;
  const line = presentation('tema', 'line').view.allowedValues;
  const pointCodes = 'ANB BAS BERGROM BFD BRN DAM DIV DRO FET FNT FORAKONSTR GRN GRØKONSTR GUT GVT HFO HYD I2B I2C I2K I2O I2P I2R I2T INB INR INT KMR KNP KOELSKAP KOGLYSMAS KONSTROMRIS KOTREKUM KRN KUM KUMI LOK MAS MKS MKV OFFENTOAL OIL OVL PAF PMK PMKAF PMKOV PMKSP PMKVL POV PSP PST PSTVL PSU RED RES ROV RSP RVA SAN SANI SEP SLA SLAMKIOSK SLG SLI SLS SLU SPR STR SUMP SVB TNK TOP TØKSTVL TØMSTBOBIL UTS VANNPOST VKI VPK VST'.split(' ');
  const lineCodes = 'AF AFBO AFD AFK AFLU AFO AFP AFS AFT AFVAR AFX DR I2 I2D I2I I2O I2P I2S I3 LEBEKXX500 LEBEKXX510 LEBEKXX511 LEBO LEBRO LEBUNT LEBYGLIN LEDIV LEELKABJOR LEELKABLUF LEELKABRØR LEFIBEKAB LEFJ LEFJRETUR LEFJTUR LEFUNDKANT LEGAS LEGASP LEGASS LEGLYSKAB LEGRØ LEGRØXX500 LEHJELIN LEISOL LEKA LEKAXX500 LEKU LEKULD LELYTKAB LEOPIKANAL LESIGNKAB LESLISS LESPUNT LESTIKKB LESTØTMUR LETRA LETRE LETREMKAB LETREUKAB LETRYKLUFT LETU LETUADK LEVANNBVARM LEVAR LEVARAF LEVARGAMAF LEVARGAMOV LEVARGAMSP LEVARGAMVL LEVAROV LEVARSP LEVARVL OV OVBO OVF OVI OVK OVKU OVO OVP OVR OVS OVT OVU OVVAR OVX SP SPBO SPD SPGRÅ SPI SPK SPLU SPO SPP SPS SPT SPVAR SPX VL VLBO VLI VLK VLLU VLP VLSPR VLT VLU VLVAR'.split(' ');
  assert.deepEqual(point.rows.map((row) => row.code), pointCodes);
  assert.deepEqual(line.rows.map((row) => row.code), lineCodes);
  assert.notEqual(point, line);
  assert.notDeepEqual(point.rows.map((row) => row.code), line.rows.map((row) => row.code));
  assert.equal(point.source.page, '10–12');
  assert.equal(line.source.page, '16–19');
  assert.equal(point.rows[0].meaning, 'Anboring');
  assert.equal(line.rows[19].meaning, "Åpen bekk ('foreløpig kode', avrenning, framføringsvei)");
  assert.deepEqual(point.rows.map((row) => row.code), api.getValidationRule('innmaling.point.tema.required').allowedValues);
  assert.deepEqual(line.rows.map((row) => row.code), api.getValidationRule('innmaling.line.tema.required').allowedValues);
});

test('new source tables do not use code/code duplicates and existing table content remains intact', () => {
  for (const key of ['measurementMethod', 'measurementMethodHeight', 'positioningCondition', 'visibility', 'temaPoint', 'temaLine']) {
    const source = AUTHORITATIVE_VALUE_TABLES[key];
    assert(source.rows.every((row) => !row.meaning || row.code !== row.meaning), key);
    assert(source.rows.every((row) => row.shortMeaning || row.longMeaning || row.meaning || source.columns.length === 1), key);
  }
  const construction = AUTHORITATIVE_VALUE_TABLES.constructionMethod;
  assert.deepEqual(construction.rows.slice(0, 5).map(({ code, meaning }) => [code, meaning]), [
    ['B', 'Prefabr. betong'], ['BU', 'Prefabr. betong u/bunn'], ['E', 'Prefabr. PEH/PEM'], ['E0', 'Prefabr. PE100'], ['E1', 'Prefabr. PE uspesifisert'],
  ]);
  assert.equal(api.getValidationRule('innmaling.common.visibility.retired').allowedValues.length, 0);
});

test('Type Regel uses one source-backed table with the original order, wording, and Tema relationships', () => {
  const { field, rule, view } = presentation('type');
  const source = AUTHORITATIVE_VALUE_TABLES.type;
  const expectedCodes = 'BBAK BFJE BNOD BRED BSPY BSTR BTRN DAM DAN DANODE DB11 DB15 DB22 DB30 DB45 DB90 DBJUST410 DBJUST420 DBJUST430 DDAM DEND DFOT DOVG DPORT DPPT DREPMUF DST DTAN DTERSK DVF DVPR FORAKLOSS FORAPLATE FORASPUNT GRØSTENG GRØSTENG01 GRØSTENG06 GRØSTENG10 KAS KBRE KDRE KFDL KINS KKAB KLV KMIN KPPK KPRØVFET KPRØVOIL KSDM KSTA KSTF KTRY KUMINLØP KUMPEILGRV KUMUTJEV KUMUTLØP KVIPP PSNK PTOR RBIO RMEK RMKJ RSDM SBA SLAPUMP SMIN SSTA STM TAN TTAN XLOK'.split(' ');
  assert.equal(view.allowedValues.heading, 'Gyldige Type-koder');
  assert.deepEqual(view.allowedValues.columns, ['code', 'meaning', 'tema']);
  assert.deepEqual(view.allowedValues.rows.map((row) => row.code), expectedCodes);
  assert.deepEqual(view.allowedValues.rows.map(({ code, meaning, tema }) => ({ code, meaning, tema })), source.rows);
  assert.equal(view.allowedValues.source.page, '12–14');
  assert.equal(view.allowedValues.groups, null);
  assert.equal(view.compatibility, null);
  assert.equal(view.allowedValues.rows[0].meaning, 'Basseng på bakken');
  assert.equal(view.allowedValues.rows[4].tema, 'BAS, BFD');
  assert.equal(view.allowedValues.validatorCodesMatch, true);

  assert.deepEqual(new Set(rule.allowedValues), new Set(source.rows.map((row) => row.code)));
  for (const row of source.rows) {
    assert.equal(row.tema, field.compatibility.byType[row.code].temaValues.join(', '), row.code);
  }
});

test('Type source table has no nested vertical scroller and Resultat remains untouched', () => {
  const modal = readFileSync(new URL('../src/components/validation-v2/ValidationV2FieldDetailContent.js', import.meta.url), 'utf8');
  const tableComponent = modal.match(/function SourceValueTable\([\s\S]*?\n}\n\nfunction ModernRulePanel/);
  assert(tableComponent, 'source-table renderer is present');
  assert.match(modal, /compactType=\{field\.canonicalFieldId === 'type'\}/);
  assert.match(tableComponent[0], /compactType \? 'relative rounded border border-slate-200'/);
  assert.doesNotMatch(tableComponent[0], /overflow-(?:auto|y-auto)|max-h-/);
  assert.equal(api.getValidationV2AggregateStatus({ passCount: 1, failCount: 0, checkCount: 0, indeterminateCount: 0 }).label, 'Pass');
  const activeTypeCodes = api.getValidationRule('innmaling.point.type.valid').allowedValues;
  assert.deepEqual(new Set(activeTypeCodes), new Set(AUTHORITATIVE_VALUE_TABLES.type.rows.map((row) => row.code)));
});
