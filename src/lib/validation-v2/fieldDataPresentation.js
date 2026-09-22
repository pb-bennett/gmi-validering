import { getAuthoritativeValueTable, getFieldInformation } from './registry/fieldInformation.js';

const STATUS_STYLE = Object.freeze({
  Feil: Object.freeze({ row: 'border-l-2 border-l-red-400 bg-red-50/50', text: 'font-semibold text-red-800' }),
  Sjekk: Object.freeze({ row: 'border-l-2 border-l-orange-400 bg-orange-50/50', text: 'font-semibold text-orange-800' }),
  Pass: Object.freeze({ row: 'bg-white', text: 'font-medium text-slate-700' }),
});
const STATUS_ORDER = new Map([['Feil', 0], ['Sjekk', 1], ['Pass', 2]]);

function sourceMeaning(tableRow) {
  return tableRow?.meaning ?? tableRow?.shortMeaning ?? tableRow?.longMeaning ?? null;
}

function statusCounts(row) {
  if (Array.isArray(row.outcomeGroups) && row.outcomeGroups.length) {
    return row.outcomeGroups
      .map((group) => [group.status, group.count, group])
      .sort(([left], [right]) => (STATUS_ORDER.get(left) ?? 9) - (STATUS_ORDER.get(right) ?? 9));
  }
  const counts = Object.entries(row.outcomeBreakdown || {})
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => (STATUS_ORDER.get(left) ?? 9) - (STATUS_ORDER.get(right) ?? 9));
  return counts.length ? counts : [[row.ruleAcceptance || null, row.count]];
}

function contextualQualifier(group, status, fieldName) {
  const context = group?.context;
  if (!context) return null;
  if (context.applicability === 'NOT_APPLICABLE') {
    return {
      label: 'Ikke aktuelt',
      explanation: `${fieldName} er ikke aktuelt for disse objektene. Den manglende verdien gir derfor ikke Feil eller Sjekk.`,
    };
  }
  const parts = (context.context || []).map(({ fieldId, value }) => {
    const label = getFieldInformation(fieldId)?.displayName;
    return label ? `${label} ${value}` : null;
  }).filter(Boolean);
  if (!parts.length) return null;
  const label = parts.join(' + ');
  const consequence = context.requirement === 'REQUIRED'
    ? `${fieldName} er påkrevd i denne konteksten. Den manglende verdien gir derfor ${status}.`
    : context.requirement === 'EXPECTED'
      ? `${fieldName} er ønsket i denne konteksten. Den manglende verdien gir derfor ${status}.`
      : `Denne konteksten gjør at verdien gir ${status}.`;
  return { label, explanation: `${label}. ${consequence}` };
}

/** Build the normal-user value table from the existing field-data summary and controlled source tables. */
export function buildValidationV2FieldDataPresentation(summary) {
  if (!summary || !Array.isArray(summary.rows)) return null;
  const table = getAuthoritativeValueTable(summary.canonicalFieldId, summary.geometryScope);
  const meanings = new Map((table?.rows || []).map((row) => [String(row.code), row]));
  const fieldName = getFieldInformation(summary.canonicalFieldId)?.displayName || summary.canonicalFieldId;
  const rows = summary.rows.flatMap((row) => {
    const groups = statusCounts(row);
    const statuses = new Set(groups.map(([status]) => status));
    const materialContext = groups.length > 1 && (statuses.size > 1 || groups.some(([status, , group]) =>
      status !== 'Pass' || group?.context?.applicability === 'NOT_APPLICABLE'));
    return groups.map(([status, count, group], groupIndex) => {
    const matchedSource = row.isMissing || row.isUnresolved || row.lookupValue === null || row.lookupValue === undefined
      ? null
      : meanings.get(String(row.lookupValue)) || null;
    const invalid = !row.isMissing && !row.isUnresolved && status === 'Feil';
    const meaning = row.isMissing || row.isUnresolved
      ? '—'
      : invalid ? 'Ugyldig verdi' : sourceMeaning(matchedSource);
    return Object.freeze({
      key: `${row.key}|${status || 'NONE'}|${groupIndex}`,
      deliveredValue: row.isMissing ? 'Mangler' : row.isUnresolved ? 'Uavklart' : row.deliveredValue,
      interpretedValue: row.interpretedValue,
      longMeaning: invalid || row.isMissing || row.isUnresolved ? null : matchedSource?.longMeaning || null,
      meaning,
      count,
      share: summary.objectCount > 0 ? (count / summary.objectCount) * 100 : 0,
      status,
      isMissing: Boolean(row.isMissing),
      isUnresolved: Boolean(row.isUnresolved),
      isInvalid: invalid,
      qualifier: materialContext ? contextualQualifier(group, status, fieldName) : null,
      style: STATUS_STYLE[status] || Object.freeze({ row: 'bg-white', text: 'font-medium text-slate-700' }),
    });
    });
  });
  const showMeaning = Boolean(table?.rows.some((row) => sourceMeaning(row) !== null)
    || rows.some((row) => row.isMissing || row.isInvalid));
  return Object.freeze({
    columns: Object.freeze(showMeaning
      ? ['Levert verdi', 'Betydning', 'Antall', 'Andel', 'Resultat']
      : ['Levert verdi', 'Antall', 'Andel', 'Resultat']),
    hasMeaning: showMeaning,
    rows: Object.freeze(rows),
  });
}
