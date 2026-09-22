import { EvaluationState, ObjectValueState, RuleReasonCode, TemaIdentityState } from './contracts.js';
import { getPointFieldApplicability, PointFieldApplicabilityState } from './registry/pointFieldApplicability.js';
import { isRingStiffnessMaterial, isSdrMaterial } from './registry/hydraulicTemaClassification.js';

const PLACEHOLDERS = new Set(['-', '?', 'ukjent', 'unknown', 'n/a', 'na', 'ikke kjent', 'ikke oppgitt']);

function structural(value) {
  const reason = {
    [ObjectValueState.BINDING_AMBIGUOUS]: RuleReasonCode.BINDING_AMBIGUOUS,
    [ObjectValueState.UNRESOLVED_SOURCE]: RuleReasonCode.UNRESOLVED_SOURCE,
    [ObjectValueState.SCHEMA_UNAVAILABLE]: RuleReasonCode.SCHEMA_UNAVAILABLE,
  }[value.state];
  return reason ? { state: EvaluationState.CHECK, reasonCode: reason } : null;
}

function lexeme(value) {
  return typeof value.sourceLexeme === 'string' && value.sourceLexeme !== 'UNAVAILABLE'
    ? value.sourceLexeme : value.sourceValue;
}
function missing(value) {
  return value.state === ObjectValueState.FIELD_ABSENT || value.state === ObjectValueState.VALUE_MISSING ||
    (typeof lexeme(value) === 'string' && lexeme(value).trim() === '');
}
function integer(value) {
  const raw = lexeme(value);
  if (typeof raw === 'number') return Number.isSafeInteger(raw) ? raw : null;
  if (typeof raw !== 'string' || !/^[+-]?[0-9]+$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isSafeInteger(number) ? number : null;
}
function strictInteger(value) {
  const raw = lexeme(value);
  if (typeof raw === 'number') return Number.isSafeInteger(raw) ? raw : null;
  if (typeof raw !== 'string' || !/^-?[0-9]+$/.test(raw)) return null;
  const number = Number(raw); return Number.isSafeInteger(number) ? number : null;
}
function required(value) {
  const issue = structural(value); if (issue) return issue;
  return missing(value) ? { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.REQUIRED_VALUE_MISSING } : null;
}
function listed(value, values) {
  const raw = lexeme(value);
  return values.includes(raw) ? null : { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.VALUE_NOT_ALLOWED };
}

function validListed(value, values) { return !missing(value) && values.includes(lexeme(value)); }
function resolvedTema(context) { return context?.tema?.state === TemaIdentityState.RESOLVED && context.temaValid ? context.tema.resolvedValue : null; }
function plainDecimal(value) {
  const raw = lexeme(value);
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string' || !/^[+-]?[0-9]+(?:[.,][0-9]+)?$/.test(raw)) return null;
  const n = Number(raw.replace(',', '.')); return Number.isFinite(n) ? n : null;
}
function listedPolicy(value, rule, preferredValues = []) {
  const issue = structural(value); if (issue) return issue;
  if (missing(value)) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.REQUIRED_VALUE_MISSING };
  if (!rule.allowedValues.includes(lexeme(value))) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.VALUE_NOT_ALLOWED };
  return preferredValues.includes(lexeme(value))
    ? { state: EvaluationState.PASS, reasonCode: null }
    : { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.UNUSUAL_VALID_VALUE };
}
function applicable(value, rule, context, numericKind = 'integer') {
  const issue = structural(value); if (issue) return issue;
  const absent = missing(value);
  const tema = resolvedTema(context);
  const n = numericKind === 'decimal' ? plainDecimal(value) : integer(value);
  if (!absent && n === null) return { state: EvaluationState.FAIL, reasonCode: numericKind === 'decimal' ? RuleReasonCode.VALUE_NOT_DECIMAL : RuleReasonCode.VALUE_NOT_INTEGER };
  if (!absent && n < 0) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.NUMERIC_OUTSIDE_ALLOWED_RANGE };
  if (!tema) return { state: EvaluationState.NOT_EVALUATED, reasonCode: RuleReasonCode.DEPENDENT_TEMA_UNRESOLVED };
  const state = getPointFieldApplicability(tema, rule.canonicalFieldId).state;
  if (absent) return state === PointFieldApplicabilityState.APPLICABLE
    ? { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.APPLICABILITY_REQUIRED_MISSING } : { state: EvaluationState.PASS, reasonCode: null };
  if (state === PointFieldApplicabilityState.OPTIONAL_SUPPORTED) return { state: EvaluationState.PASS, reasonCode: null };
  if (state !== PointFieldApplicabilityState.APPLICABLE) return { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.APPLICABILITY_UNEXPECTED_VALUE };
  if (n === 0) return { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.NUMERIC_ZERO };
  if (policyFor(rule) === 'width' && n < 20) return { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.NUMERIC_OUTSIDE_PREFERRED_RANGE };
  return { state: EvaluationState.PASS, reasonCode: null };
}
function policyFor(rule) { return rule.policy; }
function validYear(value, currentYear) {
  const raw = lexeme(value); if (typeof raw !== 'string' || !/^[0-9]{4}$/.test(raw)) return null;
  const year = Number(raw); return year <= currentYear ? year : null;
}
function parseDate(value) {
  const raw = lexeme(value);
  const match = typeof raw === 'string' && (/^([0-9]{2})\.([0-9]{2})\.([0-9]{4})$/.exec(raw) || /^([0-9]{4})([0-9]{2})([0-9]{2})$/.exec(raw));
  if (!match) return null;
  const day = Number(match[1].length === 4 ? match[3] : match[1]);
  const month = Number(match[1].length === 4 ? match[2] : match[2]);
  const year = Number(match[1].length === 4 ? match[1] : match[3]);
  const date = new Date(Date.UTC(year, month - 1, day)); return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? { date, year } : null;
}
function anniversary(reference, years) {
  const targetYear = reference.getUTCFullYear() - years; const month = reference.getUTCMonth(); const day = reference.getUTCDate();
  const last = new Date(Date.UTC(targetYear, month + 1, 0)).getUTCDate(); return new Date(Date.UTC(targetYear, month, Math.min(day, last)));
}

export function evaluateFieldPolicy(value, policy, rule, context = {}) {
  // A supplied optional note remains supplied text even when it is whitespace.
  // Evaluate its raw lexical length before generic missing() trims whitespace.
  if (policy === 'optionalText' && value.state === ObjectValueState.VALUE_PRESENT) {
    const raw = lexeme(value);
    if (typeof raw === 'string' && Array.from(raw).length > 255) {
      return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.TEXT_LENGTH_EXCEEDED };
    }
  }
  const absent = required(value);
  if (absent && !['type', 'typeCompatibility', 'manholeShape', 'constructionMethod', 'cone', 'width', 'wallThickness', 'bottomDistance', 'length', 'externalHeight', 'frameNobb', 'facilityId', 'access', 'attachmentLink', 'installationYear', 'captureDate', 'positioningCause', 'verticalDimension', 'lineWallThickness', 'sdr', 'ringStiffness', 'pressureClass'].includes(policy)) {
    if (policy === 'optionalText' || policy === 'nobb' || policy === 'visibility' || policy === 'caseNumber') {
      if (absent.state === EvaluationState.CHECK) return absent;
      return { state: EvaluationState.PASS, reasonCode: null };
    }
    if (policy === 'owner' && absent.state === EvaluationState.FAIL) return { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.REQUIRED_VALUE_MISSING };
    return absent;
  }
  const raw = lexeme(value);
  if (policy === 'surveyedBy' || policy === 'caseNumber') {
    if (PLACEHOLDERS.has(String(raw).trim().toLocaleLowerCase('nb-NO'))) return { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.PLACEHOLDER_VALUE };
    return { state: EvaluationState.PASS, reasonCode: null };
  }
  if (policy === 'heightReference') {
    const invalid = listed(value, rule.allowedValues); if (invalid) return invalid;
    return raw === 'UKJENT' ? { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.UNUSUAL_VALID_VALUE } : { state: EvaluationState.PASS, reasonCode: null };
  }
  if (policy === 'measurementMethod' || policy === 'heightMeasurementMethod') {
    if (raw === '97' && policy === 'heightMeasurementMethod') return { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.UNUSUAL_VALID_VALUE };
    const invalid = listed(value, rule.allowedValues); if (invalid) return invalid;
    return raw === '96' ? { state: EvaluationState.PASS, reasonCode: null } : { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.UNUSUAL_VALID_VALUE };
  }
  if (policy === 'horizontalAccuracy' || policy === 'verticalAccuracy' || policy === 'maxHorizontalDeviation' || policy === 'maxVerticalDeviation') {
    const n = integer(value); if (n === null) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.VALUE_NOT_INTEGER };
    if (n < 0) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.NUMERIC_OUTSIDE_ALLOWED_RANGE };
    if (n === 0) return { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.NUMERIC_ZERO };
    const passMax = policy === 'horizontalAccuracy' ? 3 : policy === 'verticalAccuracy' ? 5 : policy === 'maxHorizontalDeviation' ? 20 : 30;
    if (n <= passMax) return { state: EvaluationState.PASS, reasonCode: null };
    return policy.startsWith('max') ? { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.NUMERIC_OUTSIDE_ALLOWED_RANGE } : { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.NUMERIC_OUTSIDE_PREFERRED_RANGE };
  }
  if (policy === 'positioningCondition') {
    const invalid = listed(value, rule.allowedValues); if (invalid) return invalid;
    return raw === 'ÅPEN_GRØ' || raw === 'ÅPEN_KUM' ? { state: EvaluationState.PASS, reasonCode: null } : { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.UNUSUAL_VALID_VALUE };
  }
  if (policy === 'owner') {
    const invalid = listed(value, rule.allowedValues); if (invalid) return invalid;
    return raw === 'AN' ? { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.UNUSUAL_VALID_VALUE } : { state: EvaluationState.PASS, reasonCode: null };
  }
  if (policy === 'verticalLevel') {
    const invalid = listed(value, rule.allowedValues); if (invalid) return invalid;
    return raw === 'UNDER_GRUNN' || raw === 'PÅ_GRUNN_VANNOVERF' ? { state: EvaluationState.PASS, reasonCode: null } : { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.UNUSUAL_VALID_VALUE };
  }
  if (policy === 'insideOutside') return listed(value, rule.allowedValues) || { state: EvaluationState.PASS, reasonCode: null };
  if (policy === 'networkType') return listedPolicy(value, rule, ['F', 'H', 'O', 'S']);
  if (policy === 'material') return listedPolicy(value, rule, ['BET', 'PE', 'PE100', 'PERC', 'PP', 'PVC', 'PVC-O', 'PVC-U', 'SJK']);
  if (policy === 'pipeShape') return listedPolicy(value, rule, ['S', 'E', 'F', 'R', 'T']);
  if (policy === 'dimension') {
    const issue = structural(value); if (issue) return issue;
    if (missing(value)) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.REQUIRED_VALUE_MISSING };
    const n = strictInteger(value); if (n === null) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.VALUE_NOT_INTEGER };
    if (n < 0) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.NUMERIC_OUTSIDE_ALLOWED_RANGE };
    return n < 32 ? { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.NUMERIC_OUTSIDE_PREFERRED_RANGE } : { state: EvaluationState.PASS, reasonCode: null };
  }
  if (policy === 'lineWallThickness') {
    const issue = structural(value); if (issue) return issue;
    if (missing(value)) return context.positioningCauseValid && lexeme(context.positioningCause) === 'UENDR'
      ? { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.EXISTING_INFRASTRUCTURE_VALUE_MISSING }
      : { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.REQUIRED_VALUE_MISSING };
    const rawThickness = lexeme(value);
    if (typeof rawThickness !== 'string' || !/^-?[0-9]+(?:[.,][0-9]+)?$/.test(rawThickness)) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.VALUE_NOT_DECIMAL };
    const n = Number(rawThickness.replace(',', '.'));
    if (n < 0) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.NUMERIC_OUTSIDE_ALLOWED_RANGE };
    if (n === 0) return { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.NUMERIC_ZERO };
    const precision = (/[.,]([0-9]+)$/.exec(rawThickness)?.[1].length || 0);
    return precision > 2 ? { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.NUMERIC_OUTSIDE_PREFERRED_RANGE } : { state: EvaluationState.PASS, reasonCode: null };
  }
  if (policy === 'verticalDimension') {
    const issue = structural(value); if (issue) return issue;
    const absentVertical = missing(value); const n = absentVertical ? null : strictInteger(value);
    if (!absentVertical && (n === null || n <= 0)) return { state: EvaluationState.FAIL, reasonCode: n === null ? RuleReasonCode.VALUE_NOT_INTEGER : n < 0 ? RuleReasonCode.NUMERIC_OUTSIDE_ALLOWED_RANGE : RuleReasonCode.NUMERIC_ZERO };
    const shape = context.pipeShape;
    const shapeResolved = shape && !missing(shape) && context.pipeShapeValues?.includes(lexeme(shape));
    if (!shapeResolved) return { state: EvaluationState.NOT_EVALUATED, reasonCode: RuleReasonCode.DEPENDENT_TEMA_UNRESOLVED, details: { suppression: 'PIPE_SHAPE_UNRESOLVED' } };
    if (lexeme(shape) === 'S') return absentVertical ? { state: EvaluationState.PASS, reasonCode: null } : { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.UNUSUAL_VALID_VALUE };
    if (absentVertical) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.REQUIRED_VALUE_MISSING };
    return n < 31 ? { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.NUMERIC_OUTSIDE_PREFERRED_RANGE } : { state: EvaluationState.PASS, reasonCode: null };
  }
  if (['sdr', 'ringStiffness', 'pressureClass'].includes(policy)) {
    const issue = structural(value); if (issue) return issue;
    const supplied = !missing(value); const rawHydraulic = lexeme(value);
    const valid = policy === 'sdr'
      ? typeof rawHydraulic === 'string' && /^[0-9]+(?:[.,][0-9]+)?$/.test(rawHydraulic) && rule.allowedValues.some((candidate) => Number(candidate) === Number(rawHydraulic.replace(',', '.')))
      : rule.allowedValues.includes(rawHydraulic);
    if (supplied && !valid) return { state: EvaluationState.FAIL, reasonCode: policy === 'sdr' ? RuleReasonCode.VALUE_NOT_DECIMAL : RuleReasonCode.VALUE_NOT_ALLOWED };
    if (!context.hydraulicClass) return { state: EvaluationState.NOT_EVALUATED, reasonCode: RuleReasonCode.DEPENDENT_TEMA_UNRESOLVED, details: { suppression: 'HYDRAULIC_TEMA_UNRESOLVED' } };
    if ((policy === 'sdr' || policy === 'ringStiffness') && !context.materialValid) return { state: EvaluationState.NOT_EVALUATED, reasonCode: RuleReasonCode.RELATIONSHIP_PREREQUISITE_FAILED, details: { suppression: 'MATERIAL_UNRESOLVED' } };
    if (policy === 'pressureClass') return context.hydraulicClass === 'PRESSURE'
      ? (supplied ? { state: EvaluationState.PASS, reasonCode: null } : { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.REQUIRED_VALUE_MISSING })
      : context.hydraulicClass === 'GRAVITY' ? (supplied ? { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.UNUSUAL_VALID_VALUE } : { state: EvaluationState.PASS, reasonCode: null })
        : { state: EvaluationState.CHECK, reasonCode: supplied ? RuleReasonCode.UNUSUAL_VALID_VALUE : RuleReasonCode.REQUIRED_VALUE_MISSING };
    const plastic = policy === 'sdr'
      ? isSdrMaterial(lexeme(context.material))
      : isRingStiffnessMaterial(lexeme(context.material));
    const required = policy === 'sdr' ? context.hydraulicClass === 'PRESSURE' && plastic : context.hydraulicClass === 'GRAVITY' && plastic;
    if (!supplied) return required
      ? context.positioningCauseValid && lexeme(context.positioningCause) === 'UENDR'
        ? { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.EXISTING_INFRASTRUCTURE_VALUE_MISSING }
        : { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.REQUIRED_VALUE_MISSING }
      : context.hydraulicClass === 'SPECIAL' ? { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.REQUIRED_VALUE_MISSING } : { state: EvaluationState.PASS, reasonCode: null };
    return required ? { state: EvaluationState.PASS, reasonCode: null } : { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.UNUSUAL_VALID_VALUE };
  }
  if (policy === 'optionalText') return Array.from(String(raw)).length > 255 ? { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.TEXT_LENGTH_EXCEEDED } : { state: EvaluationState.PASS, reasonCode: null };
  if (policy === 'nobb') return integer(value) === null ? { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.VALUE_NOT_INTEGER } : { state: EvaluationState.PASS, reasonCode: null };
  if (policy === 'visibility') return { state: EvaluationState.PASS, reasonCode: null };
  if (policy === 'type') {
    const issue = structural(value); if (issue) return issue;
    if (missing(value)) {
      const tema = resolvedTema(context); if (!tema) return { state: EvaluationState.NOT_EVALUATED, reasonCode: RuleReasonCode.DEPENDENT_TEMA_UNRESOLVED };
      return tema === 'DIV' ? { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.REQUIRED_VALUE_MISSING } : context.typeTemas?.has(tema) ? { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.OPTIONAL_TYPE_NOT_SUPPLIED } : { state: EvaluationState.PASS, reasonCode: null };
    }
    return listed(value, rule.allowedValues) || { state: EvaluationState.PASS, reasonCode: null };
  }
  if (policy === 'typeCompatibility') {
    const type = value; const tema = resolvedTema(context);
    if (!tema) return { state: EvaluationState.NOT_EVALUATED, reasonCode: RuleReasonCode.DEPENDENT_TEMA_UNRESOLVED };
    if (missing(type) || !context.typeValues?.has(lexeme(type))) return { state: EvaluationState.NOT_EVALUATED, reasonCode: RuleReasonCode.RELATIONSHIP_PREREQUISITE_FAILED };
    const details = { inputValues: [lexeme(type), tema] };
    return rule.allowedPairs.some(([candidateType, candidateTema]) => candidateType === lexeme(type) && candidateTema === tema)
      ? { state: EvaluationState.PASS, reasonCode: null, details }
      : { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.TYPE_TEMA_INCOMPATIBLE, details };
  }
  if (['manholeShape', 'constructionMethod', 'cone'].includes(policy)) {
    const issue = structural(value); if (issue) return issue;
    if (!missing(value) && !rule.allowedValues.includes(lexeme(value))) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.VALUE_NOT_ALLOWED };
    const tema = resolvedTema(context); if (!tema) return { state: EvaluationState.NOT_EVALUATED, reasonCode: RuleReasonCode.DEPENDENT_TEMA_UNRESOLVED };
    const state = getPointFieldApplicability(tema, rule.canonicalFieldId).state;
    if (missing(value)) return state === PointFieldApplicabilityState.APPLICABLE ? { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.APPLICABILITY_REQUIRED_MISSING } : { state: EvaluationState.PASS, reasonCode: null };
    if (state !== PointFieldApplicabilityState.APPLICABLE) return { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.APPLICABILITY_UNEXPECTED_VALUE };
    return policy === 'constructionMethod' && lexeme(value) === 'UK' ? { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.UNUSUAL_VALID_VALUE } : { state: EvaluationState.PASS, reasonCode: null };
  }
  if (['width', 'wallThickness', 'bottomDistance'].includes(policy)) return applicable(value, rule, context, policy === 'bottomDistance' ? 'decimal' : 'integer');
  if (policy === 'length' || policy === 'externalHeight') { const issue = structural(value); if (issue) return issue; if (missing(value)) return { state: EvaluationState.PASS, reasonCode: null }; const n = integer(value); if (n === null) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.VALUE_NOT_INTEGER }; return n < 0 ? { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.NUMERIC_OUTSIDE_ALLOWED_RANGE } : { state: EvaluationState.CHECK, reasonCode: n === 0 ? RuleReasonCode.NUMERIC_ZERO : RuleReasonCode.UNUSUAL_VALID_VALUE }; }
  if (policy === 'frameNobb') { const issue = structural(value); if (issue) return issue; return missing(value) ? { state: EvaluationState.PASS, reasonCode: null } : integer(value) === null ? { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.VALUE_NOT_INTEGER } : { state: EvaluationState.PASS, reasonCode: null }; }
  if (policy === 'facilityId') { const issue = structural(value); if (issue) return issue; return missing(value) ? { state: EvaluationState.PASS, reasonCode: null } : { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.UNUSUAL_VALID_VALUE }; }
  if (policy === 'access') { const issue = structural(value); if (issue) return issue; if (!missing(value) && !rule.allowedValues.includes(lexeme(value))) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.VALUE_NOT_ALLOWED }; const tema = resolvedTema(context); if (!tema) return { state: EvaluationState.NOT_EVALUATED, reasonCode: RuleReasonCode.DEPENDENT_TEMA_UNRESOLVED }; if (missing(value)) return tema === 'KUM' ? { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.REQUIRED_VALUE_MISSING } : { state: EvaluationState.PASS, reasonCode: null }; return ['KUM', 'SLU'].includes(tema) ? { state: EvaluationState.PASS, reasonCode: null } : { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.APPLICABILITY_UNEXPECTED_VALUE }; }
  if (policy === 'attachmentLink') { const issue = structural(value); if (issue) return issue; const tema = resolvedTema(context); if (!tema) return { state: EvaluationState.NOT_EVALUATED, reasonCode: RuleReasonCode.DEPENDENT_TEMA_UNRESOLVED }; if (['LOK', 'TOP'].includes(tema)) return missing(value) ? { state: EvaluationState.PASS, reasonCode: null } : { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.APPLICABILITY_UNEXPECTED_VALUE }; if (getPointFieldApplicability(tema, 'constructionMethod').state === PointFieldApplicabilityState.APPLICABLE) return missing(value) ? { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.REQUIRED_VALUE_MISSING } : { state: EvaluationState.PASS, reasonCode: null }; return { state: EvaluationState.PASS, reasonCode: null }; }
  if (policy === 'installationYear') { const issue = structural(value); if (issue) return issue; const cause = context.positioningCause; const currentYear = context.currentYear; if (missing(value)) return validListed(cause, ['NYTT']) ? { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.REQUIRED_VALUE_MISSING } : { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.REQUIRED_VALUE_MISSING }; const raw = lexeme(value); if (typeof raw !== 'string' || !/^[0-9]{4}$/.test(raw)) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.YEAR_FORMAT_INVALID }; const year = Number(raw); if (year > currentYear) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.YEAR_FUTURE }; if (year === 0 || year < 1900 || (validListed(cause, ['NYTT']) && year < currentYear - 5)) return { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.YEAR_PLAUSIBILITY }; return { state: EvaluationState.PASS, reasonCode: null }; }
  if (policy === 'captureDate') { const issue = structural(value); if (issue) return issue; if (missing(value)) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.REQUIRED_VALUE_MISSING }; const parsed = parseDate(value); if (!parsed) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.DATE_FORMAT_INVALID }; const reference = context.referenceDate; if (parsed.date > reference) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.DATE_FUTURE }; const year = validYear(context.installationYear, context.currentYear); if (year && year !== 0 && parsed.year < year) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.DATE_BEFORE_INSTALLATION }; return parsed.date < anniversary(reference, 5) ? { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.DATE_OLDER_THAN_FIVE_YEARS } : { state: EvaluationState.PASS, reasonCode: null }; }
  if (policy === 'positioningCause') { const issue = structural(value); if (issue) return issue; if (missing(value)) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.REQUIRED_VALUE_MISSING }; if (!rule.allowedValues.includes(lexeme(value))) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.VALUE_NOT_ALLOWED }; const year = validYear(context.installationYear, context.currentYear); return lexeme(value) !== 'NYTT' && year && year !== 0 && context.nyttYears?.has(year) ? { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.POSITIONING_CAUSE_SHARED_NYTT_YEAR } : { state: EvaluationState.PASS, reasonCode: null }; }
  throw new Error(`unknown field policy ${policy}`);
}

export function evaluateValidatedTema(identity, allowedValues) {
  const observations = identity.observations || [];
  const supplied = observations.filter((item) => item.valueState === ObjectValueState.VALUE_PRESENT);
  const invalid = supplied.some((item) => !allowedValues.includes(item.sourceLexeme === 'UNAVAILABLE' ? item.rawValue : item.sourceLexeme));
  if (invalid) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.TEMA_INVALID, details: { identityState: 'INVALID' } };
  if (identity.state === TemaIdentityState.CONFLICT) return { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.TEMA_CONFLICT, details: { identityState: 'VALID_CONFLICT' } };
  if (identity.state === TemaIdentityState.MISSING) return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.TEMA_MISSING, details: { identityState: 'MISSING' } };
  if (identity.state !== TemaIdentityState.RESOLVED) return { state: EvaluationState.CHECK, reasonCode: RuleReasonCode.UNRESOLVED_SOURCE, details: { identityState: 'UNRESOLVED' } };
  return { state: EvaluationState.PASS, reasonCode: null, details: { identityState: 'RESOLVED_VALID' } };
}
