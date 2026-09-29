import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);
const { mapSosiCanonicalAttributes } = await import('../src/lib/parsing/sosiCanonicalAttributes.js');

const line = (properties, inferredFcode = 'VL') =>
  mapSosiCanonicalAttributes({ geometryType: 'LineString', properties, inferredFcode });
const point = (properties, inferredFcode = 'KUM') =>
  mapSosiCanonicalAttributes({ geometryType: 'Point', properties, inferredFcode });

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
  for (const key of ['Dimensjon', 'VertikalDimensjon', 'Lengde', 'SDR', 'Eier', 'AnleggsID', 'Datafangstdato']) {
    assert.equal(Object.hasOwn(attributes, key), false, key);
  }
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

test('points receive only present shared fields and no EGS_PUNKT projection', () => {
  const capture = new Date('2020-01-02Z');
  const result = point({
    EGS_PUNKT: { P_TEMA: 'KUM', TYPE: 'K', KUMBREDDE: '1000', TYKK: '10' },
    GUID: 'point-guid', datafangstdato: capture,
    STEDF_FORH: 'S', STEDF_ÅRSA: 'A',
    kvalitet: { målemetode: 1 },
  });
  assert.equal(result.guid, 'point-guid');
  assert.equal(result.attributes.Datafangstdato, capture.toISOString());
  assert.equal(result.attributes.Stedfestingsforhold, 'S');
  assert.equal(result.attributes.Stedfestingsårsak, 'A');
  assert.equal(result.attributes.Målemetode, 1);
  for (const key of ['Type', 'Bredde', 'Tykkelse', 'AnleggsID']) {
    assert.equal(Object.hasOwn(result.attributes, key), false, key);
  }
  for (const name of ['VADriftsdata', 'VASymbol', 'VAPåskrift']) {
    const sparse = point({ objekttypenavn: name, EGS_PUNKT: { P_TEMA: 'x' } });
    assert.equal(Object.hasOwn(sparse.attributes, 'Type'), false);
    assert.equal(Object.hasOwn(sparse.attributes, 'Målemetode'), false);
    assert.equal(sparse.guid, null);
  }
});
