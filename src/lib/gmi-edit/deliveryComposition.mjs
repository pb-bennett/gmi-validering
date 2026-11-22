// Batch 1B.3A: one export composition against the immutable original GMI.
//
// While a hyperlink transfer is active, a revised GMI for delivery carries
// three kinds of change at once:
//   1. the session's authorized ordinary field corrections (when the delivery
//      includes them; split excludes them explicitly);
//   2. the active transfer entry's decisions (Batch 1B.2A: the last transfer
//      set holds every active decision, planned against the original);
//   3. M7 removals for photographs delivered through GML or excluded.
// They are composed by ONE plan made against the original document: the 1B.1
// transfer planner with the delivery removals joined into its single M7
// removal half, so each S_HYPERLINK cell gets exactly one edit (expected = the
// original lexeme), and the field edits join the same M1 `editGmiFields` call.
// Previously exported or proposed bytes are never patched again.
//
//   planGmiDeliveryComposition(session, request)   -> frozen composition (no bytes)
//   applyGmiDeliveryComposition(composition, opts) -> verified bytes or refusal
//
// Safety:
// - The re-plan must reproduce the committed transfer: same transfers, same
//   recipients, same reference groups; without delivery removals it must be
//   byte-for-byte the committed S_HYPERLINK edits.
// - The reserved-column guard is unchanged: ordinary edits never target
//   S_HYPERLINK and no field edit may share a cell with a hyperlink edit.
// - The bytes are accepted only after M1 verification AND the independent
//   transfer verifier (hyperlinkTransferVerify.mjs), whose contract is the
//   committed decisions, the caller's delivery removals and the authorized
//   field edits. It never reads this plan's proposed lexemes.
// - FOTO coherence (the transfer's FOTO record still matches FOTO) is the
//   caller's gate: the delivery planner requires a 'current' FOTO view first.
// Pure: nothing here publishes, stages, records a download or touches FOTO.
import { GMI_HYPERLINK_FIELD } from './hyperlinkRemoval.mjs';
import { GMI_HYPERLINK_TRANSFER_STATUS, planGmiHyperlinkTransfer } from './hyperlinkTransfer.mjs';
import { verifyGmiHyperlinkTransfer } from './hyperlinkTransferVerify.mjs';
import { editGmiFields } from './patch.mjs';
import { compileGmiProposedEdits, isGmiEditSession } from './session.mjs';
import { gmiSourceIntact } from './sourceDocument.mjs';
import { gmiCellKey } from './targets.mjs';

/** Recipient acceptance of appended/renumbered wrappers is not established (recipient gate A5). */
export const GMI_TRANSFER_RECIPIENT_PENDING = 'gemini-a5-transfer-unverified';

const compositions = new WeakMap();   // composition -> { session, document, fieldEdits, removalContract, decisions }
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sortedUnique = (values) => [...new Set(values)].sort(compare);
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}
const blocked = (blockers, extra = {}) => deepFreeze({ ok: false, kind: 'gmi-delivery-composition', status: 'blocked', ...extra,
  blockers: blockers.map((entry) => ({ ...entry })) });
const refused = (stage, rejections) => deepFreeze({ ok: false, stage, rejections: rejections.map((entry) => ({ ...entry })) });

/**
 * Plan the combined revised GMI of a session with an active hyperlink transfer.
 *
 * @param {object} session the current M2 session value (not modified)
 * @param {object} request
 * @param {object} request.photoSource the FOTO GMI source of the same imported bytes (live-bound)
 * @param {object} request.photoState FOTO facts for every transferred asset (the FOTO view's planning facts)
 * @param {Array<object>} [request.removals] M8 removal selections (GML/Ikke), possibly empty
 * @param {boolean} [request.includeFieldChanges=true] false only for an explicit split exclusion
 * @param {Iterable<string>} [request.acceptedAssetIds]
 * @returns frozen composition `{ ok: true, status: 'ready', ... }` or `{ ok: false, status: 'blocked', blockers }`
 */
export function planGmiDeliveryComposition(session, { photoSource = null, photoState = null, removals = [], includeFieldChanges = true, acceptedAssetIds = null } = {}) {
  if (!isGmiEditSession(session)) return blocked([{ code: 'invalid-session' }]);
  const { document } = session;
  if (!document.editable) return blocked([{ code: 'document-not-editable' }]);
  if (!gmiSourceIntact(document)) return blocked([{ code: 'source-bytes-mutated' }]);
  if (!Array.isArray(removals)) return blocked([{ code: 'invalid-removals' }]);
  const compiled = compileGmiProposedEdits(session);
  if (!compiled.ok) return blocked([{ code: 'session-not-compilable', detail: compiled.code }]);
  const transfer = compiled.transfer;
  if (!transfer) return blocked([{ code: 'no-active-transfer' }]);
  if (transfer.basis.documentFingerprint !== document.fingerprint) return blocked([{ code: 'transfer-document-mismatch' }]);
  if (photoSource?.id !== transfer.basis.photoSourceId || photoSource?.fingerprint !== transfer.basis.photoSourceFingerprint) return blocked([{ code: 'transfer-source-mismatch' }]);

  const plan = planGmiHyperlinkTransfer(document, {
    photoSource, transfers: transfer.decisions, photoState, removals, ...(acceptedAssetIds !== null ? { acceptedAssetIds } : {}),
    expectedBasis: { documentFingerprint: transfer.basis.documentFingerprint, photoSourceFingerprint: transfer.basis.photoSourceFingerprint },
  });
  if (plan.status !== GMI_HYPERLINK_TRANSFER_STATUS.READY) return blocked(plan.blockers.length ? plan.blockers : [{ code: 'composition-empty' }]);

  // The re-plan must be the committed transfer: identical decisions, groups and recipients.
  const view = (list) => list.map((entry) => [entry.transferKey, entry.fromObjectKey, entry.toObjectKey, entry.referenceIds])
    .sort((a, b) => compare(a[0], b[0]));
  if (!sameJson(view(plan.transfers), view(transfer.transfers))) return blocked([{ code: 'transfer-replan-mismatch' }]);
  if (!removals.length) {
    const edits = (list) => list.map((edit) => [edit.target.scope, edit.target.sourceIndex, edit.expected, edit.lexeme]);
    if (!sameJson(edits(plan.edits), edits(transfer.edits))) return blocked([{ code: 'transfer-replan-mismatch', detail: 'edits' }]);
  }

  const fieldEdits = includeFieldChanges ? compiled.fieldEdits : [];
  const hyperlinkKeys = new Set(plan.edits.map((edit) => gmiCellKey(edit.target)));
  for (const edit of fieldEdits) {
    if (edit.target.field === GMI_HYPERLINK_FIELD || hyperlinkKeys.has(gmiCellKey(edit.target))) return blocked([{ code: 'field-edit-overlaps-hyperlink' }]);
  }
  const removalContract = plan.removals.map((entry) => ({ objectKey: entry.objectKey, referenceIds: [...entry.referenceIds] }));
  // M7's Gemini note covers removals with renumbering only; appended or renumbered transfer wrappers are not
  // recipient-tested (gate A5), so that claim is replaced, never repeated, for a composition.
  const warnings = [...plan.warnings.filter((entry) => entry.code !== 'gemini-va-tested-import'),
    { code: GMI_TRANSFER_RECIPIENT_PENDING, transfers: plan.transfers.length }];
  const composition = deepFreeze({
    ok: true, kind: 'gmi-delivery-composition', status: 'ready',
    basis: { documentFingerprint: document.fingerprint, stateKey: session.stateKey, effectiveKey: compiled.effectiveKey,
      transferSetId: transfer.id, transferPlanKey: transfer.planKey, photoSourceId: photoSource.id, includeFieldChanges: Boolean(includeFieldChanges) },
    planKey: plan.planKey,
    transfers: plan.transfers,
    transferKeys: sortedUnique(plan.transfers.map((entry) => entry.transferKey)),
    removalKeys: sortedUnique(plan.removals.map((entry) => entry.selectionKey)),
    cells: plan.cells,
    counts: { ...plan.counts, fieldEdits: fieldEdits.length },
    fieldEditCount: fieldEdits.length,
    warnings,
    blockers: [],
  });
  compositions.set(composition, { session, document, fieldEdits, removalContract, decisions: transfer.decisions, hyperlinkEdits: plan.edits,
    photoSourceId: transfer.basis.photoSourceId });
  return composition;
}

export const isGmiDeliveryComposition = (value) => compositions.has(value);

/**
 * Produce the verified revised bytes of a ready composition. The caller attests (`authorization`) that the delivery
 * was planned for exactly these transfers and removals. Returns
 * `{ ok: true, bytes, document, identical: false, fieldEditCount, counts, verification: { field, composition } }`
 * or `{ ok: false, stage, rejections }` and no bytes.
 *
 * @param {object} composition from planGmiDeliveryComposition
 * @param {{session: object, authorization: {transferKeys: string[], removalKeys: string[]}}} options
 *   `session` must be the exact session value the composition was planned on
 */
export function applyGmiDeliveryComposition(composition, { session = null, authorization = null } = {}) {
  const state = compositions.get(composition);
  if (!state) return refused('authorize', [{ code: 'not-a-composition' }]);
  if (composition.status !== 'ready') return refused('authorize', [{ code: 'composition-blocked' }]);
  if (session !== state.session) return refused('authorize', [{ code: 'stale-session-state' }]);
  const keys = (list) => (Array.isArray(list) ? sortedUnique(list) : null);
  const transferKeys = keys(authorization?.transferKeys), removalKeys = keys(authorization?.removalKeys);
  if (!transferKeys || !removalKeys || transferKeys.length !== authorization.transferKeys.length || removalKeys.length !== authorization.removalKeys.length) {
    return refused('authorize', [{ code: 'missing-authorization' }]);
  }
  if (!sameJson(transferKeys, composition.transferKeys) || !sameJson(removalKeys, composition.removalKeys)) return refused('authorize', [{ code: 'authorization-mismatch' }]);
  const { document } = state;
  if (!gmiSourceIntact(document)) return refused('authorize', [{ code: 'source-bytes-mutated' }]);
  const result = editGmiFields(document, [...state.fieldEdits, ...state.hyperlinkEdits]);
  if (!result.ok) return refused(result.stage, result.rejections);
  const checked = verifyGmiHyperlinkTransfer(document, result.bytes, {
    documentFingerprint: document.fingerprint,
    photoSourceId: state.photoSourceId,
    transfers: state.decisions,
    removals: state.removalContract,
    fieldEdits: state.fieldEdits.map((edit) => ({ target: edit.target, lexeme: edit.lexeme })),
  });
  if (!checked.ok) return refused('verify-composition', checked.failures);
  return Object.freeze({
    ok: true, kind: 'gmi-delivery-composition-result', identical: false, planKey: composition.planKey,
    bytes: result.bytes, document: result.verification.outputDocument, fieldEditCount: state.fieldEdits.length, counts: composition.counts,
    verification: Object.freeze({ field: result.verification.summary ?? null, composition: checked.summary }),
  });
}
