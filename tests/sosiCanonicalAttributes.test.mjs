import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);
const { mapSosiCanonicalAttributes } = await import('../src/lib/parsing/sosiCanonicalAttributes.js');

const line = (properties, inferredFcode = 'VL') =>
  mapSosiCanonicalAttributes({ geometryType: 'LineString', properties, inferredFcode });
const point = (properties, inferredFcode = 'KUM') =>
  mapSosiCanonicalAttributes({ geometryType: 'Point', properties, inferredFcode });

for (const [map, groupName] of [[line, 'EGS_LEDNING'], [point, 'EGS_PUNKT']]) {
  test(`${groupName}.status maps additively with canonical precedence and raw codes`, () => {
    for (const code of ['D', 'N', 'E', 'EF', 'EN', 'F', 'UK', 'MIDLUTED', 'XYZ', '  raw  ']) {
      const group = Object.freeze({ status: code });
      const source = Object.freeze({ [groupName]: group });
      const { attributes } = map(source);
      assert.equal(attributes.Status, code);
      assert.strictEqual(attributes[groupName], group);
      assert.equal(group.status, code);
      assert.equal(Object.hasOwn(source, 'Status'), false);
      assert.equal(map({ ...source, Status: 'R' }).attributes.Status, 'R');
      for (const empty of [undefined, null, '']) {
        assert.equal(map({ ...source, Status: empty }).attributes.Status, code);
      }
    }
  });

  test(`${groupName} missing/blank status stays absent and unverified aliases stay raw`, () => {
    for (const source of [{}, { [groupName]: {} }, { [groupName]: { STATUS: 'D' } }, { status: 'D' }]) {
      assert.equal(Object.hasOwn(map(source).attributes, 'Status'), false);
    }
    for (const status of [undefined, null, '', '   ', 0, false]) {
      const source = { [groupName]: { status } };
      assert.equal(Object.hasOwn(map(source).attributes, 'Status'), false);
      assert.strictEqual(map(source).attributes[groupName], source[groupName]);
    }
    assert.equal(map({ Status: 'XYZ' }).attributes.Status, 'XYZ');
  });
}

test('line core maps exact source paths and keeps numeric dimensions and year', () => {
  const group = {
    L_TEMA: 'SP', MATERIAL: '10P', DIMENSJON: '32.00', INNVUTV_DIM: 'ID',
    FORM: 'S', NETTYPE: 'F', ANLEGGSÅR: '0',
  };
  const { attributes } = line({ EGS_LEDNING: group });
  assert.equal(attributes.S_FCODE, 'SP');
  assert.equal(attributes.Material, '10P');
  assert.equal(attributes.Dimensjon, 32);
  assert.equal(attributes.InnvendigUtvendig, 'ID');
  assert.equal(attributes.Rørform, 'S');
  assert.equal(attributes.Nett_type, 'F');
  assert.equal(attributes.Anleggsår, 0);
  assert.strictEqual(attributes.EGS_LEDNING, group);
});

test('sparse line aliases and shared metadata use narrow normalization', () => {
  const capture = new Date('2021-06-07T08:09:10.000Z');
  const properties = {
    EGS_LEDNING: { TYKK: '4.25', RINGSTIVH: 'SN8', TRYKKLAS: 'KL25', VERT_NIVÅ: 'B', extra: { n: 1 } },
    HØYDEREFERANSE: 'UNKNOWN', STEDF_FORH: 'A', STEDF_ÅRSA: 'B', datafangstdato: capture,
    unknown: { nested: true },
  };
  const { attributes } = line(properties);
  assert.equal(attributes.Tykkelse, 4.25);
  assert.equal(attributes.Ringstivhet, 'SN8');
  assert.equal(attributes.Trykklasse, 'KL25');
  assert.equal(attributes.Vertikalnivå, 'B');
  assert.equal(attributes.Høydereferanse, 'UNKNOWN');
  assert.equal(attributes.Stedfestingsforhold, 'A');
  assert.equal(attributes.Stedfestingsårsak, 'B');
  assert.equal(attributes.Datafangstdato, capture.toISOString());
  assert.strictEqual(attributes.datafangstdato, capture);
  assert.strictEqual(attributes.EGS_LEDNING, properties.EGS_LEDNING);
  assert.strictEqual(attributes.unknown, properties.unknown);
});

test('unverified line fields and dates stay source-only', () => {
  const properties = {
    EGS_LEDNING: {
      INNV_DIM_1: '88', UTV_DIM_1: '100', lengde: 9.1, SDR: '17.0',
      geodataeier: 'owner', DRIFTSANSV: 'operator', SID: 'db-id',
      REGDATO: '20200101000000', ENDREDATO: '20210101000000',
    },
    datauttaksdato: new Date('2022-01-01Z'),
  };
  const { attributes } = line(properties);
  for (const key of ['Dimensjon', 'VertikalDimensjon', 'Lengde', 'SDR', 'AnleggsID', 'Datafangstdato']) {
    assert.equal(Object.hasOwn(attributes, key), false, key);
  }
  assert.equal(attributes.Eier, 'owner');
  assert.strictEqual(attributes.EGS_LEDNING, properties.EGS_LEDNING);
  assert.strictEqual(attributes.datauttaksdato, properties.datauttaksdato);
});

test('existing canonical values win, including zero and false; empty slots fill', () => {
  const aliases = { MATERIAL: 'PE', DIMENSJON: '40', ANLEGGSÅR: '1999', L_TEMA: 'SP', NETTYPE: 'F' };
  const { attributes } = line({
    EGS_LEDNING: aliases, S_FCODE: 'OV', Material: 'PVC', Dimensjon: 0,
    Anleggsår: false, Nett_type: '', Rørform: null, Tykkelse: undefined,
  });
  assert.equal(attributes.S_FCODE, 'OV');
  assert.equal(attributes.Material, 'PVC');
  assert.equal(attributes.Dimensjon, 0);
  assert.equal(attributes.Anleggsår, false);
  assert.equal(attributes.Nett_type, 'F');
  assert.equal(line({ EGS_LEDNING: { FORM: 'S', TYKK: '2' }, Rørform: null, Tykkelse: undefined }).attributes.Rørform, 'S');
  assert.equal(line({ EGS_LEDNING: { TYKK: '2' }, Tykkelse: undefined }).attributes.Tykkelse, 2);
});

test('line source identity beats inference, which remains fallback', () => {
  assert.equal(line({ EGS_LEDNING: { L_TEMA: 'HK' } }).attributes.S_FCODE, 'HK');
  assert.equal(line({ EGS_LEDNING: {} }).attributes.S_FCODE, 'VL');
  assert.equal(line({ S_FCODE: '' }, 'OV').attributes.S_FCODE, 'OV');
  assert.equal(Object.hasOwn(line({}).attributes, 'Tema'), false);
});

test('quality copies five exact fields and retains source NaN values', () => {
  const kvalitet = {
    målemetode: 36, nøyaktighet: 12, synbarhet: Number.NaN,
    målemetodeHøyde: 7, nøyaktighetHøyde: Number.NaN, extra: { raw: 'x' },
  };
  for (const mapped of [line({ kvalitet }), point({ kvalitet })]) {
    assert.deepEqual(
      ['Målemetode', 'Nøyaktighet', 'Synbarhet', 'MålemetodeHøyde', 'NøyaktighetHøyde']
        .map((key) => mapped.attributes[key]),
      [36, 12, null, 7, null],
    );
    assert.strictEqual(mapped.attributes.kvalitet, kvalitet);
    assert.ok(Number.isNaN(kvalitet.synbarhet));
    assert.ok(Number.isNaN(kvalitet.nøyaktighetHøyde));
  }
});

test('invalid capture dates are safe and source Date remains untouched', () => {
  const invalid = new Date(NaN);
  const { attributes } = line({ datafangstdato: invalid });
  assert.equal(attributes.Datafangstdato, null);
  assert.strictEqual(attributes.datafangstdato, invalid);
  assert.equal(Object.hasOwn(line({ datafangstdato: 'not-a-date' }).attributes, 'Datafangstdato'), false);
});

test('primitive GUID is retained and passed to structural field; absent GUID stays null', () => {
  const result = line({ GUID: 'source-guid' });
  assert.equal(result.attributes.GUID, 'source-guid');
  assert.equal(result.guid, 'source-guid');
  assert.equal(point({}).guid, null);
});

test('rich point maps exact structure fields and shared metadata without changing source', () => {
  const capture = new Date('2020-01-02Z');
  const group = {
    P_TEMA: 'KUM', TYPE: 'UTS_LOD', KUMBREDDE: '1200', KUMFORM: 'R',
    INNVUTV_DIM: 'ID', ANLEGGSÅR: '0', BYGGEMET: 'UKJENT', TYKK: '12.5',
    KJEGLE: 'J', ADKOMST: 'A', PUNKTIDANL: 'facility-1', VERT_NIVÅ: 'B',
    unknownChild: { raw: true },
  };
  const kvalitet = { målemetode: 1, nøyaktighet: 20, synbarhet: 2, målemetodeHøyde: 3, nøyaktighetHøyde: 4 };
  const result = point({
    EGS_PUNKT: group,
    GUID: 'point-guid', datafangstdato: capture,
    STEDF_FORH: 'S', STEDF_ÅRSA: 'A', HØYDEREFERANSE: 'NN2000',
    kvalitet, unknownTop: { raw: true },
  }, 'VL');
  assert.deepEqual(Object.fromEntries([
    'S_FCODE', 'Type', 'Bredde', 'Kumform', 'InnvendigUtvendig',
    'Anleggsår', 'Byggemetode', 'Tykkelse', 'Kjegle', 'Adkomst',
    'AnleggsID', 'Vertikalnivå',
  ].map((key) => [key, result.attributes[key]])), {
    S_FCODE: 'KUM', Type: 'UTS_LOD', Bredde: 1200, Kumform: 'R',
    InnvendigUtvendig: 'ID', Anleggsår: 0, Byggemetode: 'UKJENT',
    Tykkelse: 12.5, Kjegle: 'J', Adkomst: 'A', AnleggsID: 'facility-1',
    Vertikalnivå: 'B',
  });
  assert.equal(result.guid, 'point-guid');
  assert.equal(result.attributes.GUID, 'point-guid');
  assert.equal(result.attributes.Datafangstdato, capture.toISOString());
  assert.equal(result.attributes.Stedfestingsforhold, 'S');
  assert.equal(result.attributes.Stedfestingsårsak, 'A');
  assert.equal(result.attributes.Høydereferanse, 'NN2000');
  assert.equal(result.attributes.Målemetode, 1);
  assert.equal(result.attributes.NøyaktighetHøyde, 4);
  assert.strictEqual(result.attributes.EGS_PUNKT, group);
  assert.strictEqual(result.attributes.kvalitet, kvalitet);
  assert.deepEqual(result.attributes.unknownTop, { raw: true });
  assert.equal(group.KUMBREDDE, '1200');
  assert.equal(Object.hasOwn(result.attributes, 'Tema'), false);
});

test('equipment and operational point shapes receive only exact present aliases', () => {
  const equipment = point({ objekttypenavn: 'Stengeventil', EGS_PUNKT: { P_TEMA: 'SV', SID: 'db-id' } }, 'VL');
  const operation = point({ objekttypenavn: 'VADriftsdata', EGS_PUNKT: { BKODE: 'x', DBID: 'db-id', MDATO: '2020' } }, 'VADRIFTSDATA');
  const symbol = point({ objekttypenavn: 'VASymbol', EGS_PUNKT: { P_TEMA: 'SYM' } }, 'VASYMBOL');
  const annotation = point({ objekttypenavn: 'VAPåskrift', text: 'label' }, 'VAPASKRIFT');
  assert.equal(equipment.attributes.S_FCODE, 'SV');
  assert.equal(operation.attributes.EGS_PUNKT.BKODE, 'x');
  assert.equal(Object.hasOwn(operation.attributes, 'S_FCODE'), false);
  assert.equal(symbol.attributes.S_FCODE, 'SYM');
  assert.equal(annotation.attributes.text, 'label');
  assert.equal(Object.hasOwn(annotation.attributes, 'S_FCODE'), false);
  assert.equal(Object.hasOwn(point({ objekttypenavn: 'VASymbol', EGS_PUNKT: {} }).attributes, 'S_FCODE'), false);
  for (const result of [equipment, operation, symbol, annotation]) {
    for (const key of ['Type', 'Bredde', 'Kumform', 'Anleggsår', 'AnleggsID', 'Målemetode']) {
      assert.equal(Object.hasOwn(result.attributes, key), false, key);
    }
    assert.equal(result.guid, null);
  }
  assert.equal(Object.hasOwn(annotation.attributes, 'EGS_PUNKT'), false);
});

test('point precedence fills empty slots, keeps supplied scalars, and infers identity last', () => {
  const group = { P_TEMA: 'SP', TYPE: 'UTS_LTV', KUMBREDDE: '900', ANLEGGSÅR: '9999', PUNKTIDANL: 'source-id' };
  const attrs = point({ EGS_PUNKT: group, S_FCODE: '', Type: 'given', Bredde: 0, Anleggsår: false, AnleggsID: null }).attributes;
  assert.equal(attrs.S_FCODE, 'SP');
  assert.equal(attrs.Type, 'given');
  assert.equal(attrs.Bredde, 0);
  assert.equal(attrs.Anleggsår, false);
  assert.equal(attrs.AnleggsID, 'source-id');
  assert.equal(point({ EGS_PUNKT: { TYPE: 'UTS_LTV', KUMBREDDE: '900', ANLEGGSÅR: '9999' }, Type: null, Bredde: undefined, Anleggsår: '' }).attributes.Type, 'UTS_LTV');
  assert.equal(point({ EGS_PUNKT: { KUMBREDDE: '900' }, Bredde: undefined }).attributes.Bredde, 900);
  assert.equal(point({ EGS_PUNKT: { ANLEGGSÅR: '9999' }, Anleggsår: '' }).attributes.Anleggsår, 9999);
  assert.equal(point({ EGS_PUNKT: {} }, 'KUM').attributes.S_FCODE, 'KUM');
  assert.equal(point({ S_FCODE: 'EXPLICIT', EGS_PUNKT: { P_TEMA: 'SP' } }).attributes.S_FCODE, 'EXPLICIT');
});

test('unverified point size, quality, ownership, and identity paths stay source-only', () => {
  const group = {
    SID: 'db-id', DIMENSJON: '300', INNV_BREDDE_1: '500', UTV_BREDDE_1: '600',
    DYBDE_BER: '2000', TOPPLOKKH: '10', HBUNN: '8', geodataeier: 'owner', DRIFTSANSV: 'operator',
    MÅLEMETODE_TOPPZ: '1', NØYAKTIGHET_TOPPZ: '2',
  };
  const attrs = point({ EGS_PUNKT: group, datauttaksdato: new Date('2020-01-01Z') }).attributes;
  for (const key of [
    'AnleggsID', 'Bredde', 'Lengde', 'Avst_BunnInnvUnderUtv', 'Utvendig_høyde',
    'Datafangstdato', 'MålemetodeHøyde', 'NøyaktighetHøyde',
  ]) assert.equal(Object.hasOwn(attrs, key), false, key);
  assert.equal(attrs.Eier, 'owner');
  assert.strictEqual(attrs.EGS_PUNKT, group);
  assert.equal(Object.hasOwn(point({ EGS_PUNKT: { KUMBREDDE: 'unknown', TYKK: '' } }).attributes, 'Bredde'), false);
});

test('geodataeier maps exactly to canonical Eier for lines and points', () => {
  const lineGroup = { geodataeier: 'K', DRIFTSANSV: 'operator', SID: 'line-db-id' };
  const pointGroup = { geodataeier: 'P', DRIFTSANSV: 'operator', SID: 'point-db-id' };
  const mappedLine = line({ EGS_LEDNING: lineGroup });
  const mappedPoint = point({ EGS_PUNKT: pointGroup });

  assert.equal(mappedLine.attributes.Eier, 'K');
  assert.equal(mappedPoint.attributes.Eier, 'P');
  assert.strictEqual(mappedLine.attributes.EGS_LEDNING, lineGroup);
  assert.strictEqual(mappedPoint.attributes.EGS_PUNKT, pointGroup);
  assert.equal(line({ EGS_LEDNING: { geodataeier: 'P1' } }).attributes.Eier, 'P1');
  assert.equal(Object.hasOwn(line({ EGS_LEDNING: {} }).attributes, 'Eier'), false);
  assert.equal(Object.hasOwn(point({ EGS_PUNKT: {} }).attributes, 'Eier'), false);

  assert.equal(line({ EGS_LEDNING: { geodataeier: 'P' }, Eier: 'K' }).attributes.Eier, 'K');
  assert.equal(point({ EGS_PUNKT: { geodataeier: 'K' }, Eier: 'P' }).attributes.Eier, 'P');
  assert.equal(line({ EGS_LEDNING: { geodataeier: '  K-raw  ' } }).attributes.Eier, '  K-raw  ');
});
