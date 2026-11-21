// Batch 1B.2A: preparation of one hyperlink transfer history entry (internal).
//
// Pure. Turns explicit «Flytt til punktobjekt» decisions into a verified,
// unstaged M2 history entry (session.mjs `gmi-hyperlink-transfer-set`) and the
// candidate session value that would result from staging it. Nothing here
// publishes, records history in a registry, or touches FOTO state; the FOTO
// transaction (photos/photoHyperlinkTransfer.mjs) supplies the FOTO record
// and commits through the session registry.
//
//   planGmiHyperlinkTransferCommit(session, request)        -> cumulative plan, independently verified
//   buildGmiHyperlinkTransferCommit(session, prepared, opts) -> unstaged transfer set + candidate session
//                                                               + composed, verified proposed state
//
// Cumulative plans: the active transfer set (if any) already holds a complete
// plan against the original document. A new commit plans the active
// decisions plus the new ones again, from the original document, so every
// S_HYPERLINK cell still gets exactly one edit and chains across commits
// compose correctly. The 1B.1 planner is called WITHOUT a session basis
// (hyperlink edits only): ordinary field edits can never touch S_HYPERLINK,
// and the proposed state composes both and verifies the result again.
import { GMI_HYPERLINK_TRANSFER_STATUS, buildGmiHyperlinkTransferProposal, planGmiHyperlinkTransfer } from './hyperlinkTransfer.mjs';
import { createGmiProposedCache, getGmiProposedState } from './proposed.mjs';
import {
  activeGmiHyperlinkTransferSet, compileGmiProposedEdits, createGmiHyperlinkTransferSet, isGmiEditSession, stageGmiHyperlinkTransferSet,
} from './session.mjs';
import { gmiSourceIntact } from './sourceDocument.mjs';

const prepared = new WeakMap();   // prepared result -> { session, plan }
const refused = (stage, rejections, extra = {}) => Object.freeze({ ok: false, stage, ...extra,
  rejections: Object.freeze(rejections.map((entry) => Object.freeze({ ...entry }))) });

/**
 * Plan the active transfers plus `request.transfers` against the session's
 * original document.
 *
 * @param {object} session current M2 session value (not modified)
 * @param {object} request
 * @param {object} request.photoSource FOTO GMI source of the same imported bytes (live-bound)
 * @param {Array<object>} request.transfers the NEW explicit decisions (1B.1 planner input shape)
 * @param {object} request.photoState FOTO facts for every asset of the active and the new decisions
 * @param {{documentFingerprint: string, photoSourceFingerprint: string, sessionStateKey: string}} request.expectedBasis
 * @returns {{ok: true, plan, previousTransferSetId, newTransferKeys} | {ok: false, stage, rejections, plan?}}
 */
export function planGmiHyperlinkTransferCommit(session, { photoSource = null, transfers = null, photoState = null, expectedBasis = null } = {}) {
  if (!isGmiEditSession(session)) return refused('basis', [{ code: 'invalid-session' }]);
  const { document } = session;
  if (!gmiSourceIntact(document)) return refused('basis', [{ code: 'source-bytes-mutated' }]);
  if (!Array.isArray(transfers) || !transfers.length) return refused('basis', [{ code: 'no-transfers' }]);
  if (!expectedBasis || typeof expectedBasis !== 'object') return refused('basis', [{ code: 'expected-basis-required' }]);
  const stale = [];
  if (expectedBasis.sessionStateKey !== session.stateKey) stale.push({ code: 'stale-basis', detail: 'sessionStateKey' });
  if (expectedBasis.documentFingerprint !== document.fingerprint) stale.push({ code: 'stale-basis', detail: 'documentFingerprint' });
  if (expectedBasis.photoSourceFingerprint !== photoSource?.fingerprint) stale.push({ code: 'stale-basis', detail: 'photoSourceFingerprint' });
  if (stale.length) return refused('basis', stale);
  // The current proposed copy must itself be consistent before anything is added to it.
  const compiled = compileGmiProposedEdits(session);
  if (!compiled.ok) return refused('basis', [{ code: 'session-not-compilable', detail: compiled.code }]);
  const active = activeGmiHyperlinkTransferSet(session);
  if (active && (active.basis.photoSourceId !== photoSource?.id || active.basis.photoSourceFingerprint !== photoSource?.fingerprint)) {
    return refused('basis', [{ code: 'transfer-source-changed' }]);
  }
  const decisions = [...(active ? active.decisions : []), ...transfers];
  const plan = planGmiHyperlinkTransfer(document, {
    photoSource, transfers: decisions, photoState,
    expectedBasis: { documentFingerprint: expectedBasis.documentFingerprint, photoSourceFingerprint: expectedBasis.photoSourceFingerprint },
  });
  if (plan.status !== GMI_HYPERLINK_TRANSFER_STATUS.READY) {
    return refused('plan', plan.blockers.length ? plan.blockers : [{ code: 'plan-empty' }], { plan });
  }
  // Independent check of the transfer on its own (no field edits) before anything is composed.
  const alone = buildGmiHyperlinkTransferProposal(plan, { authorization: { transferKeys: plan.transfers.map((transfer) => transfer.transferKey) } });
  if (!alone.ok) return refused(alone.stage, alone.rejections, { plan });
  const previousKeys = new Set(active ? active.transfers.map((transfer) => transfer.transferKey) : []);
  const result = Object.freeze({ ok: true, plan, previousTransferSetId: active?.id ?? null,
    newTransferKeys: Object.freeze(plan.transfers.map((transfer) => transfer.transferKey).filter((key) => !previousKeys.has(key))) });
  prepared.set(result, { session, plan });
  return result;
}

/**
 * Build the unstaged transfer set for a prepared plan and the candidate
 * session that staging it would produce, then compute that candidate's
 * proposed state (field edits + transfer, M1-verified and independently
 * transfer-verified) in a private cache. Returns
 * `{ ok: true, transferSet, session, proposed }` or a refusal.
 *
 * @param {object} session the exact session value the plan was prepared on
 * @param {object} preparedPlan result of planGmiHyperlinkTransferCommit
 * @param {{photo: object, label?: string, createdAt?: string, cache?: object}} options
 */
export function buildGmiHyperlinkTransferCommit(session, preparedPlan, { photo = null, label = null, createdAt = null, cache = null } = {}) {
  const state = prepared.get(preparedPlan);
  if (!state) return refused('compose', [{ code: 'not-a-prepared-transfer' }]);
  if (state.session !== session) return refused('compose', [{ code: 'stale-session-state' }]);
  const { plan } = state;
  const created = createGmiHyperlinkTransferSet(session, {
    planKey: plan.planKey,
    documentFingerprint: plan.basis.documentFingerprint,
    photoSourceId: plan.basis.photoSourceId,
    photoSourceFingerprint: plan.basis.photoSourceFingerprint,
    decisions: plan.decisions, transfers: plan.transfers, cells: plan.cells, edits: plan.edits,
    photo, previousTransferSetId: preparedPlan.previousTransferSetId, label, createdAt,
  });
  if (!created.ok) return refused('compose', created.rejections);
  const staged = stageGmiHyperlinkTransferSet(session, created.transferSet);
  if (!staged.ok) return refused('compose', [{ code: staged.code }]);
  const proposed = getGmiProposedState(staged.session, { cache: cache || createGmiProposedCache({ maxEntriesPerDocument: 1 }) });
  if (!proposed.ok) return refused(proposed.stage, proposed.rejections);
  if (proposed.hyperlinkTransfer?.transferSetId !== created.transferSet.id) return refused('verify-transfer', [{ code: 'transfer-not-verified' }]);
  return Object.freeze({ ok: true, transferSet: created.transferSet, session: staged.session, proposed });
}
