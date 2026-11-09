// Field-only revised GMI export (M3, delivery mode A).
//
// buildGmiFieldExport(registry, handle, {date, label}) produces one
// downloadable `.gmi` payload from a layer's editing session:
//   1. resolve the handle (live source, same File, same fingerprint, intact
//      private bytes);
//   2. take the M2 proposed state (one M1 plan -> splice -> independent verify,
//      cached by effective edits);
//   3. re-read the registered File and compare its SHA-256 with the session's
//      fingerprint (the imported file must still be the one edited);
//   4. refuse if anything moved while awaiting (session, source, layer);
//   5. check the field diff has no structural differences;
//   6. return a frozen payload. Its bytes are held privately: getGmiExportBytes
//      and createGmiExportBlob hand out fresh copies.
// No edits -> the payload bytes are exactly the original bytes. With edits
// -> the M1-verified output, where only the effective field-value spans
// differ. Nothing is ever written back to the source, the registry, the
// layer or the layer's parsed dataset.
//
// Failures are `{ok: false, code, ...}` with machine-readable codes only.
// Reused later by the combined delivery builder (M9): the payload carries
// the effective key, source identity and change summary that a delivery
// snapshot needs.
import { computeGmiSourceFingerprint, getGmiSourceBytes, gmiSourceIntact } from './sourceDocument.mjs';
import { getGmiDocumentDataset } from './proposed.mjs';
import { diffGmiDatasets } from './diff.mjs';
import { formatPhotoExportTimestamp, sanitizePhotoExportLabel } from '../photos/export/photoExportNaming.mjs';

// Opaque bytes: no charset, so nothing between here and disk re-encodes them.
export const GMI_EXPORT_MIME_TYPE = 'application/octet-stream';

export const GMI_EXPORT_FAILURES = Object.freeze([
  'invalid-handle', 'session-disposed', 'stale-session', 'source-identity-mismatch', 'fingerprint-mismatch',
  'source-stale', 'source-bytes-mutated', 'source-unreadable', 'source-fingerprint-mismatch', 'loaded-gmi-unreadable',
  'document-read-only', 'verification-failed', 'structural-difference', 'state-changed', 'output-integrity', 'invalid-date',
]);

const payloads = new WeakMap();   // payload -> { bytes, handle, effectiveKey }
const fail = (code, detail = {}) => Object.freeze({ ok: false, code, ...detail });

/**
 * Filename of a revised GMI: `YYYYMMDD-HHmmss[-label].gmi`, Europe/Oslo
 * wall-clock time, matching the FOTO ZIP/GML basename convention.
 */
export function gmiExportNames({ date, label = '' } = {}) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new TypeError('gmiExportNames needs a valid Date');
  const timestamp = formatPhotoExportTimestamp(date), sanitizedLabel = sanitizePhotoExportLabel(label);
  const basename = sanitizedLabel ? `${timestamp}-${sanitizedLabel}` : timestamp;
  return Object.freeze({ label: String(label ?? ''), sanitizedLabel, timestamp, basename, filename: `${basename}.gmi` });
}

function changeSetSummary(changeSet) {
  return Object.freeze({
    id: changeSet.id, label: changeSet.label ?? null, origin: changeSet.origin ?? null, mode: changeSet.mode,
    createdAt: changeSet.createdAt ?? null, applied: changeSet.counts.applied, skipped: changeSet.counts.skipped,
  });
}

/**
 * Readiness without producing bytes (cheap after the first proposed state).
 * `{ready, blocking: [codes], notes: [codes], counts}`.
 */
export function getGmiExportReadiness(registry, handle) {
  const resolved = registry.resolve(handle);
  if (!resolved.ok) return Object.freeze({ ready: false, blocking: Object.freeze([resolved.code]), notes: Object.freeze([]), counts: null });
  const blocking = [], notes = [];
  if (!resolved.document.editable) blocking.push('document-read-only');
  const proposed = registry.proposed(handle);
  if (!proposed.ok) blocking.push('verification-failed');
  else if (proposed.identical) notes.push('no-changes');
  if (resolved.status.downloaded) notes.push('already-downloaded');
  return Object.freeze({
    ready: blocking.length === 0,
    blocking: Object.freeze(blocking),
    notes: Object.freeze(notes),
    counts: Object.freeze({ changeSets: resolved.status.changeSetCount, changedCells: resolved.status.changedCells, changedObjects: resolved.status.changedObjects }),
  });
}

/**
 * Build the field-only revised GMI for one editing session.
 * @param {object} registry createGmiEditSessions instance
 * @param {object} handle session handle from registry.open
 * @param {{date?: Date, label?: string}} [options]
 */
export async function buildGmiFieldExport(registry, handle, { date = new Date(), label = '' } = {}) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return fail('invalid-date');
  const start = registry.resolve(handle);
  if (!start.ok) return fail(start.code);
  const { session, document } = start;
  if (!document.editable) return fail('document-read-only', { documentStatus: document.status, reasons: document.reasons });

  const proposed = registry.proposed(handle);
  if (!proposed.ok) return fail(proposed.code ?? 'verification-failed', { stage: proposed.stage ?? null, rejections: proposed.rejections ?? Object.freeze([]) });

  const source = await registry.verifySource(handle);
  if (!source.ok) return fail(source.code);

  // Nothing may have moved while awaiting: same session value, same source.
  const end = registry.resolve(handle);
  if (!end.ok) return fail(end.code);
  if (end.session !== session) return fail('state-changed');

  if (!gmiSourceIntact(document) || !gmiSourceIntact(proposed.document)) return fail('output-integrity');
  const bytes = getGmiSourceBytes(proposed.document);
  if (proposed.identical) {
    const original = getGmiSourceBytes(document);
    if (original.length !== bytes.length || original.some((byte, i) => byte !== bytes[i])) return fail('output-integrity');
  }

  const diff = diffGmiDatasets(getGmiDocumentDataset(document), proposed.dataset);
  if (diff.structural.length) return fail('structural-difference', { structural: diff.structural.map((entry) => entry.code) });
  if (diff.changes.length !== proposed.editCount) return fail('output-integrity');

  const fingerprint = await computeGmiSourceFingerprint(bytes);
  if (proposed.identical && fingerprint !== document.fingerprint) return fail('output-integrity');
  const after = registry.resolve(handle);
  if (!after.ok) return fail(after.code);
  if (after.session !== session) return fail('state-changed');

  const names = gmiExportNames({ date, label });
  const effectiveKey = proposed.effectiveKey;
  const payload = Object.freeze({
    ok: true,
    kind: 'gmi-field-export',
    filename: names.filename,
    basename: names.basename,
    label: names.label,
    sanitizedLabel: names.sanitizedLabel,
    createdAt: date.toISOString(),
    mimeType: GMI_EXPORT_MIME_TYPE,
    size: bytes.length,
    fingerprint,
    identical: proposed.identical,
    effectiveKey,
    source: Object.freeze({ layerId: handle.layerId, sessionId: handle.sessionId, inputId: handle.inputId, filename: document.filename, fingerprint: document.fingerprint, size: document.size, encodingClass: document.encoding.encodingClass }),
    summary: Object.freeze({
      changeSetCount: session.changeSets.length,
      changeSets: Object.freeze(session.changeSets.map(changeSetSummary)),
      changedCells: diff.counts.cells,
      changedObjects: diff.counts.objects,
      byField: diff.counts.byField,
      changes: Object.freeze(diff.changes.map((change) => Object.freeze({
        scope: change.scope, sourceIndex: change.sourceIndex, objectId: change.objectId ?? null, guid: change.guid ?? null,
        field: change.field, original: change.original, proposed: change.proposed,
      }))),
    }),
  });
  payloads.set(payload, { bytes, handle, effectiveKey });
  return payload;
}

export const isGmiFieldExport = (value) => payloads.has(value);

/** A fresh copy of an export's bytes. */
export function getGmiExportBytes(payload) {
  const state = payloads.get(payload);
  if (!state) throw new TypeError('not a GMI field export');
  return Uint8Array.from(state.bytes);
}

/** A Blob of an export's bytes (browser download). */
export function createGmiExportBlob(payload) {
  return new Blob([getGmiExportBytes(payload)], { type: GMI_EXPORT_MIME_TYPE });
}

/**
 * Record that the caller started the browser download of `payload`. Clears
 * the unsaved-changes flag only while the session still has the exported
 * effective state (`export-stale` otherwise). It cannot prove the user kept
 * the file.
 */
export function recordGmiExportDownload(registry, payload) {
  const state = payloads.get(payload);
  if (!state) return fail('not-an-export');
  return registry.markDownloaded(state.handle, state.effectiveKey);
}
