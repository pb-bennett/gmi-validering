// Targeted byte replacement for source-preserving GMI editing (M1).
//
// Three layers, each fail-closed:
//
// planGmiFieldPatches(document, edits)
//   edit = { target: {scope, sourceIndex, field, objectId?, guid?},
//            expected: '<exact original lexeme>', lexeme: '<new lexeme>' }
//   Resolves each target to its indexed source cell, checks the expected
//   original lexeme (stale precondition), validates and encodes the new
//   lexeme under the document's encoding policy, and rejects duplicate
//   targets. Returns frozen patches with an original-byte precondition.
//
// applyGmiPatches(document, patches)
//   patch = { start, end, expected: Uint8Array, replacement: Uint8Array }
//   Byte splice with strict preconditions: the document must be editable and
//   intact; each range must be exactly one editable field-value span (so no
//   patch can reach a separator, EOL, header, GUID, geometry or any other
//   structure); the expected bytes must equal the original; replacement bytes
//   must be a valid encoded lexeme; ranges must not overlap. Output is the
//   original subarrays and replacement bytes concatenated; nothing outside the
//   patched spans is decoded or re-encoded. No patches -> identical bytes.
//
// editGmiFields(document, edits)
//   plan -> apply -> verifyGmiEdit (independent reparse and byte proofs).
//   Returns bytes only when verification passes.
import { validateGmiFieldLexeme, validateGmiReplacementBytes } from './encoding.mjs';
import { gmiSourceIntact, internalGmiSourceState } from './sourceDocument.mjs';
import { resolveGmiCell } from './targets.mjs';
import { verifyGmiEdit } from './verify.mjs';

const rejected = (rejections, stage) => Object.freeze({ ok: false, stage, rejections: Object.freeze(rejections.map((entry) => Object.freeze(entry))) });

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * @param {object} document GmiSourceDocument
 * @param {Array<{target: object, expected: string, lexeme: string}>} edits
 */
export function planGmiFieldPatches(document, edits) {
  const state = internalGmiSourceState(document);
  if (!document.editable) return rejected([{ code: 'document-not-editable', status: document.status, reasons: document.reasons }], 'plan');
  if (!Array.isArray(edits)) return rejected([{ code: 'invalid-edits' }], 'plan');
  const rejections = [], patches = [], seen = new Map();
  edits.forEach((edit, editIndex) => {
    const fail = (code, detail = {}) => rejections.push({ editIndex, code, ...detail });
    if (!edit || typeof edit !== 'object') { fail('invalid-edit'); return; }
    const resolved = resolveGmiCell(document, edit.target);
    if (!resolved.ok) { const { ok, code, ...detail } = resolved; void ok; fail(code, detail); return; }
    const { cell } = resolved;
    if (seen.has(cell.key)) { fail('duplicate-target', { firstEditIndex: seen.get(cell.key) }); return; }
    seen.set(cell.key, editIndex);
    if (typeof edit.expected !== 'string') { fail('missing-expected-value'); return; }
    if (edit.expected !== cell.lexeme) { fail('stale-expected-value'); return; }
    const encoded = validateGmiFieldLexeme(edit.lexeme, document.encoding.encodingClass);
    if (!encoded.ok) { const { ok, code, ...detail } = encoded; void ok; fail(code, detail); return; }
    patches.push(Object.freeze({
      cellKey: cell.key,
      target: Object.freeze({ scope: cell.scope, sourceIndex: cell.sourceIndex, field: cell.field }),
      start: cell.start,
      end: cell.end,
      expectedLexeme: cell.lexeme,
      lexeme: edit.lexeme,
      expected: state.bytes.slice(cell.start, cell.end),
      replacement: encoded.bytes,
    }));
  });
  if (rejections.length) return rejected(rejections, 'plan');
  return Object.freeze({ ok: true, patches: Object.freeze(patches) });
}

/**
 * Strict byte splice. Accepts patches from planGmiFieldPatches or equivalent
 * hand-built ones; every precondition is re-checked here.
 */
export function applyGmiPatches(document, patches) {
  const state = internalGmiSourceState(document);
  if (!document.editable) return rejected([{ code: 'document-not-editable', status: document.status }], 'apply');
  if (!gmiSourceIntact(document)) return rejected([{ code: 'source-bytes-mutated' }], 'apply');
  if (!Array.isArray(patches)) return rejected([{ code: 'invalid-patches' }], 'apply');
  const source = state.bytes;
  const rejections = [], accepted = [];
  patches.forEach((patch, patchIndex) => {
    const fail = (code) => rejections.push({ patchIndex, code });
    if (!patch || typeof patch !== 'object') { fail('invalid-patch'); return; }
    const { start, end } = patch;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > source.length) { fail('invalid-range'); return; }
    const cell = state.cellsByStart.get(start);
    if (!cell || cell.end !== end) { fail('range-not-a-field-value'); return; }
    if (!(patch.expected instanceof Uint8Array)) { fail('missing-precondition'); return; }
    if (!bytesEqual(patch.expected, source.subarray(start, end))) { fail('stale-precondition'); return; }
    const replacement = validateGmiReplacementBytes(patch.replacement, document.encoding.encodingClass);
    if (!replacement.ok) { fail(replacement.code); return; }
    accepted.push({ patchIndex, start, end, replacement: replacement.bytes });
  });
  accepted.sort((a, b) => a.start - b.start || a.end - b.end);
  for (let k = 1; k < accepted.length; k++) {
    const previous = accepted[k - 1], current = accepted[k];
    if (previous.end > current.start || previous.start === current.start) rejections.push({ patchIndex: current.patchIndex, code: 'overlapping-patches', with: previous.patchIndex });
  }
  if (rejections.length) return rejected(rejections, 'apply');
  const size = accepted.reduce((sum, patch) => sum - (patch.end - patch.start) + patch.replacement.length, source.length);
  const output = new Uint8Array(size);
  let cursor = 0, offset = 0;
  for (const patch of accepted) {
    output.set(source.subarray(cursor, patch.start), offset);
    offset += patch.start - cursor;
    output.set(patch.replacement, offset);
    offset += patch.replacement.length;
    cursor = patch.end;
  }
  output.set(source.subarray(cursor), offset);
  return Object.freeze({ ok: true, bytes: output, patchCount: accepted.length });
}

/**
 * Plan, apply and independently verify a set of field edits against the
 * immutable source. Returns `{ ok: true, bytes, patches, verification }` only
 * when every check passes; otherwise `{ ok: false, stage, rejections }` and
 * no bytes. The source document is never modified.
 */
export function editGmiFields(document, edits) {
  const plan = planGmiFieldPatches(document, edits);
  if (!plan.ok) return plan;
  const applied = applyGmiPatches(document, plan.patches);
  if (!applied.ok) return applied;
  const changes = plan.patches.map((patch) => ({ target: patch.target, lexeme: patch.lexeme }));
  const verification = verifyGmiEdit(document, applied.bytes, changes);
  if (!verification.ok) return rejected(verification.failures, 'verify');
  return Object.freeze({ ok: true, bytes: applied.bytes, patches: plan.patches, verification });
}
