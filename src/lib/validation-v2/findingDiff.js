// Shared comparison for verified GMI datasets. Dataset revisions differ across
// reparses; object identity is the immutable source index or a unique GUID.
const attention = (state) => ['FAIL', 'CHECK', 'INDETERMINATE'].includes(state);
const findingsOf = (run) => [...run.ruleResults.flatMap((rule) => rule.findings), ...(run.schemaFindings || [])].filter((f) => attention(f.state));

function objectIdentities(dataset) {
  return Object.fromEntries(['point', 'line'].map((scope) => {
    const objects = (scope === 'line' ? dataset.lines : dataset.points) || [];
    const counts = new Map();
    for (const object of objects) if (object.guid) { const guid = object.guid.toLowerCase(); counts.set(guid, (counts.get(guid) || 0) + 1); }
    return [scope, objects.map((object, index) => {
      const guid = object.guid?.toLowerCase();
      return guid && counts.get(guid) === 1 ? `guid:${guid}` : `index:${index}`;
    })];
  }));
}
function identity(finding, identities) {
  const ref = finding.objectRef;
  const scope = ref?.geometryScope || finding.geometryScope;
  return JSON.stringify([finding.ruleId || finding.canonicalFieldId, scope,
    ref ? identities[scope][ref.sourceIndex] : `schema:${finding.reasonCode}`]);
}

// Existing M5C semantics, including separately reported severity changes.
export function compareGmiValidationRuns(original, revised, originalDataset, proposedDataset) {
  if (original.layerId !== revised.layerId || original.runContext.referenceDate !== revised.runContext.referenceDate) throw new Error('Comparison identity/date mismatch');
  const originalIds = objectIdentities(originalDataset), proposedIds = objectIdentities(proposedDataset);
  const before = new Map(findingsOf(original).map((finding) => [identity(finding, originalIds), finding]));
  const introduced = [], resolved = [], unchanged = [], severityChanged = [];
  for (const finding of findingsOf(revised)) {
    const key = identity(finding, proposedIds), previous = before.get(key);
    if (!previous) introduced.push(finding);
    else if (previous.state !== finding.state) severityChanged.push({ previous, finding });
    else if (previous.reasonCode !== finding.reasonCode) { introduced.push(finding); resolved.push(previous); }
    else unchanged.push(finding);
    before.delete(key);
  }
  resolved.push(...before.values());
  introduced.sort((a, b) => Number(b.state === 'FAIL') - Number(a.state === 'FAIL'));
  const counts = (list) => ({ fail: list.filter((f) => f.state === 'FAIL').length, check: list.filter((f) => f.state !== 'FAIL').length });
  return { introduced, resolved, unchanged, severityChanged, newCounts: counts(introduced), resolvedCounts: counts(resolved) };
}

/** Exact finding transitions: a severity change resolves the old finding and
 * introduces the new one (rule + stable object + state + reasonCode).
 */
export function diffGmiValidationFindings(before, after, beforeDataset, afterDataset) {
  const comparison = compareGmiValidationRuns(before, after, beforeDataset, afterDataset);
  const introduced = [...comparison.introduced, ...comparison.severityChanged.map((entry) => entry.finding)];
  introduced.sort((a, b) => Number(b.state === 'FAIL') - Number(a.state === 'FAIL'));
  const resolved = [...comparison.resolved, ...comparison.severityChanged.map((entry) => entry.previous)];
  const byObject = {};
  for (const [transition, findings] of [['introduced', introduced], ['resolved', resolved]]) {
    for (const finding of findings) {
      const ref = finding.objectRef;
      const key = ref ? `${ref.geometryScope}:${ref.sourceIndex}` : `schema:${finding.geometryScope}`;
      byObject[key] ??= { introduced: [], resolved: [] };
      byObject[key][transition].push(finding);
    }
  }
  for (const entry of Object.values(byObject)) {
    Object.freeze(entry.introduced); Object.freeze(entry.resolved); Object.freeze(entry);
  }
  const counts = (list) => Object.freeze({ fail: list.filter((finding) => finding.state === 'FAIL').length,
    check: list.filter((finding) => finding.state !== 'FAIL').length });
  return Object.freeze({ introduced: Object.freeze(introduced), resolved: Object.freeze(resolved),
    unchanged: Object.freeze(comparison.unchanged), byObject: Object.freeze(byObject),
    newCounts: counts(introduced), resolvedCounts: counts(resolved) });
}
