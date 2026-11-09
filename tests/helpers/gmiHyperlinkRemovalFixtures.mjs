// Synthetic, in-memory GMI builders and FOTO evidence helpers for the M7
// hyperlink-removal tests. Every name, filename and GUID is fabricated; only
// the grammar shapes follow observed delivered values (see
// gmiPhotoFixtures.realGrammarFamilies and the M0 hyperlink-families fixture).
// Nothing here is written to disk, so the M0 fixture manifest is unaffected.
import { encodeSingleByte } from './gmiEditFixtures.mjs';
import { createGmiPhotoSource, reviewGmiPhotoSource } from '../../src/lib/photos/gmiPhotoSource.mjs';
import { gmiHyperlinkSelectionKey } from '../../src/lib/gmi-edit/hyperlinkRemoval.mjs';

export const LINE_FIELDS = ['S_FCODE', 'Tema', 'Material', 'Dimensjon', 'SDR', 'Trykklasse', 'S_HYPERLINK', 'Merknad', 'Datafangstdato'];
export const POINT_FIELDS = ['S_FCODE', 'Type', 'AnleggsID', 'S_HYPERLINK', 'Merknad', 'Kumform'];

export const link = (path, sign = null) => `link:"${path}"${sign ? ` sign:"${sign}"` : ''}`;
export const wrappers = (members, trailing = true) =>
  members.map((member, index) => `h:${index + 1}(${member})`).join(' ') + (trailing && members.length ? ' ' : '');

const guid = (kind, n) => `5ec0e000-0000-4000-8000-${(kind === 'L' ? 0x7000 : 0x8000 + n).toString(16).padStart(8, '0')}${n.toString(16).padStart(4, '0')}`;

/**
 * Build GMI text. `points` / `lines`: arrays of { hyperlink, merknad?, guid? (false = none) }.
 */
export function buildGmiText({ points = [], lines = [], eol = '\r\n' } = {}) {
  const extent = '_EXTENT 581900 6565900 582100 6566100 !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!';
  const out = ['[GMIFILE_ASCII]', '_VERSION 2', '_FILETYPE GMI', '_INDEX !!!!!!!!!!!!!!!!!!!!', extent,
    'COSYS_EPSG 25832', 'COSYSVER_EPSG 5941', 'PRODUCER Syntetisk testprodusent'];
  if (lines.length) out.push('[L_]', extent, `_FIELDNAMES ${LINE_FIELDS.join(';')};`);
  if (points.length) out.push('[P_]', extent, `_FIELDNAMES ${POINT_FIELDS.join(';')};`);
  if (lines.length) {
    out.push('[+L_]');
    lines.forEach((line, index) => {
      const n = index + 1;
      out.push(`:L ${n}`, '_EXTENT 581900 6565900 582100 6566100 ',
        `_FIELDVALUES VL;VL;PE;110;;PN10;${line.hyperlink};${line.merknad ?? `Linje ${n}`};2026-08-01;`);
      if (line.guid !== false) out.push(`GUID ${line.guid ?? guid('L', n)}`);
      out.push('/XYZ', `${581940 + n}.000 6566007.000 101.000`, `${581945 + n}.000 6566010.000 101.250`);
    });
  }
  if (points.length) {
    out.push('[+P_]');
    points.forEach((point, index) => {
      const n = index + 1;
      out.push(`:P ${n}`, `_FIELDVALUES KUM;Kum;SYNT-R${n};${point.hyperlink};${point.merknad ?? `Punkt ${n}`};S;`);
      if (point.guid !== false) out.push(`GUID ${point.guid ?? guid('P', n)}`);
      out.push('/XYZ', `${581940 + n * 7}.000 ${6566000 + n * 7}.000 ${100 + n}.000`);
    });
  }
  out.push('[END]');
  return out.join(eol) + eol;
}

export const latin1Bytes = (text) => encodeSingleByte(text);
export const utf8Bytes = (text) => new Uint8Array(Buffer.from(text, 'utf8'));

/** Photos that match by basename (one asset per distinct name unless duplicated on purpose). */
export function photosFor(filenames) {
  return filenames.map((name, index) => ({ id: `asset-${index + 1}-${name}`, originalFilename: name, sourceRelativePath: null }));
}

/**
 * The FOTO GMI source as the photo session stores it: an id, references with
 * `${id}:` prefixed ids, and a reviewed association ledger.
 */
export function sessionPhotoSource(document, photos, { id = 'photo-gmi-test', fingerprint = document.fingerprint } = {}) {
  const parsed = createGmiPhotoSource(document.parser, fingerprint);
  const source = Object.freeze({ ...parsed, id, references: Object.freeze(parsed.references.map((reference) => Object.freeze({ ...reference, id: `${id}:${reference.id}` }))) });
  return Object.freeze({ ...source, associationLedger: reviewGmiPhotoSource(source, photos) });
}

/** Ledger edges as FOTO occurrence-shaped selections. */
export function edgesOf(source) {
  return Object.values(source.associationLedger.associationsById);
}

export function selectionFor(source, edge) {
  return {
    key: gmiHyperlinkSelectionKey({ sourceFingerprint: source.fingerprint, objectKey: edge.objectKey, assetId: edge.photoId }),
    sourceId: source.id, sourceFingerprint: source.fingerprint,
    objectKey: edge.objectKey, assetId: edge.photoId, referenceIds: [...edge.referenceIds],
  };
}

/** Selection for the edge of `objectKey` whose photo has `filename`. */
export function selectByFilename(source, objectKey, filename) {
  const edge = edgesOf(source).find((candidate) => candidate.objectKey === objectKey
    && candidate.referenceIds.some((id) => source.references.find((reference) => reference.id === id)?.filename === filename));
  if (!edge) throw new Error(`no confident edge for ${objectKey} / ${filename}`);
  return selectionFor(source, edge);
}

export const objectKeyAt = (source, scope, sourceIndex) =>
  Object.values(source.objectsByKey).find((object) => object.geometryScope === scope && object.sourceIndex === sourceIndex).objectKey;
