// M1: production gmi-edit checks over a private GMI corpus, compared file by
// file with the independent M0 reference harness (tests/helpers/gmiEditHarness.mjs).
//
// TEST-ONLY. Reads files, never writes, renames or normalizes them; every
// output stays in memory. Returns aggregate counts and reason codes only (no
// filenames, values or paths).
import { readFile, stat } from 'node:fs/promises';
import {
  applyCellChanges, chooseSingleCellTarget, loadGmiDocument, cellSpans, verifyCellChanges,
} from './gmiEditHarness.mjs';
import { sha256Hex } from './gmiEditFixtures.mjs';
import {
  GMI_GEOMETRY_SCOPES, createGmiSourceDocument, editGmiFields, getGmiSourceBytes, gmiSourceIntact,
  listGmiObjectCells, resolveGmiCell, verifyGmiEdit,
} from '../../src/lib/gmi-edit/index.mjs';
import { internalGmiSourceState, MAX_GMI_EDIT_BYTES } from '../../src/lib/gmi-edit/sourceDocument.mjs';

const bump = (counter, key, by = 1) => { counter[key] = (counter[key] || 0) + by; };
const bytesEqual = (a, b) => a.length === b.length && a.every((byte, i) => byte === b[i]);

/**
 * The production status the reference result implies under the M1 policy:
 * coordinate-only parser warnings no longer make a file read-only; every
 * other reference outcome must be reproduced exactly.
 */
export function expectedProductionStatus(reference) {
  if (reference.status !== 'unsupported') return { status: reference.status, policy: 'same' };
  const other = reference.reasons.filter((reason) => reason !== 'parser-warnings');
  const classes = reference.parser.warningSummary.classes;
  const onlyCoordinate = reference.counts.otherParserWarnings > 0 && reference.counts.otherParserWarnings === classes.coordinate;
  if (reference.reasons.includes('parser-warnings') && onlyCoordinate && other.length === 0) return { status: 'reconciled', policy: 'coordinate-warnings-editable' };
  return { status: 'unsupported', policy: 'same' };
}

/** Spread up to `limit` objects over the file; first, middle and last editable column of each. */
export function chooseMultiCellEdits(document, limit = 20) {
  const objects = [];
  for (const { scope, collection } of GMI_GEOMETRY_SCOPES) {
    document.parser[collection].forEach((_, sourceIndex) => objects.push({ scope, sourceIndex }));
  }
  const step = Math.max(1, Math.floor(objects.length / limit));
  const edits = [];
  for (let k = 0; k < objects.length && edits.length < limit * 3; k += step) {
    const { scope, sourceIndex } = objects[k];
    const cells = (listGmiObjectCells(document, scope, sourceIndex) || []).filter((cell) => cell.editable);
    if (!cells.length) continue;
    const picked = [...new Set([cells[0], cells[Math.floor((cells.length - 1) / 2)], cells.at(-1)])];
    for (const cell of picked) {
      const fill = cell.lexeme.trim() === '';
      edits.push({ target: { scope, sourceIndex, field: cell.field }, expected: cell.lexeme, lexeme: fill ? 'M1' : '', kind: fill ? 'fill' : 'clear' });
    }
  }
  return edits;
}

function compareSpans(reference, production, stats) {
  const state = internalGmiSourceState(production);
  for (const { scope } of GMI_GEOMETRY_SCOPES) {
    const referenceObjects = reference.index?.objects?.[scope] || [];
    if (referenceObjects.length !== state.objects[scope].length) { bump(stats.spans.mismatchCodes, 'object-count'); continue; }
    referenceObjects.forEach((object, sourceIndex) => {
      const referenceSpans = cellSpans(object), productionSpans = state.objects[scope][sourceIndex].spans;
      if (referenceSpans.size !== productionSpans.size) bump(stats.spans.mismatchCodes, 'cell-count');
      for (const [field, { position, span }] of referenceSpans) {
        stats.spans.compared++;
        const other = productionSpans.get(field);
        if (!other || other.position !== position || other.span[0] !== span[0] || other.span[1] !== span[1]) {
          stats.spans.mismatches++;
          bump(stats.spans.mismatchCodes, 'span');
        }
      }
      if ((object.issues?.length || 0) !== state.objects[scope][sourceIndex].issues.length) bump(stats.spans.mismatchCodes, 'object-issues');
    });
  }
}

// Change one byte of the first header line after the signature (never a field
// value) in an in-memory copy; the verifier must reject it.
function tamperOutsideTargets(output) {
  const copy = Uint8Array.from(output);
  const lf = copy.indexOf(0x0a);
  copy[lf + 1] = copy[lf + 1] === 0x5f ? 0x2d : 0x5f;
  return copy;
}

export async function scanGmiCorpusProduction(files) {
  const stats = {
    files: files.length, uniqueFiles: 0, duplicateFiles: 0,
    production: { status: {}, reasons: {}, editable: 0, readOnly: 0, encodingClass: {}, eolKind: {} },
    reference: { status: {}, reasons: {} },
    agreement: { agrees: 0, policyDifferences: {}, unexpected: {} },
    objects: 0, lexemes: { production: 0, reference: 0 }, nonEditableObjects: { production: 0, reference: 0 },
    spans: { compared: 0, mismatches: 0, mismatchCodes: {} },
    noOp: { checked: 0, identical: 0, readOnlyRejected: 0, readOnlyBytesIdentical: 0 },
    singleCell: { applicable: 0, ok: 0, identicalToReference: 0, referenceVerifierOk: 0, notApplicable: 0, failures: {} },
    multiCell: { files: 0, cells: 0, fills: 0, clears: 0, ok: 0, identicalToReference: 0, referenceVerifierOk: 0, failures: {} },
    negative: { staleRejected: 0, tamperRejected: 0, checked: 0 },
    coordinatePolicy: { files: 0, editable: 0, malformedLines: 0, editsVerified: 0, malformedLinesPreserved: 0, repairRejected: 0 },
    sourceIntact: 0,
    errors: {},
  };
  const seen = new Set();
  for (const filename of files) {
    let bytes;
    try {
      if ((await stat(filename)).size > MAX_GMI_EDIT_BYTES) { bump(stats.production.status, 'too-large'); stats.uniqueFiles++; continue; }
      bytes = new Uint8Array(await readFile(filename));
    } catch { bump(stats.errors, 'unreadable'); continue; }
    const digest = sha256Hex(bytes);
    if (seen.has(digest)) { stats.duplicateFiles++; continue; }
    seen.add(digest);
    stats.uniqueFiles++;
    try {
      const reference = loadGmiDocument(bytes);
      const production = createGmiSourceDocument(bytes);
      bump(stats.reference.status, reference.status);
      for (const reason of reference.reasons) bump(stats.reference.reasons, reason);
      bump(stats.production.status, production.status);
      for (const reason of production.reasons) bump(stats.production.reasons, reason);
      bump(stats.production.encodingClass, production.encoding.encodingClass);
      bump(stats.production.eolKind, production.encoding.eol.kind);
      if (production.editable) stats.production.editable++; else stats.production.readOnly++;

      const expected = expectedProductionStatus(reference);
      if (expected.status === production.status) {
        if (expected.policy === 'same') stats.agreement.agrees++;
        else bump(stats.agreement.policyDifferences, `${reference.status}->${production.status}:${expected.policy}`);
      } else {
        bump(stats.agreement.unexpected, `${reference.status}->${production.status}:${production.reasons.join('+') || 'none'}`);
      }

      if (reference.index && production.counts) {
        stats.objects += production.counts.points + production.counts.lines;
        stats.lexemes.production += production.counts.lexemes;
        stats.lexemes.reference += reference.counts.lexemes;
        stats.nonEditableObjects.production += production.counts.nonEditableObjects;
        stats.nonEditableObjects.reference += reference.counts.nonEditableObjects;
        compareSpans(reference, production, stats);
      }

      // T1: no-change export.
      if (production.editable) {
        stats.noOp.checked++;
        const noOp = editGmiFields(production, []);
        if (noOp.ok && bytesEqual(noOp.bytes, bytes) && sha256Hex(noOp.bytes) === digest) stats.noOp.identical++;
      } else {
        const refused = editGmiFields(production, []);
        if (!refused.ok && refused.rejections[0].code === 'document-not-editable') stats.noOp.readOnlyRejected++;
        if (bytesEqual(getGmiSourceBytes(production), bytes)) stats.noOp.readOnlyBytesIdentical++;
      }

      const coordinateFile = (production.counts?.coordinateWarnings || 0) > 0;
      if (coordinateFile) {
        stats.coordinatePolicy.files++;
        stats.coordinatePolicy.malformedLines += production.counts.malformedCoordinateLines;
        if (production.editable) stats.coordinatePolicy.editable++;
      }

      if (production.editable && (reference.status === 'reconciled' || reference.status === 'unsupported')) {
        // T3: the reference harness's single-cell target through the production API.
        const target = chooseSingleCellTarget(reference);
        if (!target) stats.singleCell.notApplicable++;
        else {
          stats.singleCell.applicable++;
          const cell = resolveGmiCell(production, target);
          const result = cell.ok ? editGmiFields(production, [{ target: { scope: target.scope, sourceIndex: target.sourceIndex, field: target.field }, expected: cell.cell.lexeme, lexeme: target.lexeme }])
            : { ok: false, rejections: [{ code: cell.code }] };
          if (result.ok) {
            stats.singleCell.ok++;
            if (bytesEqual(result.bytes, applyCellChanges(reference, [target]).output)) stats.singleCell.identicalToReference++;
            if (verifyCellChanges(reference, result.bytes, [target]).ok) stats.singleCell.referenceVerifierOk++;
            if (coordinateFile) {
              stats.coordinatePolicy.editsVerified++;
              stats.coordinatePolicy.malformedLinesPreserved += result.verification.summary.malformedCoordinateLinesPreserved;
            }
            // Negative: an output changed outside the target must be rejected.
            stats.negative.checked++;
            const tampered = verifyGmiEdit(production, tamperOutsideTargets(result.bytes), [{ target, lexeme: target.lexeme }]);
            if (!tampered.ok) stats.negative.tamperRejected++;
            // Negative: a stale expected value must be rejected.
            const stale = editGmiFields(production, [{ target, expected: `${cell.cell.lexeme}x`, lexeme: target.lexeme }]);
            if (!stale.ok && stale.rejections[0].code === 'stale-expected-value') stats.negative.staleRejected++;
          } else for (const failure of result.rejections) bump(stats.singleCell.failures, failure.code);
        }

        // T3/T4: many fills and clears in first, middle and last columns at once.
        const edits = chooseMultiCellEdits(production);
        if (edits.length) {
          stats.multiCell.files++;
          stats.multiCell.cells += edits.length;
          for (const edit of edits) stats.multiCell[edit.kind === 'fill' ? 'fills' : 'clears']++;
          const result = editGmiFields(production, edits.map(({ kind, ...edit }) => (void kind, edit)));
          if (result.ok) {
            stats.multiCell.ok++;
            const cells = edits.map((edit) => ({ ...edit.target, lexeme: edit.lexeme }));
            if (bytesEqual(result.bytes, applyCellChanges(reference, cells).output)) stats.multiCell.identicalToReference++;
            if (verifyCellChanges(reference, result.bytes, cells).ok) stats.multiCell.referenceVerifierOk++;
          } else for (const failure of result.rejections) bump(stats.multiCell.failures, failure.code);
        }

        // Coordinate policy: "repairing" a malformed vertex line is rejected.
        if (coordinateFile) {
          const state = internalGmiSourceState(production);
          const object = GMI_GEOMETRY_SCOPES.flatMap(({ scope }) => state.index.objects[scope]).find((entry) => entry.malformedCoordinateLines.length);
          const line = state.index.lines[object.malformedCoordinateLines[0]];
          const repaired = getGmiSourceBytes(production);
          for (let i = line.start; i < line.end; i++) if (!/[\d. -]/.test(String.fromCharCode(repaired[i]))) repaired[i] = 0x20;
          if (!verifyGmiEdit(production, repaired, []).ok) stats.coordinatePolicy.repairRejected++;
        }
      }
      if (gmiSourceIntact(production) && bytesEqual(getGmiSourceBytes(production), bytes)) stats.sourceIntact++;
    } catch (error) {
      bump(stats.errors, error?.message?.replace(/[^a-z-]/gi, '').slice(0, 40) || 'unknown');
    }
  }
  return stats;
}
