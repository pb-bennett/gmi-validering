// Field targets for source-preserving GMI editing (M1).
//
// A target is a stable source location: (geometry scope, parser-order source
// index, exact delivered column name) in the immutable source. It is never
// found by searching for a value's text, so identical values in different
// objects cannot be confused. Optional identity guards (`objectId`, the
// parser's `:L n`/`:P n` number, and `guid`) are checked when supplied; they
// are checks, not keys, because many real files have no GUIDs.
import { GMI_GEOMETRY_SCOPES } from './sourceIndex.mjs';
import { internalGmiSourceState } from './sourceDocument.mjs';
import { GMI_SOURCE_LEXEMES } from '../parsing/gmiLexicalEvidence.js';

const reject = (code, detail = {}) => Object.freeze({ ok: false, code, ...detail });

export const gmiCellKey = ({ scope, sourceIndex, field }) => JSON.stringify([scope, sourceIndex, field]);

function parserObject(state, scope, sourceIndex) {
  const config = GMI_GEOMETRY_SCOPES.find((entry) => entry.scope === scope);
  return state.parser?.[config.collection]?.[sourceIndex] ?? null;
}

/**
 * Resolve a target to its exact, editable source cell.
 * @param {object} document GmiSourceDocument
 * @param {{scope: 'point'|'line', sourceIndex: number, field: string, objectId?: number, guid?: string|null}} target
 * @returns {{ok: true, cell: object} | {ok: false, code: string}}
 */
export function resolveGmiCell(document, target) {
  const state = internalGmiSourceState(document);
  if (!document.editable) return reject('document-not-editable', { status: document.status, reasons: document.reasons });
  if (!target || typeof target !== 'object') return reject('invalid-target');
  const { scope, sourceIndex, field } = target;
  if (!GMI_GEOMETRY_SCOPES.some((entry) => entry.scope === scope)) return reject('unknown-scope');
  if (!Number.isInteger(sourceIndex) || sourceIndex < 0) return reject('invalid-source-index');
  if (typeof field !== 'string') return reject('invalid-field');
  const record = state.objects[scope][sourceIndex];
  const object = parserObject(state, scope, sourceIndex);
  if (!record || !object) return reject('object-not-found');
  if ('objectId' in target && !Object.is(target.objectId, object.id)) return reject('object-identity-mismatch', { check: 'objectId' });
  if ('guid' in target && (target.guid ?? null) !== (object.guid ?? null)) return reject('object-identity-mismatch', { check: 'guid' });
  if (record.issues.length) return reject('object-not-editable', { issues: record.issues });
  const cells = record.cells.filter((cell) => cell.field === field);
  if (!cells.length) return reject('field-absent');
  if (cells.length > 1) return reject('duplicate-field-name');
  const [cell] = cells;
  if (cell.reason) return reject(cell.reason);
  const indexed = state.cellsByStart.get(cell.start);
  if (!indexed || indexed.scope !== scope || indexed.sourceIndex !== sourceIndex || indexed.field !== field) return reject('cell-not-indexed');
  const lexeme = object.attributes[GMI_SOURCE_LEXEMES][field];
  return Object.freeze({
    ok: true,
    cell: Object.freeze({
      key: gmiCellKey({ scope, sourceIndex, field }),
      scope, sourceIndex, field,
      position: cell.position,
      line: cell.line,
      start: cell.start,
      end: cell.end,
      lexeme,
      objectId: object.id,
      guid: object.guid ?? null,
    }),
  });
}

/**
 * Every column of one object with its source lexeme and editability, for
 * inspection. Works on read-only documents too (cells are then not editable).
 */
export function listGmiObjectCells(document, scope, sourceIndex) {
  const state = internalGmiSourceState(document);
  const record = state.objects[scope]?.[sourceIndex];
  const object = record && parserObject(state, scope, sourceIndex);
  if (!record || !object) return null;
  const lexemes = object.attributes?.[GMI_SOURCE_LEXEMES] || {};
  return Object.freeze(record.cells.map((cell) => Object.freeze({
    field: cell.field,
    position: cell.position,
    lexeme: cell.start === null ? null : state.text.slice(cell.start, cell.end),
    parserLexeme: Object.hasOwn(lexemes, cell.field) ? lexemes[cell.field] : null,
    editable: document.editable && !cell.reason && cell.start !== null,
    reason: !document.editable ? 'document-not-editable' : cell.reason ?? (cell.start === null ? 'no-value' : null),
  })));
}
