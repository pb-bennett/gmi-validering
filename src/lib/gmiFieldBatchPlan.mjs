// G2/G3: inspection, explicit ChangeSets and hypothetical validation. No live staging.
import { createGmiBatchCorrection, getGmiEditCell, gmiSourceIntact, isGmiEditSession,
  dryRunGmiChangeSet, isCurrentGmiDryRun, gmiCellKey, listGmiObjectCells, resolveGmiCell } from './gmi-edit/index.mjs';
import { isGmiMissingLexeme as missing } from './gmi-edit/changeSet.mjs';
import { gmiSessionEffectiveCells } from './gmi-edit/session.mjs';
import { checkGmiFieldDraft, describeGmiEditColumns, gmiEditColumnPolicy } from './gmiEditFields.mjs';
import { gmiEditObjectDiagnostics } from './gmiEditValidation.mjs';
import { buildGmiBatchSelection, canManuallySelectGmiBatchRow, prepareGmiBatchReview } from './gmiEditBatchView.mjs';
import { gmiSelectionTargets } from './gmiBatchInspectorView.mjs';
import { sameGmiSelectionBinding } from './gmiEditSelection.mjs';
import { gmiObjectCountLabel } from './gmiEditView.mjs';

const previews = new WeakMap();
const batches = new WeakMap();
const keyOf = (target) => `${target?.scope}:${target?.sourceIndex}`;
const reject = (code, detail = {}) => ({ ok: false, code, ...detail });
const yieldDefault = () => new Promise((resolve) => setTimeout(resolve, 0));

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function liveView(view) {
  return isGmiEditSession(view?.session) && view.session.document === view.document
    && view.handle?.layerId === view.session.layerId && typeof view.handle.sessionId === 'string'
    && view.handle.fingerprint === view.document.fingerprint && gmiSourceIntact(view.document);
}

function findingsBetween(before, after) {
  const currentFindings = before.findings.filter((finding) => finding.transition !== 'resolved');
  const proposed = after.findings.filter((finding) => finding.transition !== 'resolved');
  const currentKeys = new Set(currentFindings.map((finding) => finding.key));
  const proposedKeys = new Set(proposed.map((finding) => finding.key));
  return { currentFindings,
    findings: proposed.map((finding) => ({ ...finding, batchIntroduced: !currentKeys.has(finding.key) })),
    resolvedFindings: currentFindings.filter((finding) => !proposedKeys.has(finding.key))
      .filter((finding) => !after.deferredRuleIds?.includes(finding.ruleId)),
    deferred: before.deferred || after.deferred };
}

function classify(row, operation, lexeme, match = null) {
  const unchanged = row.current === lexeme;
  const alreadyEmpty = operation === 'clear' && missing(row.current);
  const matches = operation === 'replace' ? row.current === match
    : operation === 'clear' ? !alreadyEmpty : operation === 'set' || (missing(row.current) && missing(row.original));
  const applicabilityReason = ['not-applicable', 'unresolved'].includes(row.reason) ? row.reason : row.applicability === 'NOT_APPLICABLE' ? 'not-applicable'
    : row.applicability === 'UNRESOLVED' ? 'unresolved' : null;
  const reason = alreadyEmpty ? 'already-empty' : operation === 'replace' && !matches ? 'operation-mismatch'
    : unchanged ? 'unchanged' : !matches ? 'operation-mismatch'
    : applicabilityReason || (row.changedBy.length ? 'conflict' : null);
  return { ...row, reason, operationMatches: matches, canInclude: !alreadyEmpty && !unchanged && matches,
    defaultIncluded: !reason,
    status: reason || (missing(row.current) ? 'fill' : 'overwrite') };
}

/** Exact effective values for the selected source cells, including whitespace variants and counts. */
export function gmiFieldBatchValues(view, selection, sourceKey) {
  if (!liveView(view)) return reject('stale-session');
  const selected = gmiSelectionTargets(view, selection);
  if (!selected.ok) return selected;
  const values = new Map();
  let blocked = 0;
  for (const target of selected.targets) {
    const resolved = resolveGmiCell(view.document, { ...target, field: sourceKey });
    if (!resolved.ok) { blocked++; continue; }
    const current = getGmiEditCell(view.session, resolved.cell).proposed;
    values.set(current, (values.get(current) || 0) + 1);
  }
  return freeze({ ok: true, values: [...values].map(([lexeme, count]) => ({ lexeme, count })), blocked });
}

/**
 * Exact source targets for one scope/column, ordered by source index.
 * `isLive` must track the caller's session/selection while asynchronous work runs.
 * Optional `selection` is checked against the view's source/session binding.
 */
export async function prepareGmiFieldBatch(view, options = {}, { yieldWork = yieldDefault, isLive = () => true } = {}) {
  const session = view?.session;
  const sourceBinding = { ...view?.handle };
  await yieldWork();
  if (!isLive() || !liveView(view) || view.session !== session
    || !sameGmiSelectionBinding(sourceBinding, view.handle)) return reject('stale-session');
  if (!options || typeof options !== 'object') return reject('invalid-options');
  let selectionValid = () => true;
  const isCurrent = () => isLive() && view.session === session
    && sameGmiSelectionBinding(sourceBinding, view.handle) && selectionValid();
  const { scope, sourceKey, operation, value, match = null, selection } = options;
  if (!['point', 'line'].includes(scope)) return reject('unknown-scope');
  if (!['fill-missing', 'set', 'replace', 'clear'].includes(operation)) return reject('unsupported-operation');
  if (operation === 'replace' && typeof match !== 'string') return reject('invalid-match');
  if (operation === 'clear' && value !== undefined && value !== '') return reject('invalid-clear-value');
  const proposedValue = operation === 'clear' ? '' : value;
  const columns = describeGmiEditColumns(view, scope).columns.filter((column) => column.sourceKey === sourceKey);
  if (!columns.length) return reject('field-absent');
  const [column] = columns;
  if (!column.editable) return reject(column.reason);
  if (columns.length !== 1 || column.bindingState === 'AMBIGUOUS') return reject('field-binding-unresolved');
  if (column.operationKind === 'linked-tema') return reject('linked-tema-not-supported');
  let targets = options.targets;
  if (targets !== undefined && !Array.isArray(targets)) return reject('invalid-targets');
  if (selection) {
    const selected = gmiSelectionTargets(view, selection);
    if (!selected.ok) return selected;
    if (selection.scope !== scope) return reject('invalid-targets');
    const binding = { ...selection.binding }, keys = new Set(selection.keys);
    selectionValid = () => sameGmiSelectionBinding(binding, selection.binding) && selection.scope === scope
      && Array.isArray(selection.keys) && selection.keys.every((key) => keys.has(key))
      && new Set(selection.keys).size === selection.keys.length;
    if (targets && (targets.length !== selected.targets.length
      || targets.some((target) => !selected.targets.some((entry) => keyOf(entry) === keyOf(target))))) return reject('invalid-targets');
    targets ??= selected.targets;
  }
  if (!Array.isArray(targets) || !targets.length || targets.some((target) => target?.scope !== scope
    || !Number.isInteger(target.sourceIndex) || target.sourceIndex < 0)
    || new Set(targets.map(keyOf)).size !== targets.length) return reject('invalid-targets');
  targets = targets.map((target) => ({ ...target })).sort((a, b) => a.sourceIndex - b.sourceIndex);
  const mode = operation === 'fill-missing' ? 'fill-missing' : 'overwrite';
  let lexeme, hydraulicReview = null;
  if (column.operationKind === 'hydraulic') {
    // Preserve M2's numeric spellings, eligibility and manual override behavior.
    // The existing eligibility API does not check caller identity guards, so
    // check those here before handing it the exact selection.
    if (scope !== 'line') return reject('unsupported-field');
    for (const target of targets) {
      const resolved = resolveGmiCell(view.document, { ...target, field: sourceKey });
      if (!resolved.ok && resolved.code !== 'object-not-editable') return reject(resolved.code);
    }
    const draft = checkGmiFieldDraft(column, proposedValue, view.document.encoding.encodingClass,
      { restrictEnumeration: false, normalizeCase: false });
    if (!draft.ok) return reject(draft.problem.code);
    lexeme = draft.lexeme;
    hydraulicReview = await prepareGmiBatchReview(view, { canonicalFieldId: column.canonicalFieldId, mode, lexeme, targets }, { yieldWork, isLive: isCurrent });
    if (!hydraulicReview.ok) return hydraulicReview;
    if (hydraulicReview.eligibility.field !== sourceKey) return reject('field-binding-unresolved');
  } else {
    // Custom codes are reviewed by the Validator, just as in the individual editor.
    const draft = checkGmiFieldDraft(column, proposedValue, view.document.encoding.encodingClass, { restrictEnumeration: false });
    if (!draft.ok) return reject(draft.problem.code);
    lexeme = draft.lexeme;
  }
  const rows = [];
  if (hydraulicReview) {
    for (const entry of [...hydraulicReview.rows, ...hydraulicReview.skippedRows].sort((a, b) => a.sourceIndex - b.sourceIndex)) {
      const row = { ...entry, key: keyOf(entry), cellKey: entry.key,
        status: entry.reason || (entry.current === lexeme ? 'unchanged' : entry.missing ? 'fill' : 'overwrite'),
        defaultIncluded: !entry.reason && !entry.changedBy.length && entry.current !== lexeme,
        canInclude: Boolean(entry.key) && (!entry.reason || canManuallySelectGmiBatchRow(entry, mode)),
        operationMatches: operation === 'set' || (missing(entry.current) && missing(entry.original)) };
      rows.push(['replace', 'clear'].includes(operation) && entry.key ? classify(row, operation, lexeme, match) : row);
    }
  } else {
    const effective = gmiSessionEffectiveCells(view.session);
    for (const target of targets) {
      const resolved = resolveGmiCell(view.document, { ...target, field: sourceKey });
      if (!resolved.ok) {
        rows.push({ ...target, key: keyOf(target), cellKey: null, field: sourceKey, reason: resolved.code,
          status: 'source-refused', canInclude: false, defaultIncluded: false, findings: [], resolvedFindings: [], deferred: false });
      } else {
        const current = getGmiEditCell(view.session, resolved.cell);
        const values = listGmiObjectCells(view.document, scope, target.sourceIndex).map((cell) => ({ ...cell,
          editable: gmiEditColumnPolicy(cell).editable,
          proposed: effective.get(gmiCellKey({ scope, sourceIndex: target.sourceIndex, field: cell.field }))?.proposed ?? cell.lexeme }));
        const input = { view, scope, sourceIndex: target.sourceIndex, rows: values, governingRuleId: column.governingRuleId };
        const before = gmiEditObjectDiagnostics(input);
        const after = gmiEditObjectDiagnostics({ ...input, drafts: { [sourceKey]: lexeme } });
        rows.push(classify({ scope, sourceIndex: target.sourceIndex, objectId: resolved.cell.objectId, guid: resolved.cell.guid,
          key: keyOf(target), cellKey: resolved.cell.key, field: sourceKey, original: current.original, current: current.proposed,
          changedBy: current.history.map((entry) => entry.changeSetId), missing: missing(current.proposed),
          applicability: column.governingRuleId ? before.governingOutcome?.diagnosticFacts?.coverageApplicability || 'UNRESOLVED' : null,
          governingOutcome: before.governingOutcome, proposedOutcome: after.governingOutcome,
          validatorKind: column.validatorKind, ...findingsBetween(before, after) }, operation, lexeme, match));
      }
      if (rows.length % 20 === 0) {
        await yieldWork();
        if (!isCurrent()) return reject('stale-session');
      }
    }
  }
  if (!isCurrent() || !liveView(view)) return reject('stale-session');
  if (operation === 'replace' && !rows.some((row) => row.current === match)) return reject('match-not-found');
  const preview = freeze({ session, scope, sourceKey, operation, lexeme, match: operation === 'replace' ? match : null, mode, column, rows, hydraulicReview });
  previews.set(preview, { view, isLive: isCurrent, selection });
  return { ok: true, preview };
}

/**
 * `included` contains object keys (point:0 / line:0). Omitted = default rows.
 * `replace` authorizes replacing existing proposals. Manual applicability
 * inclusion additionally requires approvals.allowApplicabilityOverride.
 * G4 owns UI confirmation for overwrite, new findings and unvalidated columns.
 */
export function buildGmiFieldBatch(session, preview, { included, replace = false, approvals = {}, createdAt } = {}) {
  const basis = previews.get(preview);
  if (!basis) return reject('invalid-preview');
  if (session !== preview.session || basis.view.session !== session || !basis.isLive() || !liveView(basis.view)) return reject('stale-session');
  const liveKeys = basis.selection ? new Set(basis.selection.keys) : null;
  included ??= new Set(preview.rows.filter((row) => row.defaultIncluded && (!liveKeys || liveKeys.has(row.key))).map((row) => row.key));
  if (!(included instanceof Set)) return reject('invalid-targets');
  if (liveKeys && [...included].some((key) => !liveKeys.has(key))) return reject('stale-selection');
  const selected = preview.rows.filter((row) => included.has(row.key));
  if (selected.length !== included.size) return reject('invalid-targets');
  if (!selected.length) return reject('no-requests');
  if (selected.some((row) => !row.canInclude)) return reject('target-not-allowed');
  if (selected.some((row) => ['not-applicable', 'unresolved'].includes(row.reason))
    && approvals?.allowApplicabilityOverride !== true) return reject('manual-override-not-approved');
  const intent = { operation: preview.operation, sourceKey: preview.sourceKey, value: preview.lexeme, match: preview.match, scope: preview.scope,
    excluded: {
      notApplicable: preview.rows.filter((row) => !included.has(row.key) && ['not-applicable', 'unresolved', 'already-empty'].includes(row.reason)).length,
      mismatch: preview.rows.filter((row) => !included.has(row.key) && row.reason === 'operation-mismatch').length,
      user: preview.rows.filter((row) => row.canInclude && !included.has(row.key) && !['not-applicable', 'unresolved', 'operation-mismatch'].includes(row.reason)).length,
    } };
  const labelPrefix = preview.operation === 'clear' ? `Tøm ${preview.sourceKey}`
    : preview.operation === 'replace' ? `Erstatt ${preview.sourceKey} «${preview.match}» med «${preview.lexeme}»` : null;
  let result;
  if (preview.hydraulicReview) {
    result = buildGmiBatchSelection(session, preview.hydraulicReview, new Set(selected.map((row) => row.cellKey)),
      replace, createdAt, approvals?.allowApplicabilityOverride === true, intent, labelPrefix);
  } else {
    // This branch is reachable only for G1's generic operationKind. Hydraulic
    // fields always use the eligibility-token path above, never explicit targets.
    const options = { field: preview.sourceKey, lexeme: preview.lexeme,
      targets: selected.map(({ scope, sourceIndex, objectId, guid }) => ({ scope, sourceIndex, objectId, guid })),
      mode: preview.mode, conflictPolicy: replace ? 'replace' : 'skip', createdAt, intent };
    result = createGmiBatchCorrection(session, options);
    if (result.ok) result = createGmiBatchCorrection(session, { ...options,
      label: `${labelPrefix || `${preview.operation === 'set' ? 'Sett' : 'Fyll'} ${preview.sourceKey} ${preview.lexeme}`} · ${gmiObjectCountLabel(result.changeSet.cells.length, preview.scope)}` });
  }
  if (!result.ok) return result;
  const changed = new Set(result.changeSet.cells.map((cell) => cell.key));
  const unchanged = new Set(result.changeSet.unchanged.map((cell) => cell.key));
  const skipped = new Map(result.changeSet.skipped.map((cell) => [cell.key, cell.reason]));
  const rows = preview.rows.map((row) => ({ ...row, included: included.has(row.key),
    outcome: changed.has(row.cellKey) ? 'changed' : unchanged.has(row.cellKey) ? 'unchanged'
      : included.has(row.key) ? 'skipped' : 'excluded', skipReason: skipped.get(row.cellKey) || row.reason }));
  const batch = freeze({ ...result, rows, dryRun: null, approvalReady: false,
    counts: { selected: rows.length, included: selected.length, changed: changed.size,
    unchanged: unchanged.size, skipped: rows.filter((row) => row.outcome === 'skipped').length,
    excluded: rows.length - selected.length,
    newErrors: rows.filter((row) => changed.has(row.cellKey) && row.findings.some((finding) => finding.batchIntroduced && finding.state === 'FAIL')).length,
    newChecks: rows.filter((row) => changed.has(row.cellKey) && row.findings.some((finding) => finding.batchIntroduced && finding.state === 'CHECK')).length } });
  basis.latestBatch = batch;
  batches.set(batch, { batch, preview, included: [...included], changeSet: batch.changeSet, generation: 0 });
  return batch;
}

function currentBatch(session, batch) {
  const built = batches.get(batch), basis = built && previews.get(built.preview);
  if (!basis || basis.latestBatch !== built.batch || session !== built.preview.session || basis.view.session !== session
    || batch.changeSet !== built.changeSet || !basis.isLive() || !liveView(basis.view)) return false;
  return !basis.selection || built.included.every((key) => basis.selection.keys.includes(key));
}

/** Validate the exact built candidate after decisions, not a newly rebuilt set.
 * G4 can call this after each rebuild and must query readiness immediately
 * before approval. The raw synchronous G2 builder never claims readiness.
 */
export async function dryRunGmiFieldBatch(session, batch, options = {}) {
  if (!currentBatch(session, batch)) return reject('stale-batch', { approvalReady: false });
  const basis = batches.get(batch), generation = ++basis.generation;
  const externalLive = options.isLive || (() => true);
  const isLive = () => basis.generation === generation && currentBatch(session, batch) && externalLive();
  const dryRun = await dryRunGmiChangeSet(session, basis.changeSet, { ...options, isLive });
  if (!dryRun.ok) return reject(dryRun.code, { dryRun, approvalReady: false });
  if (!isLive()) return reject('stale-batch', { approvalReady: false });
  const changedObjects = new Set(batch.changeSet.cells.map(keyOf));
  const outside = (finding) => !finding.objectRef
    || !changedObjects.has(`${finding.objectRef.geometryScope}:${finding.objectRef.sourceIndex}`);
  const checked = freeze({ ...batch, dryRun, approvalReady: true, referenceDate: dryRun.referenceDate,
    rows: batch.rows.map((row) => ({ ...row, datasetChecked: true,
      datasetIntroduced: dryRun.byObject[row.key]?.introduced || [], datasetResolved: dryRun.byObject[row.key]?.resolved || [] })),
    datasetCounts: { introduced: dryRun.diff.newCounts, resolved: dryRun.diff.resolvedCounts },
    crossObject: { introduced: dryRun.introduced.filter(outside), resolved: dryRun.resolved.filter(outside) } });
  batches.set(checked, basis);
  return checked;
}

export function isCurrentGmiFieldBatchValidation(session, batch, options = {}) {
  return currentBatch(session, batch) && isCurrentGmiDryRun(batch.dryRun, session, batch.changeSet, options);
}

/** Source/validation readiness only. User-facing risk confirmation stays in G4. */
export function getGmiFieldBatchApproval(session, batch, options = {}) {
  if (!isCurrentGmiFieldBatchValidation(session, batch, options)) return reject('dry-run-required', { approvalReady: false });
  return { ok: true, changeSet: batch.changeSet, dryRun: batch.dryRun };
}
