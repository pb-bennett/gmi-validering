import { EvaluationState, RuleReasonCode } from './contracts.js';
import { getFieldInformation } from './registry/fieldInformation.js';
import { getValidationRules } from './registry/rules.js';

export const ValidationV2DiagnosticType = Object.freeze({
  REQUIRED_MISSING: 'REQUIRED_MISSING',
  INVALID_VALUE: 'INVALID_VALUE',
  MALFORMED_VALUE: 'MALFORMED_VALUE',
  CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',
  VALID_VALUE_REVIEW: 'VALID_VALUE_REVIEW',
  CONTEXT_REQUIRED_MISSING: 'CONTEXT_REQUIRED_MISSING',
  CONTEXT_UNEXPECTED_VALUE: 'CONTEXT_UNEXPECTED_VALUE',
  CONTEXT_INCOMPATIBLE: 'CONTEXT_INCOMPATIBLE',
  RELATIONSHIP_INCONSISTENT: 'RELATIONSHIP_INCONSISTENT',
  SCHEMA_OR_SOURCE_ISSUE: 'SCHEMA_OR_SOURCE_ISSUE',
  INFORMATIONAL_VALUE: 'INFORMATIONAL_VALUE',
  DEPENDENCY_UNRESOLVED: 'DEPENDENCY_UNRESOLVED',
});

export const ValidationV2DiagnosticState = Object.freeze({
  FAIL: 'FAIL',
  CHECK: 'CHECK',
});

const T = ValidationV2DiagnosticType;
const S = ValidationV2DiagnosticState;

function isDirectApplicableOutcome(outcome) {
  if (!outcome || !['PASS', 'CHECK', 'FAIL'].includes(outcome.state)) return false;
  if (outcome.state === 'PASS') {
    return ['ALL', 'APPLICABLE', 'EXPECTED'].includes(outcome.diagnosticFacts?.coverageApplicability);
  }
  return true;
}

// This is deliberately a reason-code map, not a second policy. The evaluator
// owns the reason; this layer only gives it a stable presentation category.
export const DIAGNOSTIC_REASON_MAPPING = Object.freeze({
  [RuleReasonCode.PLACEHOLDER_VALUE]: T.VALID_VALUE_REVIEW,
  [RuleReasonCode.UNUSUAL_VALID_VALUE]: T.VALID_VALUE_REVIEW,
  [RuleReasonCode.NUMERIC_ZERO]: T.VALID_VALUE_REVIEW,
  [RuleReasonCode.NUMERIC_OUTSIDE_PREFERRED_RANGE]: T.VALID_VALUE_REVIEW,
  [RuleReasonCode.NUMERIC_OUTSIDE_ALLOWED_RANGE]: T.CONSTRAINT_VIOLATION,
  [RuleReasonCode.TEMA_INVALID]: T.INVALID_VALUE,
  [RuleReasonCode.TEMA_MISSING]: T.REQUIRED_MISSING,
  [RuleReasonCode.SCHEMA_TEMA_SFCODE_COEXISTENCE]: T.SCHEMA_OR_SOURCE_ISSUE,
  [RuleReasonCode.DEPENDENT_TEMA_UNRESOLVED]: T.DEPENDENCY_UNRESOLVED,
  [RuleReasonCode.REQUIRED_FIELD_ABSENT]: T.SCHEMA_OR_SOURCE_ISSUE,
  [RuleReasonCode.REQUIRED_VALUE_MISSING]: T.REQUIRED_MISSING,
  [RuleReasonCode.VALUE_NOT_ALLOWED]: T.INVALID_VALUE,
  [RuleReasonCode.VALUE_NOT_INTEGER]: T.MALFORMED_VALUE,
  [RuleReasonCode.NUMERIC_PRECISION_UNAVAILABLE]: T.MALFORMED_VALUE,
  [RuleReasonCode.VALUE_NOT_DECIMAL]: T.MALFORMED_VALUE,
  [RuleReasonCode.DECIMAL_NOTATION_UNRESOLVED]: T.MALFORMED_VALUE,
  [RuleReasonCode.YEAR_FORMAT_INVALID]: T.MALFORMED_VALUE,
  [RuleReasonCode.DATE_FORMAT_INVALID]: T.MALFORMED_VALUE,
  [RuleReasonCode.LEXICAL_FORMAT_UNAVAILABLE]: T.MALFORMED_VALUE,
  [RuleReasonCode.TEXT_LENGTH_EXCEEDED]: T.CONSTRAINT_VIOLATION,
  [RuleReasonCode.BINDING_AMBIGUOUS]: T.SCHEMA_OR_SOURCE_ISSUE,
  [RuleReasonCode.UNRESOLVED_SOURCE]: T.SCHEMA_OR_SOURCE_ISSUE,
  [RuleReasonCode.SCHEMA_UNAVAILABLE]: T.SCHEMA_OR_SOURCE_ISSUE,
  [RuleReasonCode.TEMA_CONFLICT]: T.SCHEMA_OR_SOURCE_ISSUE,
  [RuleReasonCode.OPTIONAL_TYPE_NOT_SUPPLIED]: T.CONTEXT_REQUIRED_MISSING,
  [RuleReasonCode.RELATIONSHIP_PREREQUISITE_FAILED]: T.DEPENDENCY_UNRESOLVED,
  [RuleReasonCode.RELATIONSHIP_INPUT_INDETERMINATE]: T.DEPENDENCY_UNRESOLVED,
  [RuleReasonCode.TYPE_TEMA_INCOMPATIBLE]: T.CONTEXT_INCOMPATIBLE,
  [RuleReasonCode.APPLICABILITY_REQUIRED_MISSING]: T.CONTEXT_REQUIRED_MISSING,
  [RuleReasonCode.APPLICABILITY_UNEXPECTED_VALUE]: T.CONTEXT_UNEXPECTED_VALUE,
  [RuleReasonCode.YEAR_FUTURE]: T.CONSTRAINT_VIOLATION,
  [RuleReasonCode.YEAR_PLAUSIBILITY]: T.VALID_VALUE_REVIEW,
  [RuleReasonCode.DATE_FUTURE]: T.CONSTRAINT_VIOLATION,
  [RuleReasonCode.DATE_BEFORE_INSTALLATION]: T.RELATIONSHIP_INCONSISTENT,
  [RuleReasonCode.DATE_OLDER_THAN_FIVE_YEARS]: T.VALID_VALUE_REVIEW,
  [RuleReasonCode.POSITIONING_CAUSE_SHARED_NYTT_YEAR]: T.RELATIONSHIP_INCONSISTENT,
  [RuleReasonCode.EXISTING_INFRASTRUCTURE_VALUE_MISSING]: T.VALID_VALUE_REVIEW,
});

const MAX_VALUES = 5;
const MAX_OBJECT_REFS = 10;
const MAX_RELATIONSHIP_PAIRS = 5;
const SENSITIVE_FIELDS = new Set(['optionalText', 'caseNumber', 'surveyedBy']);
const EXPECTED_WORDING = Object.freeze({
  access: 'Adkomst er ønsket for kummer og bør kontrolleres.',
  attachmentLink: 'Bilder er normalt ønsket for denne typen objekt og bør kontrolleres.',
});
const COVERAGE_PRESENTATION = Object.freeze({
  access: { subject: 'Adkomst', singular: 'kum', plural: 'kummer' },
  attachmentLink: { subject: 'bilder', singular: 'objekt', plural: 'objekter' },
  sdr: { subject: 'SDR', singular: 'aktuell trykkledning', plural: 'aktuelle trykkledninger' },
  ringStiffness: { subject: 'Ringstivhet', singular: 'aktuell ledning', plural: 'aktuelle ledninger' },
  pressureClass: { subject: 'Trykklasse', singular: 'aktuell trykkledning', plural: 'aktuelle trykkledninger' },
});
const collator = new Intl.Collator('nb-NO', { numeric: true, sensitivity: 'base' });

function safeValue(value, canonicalFieldId) {
  if (value === null || value === undefined || value === '') return null;
  if (SENSITIVE_FIELDS.has(canonicalFieldId)) return null;
  const text = String(value);
  if (text.length > 64 || /[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}

function objectLabel(ref) {
  if (!ref || !Number.isInteger(ref.sourceIndex)) return null;
  return `${ref.geometryScope === 'line' ? 'Linje' : 'Punkt'} ${ref.sourceIndex + 1}`;
}

function fieldName(canonicalFieldId, field) {
  return field?.displayName || getFieldInformation(canonicalFieldId)?.displayName || canonicalFieldId;
}

function isContextualMissing(finding) {
  return [
    RuleReasonCode.APPLICABILITY_REQUIRED_MISSING,
    RuleReasonCode.OPTIONAL_TYPE_NOT_SUPPLIED,
  ].includes(finding.reasonCode) || finding.details?.diagnosticFacts?.applicability === 'CONDITIONAL' || finding.details?.diagnosticFacts?.requirement === 'EXPECTED';
}

function mapReason(finding) {
  const mapped = DIAGNOSTIC_REASON_MAPPING[finding.reasonCode];
  if (mapped === T.DEPENDENCY_UNRESOLVED) return null;
  if (finding.reasonCode === RuleReasonCode.REQUIRED_VALUE_MISSING && isContextualMissing(finding)) {
    return T.CONTEXT_REQUIRED_MISSING;
  }
  return mapped || T.SCHEMA_OR_SOURCE_ISSUE;
}

function diagnosticState(state) {
  if (state === EvaluationState.FAIL) return S.FAIL;
  if (state === EvaluationState.CHECK || state === EvaluationState.INDETERMINATE) return S.CHECK;
  return null;
}

function evidenceValue(finding) {
  const observed = finding.observed;
  if (!observed || finding.rule?.evaluatorKind === 'FIELD_RELATIONSHIP') return null;
  return safeValue(observed.sourceValue, finding.canonicalFieldId);
}

function contextKey(finding, type) {
  const facts = finding.details?.diagnosticFacts || {};
  if (finding.canonicalFieldId === 'attachmentLink'
    && type === T.CONTEXT_UNEXPECTED_VALUE
    && finding.reasonCode === RuleReasonCode.APPLICABILITY_UNEXPECTED_VALUE) {
    return JSON.stringify({ policy: 'LOK_TOP_UNSUPPORTED_IMAGES' });
  }
  if (finding.canonicalFieldId === 'attachmentLink'
    && type === T.CONTEXT_REQUIRED_MISSING
    && facts.requirement === 'EXPECTED') {
    return JSON.stringify({ requirement: 'EXPECTED' });
  }
  if (type === T.CONTEXT_INCOMPATIBLE) return '{}';
  const visibleContext = [T.CONTEXT_REQUIRED_MISSING, T.CONTEXT_UNEXPECTED_VALUE, T.CONTEXT_INCOMPATIBLE].includes(type);
  const relevantFieldIds = visibleContext ? (facts.explanationContextFieldIds || (
    [T.CONTEXT_REQUIRED_MISSING, T.CONTEXT_UNEXPECTED_VALUE, T.CONTEXT_INCOMPATIBLE].includes(type)
      ? ['tema']
      : []
  )) : [];
  return JSON.stringify({
    context: (facts.context || []).filter((item) => relevantFieldIds.includes(item.fieldId)),
    requirement: facts.requirement || null,
    inputValues: type === T.CONTEXT_INCOMPATIBLE ? finding.details?.inputValues || [] : [],
  });
}

function schemaCause(finding) {
  switch (finding.reasonCode) {
    case RuleReasonCode.REQUIRED_FIELD_ABSENT: return 'Feltet finnes ikke i skjemaet.';
    case RuleReasonCode.BINDING_AMBIGUOUS: return 'Feltet kan ikke bindes entydig i skjemaet.';
    case RuleReasonCode.UNRESOLVED_SOURCE: return 'Ingen entydig kilde ble funnet for feltet.';
    case RuleReasonCode.SCHEMA_UNAVAILABLE: return 'Skjemainformasjonen for feltet er ikke tilgjengelig.';
    default: return null;
  }
}

function createGroup({ finding, type, field, geometryScope, denominator }) {
  const presentationId = `${finding.canonicalFieldId}|${geometryScope}|${type}|${finding.state}|${finding.ruleId}|${finding.reasonCode}|${contextKey(finding, type)}`;
  return {
    key: presentationId,
    diagnosticId: presentationId,
    type,
    state: diagnosticState(finding.state),
    field: {
      canonicalFieldId: finding.canonicalFieldId,
      displayName: fieldName(finding.canonicalFieldId, field),
      geometryScope,
      ruleIds: [finding.ruleId],
    },
    count: 0,
    denominator,
    reasonCodes: [],
    ruleIds: [],
    values: new Map(),
    contextValues: new Map(),
    relationshipPairs: new Map(),
    objectRefs: [],
    exactObjectRefs: new Map(),
    contextFacts: finding.details?.diagnosticFacts || null,
    schemaCause: schemaCause(finding),
    expected: finding.expectedValues?.length ? { kind: 'APPROVED_CODES', source: 'active-rule-domain' } : null,
    action: type === T.INVALID_VALUE ? { kind: 'INSPECT_AND_CORRECT_TO_APPROVED_VALUE' } : null,
    wordingKey: finding.reasonCode === RuleReasonCode.SCHEMA_TEMA_SFCODE_COEXISTENCE
      ? 'TEMA_SCHEMA_COEXISTENCE'
      : finding.reasonCode === RuleReasonCode.POSITIONING_CAUSE_SHARED_NYTT_YEAR
        ? 'POSITIONING_CAUSE_SHARED_NYTT_YEAR'
        : finding.canonicalFieldId === 'attachmentLink' && finding.reasonCode === RuleReasonCode.APPLICABILITY_UNEXPECTED_VALUE
          ? 'S_HYPERLINK_LOK_TOP'
          : finding.reasonCode === RuleReasonCode.EXISTING_INFRASTRUCTURE_VALUE_MISSING
            ? 'EXISTING_INFRASTRUCTURE_VALUE_MISSING'
            : null,
  };
}

function addFinding(group, finding) {
  if (group.wordingKey === 'S_HYPERLINK_LOK_TOP'
    && finding.objectRef?.key
    && group.exactObjectRefs.has(finding.objectRef.key)) return;
  group.count += 1;
  if (finding.reasonCode && !group.reasonCodes.includes(finding.reasonCode)) group.reasonCodes.push(finding.reasonCode);
  if (finding.ruleId && !group.ruleIds.includes(finding.ruleId)) group.ruleIds.push(finding.ruleId);
  const value = evidenceValue(finding);
  if (value) group.values.set(value, (group.values.get(value) || 0) + 1);
  const theme = (finding.details?.diagnosticFacts?.context || [])
    .find((item) => item.fieldId === 'tema')?.value;
  if (theme) group.contextValues.set(theme, (group.contextValues.get(theme) || 0) + 1);
  const pair = finding.details?.inputValues;
  if (group.type === T.CONTEXT_INCOMPATIBLE && Array.isArray(pair) && pair.length >= 2) {
    const key = JSON.stringify([pair[0], pair[1]]);
    const existing = group.relationshipPairs.get(key) || { type: pair[0], tema: pair[1], count: 0 };
    existing.count += 1;
    group.relationshipPairs.set(key, existing);
  }
  const ref = objectLabel(finding.objectRef);
  if (ref && !group.objectRefs.includes(ref)) group.objectRefs.push(ref);
  if (finding.objectRef?.key && !group.exactObjectRefs.has(finding.objectRef.key)) {
    group.exactObjectRefs.set(finding.objectRef.key, finding.objectRef);
  }
}

function finalize(group) {
  const values = [...group.values.entries()]
    .map(([supplied, count]) => ({ supplied, count }))
    .sort((a, b) => b.count - a.count || collator.compare(a.supplied, b.supplied));
  const sampleRefs = group.objectRefs.slice(0, MAX_OBJECT_REFS);
  const contextBreakdown = group.field.canonicalFieldId === 'attachmentLink'
    && group.contextFacts?.requirement === 'EXPECTED'
    ? [...group.contextValues.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || collator.compare(a.label, b.label))
    : [];
  const { contextValues, exactObjectRefs, ...presentation } = group;
  const relationshipPairs = [...group.relationshipPairs.values()]
    .sort((a, b) => b.count - a.count || collator.compare(String(a.type), String(b.type)) || collator.compare(String(a.tema), String(b.tema)));
  return Object.freeze({
    ...presentation,
    values: Object.freeze(values.slice(0, MAX_VALUES)),
    additionalValueCount: Math.max(0, values.length - MAX_VALUES),
    affectedObjects: Object.freeze({ total: group.count, sampleRefs, omittedCount: Math.max(0, group.count - sampleRefs.length) }),
    // Runtime action data only. It is never rendered, persisted, or encoded.
    exactObjectRefs: Object.freeze([...exactObjectRefs.values()]),
    hasCompleteExactObjectRefs: exactObjectRefs.size === group.count,
    percentage: group.denominator > 0 ? Number(((group.count / group.denominator) * 100).toFixed(1)) : null,
    contextBreakdown: Object.freeze(contextBreakdown),
    relationshipPairs: Object.freeze(relationshipPairs.slice(0, MAX_RELATIONSHIP_PAIRS).map((pair) => Object.freeze(pair))),
    additionalRelationshipPairCount: Math.max(0, relationshipPairs.length - MAX_RELATIONSHIP_PAIRS),
  });
}

function dependencyNote(outcomes, rule, field, geometryScope, denominator) {
  const unresolved = outcomes.filter((outcome) => outcome.state === EvaluationState.NOT_EVALUATED && (
    Boolean(outcome.suppression) || outcome.reasonCode === RuleReasonCode.DEPENDENT_TEMA_UNRESOLVED
  ));
  if (!unresolved.length) return null;
  const grouped = new Map();
  unresolved.forEach((outcome) => {
    const suppression = outcome.suppression
      || (outcome.reasonCode === RuleReasonCode.DEPENDENT_TEMA_UNRESOLVED ? 'DEPENDENT_TEMA_UNRESOLVED' : null)
      || (outcome.reasonCode === RuleReasonCode.RELATIONSHIP_PREREQUISITE_FAILED && ['sdr', 'ringStiffness'].includes(rule.policy) ? 'MATERIAL_UNRESOLVED' : null)
      || outcome.reasonCode || 'UNRESOLVED';
    if (!grouped.has(suppression)) grouped.set(suppression, []);
    grouped.get(suppression).push(outcome);
  });
  return [...grouped.entries()].map(([suppression, entries]) => Object.freeze({
    diagnosticId: `${rule.canonicalFieldId}:${geometryScope}:DEPENDENCY_UNRESOLVED:${suppression}`,
    type: T.DEPENDENCY_UNRESOLVED,
    state: null,
    field: { canonicalFieldId: rule.canonicalFieldId, displayName: fieldName(rule.canonicalFieldId, field), geometryScope, ruleIds: [rule.ruleId] },
    count: entries.length,
    denominator,
    reasonCodes: [...new Set(entries.map((entry) => entry.reasonCode).filter(Boolean))],
    ruleIds: [rule.ruleId],
    dependency: suppression,
    affectedObjects: { total: entries.length, sampleRefs: entries.slice(0, MAX_OBJECT_REFS).map((entry) => objectLabel(entry.objectRef)).filter(Boolean), omittedCount: Math.max(0, entries.length - MAX_OBJECT_REFS) },
  }));
}

export function buildFieldDiagnostics({ result, rule, field, geometryScope, summary = null } = {}) {
  if (!result || !rule || !geometryScope) return Object.freeze({ diagnostics: [], unresolved: [], hasPolicyResult: false });
  const denominator = summary?.objectCount || result.ruleResults?.find((item) => item.rule?.ruleId === rule.ruleId)?.geometryBreakdown?.[geometryScope]?.evaluatedCount || 0;
  const findings = [
    ...(result.ruleResults || []).flatMap((item) => item.findings || [])
      .filter((finding) => finding.ruleId === rule.ruleId && finding.geometryScope === geometryScope),
    ...(result.schemaFindings || []).filter((finding) => finding.canonicalFieldId === rule.canonicalFieldId && finding.geometryScope === geometryScope),
  ];
  const groups = new Map();
  findings.forEach((finding) => {
    const type = finding.ruleId === 'schema' || finding.reasonCode === RuleReasonCode.SCHEMA_TEMA_SFCODE_COEXISTENCE
      ? T.SCHEMA_OR_SOURCE_ISSUE : mapReason(finding);
    if (!type) return;
    const state = finding.ruleId === 'schema' ? S.CHECK : diagnosticState(finding.state);
    if (!state) return;
    const withState = { ...finding, state };
    const seed = createGroup({ finding: withState, type, field, geometryScope, denominator });
    const key = seed.key;
    if (!groups.has(key)) groups.set(key, seed);
    addFinding(groups.get(key), finding);
  });
  const outcomes = (result.outcomes || []).filter((outcome) => outcome.ruleId === rule.ruleId && outcome.objectRef?.geometryScope === geometryScope);
  const coverageRows = outcomes
    .map((outcome) => ({
      applicability: outcome.diagnosticFacts?.coverageApplicability,
      presence: outcome.diagnosticFacts?.presence,
    }))
    .filter((row) => ['APPLICABLE', 'EXPECTED'].includes(row.applicability));
  const coverage = coverageRows.length > 0
    ? Object.freeze({
      applicableCount: coverageRows.length,
      presentCount: coverageRows.filter((row) => row.presence === 'PRESENT').length,
      missingCount: coverageRows.filter((row) => row.presence === 'MISSING').length,
      unresolvedCount: outcomes.filter((outcome) => outcome.diagnosticFacts?.coverageApplicability === 'UNRESOLVED').length,
      requirement: coverageRows.every((row) => row.applicability === 'APPLICABLE') ? 'REQUIRED' : 'EXPECTED',
    })
    : null;
  const diagnostics = [...groups.values()]
    .map(finalize)
    .sort((a, b) => (a.state === S.FAIL ? 0 : 1) - (b.state === S.FAIL ? 0 : 1) || b.count - a.count || a.diagnosticId.localeCompare(b.diagnosticId));
  const unresolved = dependencyNote(outcomes, rule, field, geometryScope, denominator);
  const counts = result.ruleResults?.find((item) => item.rule?.ruleId === rule.ruleId)?.geometryBreakdown?.[geometryScope] || {};
  const directOutcomes = outcomes.filter(isDirectApplicableOutcome);
  return Object.freeze({
    diagnostics: Object.freeze(diagnostics),
    unresolved: Object.freeze(unresolved || []),
    coverage,
    counts: Object.freeze({ fail: directOutcomes.filter((outcome) => outcome.state === 'FAIL').length, check: directOutcomes.filter((outcome) => outcome.state === 'CHECK').length, pass: directOutcomes.filter((outcome) => outcome.state === 'PASS').length }),
    hasPolicyResult: true,
  });
}

/** Compose one field-centric Resultat model from its independent validation owners. */
export function buildFieldDiagnosticsForRules({ result, rules, field, geometryScope, summary = null } = {}) {
  const ownerRules = rules?.length ? rules : [];
  const models = ownerRules.map((rule) => buildFieldDiagnostics({ result, rule, field, geometryScope, summary }));
  const rank = (state) => state === S.FAIL ? 0 : state === S.CHECK ? 1 : 2;
  const objectStates = new Map();
  ownerRules.forEach((rule) => (result?.outcomes || []).filter((outcome) =>
    outcome.ruleId === rule.ruleId && outcome.objectRef?.geometryScope === geometryScope
  ).forEach((outcome) => {
    const state = outcome.state === EvaluationState.FAIL ? S.FAIL
      : outcome.state === EvaluationState.CHECK || outcome.state === EvaluationState.INDETERMINATE ? S.CHECK
        : outcome.state === EvaluationState.PASS ? 'PASS' : null;
    if (!state) return;
    const previous = objectStates.get(outcome.objectRef.key);
    if (!previous || rank(state) < rank(previous)) objectStates.set(outcome.objectRef.key, state);
  }));
  return Object.freeze({
    diagnostics: Object.freeze(models.flatMap((model) => model.diagnostics)
      .sort((left, right) => rank(left.state) - rank(right.state) || left.diagnosticId.localeCompare(right.diagnosticId))),
    unresolved: Object.freeze(models.flatMap((model) => model.unresolved)),
    coverage: models[0]?.coverage || null,
    counts: Object.freeze({
      fail: [...objectStates.values()].filter((state) => state === S.FAIL).length,
      check: [...objectStates.values()].filter((state) => state === S.CHECK).length,
      pass: [...objectStates.values()].filter((state) => state === 'PASS').length,
    }),
    hasPolicyResult: models.some((model) => model.hasPolicyResult),
  });
}

function displayValues(diagnostic) {
  if (!diagnostic.values?.length) return '';
  const values = diagnostic.values.map(({ supplied, count }) => `\`${supplied}\` (${count})`).join(', ');
  return `${diagnostic.additionalValueCount ? 'Eksempler: ' : ''}${values}${diagnostic.additionalValueCount ? `, + ${diagnostic.additionalValueCount} andre verdier` : ''}`;
}

function objectCountText(count) { return `${count} ${count === 1 ? 'objekt' : 'objekter'}`; }

function contextText(diagnostic) {
  if (![T.CONTEXT_REQUIRED_MISSING, T.CONTEXT_UNEXPECTED_VALUE].includes(diagnostic.type)) return '';
  if (diagnostic.field?.canonicalFieldId === 'attachmentLink'
    && diagnostic.contextFacts?.requirement === 'EXPECTED') return '';
  const context = diagnostic.contextFacts?.context;
  if (!Array.isArray(context) || !context.length) return '';
  const allowed = diagnostic.contextFacts?.explanationContextFieldIds;
  const allowedIds = allowed?.length ? allowed : ['tema'];
  const relevant = context.filter((item) => allowedIds.includes(item.fieldId)
    && getFieldInformation(item.fieldId)?.displayName
    && typeof item.value === 'string'
    && item.value.length <= 64);
  if (!relevant.length) return '';
  const dimensions = new Map();
  relevant.forEach((item) => {
    const label = getFieldInformation(item.fieldId).displayName;
    if (!dimensions.has(item.fieldId)) dimensions.set(item.fieldId, { label, values: [] });
    const values = dimensions.get(item.fieldId).values;
    if (!values.includes(item.value)) values.push(item.value);
  });
  return ` med ${[...dimensions.values()].map(({ label, values }) =>
    `${label} ${values.map((value) => `\`${value}\``).join(' eller ')}`).join(' og ')}`;
}

export function renderValidationV2Diagnostic(diagnostic) {
  const name = diagnostic.field.canonicalFieldId === 'attachmentLink' && diagnostic.contextFacts?.requirement === 'EXPECTED'
    ? 'bilder'
    : diagnostic.field.displayName;
  const count = diagnostic.count;
  const values = displayValues(diagnostic);
  const suffix = values ? `: ${values}` : '';
  switch (diagnostic.wordingKey) {
    case 'TEMA_SCHEMA_COEXISTENCE': return 'Både Tema og S_FCODE finnes i skjemaet. Kolonnene beskriver samme identitet; kontroller hvorfor begge er levert.';
    case 'POSITIONING_CAUSE_SHARED_NYTT_YEAR': return `${objectCountText(count)} har Stedfestingsårsak som må kontrolleres mot et delt NYTT-år i leveringen.`;
    case 'S_HYPERLINK_LOK_TOP': return `${objectCountText(count)} kumlokk med Tema LOK eller TOP har bilder. Gemini VA støtter ikke bilder på disse objektene. Fjern bildelenken fra de berørte objektene.`;
    case 'EXISTING_INFRASTRUCTURE_VALUE_MISSING': return `${objectCountText(count)} med Stedfestingsårsak UENDR mangler ${name}. Opplysningen kan være vanskelig eller umulig å fremskaffe for eksisterende infrastruktur og bør kontrolleres.`;
    default: break;
  }
  switch (diagnostic.type) {
    case T.REQUIRED_MISSING: return diagnostic.contextFacts?.requirement === 'EXPECTED'
      ? `${objectCountText(count)} mangler ${name}. Feltet er ønskelig i denne kontrollen og bør kontrolleres.`
      : `${objectCountText(count)} mangler ${name}. Feltet er påkrevd.`;
    case T.INVALID_VALUE: return `${objectCountText(count)} har verdier som ikke er godkjente koder for ${name}${suffix}.`;
    case T.MALFORMED_VALUE: return `${objectCountText(count)} har ${name} i ugyldig format${suffix}.`;
    case T.CONSTRAINT_VIOLATION: return `${objectCountText(count)} har ${name} som bryter en grense eller begrensning${suffix}.`;
    case T.VALID_VALUE_REVIEW: return `${objectCountText(count)} har en gyldig verdi for ${name} som bør kontrolleres${suffix}.`;
    case T.CONTEXT_REQUIRED_MISSING:
      if (diagnostic.contextFacts?.requirement === 'EXPECTED') {
        const expectedPhrase = EXPECTED_WORDING[diagnostic.field.canonicalFieldId];
        return `${objectCountText(count)}${contextText(diagnostic)} mangler ${name}. ${expectedPhrase || 'Feltet er ønskelig i denne konteksten og bør kontrolleres.'}`;
      }
      return `${objectCountText(count)}${contextText(diagnostic)} mangler ${name}. Feltet er påkrevd for disse objektene.`;
    case T.CONTEXT_UNEXPECTED_VALUE: return `${objectCountText(count)} har ${name}${contextText(diagnostic)}. Feltet gjelder ikke normalt i denne konteksten og bør kontrolleres${suffix}.`;
    case T.CONTEXT_INCOMPATIBLE: return `${objectCountText(count)} har en Type som ikke passer til Tema.`;
    case T.RELATIONSHIP_INCONSISTENT: return `${objectCountText(count)} har ${name} som ikke stemmer med en annen felt- eller datasettverdi.`;
    case T.SCHEMA_OR_SOURCE_ISSUE: return `Det er funnet et skjema- eller kildeproblem for ${name} som berører ${objectCountText(count)}.`;
    case T.INFORMATIONAL_VALUE: return `${objectCountText(count)} har ${name}. Verdiene vises for informasjon; de antas ikke derfor å være feil${suffix}.`;
    default: return `${objectCountText(count)} kunne ikke forklares for ${name}.`;
  }
}

function objectCountLabel(count) {
  return count === 1 ? 'objekt' : 'objekter';
}

export function getValidationV2DiagnosticPresentation(diagnostic) {
  const summary = renderValidationV2Diagnostic(diagnostic);
  if (diagnostic.type === T.SCHEMA_OR_SOURCE_ISSUE && diagnostic.schemaCause) {
    return Object.freeze({
      summary,
      detailLines: Object.freeze([diagnostic.schemaCause]),
      guidance: 'Kontroller feltets skjema og kildebinding.',
    });
  }
  if (diagnostic.type !== T.CONTEXT_INCOMPATIBLE) {
    return Object.freeze({ summary, detailLines: Object.freeze([]), guidance: null });
  }
  const detailLines = (diagnostic.relationshipPairs || [])
    .map((pair) => `Type ${pair.type} + Tema ${pair.tema} — ${pair.count} ${objectCountLabel(pair.count)}`);
  if (diagnostic.additionalRelationshipPairCount > 0) {
    detailLines.push(`og ${diagnostic.additionalRelationshipPairCount} andre kombinasjoner`);
  }
  return Object.freeze({
    summary,
    detailLines: Object.freeze(detailLines),
    guidance: 'Verdiene er gyldige hver for seg, men kombinasjonen er ikke godkjent. Kontroller Type og Tema.',
  });
}

export function renderValidationV2DiagnosticBreakdown(diagnostic) {
  if (!diagnostic?.contextBreakdown?.length) return null;
  return diagnostic.contextBreakdown.map(({ label, count }) => `${label} ${count}`).join(' · ');
}

function renderValidationV2DependencyNoteLegacy(note) {
  const dependency = {
    HYDRAULIC_TEMA_UNRESOLVED: 'Tema er ugyldig eller uavklart',
    MATERIAL_UNRESOLVED: 'Material er ugyldig eller uavklart',
    PIPE_SHAPE_UNRESOLVED: 'Rørform er ugyldig eller uavklart',
    DEPENDENT_TEMA_UNRESOLVED: 'Tema er ugyldig eller uavklart',
  }[note.dependency] || 'en nødvendig forutsetning er ugyldig eller uavklart';
  return `${note.field.displayName} kunne ikke vurderes for ${objectCountText(note.count)} fordi ${dependency}.`;
}

export function getValidationV2DependencyPresentation(note) {
  if (note.field?.canonicalFieldId === 'type') {
    return Object.freeze({
        summary: `Type kunne ikke kontrolleres mot Tema for ${objectCountText(note.count)}.`,
      detailLines: Object.freeze(['Tema er ugyldig eller uavklart for disse objektene.']),
      guidance: 'Kontroller Tema/S_FCODE først. Type-kompatibiliteten kan vurderes når Tema er entydig.',
    });
  }
  const prerequisite = {
    HYDRAULIC_TEMA_UNRESOLVED: 'Tema',
    DEPENDENT_TEMA_UNRESOLVED: 'Tema',
    MATERIAL_UNRESOLVED: 'Material',
    PIPE_SHAPE_UNRESOLVED: 'Rørform',
  }[note.dependency];
  if (prerequisite) {
    return Object.freeze({
      summary: `${note.field.displayName} kunne ikke vurderes for ${objectCountText(note.count)} fordi ${prerequisite} er ugyldig eller uavklart.`,
      detailLines: Object.freeze([]), guidance: null,
    });
  }
  return Object.freeze({ summary: renderValidationV2DependencyNoteLegacy(note), detailLines: Object.freeze([]), guidance: null });
}

export function renderValidationV2DependencyNote(note) {
  return getValidationV2DependencyPresentation(note).summary;
}

export function getValidationV2CoveragePresentation({ coverage, field } = {}) {
  if (!coverage || coverage.applicableCount <= 0 || !field) return null;
  const metadata = COVERAGE_PRESENTATION[field.canonicalFieldId];
  const fallback = field.geometryScope === 'line'
    ? { subject: field.displayName, singular: 'aktuell ledning', plural: 'aktuelle ledninger' }
    : { subject: field.displayName, singular: 'aktuelt objekt', plural: 'aktuelle objekter' };
  const presentation = metadata || fallback;
  const population = coverage.applicableCount === 1 ? presentation.singular : presentation.plural;
  const percentage = Math.round((coverage.presentCount / coverage.applicableCount) * 100);
  return Object.freeze({
    presentCount: coverage.presentCount,
    applicableCount: coverage.applicableCount,
    missingCount: coverage.missingCount,
    percentage,
    subject: presentation.subject,
    population,
    main: `${coverage.presentCount} av ${coverage.applicableCount} ${population} har ${presentation.subject}`,
    secondary: `${coverage.missingCount} mangler · ${percentage} % dekning`,
  });
}

export function renderValidationV2Coverage({ coverage, field } = {}) {
  return getValidationV2CoveragePresentation({ coverage, field })?.main || null;
}

export function renderValidationV2ResultHeading({ field, diagnostics = [], unresolved = [], counts = {} } = {}) {
  const name = field?.displayName || 'Feltet';
  if (diagnostics.some((item) => item.state === S.FAIL)) return `Feil i ${name}`;
  if (diagnostics.some((item) => item.state === S.CHECK) || unresolved.length || counts.check > 0) return `${name} bør kontrolleres`;
  if ((counts.pass || 0) === 0 && (counts.fail || 0) === 0 && (counts.check || 0) === 0) return 'Ingen objekter i laget var aktuelle for denne kontrollen.';
  return counts.pass === 1
    ? `1 objekt består ${name}-kontrollen`
    : `Alle ${counts.pass || 0} objekter består ${name}-kontrollen`;
}

export function getDiagnosticMappingCoverage() {
  const knownReasonCodes = Object.values(RuleReasonCode);
  // Rule definitions intentionally do not duplicate evaluator branches with a
  // reason-code inventory. The contract therefore audits the complete stable
  // RuleReasonCode union used by the active registry.
  const emittedReasonCodes = knownReasonCodes;
  return Object.freeze({
    activeOwnerCount: getValidationRules().length,
    canonicalFieldCount: new Set(getValidationRules().map((rule) => rule.canonicalFieldId)).size,
    knownReasonCodes,
    emittedReasonCodes,
    unmappedReasonCodes: emittedReasonCodes.filter((code) => !DIAGNOSTIC_REASON_MAPPING[code]),
    complete: emittedReasonCodes.every((code) => Boolean(DIAGNOSTIC_REASON_MAPPING[code])),
  });
}
