// Pure hypothetical session values only. No session registry or store imports.
import { isGmiEditSession, stageGmiChangeSet } from './session.mjs';
import { getGmiProposedState, gmiValidationReferenceDate, validateGmiDataset } from './proposed.mjs';
import { gmiSourceIntact } from './sourceDocument.mjs';
import { diffGmiValidationFindings } from '../validation-v2/findingDiff.js';

const results = new WeakMap();
const fail = (code, stage, detail = {}) => Object.freeze({ ok: false, code, stage, ...detail });
const yieldDefault = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Verify the exact hypothetical copy, then compare full current/proposed runs.
 * Yields between heavy synchronous phases; never publishes or stages live state.
 */
export async function dryRunGmiChangeSet(session, changeSet, {
  cache, layerId = session?.layerId, referenceDate, getReferenceDate = () => referenceDate,
  yieldWork = yieldDefault, isLive = () => true,
} = {}) {
  if (!isGmiEditSession(session)) return fail('not-a-session', 'stage');
  if (layerId !== session.layerId) return fail('layer-mismatch', 'validation');
  let date;
  try { date = gmiValidationReferenceDate(referenceDate ?? getReferenceDate()); }
  catch { return fail('invalid-reference-date', 'validation'); }
  const dateIsLive = () => {
    try { return date === gmiValidationReferenceDate(getReferenceDate()); }
    catch { return false; }
  };
  const checkpoint = () => !isLive() ? fail('cancelled', 'cancelled') : !dateIsLive() ? fail('stale-reference-date', 'cancelled')
    : !gmiSourceIntact(session.document) ? fail('verification-failed', 'integrity') : null;
  const pause = async () => { await yieldWork(); return checkpoint(); };
  let stopped = await pause();
  if (stopped) return stopped;
  const staged = stageGmiChangeSet(session, changeSet);
  if (!staged.ok) return fail(staged.code, 'stage');
  if (!staged.staged) return fail('no-effective-cells', 'stage');
  const options = cache ? { cache } : undefined;
  const proposed = getGmiProposedState(staged.session, options);
  if (!proposed.ok) return fail('verification-failed', proposed.stage || 'verification', { rejections: proposed.rejections });
  stopped = await pause();
  if (stopped) return stopped;
  const current = getGmiProposedState(session, options);
  if (!current.ok) return fail('verification-failed', current.stage || 'verification', { rejections: current.rejections });
  let before, after;
  try { before = validateGmiDataset(current.dataset, { layerId, referenceDate: date }); }
  catch { return fail('validation-failed', 'before-validation'); }
  stopped = await pause();
  if (stopped) return stopped;
  try { after = validateGmiDataset(proposed.dataset, { layerId, referenceDate: date }); }
  catch { return fail('validation-failed', 'after-validation'); }
  stopped = await pause();
  if (stopped) return stopped;
  if (!gmiSourceIntact(current.document) || !gmiSourceIntact(proposed.document)) return fail('verification-failed', 'integrity');
  const diff = diffGmiValidationFindings(before, after, current.dataset, proposed.dataset);
  const result = Object.freeze({ ok: true, kind: 'gmi-change-set-dry-run', session, changeSet, layerId, referenceDate: date,
    effectiveKey: proposed.effectiveKey, verification: proposed.verification || Object.freeze({ ok: true, identical: true }),
    current, proposed, before, after, diff, introduced: diff.introduced, resolved: diff.resolved, byObject: diff.byObject });
  results.set(result, { isLive: () => isLive() && dateIsLive() });
  return result;
}

/** An immutable result is evidence only for its exact session, ChangeSet/date. */
export function isCurrentGmiDryRun(result, session, changeSet, { referenceDate, layerId = session?.layerId } = {}) {
  const basis = results.get(result);
  if (!basis || !result.ok || result.session !== session || result.changeSet !== changeSet || result.layerId !== layerId || !basis.isLive()) return false;
  try { if (result.referenceDate !== gmiValidationReferenceDate(referenceDate)) return false; }
  catch { return false; }
  return gmiSourceIntact(session.document) && gmiSourceIntact(result.current.document) && gmiSourceIntact(result.proposed.document);
}
