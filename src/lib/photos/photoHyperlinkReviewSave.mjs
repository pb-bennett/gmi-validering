// Batch 1B.4A: the writable photo hyperlink review's only route into the Batch 1B.2A transaction.
//
// Ownership is unchanged: the Rettinger (M2) history is the only transaction and history owner
// (commitPhotoHyperlinkTransfer), and FOTO accepted state is never written. This module only
// - decides which review decisions are saved (resolved «Flytt til punktobjekt» only; GML/Ikke are FOTO delivery
//   choices, so a review that still contains them is refused with an explanation instead of being partly saved);
// - captures the expected basis when Kontroll opens and hands it to the transaction, which re-checks it against the
//   live GMI, FOTO and Rettinger state at save time and fails closed on any difference;
// - turns the transaction result into a Norwegian explanation or a receipt.
// Every write happens inside commitPhotoHyperlinkTransfer: all transfers in one entry, or none.
import { commitPhotoHyperlinkTransfer, photoHyperlinkTransferBasis, photoHyperlinkTransferDecision } from './photoHyperlinkTransfer.mjs';

export const PHOTO_LINK_SAVE_BLOCKER_TEXT = Object.freeze({
  'read-only': 'Gjennomgangen kan ikke lagres.',
  'none-selected': 'Velg minst én bildelenke før du lagrer.',
  unresolved: 'Alle valgte beslutninger må være avklart før lagring. Bruk «Endre» på radene som må avklares.',
  'delivery-outcomes': '«Lever som GML» og «Ikke med i leveransen» er leveringsvalg i FOTO og lagres ikke sammen med flytting av bildelenker. Endre disse til «Behold uendret» eller fjern valget, lagre flyttingene, og sett leveringsvalget i FOTO etterpå.',
  'no-changes': 'Ingen endringer å lagre: alle valgte bildelenker beholdes uendret.',
  'transfer-not-current': 'Den lagrede flyttingen i Rettinger stemmer ikke lenger med FOTO. Angre eller forkast den i Rettinger før nye flyttinger lagres.',
  'basis-unavailable': 'Kontrollgrunnlaget kunne ikke fastsettes. Gå tilbake til paring og åpne Kontroll på nytt.',
});

const SESSION_CODES = new Set(['invalid-handle', 'stale-session', 'session-disposed', 'source-stale', 'fingerprint-mismatch', 'source-identity-mismatch',
  'source-bytes-mutated', 'invalid-session', 'session-not-compilable', 'session-required', 'session-document-mismatch', 'stale-session-state']);
const BASIS_PARTS = Object.freeze({ documentFingerprint: 'GMI-filen', photoSourceId: 'FOTO-kilden', photoSourceFingerprint: 'FOTO-kilden',
  sessionStateKey: 'Rettinger', photoBasisKey: 'FOTO' });
const NOTHING_SAVED = 'Ingen endringer er lagret, og valgene dine er beholdt.';

/** Norwegian explanation of a refused basis capture or transaction result. */
export function photoLinkReviewSaveMessage(result) {
  const code = result?.code;
  if (code === 'stale-basis') {
    const parts = [...new Set((result.detail || []).map((key) => BASIS_PARTS[key]).filter(Boolean))];
    return `Grunnlaget er endret siden Kontroll ble åpnet${parts.length ? ` (${parts.join(', ')})` : ''}. ${NOTHING_SAVED} Gå tilbake til paring, kontroller beslutningene og åpne Kontroll på nytt.`;
  }
  if (code === 'expected-basis-required') return `Kontrollgrunnlaget mangler. ${NOTHING_SAVED} Åpne Kontroll på nytt.`;
  if (code === 'photo-source-not-live-bound') return `Fotolagets GMI-kilde er ikke koblet til det lastede GMI-laget. ${NOTHING_SAVED} Koble bildene til GMI-laget i FOTO og åpne gjennomgangen på nytt.`;
  if (code === 'photo-source-ambiguous') return `Fotolaget har flere kilder fra samme GMI-fil. ${NOTHING_SAVED} Fjern duplikatkilden i FOTO før flytting.`;
  if (code === 'photo-layer-missing') return `Fotolaget er ikke lenger tilgjengelig. ${NOTHING_SAVED}`;
  if (code === 'document-not-editable') return 'GMI-filen kan ikke redigeres sikkert i Rettinger, så bildelenker kan ikke flyttes. Ingen endringer er lagret.';
  if (code === 'foreign-transfer-source') return `Beslutningene hører til en annen GMI-kilde enn fotolaget. ${NOTHING_SAVED} Lukk og åpne gjennomgangen på nytt.`;
  if (code === 'no-transfers') return PHOTO_LINK_SAVE_BLOCKER_TEXT['no-changes'];
  if (code === 'transfer-history-mismatch') return `Tidligere lagrede flyttinger kunne ikke gjenskapes uendret. ${NOTHING_SAVED} Kontroller historikken i Rettinger.`;
  if (code === 'commit-failed') return `Lagringen kunne ikke fullføres, og Rettinger er satt tilbake. ${NOTHING_SAVED} Prøv igjen.`;
  if (code === 'transaction-failed') return `Lagringen feilet uventet (${result.stage || 'ukjent steg'}). ${NOTHING_SAVED} Prøv igjen, eller lukk og åpne gjennomgangen på nytt.`;
  if (code === 'transfer-photo-mismatch' || result?.stage === 'verify') return `Kontrollen etter planlegging fant at GMI og FOTO ikke beskriver samme flytting. ${NOTHING_SAVED}`;
  if (SESSION_CODES.has(code)) return `Rettinger-økten for GMI-laget er ikke lenger gyldig. ${NOTHING_SAVED} Lukk gjennomgangen og åpne den på nytt fra gjeldende lag.`;
  if (PHOTO_LINK_SAVE_BLOCKER_TEXT[code]) return PHOTO_LINK_SAVE_BLOCKER_TEXT[code];
  const codes = [...new Set((result?.blockers || result?.rejections || []).map((entry) => entry?.code).filter(Boolean))];
  return `Flyttingen ble avvist av kontrollen ved lagring${codes.length ? ` (${codes.join(', ')})` : code ? ` (${code})` : ''}. ${NOTHING_SAVED} Endre de berørte beslutningene eller behold bildelenkene uendret.`;
}

/**
 * The saved transfers of the review's GMI layer, from the cached FOTO transfer views
 * (photoHyperlinkTransferViews). `status` is the verified view status ('none' without an active transfer);
 * `transfers` is the active entry's FOTO record, also when the view does not verify, so saved groups stay marked.
 */
export function photoLinkReviewSavedState(transferViews, gmiLayerId) {
  const index = transferViews?.scope?.entries.findIndex((entry) => entry.layerId === gmiLayerId) ?? -1;
  if (index < 0) return Object.freeze({ status: 'none', transferSetId: null, transfers: Object.freeze([]) });
  const entry = transferViews.scope.entries[index], view = transferViews.views[index];
  return Object.freeze({ status: view?.status || 'unavailable', transferSetId: entry.transferSet.id,
    transfers: Object.freeze(entry.transferSet.photo.transfers.map((transfer) => Object.freeze({ transferKey: transfer.transferKey,
      decisionKey: transfer.decisionKey, assetId: transfer.assetId, photoId: transfer.photoId, fromObjectKey: transfer.fromObjectKey,
      toObjectKey: transfer.toObjectKey, referenceIds: transfer.referenceIds, proposedPosition: transfer.proposedPosition }))) });
}

/** What a save would write, or why it cannot: the decisions are the live review decisions (photoLinkReviewDecisions). */
export function photoLinkReviewSavePlan(model, decisions, progress, { transferStatus = 'none' } = {}) {
  let blocker = progress.saveBlocker;
  if (!blocker && !['none', 'current'].includes(transferStatus)) blocker = 'transfer-not-current';
  const moves = decisions.filter((entry) => entry.outcome === 'move');
  const transfers = blocker ? [] : moves.map((entry) => photoHyperlinkTransferDecision(entry, model.source));
  if (!blocker && transfers.some((entry) => !entry)) blocker = 'unresolved';
  return Object.freeze({ ready: !blocker, blocker, message: blocker ? PHOTO_LINK_SAVE_BLOCKER_TEXT[blocker] : null,
    moves: Object.freeze(moves), transfers: Object.freeze(blocker ? [] : transfers) });
}

/** The expected basis for a later save, captured when Kontroll opens: `{ ok, basis }` or `{ ok: false, code, message }`. */
export function capturePhotoLinkReviewBasis(owners) {
  const captured = photoHyperlinkTransferBasis(owners);
  return captured.ok ? captured : Object.freeze({ ok: false, code: captured.code, message: photoLinkReviewSaveMessage(captured) });
}

const objectName = (object) => object ? `${object.tema || 'Uavklart Tema'} · ${object.pointName}` : 'Ukjent objekt';
const anleggsId = (object) => object?.anleggsId ? ` (AnleggsID ${object.anleggsId})` : '';

/**
 * Save the review's resolved moves as ONE Rettinger transaction. `expected` is the basis from Kontroll; the
 * transaction re-checks it (and re-plans everything, cumulatively with any earlier active transfer) against the
 * live owners and either commits every transfer or none.
 */
export function savePhotoLinkReview({ registry, handle, photoSession, photoLayerId, model, decisions, progress, expected, transferStatus = 'none', now }) {
  const plan = photoLinkReviewSavePlan(model, decisions, progress, { transferStatus });
  if (!plan.ready) return Object.freeze({ ok: false, code: plan.blocker, message: plan.message });
  if (!expected) return Object.freeze({ ok: false, code: 'expected-basis-required', message: photoLinkReviewSaveMessage({ code: 'expected-basis-required' }) });
  const result = commitPhotoHyperlinkTransfer({ registry, handle, photoSession, photoLayerId, transfers: plan.transfers, expected, ...(now ? { now } : {}) });
  if (!result.ok) return Object.freeze({ ok: false, code: result.code, stage: result.stage, message: photoLinkReviewSaveMessage(result) });
  const fresh = new Set(result.newTransferKeys || []);
  const byDecision = new Map(plan.moves.map((entry) => [entry.key, entry]));
  const saved = result.transfers.filter((entry) => fresh.has(entry.transferKey));
  const items = saved.map((entry) => {
    const decision = byDecision.get(entry.decisionKey);
    return Object.freeze({ transferKey: entry.transferKey, filename: decision?.group.references[0]?.filename || entry.assetId,
      references: entry.referenceIds.length, from: `${objectName(decision?.row)}${anleggsId(decision?.row)}`,
      to: `${objectName(decision?.target)}${anleggsId(decision?.target)}` });
  });
  return Object.freeze({ ok: true, transferSetId: result.transferSetId, receipt: Object.freeze({
    transferSetId: result.transferSetId, photographs: new Set(saved.map((entry) => entry.assetId)).size,
    references: saved.reduce((sum, entry) => sum + entry.referenceIds.length, 0),
    earlier: result.transfers.length - saved.length, items: Object.freeze(items) }) });
}
