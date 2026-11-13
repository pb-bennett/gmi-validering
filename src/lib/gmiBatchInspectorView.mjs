// R4 orchestration. M5B/M2 remain the only owners of eligibility and patches.
import { getGmiDocumentDataset, gmiSourceIntact } from './gmi-edit/index.mjs';
import { sameGmiSelectionBinding } from './gmiEditSelection.mjs';
import { buildGmiBatchSelection, canManuallySelectGmiBatchRow } from './gmiEditBatchView.mjs';
import { describeGmiEditColumns } from './gmiEditFields.mjs';
import { buildFieldDiagnostics, renderValidationV2Diagnostic } from './validation-v2/diagnostics.js';
import { VALIDATION_RULES } from './validation-v2/registry/rules.js';

const FIELD_REASONS = {
  'field-absent': 'Finnes ikke i filen – kolonnen kan ikke opprettes',
  'linked-tema-disagreement': 'Tema og S_FCODE er ulike – bruk Sett verdi for å rette begge',
  'identifier-column': 'Identifikator – kan ikke masseendres',
  'individual-only': 'Kan bare rettes enkeltvis',
  'field-owned-by-photo-delivery': 'Forvaltes av fotoleveransen',
  'duplicate-field-name': 'Flere kolonner har samme navn',
  'unnamed-field': 'Kolonnen mangler navn',
  'field-binding-unresolved': 'Feltkoblingen er tvetydig',
};
const datasetFindingCache = new WeakMap();

export function gmiInspectorFields(view, scope) {
  if (!['point', 'line'].includes(scope)) return [];
  const { columns, absent } = describeGmiEditColumns(view, scope);
  return [...columns.filter(column => !column.linkedSourceKeys.length || column.sourceKey === column.linkedSourceKeys[0]).map((column) => {
    const reason = !column.editable ? column.reason : column.bindingState === 'AMBIGUOUS' ? 'field-binding-unresolved' : null;
    return { ...column, label: column.linkedSourceKeys.length ? 'Tema (Tema + S_FCODE)' : column.sourceKey, disabled: Boolean(reason), explanation: reason ? FIELD_REASONS[reason] || 'Kan ikke rettes sikkert' : null };
  }), ...absent.map((column) => ({ ...column, sourceKey: null, disabled: true, explanation: FIELD_REASONS[column.reason] }))];
}

export function gmiFieldInspectorRows(preview, batch, selection, advanced, stale) {
  const result = {}, selected = new Set(selection?.keys || []);
  const rows = new Map(batch?.rows?.map((row) => [row.key, row]));
  for (const row of preview.rows) {
    if (!selected.has(row.key)) { result[row.key] = { outcome: 'excluded', detail: '', findings: [] }; continue; }
    if (stale) { result[row.key] = { outcome: 'stale', detail: '', findings: [] }; continue; }
    const current = rows.get(row.key), changed = current?.outcome === 'changed';
    const manual = changed && ['not-applicable', 'unresolved'].includes(row.reason);
    const reason = current?.skipReason || row.reason;
    const canManual = advanced && row.canInclude && ['not-applicable', 'unresolved'].includes(row.reason);
    const { findings, existingCount, resolvedCount } = gmiObjectFindingTransitions(row);
    const unchanged = (!row.reason && (row.physical ? row.physical.every(cell => cell.current === preview.lexeme) : row.current === preview.lexeme)) || reason === 'unchanged';
    const detail = reason === 'linked-tema-disagreement' ? FIELD_REASONS[reason] : reason === 'already-empty' ? 'Allerede tom – kan ikke tømmes'
      : reason === 'operation-mismatch' && preview.operation === 'replace' ? 'Samsvarer ikke nøyaktig med valgt verdi'
      : reason === 'operation-mismatch' ? `Har allerede verdi «${row.current}»`
      : reason === 'not-applicable' && !preview.hydraulicReview ? 'Gjelder ikke ifølge Validator'
        : reason === 'unchanged' ? `Har allerede «${row.current}»` : gmiBatchSkipSummary(row, preview.sourceKey, reason);
    result[row.key] = { outcome: changed ? manual ? 'manual' : 'change' : unchanged ? 'unchanged' : 'skipped',
      detail: changed && !manual ? '' : detail, findings: changed ? findings : [],
      ...(changed ? { existingCount, resolvedCount } : {}),
      change: changed ? { from: row.disagreement ? row.physical.map(cell => `${cell.field}: «${cell.current}»`).join(' · ') : row.current,
        to: preview.lexeme, overwrites: !row.missing } : undefined,
      canManual, manualOn: manual, cellKey: row.key, explanation: row.explanation,
      hypothetical: !changed && canManual ? { change: { from: row.current, to: preview.lexeme }, findings, existingCount, resolvedCount } : null };
  }
  for (const key of selected) if (!result[key]) result[key] = { outcome: 'added', detail: '', findings: [] };
  return result;
}

/**
 * G4's basic mixed gate: effective Tema and the edited field's current lexeme
 * (including empties), compared only across the objects that change in the
 * checked ChangeSet. Its cells cover manual inclusions and replaced conflicts;
 * skipped, unchanged and deselected objects have no cell and are ignored.
 */
export function gmiInspectorMixedFields(preview, dataset, changeSet) {
  if (!preview || !dataset || !changeSet) return [];
  const objects = dataset[preview.scope === 'point' ? 'points' : 'lines'];
  const changing = [...new Map(changeSet.cells.filter((cell) => cell.scope === preview.scope && (preview.sourceKeys || [preview.sourceKey]).includes(cell.field))
    .map((cell) => [cell.sourceIndex, cell])).values()];
  if (changing.length < 2) return [];
  const tema = (cell) => {
    const attributes = objects[cell.sourceIndex]?.attributes || {};
    const key = Object.keys(attributes).find((name) => /^(tema|s_fcode)$/i.test(name));
    return String(attributes[key] ?? '').trim();
  };
  return [['Tema', tema], [preview.sourceKey, (cell) => String(cell.previous ?? '').trim()]]
    .filter(([, value]) => new Set(changing.map(value)).size > 1).map(([field]) => field);
}

export function gmiBatchDatasetFindings(dryRun, transition = 'introduced') {
  let cached = datasetFindingCache.get(dryRun);
  if (!cached) { cached = new Map(); datasetFindingCache.set(dryRun, cached); }
  if (cached.has(transition)) return cached.get(transition);
  const result = transition === 'resolved' ? dryRun.before : dryRun.after;
  const groups = new Map();
  const findings = dryRun[transition].map((finding, index) => {
    const scope = finding.objectRef?.geometryScope || finding.geometryScope;
    const rule = result.ruleResults.find((entry) => entry.rule.ruleId === finding.ruleId)?.rule;
    const group = `${finding.ruleId}:${scope}`;
    if (!groups.has(group)) groups.set(group, rule ? buildFieldDiagnostics({ result, rule, geometryScope: scope }).diagnostics : []);
    const diagnostics = groups.get(group);
    const diagnostic = diagnostics.find((entry) => entry.state === finding.state && entry.reasonCodes.includes(finding.reasonCode));
    return { key: `${transition}:${index}`, introduced: transition === 'introduced', objectRef: finding.objectRef,
      ruleId: finding.ruleId, state: finding.state,
      tone: finding.state === 'FAIL' ? 'error' : 'warning', severity: finding.state === 'FAIL' ? 'FEIL' : 'SJEKK',
      reason: diagnostic ? renderValidationV2Diagnostic(diagnostic) : rule?.description || 'Kontroller feltkoblingen i Validator' };
  });
  cached.set(transition, findings);
  return findings;
}

/**
 * S2, presentation only: the dataset dry run with severity changes shown once.
 * An introduced and a resolved finding of the same rule on the same object with
 * a different severity become one «Forverret» (SJEKK → FEIL) or «Forbedret»
 * (FEIL → SJEKK) record. Same-severity reason changes stay new + resolved.
 * Approval never reads these counts: it keeps `dryRun.diff.newCounts`, where a
 * worsened FEIL is an introduced FEIL.
 */
export function gmiBatchDatasetTransitions(dryRun) {
  let cached = datasetFindingCache.get(dryRun);
  if (!cached) { cached = new Map(); datasetFindingCache.set(dryRun, cached); }
  if (cached.has('transitions')) return cached.get('transitions');
  const identity = (finding) => finding.objectRef
    ? `${finding.ruleId}|${finding.objectRef.geometryScope}:${finding.objectRef.sourceIndex}` : null;
  const { paired, resolved } = pairSeverityChanges(gmiBatchDatasetFindings(dryRun), gmiBatchDatasetFindings(dryRun, 'resolved'), identity);
  const introduced = gmiBatchDatasetFindings(dryRun).map((finding) => withTransition(finding, paired.get(finding)));
  const result = { added: introduced.filter((finding) => finding.transition === 'new'),
    worsened: introduced.filter((finding) => finding.transition === 'worsened'),
    improved: introduced.filter((finding) => finding.transition === 'improved'),
    resolved: resolved.map((finding) => ({ ...finding, transition: 'resolved', label: `Løst ${finding.severity}` })) };
  result.counts = { newFail: result.added.filter((finding) => finding.state === 'FAIL').length,
    newCheck: result.added.filter((finding) => finding.state !== 'FAIL').length,
    worsened: result.worsened.length, improved: result.improved.length,
    resolvedFail: result.resolved.filter((finding) => finding.state === 'FAIL').length,
    resolvedCheck: result.resolved.filter((finding) => finding.state !== 'FAIL').length };
  cached.set('transitions', result);
  return result;
}

export function gmiSelectionTargets(view, selection, { lineOnly = false } = {}) {
  const binding = { layerId: view.session.layerId, sessionId: view.handle.sessionId, fingerprint: view.document.fingerprint };
  if (!sameGmiSelectionBinding(binding, selection?.binding) || view.handle.fingerprint !== binding.fingerprint
    || view.session.document !== view.document || !gmiSourceIntact(view.document)) return { ok: false, code: 'stale-session' };
  if (lineOnly && selection.scope !== 'line') return { ok: false, code: 'line-only' };
  if (!['point', 'line'].includes(selection.scope) || !Array.isArray(selection.keys)) return { ok: false, code: 'invalid-targets' };
  const dataset = getGmiDocumentDataset(view.document);
  const targets = [];
  for (const key of selection.keys) {
    const match = /^(point|line):(0|[1-9]\d*)$/.exec(key);
    const sourceIndex = match && match[1] === selection.scope ? Number(match[2]) : -1;
    const object = dataset[selection.scope === 'point' ? 'points' : 'lines'][sourceIndex];
    if (!object) return { ok: false, code: 'invalid-targets' };
    targets.push({ scope: selection.scope, sourceIndex, objectId: object.id, guid: object.guid ?? null });
  }
  return targets.length && new Set(selection.keys).size === targets.length
    ? { ok: true, targets } : { ok: false, code: 'invalid-targets' };
}

export function gmiBatchScopeState(view, selection, review) {
  const targets = gmiSelectionTargets(view, selection, { lineOnly: true });
  if (!targets.ok) return targets.code;
  if (review.preview.session !== view.session || !sameGmiSelectionBinding(review.binding, selection.binding)) return 'stale-session';
  if (selection.keys.some((key) => !review.keys.includes(key))) return 'expanded';
  return null;
}

/** B3: source identity, never table order or editing revision, owns the itinerary. */
export function gmiIndividualSelection(view, selection, selected, binding = selection?.binding) {
  if (!view || !sameGmiSelectionBinding(binding, selection?.binding)) return { ok: false, targets: [], index: -1 };
  const result = gmiSelectionTargets(view, selection);
  if (!result.ok) return { ...result, targets: [], index: -1 };
  const targets = [...result.targets].sort((a, b) => a.sourceIndex - b.sourceIndex);
  const index = targets.findIndex((target) => target.scope === selected?.scope && target.sourceIndex === selected?.sourceIndex);
  return { ok: true, targets, index };
}

export function planGmiInspectorBatch(view, selection, review, manual = new Set(), replace = false, advanced = false) {
  const stale = gmiBatchScopeState(view, selection, review);
  if (stale) return { ok: false, code: stale };
  const scope = new Set(selection.keys);
  const rows = [...review.preview.rows, ...review.preview.skippedRows].filter((row) => scope.has(`${row.scope}:${row.sourceIndex}`));
  const included = new Set(rows.filter((row) => !row.reason || (advanced && manual.has(row.key))).map((row) => row.key));
  const result = buildGmiBatchSelection(view.session, review.preview, included, replace, undefined, advanced);
  const changeSet = result.ok ? result.changeSet : null;
  const changed = new Set(changeSet?.cells.map((cell) => cell.key));
  const unchanged = new Set(changeSet?.unchanged.map((cell) => cell.key));
  const skipped = new Map(changeSet?.skipped.map((cell) => [cell.key, cell.reason]));
  const displayRows = rows.map((row) => ({ ...row, manual: advanced && manual.has(row.key),
    status: changed.has(row.key) ? 'Endres' : unchanged.has(row.key) ? 'Uendret' : 'Hoppes over',
    skipReason: skipped.get(row.key) || row.reason,
    proposed: review.preview.lexeme }));
  const introduced = (state) => displayRows.filter((row) => changed.has(row.key)
    && row.findings.some((finding) => finding.batchIntroduced && finding.state === state)).length;
  return { ...result, rows: displayRows, included, counts: { selected: rows.length,
    eligible: rows.filter((row) => !row.reason).length,
    manual: changeSet?.eligibility.manualOverrides.length || 0,
    changed: changeSet?.cells.length || 0, unchanged: changeSet?.unchanged.length || 0,
    skipped: displayRows.filter((row) => row.status === 'Hoppes over').length,
    // Previewed objects the user has since unchecked. They are not in the ChangeSet.
    excluded: review.preview.rows.length + review.preview.skippedRows.length - rows.length,
    // Only cells that actually change can introduce findings.
    newErrors: introduced('FAIL'), newChecks: introduced('CHECK'),
  } };
}

// ------------------------------------------------- table review presentation

const HYDRAULIC = { PRESSURE: 'trykkledninger', GRAVITY: 'selvfallsledninger', SPECIAL: 'spesiell hydraulisk klasse' };

/** One short, specific reason for a skipped object, from M5B/M2 evidence only. */
export function gmiBatchSkipSummary(row, field, reason = row.reason) {
  const facts = row.evidence?.diagnosticFacts;
  const context = (id) => facts?.context?.find((entry) => entry.fieldId === id)?.value;
  const tema = context('tema'), material = context('material');
  if (reason === 'populated') return `Har allerede verdi «${String(row.current ?? row.original).trim()}»`;
  if (reason === 'conflict') return 'Endret av en tidligere retting';
  if (reason === 'object-not-editable') return 'Objektet kan ikke rettes sikkert';
  if (reason === 'out-of-scope') return 'Utenfor utvalget';
  if (reason === 'unresolved') return `Uavklart om ${field} gjelder${tema ? ` (Tema ${tema})` : ''}`;
  if (reason !== 'not-applicable') return 'Hoppes over';
  if (facts?.applicabilityReason === 'HYDRAULIC_CLASS_NOT_RECOMMENDED' && HYDRAULIC[facts.classification]) {
    return `${field} anbefales ikke for ${HYDRAULIC[facts.classification]}${tema ? ` (Tema ${tema})` : ''}`;
  }
  if (facts?.applicabilityReason === 'MATERIAL_FAMILY_NOT_RECOMMENDED') return `${field} anbefales ikke for ${material ? `material ${material}` : 'materialet'}`;
  if (facts?.applicabilityReason === 'SPECIAL_HYDRAULIC_CONTEXT') return `Spesiell hydraulisk klasse${tema ? ` (Tema ${tema})` : ''} – vurder manuelt`;
  return `${field} anbefales ikke for objektet`;
}

const isFail = (finding) => finding.state === 'FAIL';

/** One-to-one pairing of introduced/resolved findings with the same identity and a different severity. */
function pairSeverityChanges(introduced, resolved, identity) {
  const open = [...resolved], paired = new Map();
  for (const finding of introduced) {
    const key = identity(finding);
    if (key === null || key === undefined) continue;
    const index = open.findIndex((previous) => identity(previous) === key && isFail(previous) !== isFail(finding));
    if (index >= 0) { paired.set(finding, open[index]); open.splice(index, 1); }
  }
  return { paired, resolved: open };
}

const TRANSITION_RANK = Object.freeze({ new: 0, worsened: 1, improved: 3 });

/** Shared transition label: «FEIL (ny)», «Forverret: SJEKK → FEIL», «Forbedret: FEIL → SJEKK». */
function withTransition(finding, previous) {
  const severity = isFail(finding) ? 'FEIL' : 'SJEKK';
  if (!previous) return { ...finding, transition: 'new', label: `${severity} (ny)` };
  const from = isFail(previous) ? 'FEIL' : 'SJEKK';
  return { ...finding, transition: isFail(finding) ? 'worsened' : 'improved', previousSeverity: from,
    label: isFail(finding) ? `Forverret: ${from} → ${severity}` : `Forbedret: ${from} → ${severity}`,
    // The remaining SJEKK is still a finding; say so wherever there is room.
    note: isFail(finding) ? 'Telles som ny FEIL ved godkjenning' : 'SJEKK gjenstår' };
}

/**
 * S2, presentation only: one object's findings after the change. `findings`
 * holds only what the change does (new, worsened, improved), most severe first;
 * unchanged existing findings are kept separately and counted, so an existing
 * FEIL can never hide a new SJEKK. Every record keeps `introduced`, so the
 * review sort is unchanged.
 */
export function gmiObjectFindingTransitions(row) {
  const after = row?.findings || [], other = row?.otherFindings || [];
  const introduced = after.filter((finding) => finding.batchIntroduced);
  const afterKeys = new Set([...after, ...other].map((finding) => finding.key));
  const before = row?.resolvedFindings ?? (row?.currentFindings || []).filter((finding) => !afterKeys.has(finding.key));
  const { paired, resolved } = pairSeverityChanges(introduced, before, (finding) => finding.ruleId);
  const record = (finding, transition, extra = {}) => ({ key: finding.key, tone: isFail(finding) ? 'error' : 'warning',
    severity: isFail(finding) ? 'FEIL' : 'SJEKK', introduced: transition !== 'existing' && transition !== 'resolved',
    transition, reason: finding.reason, ...extra });
  const findings = introduced.map((finding) => {
    const { transition, label, previousSeverity, note } = withTransition(finding, paired.get(finding));
    return record(finding, transition, { label, previousSeverity, note });
  }).sort((a, b) => (TRANSITION_RANK[a.transition] + (a.transition === 'new' && a.tone === 'warning' ? 2 : 0))
    - (TRANSITION_RANK[b.transition] + (b.transition === 'new' && b.tone === 'warning' ? 2 : 0)));
  const existing = gmiBatchFindingList([...after.filter((finding) => !finding.batchIntroduced), ...other])
    .map((finding) => ({ ...finding, transition: 'existing', label: finding.severity }));
  return { findings, existing, existingCount: existing.length,
    resolved: resolved.map((finding) => record(finding, 'resolved', { label: `Løst ${isFail(finding) ? 'FEIL' : 'SJEKK'}` })),
    resolvedCount: resolved.length };
}

/** Findings most-severe first: new FEIL, FEIL, new SJEKK, SJEKK. */
export function gmiBatchFindingList(findings = []) {
  const rank = (finding) => (finding.state === 'FAIL' ? 0 : 2) + (finding.batchIntroduced ? 0 : 1);
  return [...findings].sort((a, b) => rank(a) - rank(b)).map((finding) => ({
    key: finding.key, tone: finding.state === 'FAIL' ? 'error' : 'warning',
    severity: finding.state === 'FAIL' ? 'FEIL' : 'SJEKK', introduced: Boolean(finding.batchIntroduced), reason: finding.reason,
  }));
}

const gmiReviewFindingFields = (row) => {
  const { findings, existingCount, resolvedCount } = gmiObjectFindingTransitions(row);
  return { findings, existingCount, resolvedCount };
};

export const GMI_BATCH_OUTCOME_LABELS = Object.freeze({
  change: 'Endres', manual: 'Manuelt inkludert', unchanged: 'Uendret', skipped: 'Hoppes over',
  excluded: 'Utelatt av deg', stale: 'Ugyldig forhåndsvisning', added: 'Ikke forhåndsvist',
});

/**
 * Per-object table records for the current review. The outcome is read from the
 * ChangeSet that would actually be staged; nothing is inferred from the original
 * preview for objects the user removed. A skipped object only carries a
 * hypothetical change/findings when it may be manually included, and those are
 * labelled as such.
 */
export function gmiBatchReviewRows({ review, plan, selection, advanced = false, stale = null }) {
  const out = {};
  if (!review) return out;
  const field = review.preview.eligibility.field, lexeme = review.preview.lexeme;
  const all = [...review.preview.rows, ...review.preview.skippedRows];
  const selected = new Set(selection?.keys || []);
  const objectKey = (row) => `${row.scope}:${row.sourceIndex}`;
  if (stale || !plan) {
    // An invalid preview shows no values for any object: it must be recalculated.
    for (const key of selected) out[key] = { outcome: review.keys.includes(key) ? 'stale' : 'added', detail: '', findings: [] };
    return out;
  }
  // No ChangeSet when nothing was included (every selected object is skipped);
  // any other construction failure invalidates the included objects.
  const changeSet = plan.ok ? plan.changeSet : null;
  const failed = !plan.ok && plan.included?.size > 0;
  const cells = new Map(changeSet?.cells.map((cell) => [cell.key, cell]));
  const unchanged = new Set(changeSet?.unchanged.map((cell) => cell.key));
  const finalSkips = new Map(changeSet?.skipped.map((cell) => [cell.key, cell.reason]));
  const manual = new Set(changeSet?.eligibility.manualOverrides.map((row) => row.key));
  for (const row of all) {
    const key = objectKey(row);
    if (!selected.has(key)) { out[key] = { outcome: 'excluded', detail: '', findings: [] }; continue; }
    if (failed && plan.included.has(row.key)) { out[key] = { outcome: 'stale', detail: '', findings: [] }; continue; }
    const cell = cells.get(row.key);
    if (cell) {
      out[key] = { outcome: manual.has(row.key) ? 'manual' : 'change', detail: manual.has(row.key) ? gmiBatchSkipSummary(row, field) : '',
        change: { from: cell.previous, to: cell.next, overwrites: cell.overwritesPopulated }, ...gmiReviewFindingFields(row),
        canManual: manual.has(row.key) && advanced, manualOn: manual.has(row.key), cellKey: row.key, explanation: row.explanation };
      continue;
    }
    if (unchanged.has(row.key)) { out[key] = { outcome: 'unchanged', detail: `Har allerede «${String(row.current).trim()}»`, findings: [], explanation: row.explanation }; continue; }
    const reason = finalSkips.get(row.key) || row.reason;
    const canManual = advanced && canManuallySelectGmiBatchRow(row, review.preview.mode);
    out[key] = { outcome: 'skipped', detail: gmiBatchSkipSummary(row, field, reason), findings: [], explanation: row.explanation,
      canManual, manualOn: false, cellKey: row.key,
      // Decision support only: what manual inclusion would do. Never counted.
      hypothetical: canManual ? { change: { from: row.current, to: lexeme }, ...gmiReviewFindingFields(row) } : null };
  }
  return out;
}

// ------------------------------------------------- B2 current findings and risk gate

const RULE_FIELDS = new Map(VALIDATION_RULES.map((rule) => [rule.ruleId, rule.canonicalFieldId]));
export const GMI_CURRENT_FINDING_CATEGORIES = Object.freeze(['FEIL', 'SJEKK', 'none', 'unknown']);

/**
 * B2, presentation only: one category per selected, previewed object from the
 * findings the preview already holds (`row.currentFindings`, the Validator on
 * the current working copy). Only findings of rules owned by the edited
 * canonical field count. Precedence FEIL > SJEKK > none; an object without
 * preview findings (source-refused) is «unknown», never «none».
 */
export function gmiCurrentFindingSplit(preview, selection) {
  const canonicalFieldId = preview?.column?.canonicalFieldId || null;
  if (!preview || !canonicalFieldId) return null;
  const selected = new Set(selection?.keys || []);
  const groups = { FEIL: [], SJEKK: [], none: [], unknown: [] };
  for (const row of preview.rows || []) {
    if (!selected.has(row.key)) continue;
    if (!Array.isArray(row.currentFindings)) { groups.unknown.push(row.key); continue; }
    const own = row.currentFindings.filter((finding) => RULE_FIELDS.get(finding.ruleId) === canonicalFieldId);
    groups[own.some((finding) => finding.state === 'FAIL') ? 'FEIL' : own.length ? 'SJEKK' : 'none'].push(row.key);
  }
  const counts = Object.fromEntries(Object.entries(groups).map(([key, keys]) => [key, keys.length]));
  return Object.freeze({ field: preview.sourceKey, canonicalFieldId, groups: Object.freeze(groups), counts: Object.freeze(counts),
    total: counts.FEIL + counts.SJEKK + counts.none + counts.unknown });
}

/**
 * B2 risk gate. Staging needs the existing risk approval whenever any reason is
 * present; an empty list means direct staging. `newFail` is the dry run's
 * `diff.newCounts.fail` (approval semantics unchanged; worsened counts as new).
 */
export function gmiBatchRiskReasons({ manualRows = [], changeSetCounts = {}, newFail = 0, mixedProfile = [], mixedFields = [], unvalidated = false, linkedTema = false }) {
  return [
    manualRows.length > 0 && 'manual',
    (changeSetCounts.populatedOverwrites > 0 || changeSetCounts.overwritten > 0) && 'overwrite',
    newFail > 0 && 'new-fail',
    (mixedProfile.length > 0 || mixedFields.length > 0) && 'mixed',
    unvalidated && 'unvalidated',
    linkedTema && 'linked-tema',
  ].filter(Boolean);
}
