import {
  BindingState,
  EvaluationState,
  ObjectValueState,
  RuleEvaluatorKind,
  RuleReasonCode,
  TemaIdentityState,
  ValueComparisonPolicy,
} from './contracts.js';

function isAllowedValue(value, sourceLexeme, allowedValues, valueComparison) {
  const hasSourceLexeme = typeof sourceLexeme === 'string' && sourceLexeme !== 'UNAVAILABLE';
  if (valueComparison === ValueComparisonPolicy.INTEGER_CODE_STRING) {
    if (hasSourceLexeme) {
      return typeof sourceLexeme === 'string' && allowedValues.some(
        (allowedValue) => Object.is(allowedValue, sourceLexeme),
      );
    }
    if (typeof value === 'string') {
      return allowedValues.some((allowedValue) => Object.is(allowedValue, value));
    }
    if (
      typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      !Object.is(value, -0)
    ) {
      const canonicalCode = String(value);
      return allowedValues.some((allowedValue) => Object.is(allowedValue, canonicalCode));
    }
    return false;
  }
  const comparisonValue = hasSourceLexeme ? sourceLexeme : value;
  return allowedValues.some((allowedValue) => Object.is(allowedValue, comparisonValue));
}

/**
 * Evaluate requiredness from existing A4 evidence only.
 *
 * @param {Object} value
 * @returns {{state: string, reasonCode: string|null}}
 */
export function evaluateRequiredField(value) {
  switch (value.state) {
    case ObjectValueState.VALUE_PRESENT:
      return { state: EvaluationState.PASS, reasonCode: null };
    case ObjectValueState.FIELD_ABSENT:
      return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.REQUIRED_FIELD_ABSENT };
    case ObjectValueState.VALUE_MISSING:
      return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.REQUIRED_VALUE_MISSING };
    case ObjectValueState.BINDING_AMBIGUOUS:
      return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.BINDING_AMBIGUOUS };
    case ObjectValueState.UNRESOLVED_SOURCE:
      return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.UNRESOLVED_SOURCE };
    case ObjectValueState.SCHEMA_UNAVAILABLE:
      return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.SCHEMA_UNAVAILABLE };
    default:
      throw new Error('unsupported ObjectFieldValue state for required evaluator');
  }
}

/**
 * Evaluate one exact allowed-value set from existing A4 evidence only.
 *
 * @param {Object} value
 * @param {Array<*>} allowedValues
 * @returns {{state: string, reasonCode: string|null}}
 */
export function evaluateAllowedValue(value, allowedValues) {
  switch (value.state) {
    case ObjectValueState.VALUE_PRESENT: {
      const allowed = isAllowedValue(
        value.sourceValue, value.sourceLexeme, allowedValues, ValueComparisonPolicy.EXACT,
      );
      return {
        state: allowed ? EvaluationState.PASS : EvaluationState.FAIL,
        reasonCode: allowed ? null : RuleReasonCode.VALUE_NOT_ALLOWED,
      };
    }
    case ObjectValueState.FIELD_ABSENT:
    case ObjectValueState.VALUE_MISSING:
      return { state: EvaluationState.NOT_EVALUATED, reasonCode: null };
    case ObjectValueState.BINDING_AMBIGUOUS:
      return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.BINDING_AMBIGUOUS };
    case ObjectValueState.UNRESOLVED_SOURCE:
      return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.UNRESOLVED_SOURCE };
    case ObjectValueState.SCHEMA_UNAVAILABLE:
      return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.SCHEMA_UNAVAILABLE };
    default:
      throw new Error('unsupported ObjectFieldValue state for allowed-value evaluator');
  }
}

/**
 * Evaluate one required field whose present value must also be source-authorized.
 *
 * @param {Object} value
 * @param {Array<*>} allowedValues
 * @param {'EXACT'|'INTEGER_CODE_STRING'} [valueComparison='EXACT']
 * @returns {{state: string, reasonCode: string|null}}
 */
export function evaluateRequiredAllowedValue(
  value,
  allowedValues,
  valueComparison = ValueComparisonPolicy.EXACT,
) {
  switch (value.state) {
    case ObjectValueState.FIELD_ABSENT:
      return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.REQUIRED_FIELD_ABSENT };
    case ObjectValueState.VALUE_MISSING:
      return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.REQUIRED_VALUE_MISSING };
    case ObjectValueState.VALUE_PRESENT: {
      const allowed = isAllowedValue(
        value.sourceValue,
        value.sourceLexeme,
        allowedValues,
        valueComparison,
      );
      return {
        state: allowed ? EvaluationState.PASS : EvaluationState.FAIL,
        reasonCode: allowed ? null : RuleReasonCode.VALUE_NOT_ALLOWED,
      };
    }
    case ObjectValueState.BINDING_AMBIGUOUS:
      return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.BINDING_AMBIGUOUS };
    case ObjectValueState.UNRESOLVED_SOURCE:
      return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.UNRESOLVED_SOURCE };
    case ObjectValueState.SCHEMA_UNAVAILABLE:
      return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.SCHEMA_UNAVAILABLE };
    default:
      throw new Error('unsupported ObjectFieldValue state for required allowed-value evaluator');
  }
}

const INTEGER_LEXEME_PATTERN = /^[+-]?[0-9]+$/;
const DECIMAL_LEXEME_PATTERN = /^[+-]?[0-9]+(?:[.,][0-9]+)?$/;
const DECIMAL_EXPONENT_PATTERN = /^[+-]?(?:(?:[0-9]+(?:[.,][0-9]+)?)|(?:[.,][0-9]+)|(?:[0-9]+[.,]))[eE][+-]?[0-9]+$/;
const DECIMAL_LEADING_SEPARATOR_PATTERN = /^[+-]?[.,][0-9]+$/;
const DECIMAL_TRAILING_SEPARATOR_PATTERN = /^[+-]?[0-9]+[.,]$/;
const DECIMAL_COMMA_GROUPING_PATTERN = /^[+-]?[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?$/;
const DECIMAL_DOT_GROUPING_PATTERN = /^[+-]?[0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]+)?$/;
const YEAR_LEXEME_PATTERN = /^[0-9]{4}$/;
const DATE_LEXEME_PATTERN = /^(?:[0-9]{2}\.[0-9]{2}\.[0-9]{4}|[0-9]{8})$/;

function isCalendarDateLexeme(lexeme) {
  const dotted = /^([0-9]{2})\.([0-9]{2})\.([0-9]{4})$/.exec(lexeme);
  const compact = /^([0-9]{4})([0-9]{2})([0-9]{2})$/.exec(lexeme);
  const match = dotted || compact;
  if (!match) return false;
  const day = Number(dotted ? match[1] : match[3]);
  const month = Number(match[2]);
  const year = Number(dotted ? match[3] : match[1]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function evaluateMissingOrStructural(value, evaluatorName) {
  switch (value.state) {
    case ObjectValueState.FIELD_ABSENT:
    case ObjectValueState.VALUE_MISSING:
      return { state: EvaluationState.NOT_EVALUATED, reasonCode: null };
    case ObjectValueState.BINDING_AMBIGUOUS:
      return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.BINDING_AMBIGUOUS };
    case ObjectValueState.UNRESOLVED_SOURCE:
      return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.UNRESOLVED_SOURCE };
    case ObjectValueState.SCHEMA_UNAVAILABLE:
      return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.SCHEMA_UNAVAILABLE };
    default:
      throw new Error(`unsupported ObjectFieldValue state for ${evaluatorName}`);
  }
}

function getLexicalValue(value) {
  if (typeof value.sourceLexeme === 'string' && value.sourceLexeme !== 'UNAVAILABLE') {
    return { available: true, value: value.sourceLexeme };
  }
  if (typeof value.sourceValue === 'string') {
    return { available: true, value: value.sourceValue };
  }
  return { available: false, value: undefined };
}

function getTextLexicalEvidence(value) {
  const lexical = getLexicalValue(value);
  if (value.state !== ObjectValueState.VALUE_MISSING) {
    return { lexical, ambiguous: false };
  }
  const suppliedLexemes = Array.isArray(value.candidates)
    ? value.candidates
      .map((entry) => entry.sourceLexeme)
      .filter((sourceLexeme) =>
        typeof sourceLexeme === 'string' &&
        sourceLexeme !== 'UNAVAILABLE' &&
        sourceLexeme !== ''
      )
    : [];
  if (suppliedLexemes.length === 0) {
    return { lexical, ambiguous: false };
  }
  const firstLexeme = suppliedLexemes[0];
  return {
    lexical: { available: true, value: firstLexeme },
    ambiguous: suppliedLexemes.some((sourceLexeme) => sourceLexeme !== firstLexeme),
  };
}

function isUnresolvedDecimalNotation(lexeme) {
  const candidate = lexeme.trim();
  if (candidate.length === 0 || candidate !== lexeme && !DECIMAL_LEXEME_PATTERN.test(candidate)) {
    return false;
  }
  return DECIMAL_EXPONENT_PATTERN.test(candidate) ||
    DECIMAL_LEADING_SEPARATOR_PATTERN.test(candidate) ||
    DECIMAL_TRAILING_SEPARATOR_PATTERN.test(candidate) ||
    DECIMAL_COMMA_GROUPING_PATTERN.test(candidate) ||
    DECIMAL_DOT_GROUPING_PATTERN.test(candidate) ||
    (candidate !== lexeme && DECIMAL_LEXEME_PATTERN.test(candidate));
}

/**
 * Evaluate the conservative source-backed decimal spelling policy. Exact
 * plain signed decimals pass; numeric-looking but unspecified notation stays
 * unresolved rather than being asserted invalid.
 */
export function evaluateDecimalFormat(value) {
  if (value.state !== ObjectValueState.VALUE_PRESENT) {
    return evaluateMissingOrStructural(value, 'decimal-format evaluator');
  }
  const lexical = getLexicalValue(value);
  if (lexical.available) {
    if (DECIMAL_LEXEME_PATTERN.test(lexical.value)) {
      return { state: EvaluationState.PASS, reasonCode: null };
    }
    if (isUnresolvedDecimalNotation(lexical.value)) {
      return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.DECIMAL_NOTATION_UNRESOLVED };
    }
    return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.VALUE_NOT_DECIMAL };
  }
  if (typeof value.sourceValue === 'number') {
    if (!Number.isFinite(value.sourceValue)) {
      return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.VALUE_NOT_DECIMAL };
    }
    return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.LEXICAL_FORMAT_UNAVAILABLE };
  }
  return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.VALUE_NOT_DECIMAL };
}

export function evaluateYearFormat(value) {
  if (value.state !== ObjectValueState.VALUE_PRESENT) {
    return evaluateMissingOrStructural(value, 'year-format evaluator');
  }
  const lexical = getLexicalValue(value);
  if (lexical.available) {
    return YEAR_LEXEME_PATTERN.test(lexical.value)
      ? { state: EvaluationState.PASS, reasonCode: null }
      : { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.YEAR_FORMAT_INVALID };
  }
  if (typeof value.sourceValue === 'number') {
    if (!Number.isFinite(value.sourceValue) || !Number.isInteger(value.sourceValue)) {
      return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.LEXICAL_FORMAT_UNAVAILABLE };
    }
    const fallback = String(value.sourceValue);
    return YEAR_LEXEME_PATTERN.test(fallback)
      ? { state: EvaluationState.PASS, reasonCode: null }
      : { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.LEXICAL_FORMAT_UNAVAILABLE };
  }
  return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.LEXICAL_FORMAT_UNAVAILABLE };
}

export function evaluateDateFormat(value) {
  if (value.state !== ObjectValueState.VALUE_PRESENT) {
    return evaluateMissingOrStructural(value, 'date-format evaluator');
  }
  const lexical = getLexicalValue(value);
  if (!lexical.available) {
    return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.LEXICAL_FORMAT_UNAVAILABLE };
  }
  return DATE_LEXEME_PATTERN.test(lexical.value) && isCalendarDateLexeme(lexical.value)
    ? { state: EvaluationState.PASS, reasonCode: null }
    : { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.DATE_FORMAT_INVALID };
}

export function evaluateTextMaxLength(value, maximumLength = 255) {
  const evidence = getTextLexicalEvidence(value);
  if (evidence.ambiguous) {
    return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.BINDING_AMBIGUOUS };
  }
  const { lexical } = evidence;
  const hasSuppliedTextLexeme = value.state === ObjectValueState.VALUE_MISSING && lexical.available;
  if (value.state !== ObjectValueState.VALUE_PRESENT && !hasSuppliedTextLexeme) {
    return evaluateMissingOrStructural(value, 'text-max-length evaluator');
  }
  if (!lexical.available) {
    return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.LEXICAL_FORMAT_UNAVAILABLE };
  }
  return [...lexical.value].length <= maximumLength
    ? { state: EvaluationState.PASS, reasonCode: null }
    : { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.TEXT_LENGTH_EXCEEDED };
}

/**
 * Evaluate an optional supplied value as an exact integer representation.
 * Original source lexemes are authoritative and are never normalized.
 *
 * @param {Object} value
 * @returns {{state: string, reasonCode: string|null}}
 */
export function evaluateIntegerFormat(value) {
  switch (value.state) {
    case ObjectValueState.VALUE_PRESENT: {
      const hasSourceLexeme = typeof value.sourceLexeme === 'string' &&
        value.sourceLexeme !== 'UNAVAILABLE';
      if (hasSourceLexeme) {
        const valid = INTEGER_LEXEME_PATTERN.test(value.sourceLexeme);
        return {
          state: valid ? EvaluationState.PASS : EvaluationState.FAIL,
          reasonCode: valid ? null : RuleReasonCode.VALUE_NOT_INTEGER,
        };
      }
      if (typeof value.sourceValue === 'string') {
        const valid = INTEGER_LEXEME_PATTERN.test(value.sourceValue);
        return {
          state: valid ? EvaluationState.PASS : EvaluationState.FAIL,
          reasonCode: valid ? null : RuleReasonCode.VALUE_NOT_INTEGER,
        };
      }
      if (typeof value.sourceValue === 'number') {
        if (!Number.isFinite(value.sourceValue) || !Number.isInteger(value.sourceValue)) {
          return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.VALUE_NOT_INTEGER };
        }
        if (!Number.isSafeInteger(value.sourceValue)) {
          return {
            state: EvaluationState.INDETERMINATE,
            reasonCode: RuleReasonCode.NUMERIC_PRECISION_UNAVAILABLE,
          };
        }
        return { state: EvaluationState.PASS, reasonCode: null };
      }
      return { state: EvaluationState.FAIL, reasonCode: RuleReasonCode.VALUE_NOT_INTEGER };
    }
    case ObjectValueState.FIELD_ABSENT:
    case ObjectValueState.VALUE_MISSING:
      return { state: EvaluationState.NOT_EVALUATED, reasonCode: null };
    case ObjectValueState.BINDING_AMBIGUOUS:
      return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.BINDING_AMBIGUOUS };
    case ObjectValueState.UNRESOLVED_SOURCE:
      return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.UNRESOLVED_SOURCE };
    case ObjectValueState.SCHEMA_UNAVAILABLE:
      return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.SCHEMA_UNAVAILABLE };
    default:
      throw new Error('unsupported ObjectFieldValue state for integer-format evaluator');
  }
}

/**
 * Evaluate a strict allowed-value set against the existing Tema identity
 * result. Resolution remains owned by temaIdentity.js; this only validates
 * its owned source lexeme (or resolved raw value when unavailable) without normalization.
 */
export function evaluateTemaRequiredAllowedValue(identity, allowedValues) {
  if (identity.bindingState === BindingState.SCHEMA_UNAVAILABLE) {
    return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.SCHEMA_UNAVAILABLE };
  }
  if (identity.bindingState === BindingState.AMBIGUOUS) {
    return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.BINDING_AMBIGUOUS };
  }
  switch (identity.state) {
    case TemaIdentityState.RESOLVED: {
      const allowed = isAllowedValue(
        identity.resolvedValue, identity.sourceLexeme, allowedValues, ValueComparisonPolicy.EXACT,
      );
      return {
        state: allowed ? EvaluationState.PASS : EvaluationState.FAIL,
        reasonCode: allowed ? null : RuleReasonCode.VALUE_NOT_ALLOWED,
      };
    }
    case TemaIdentityState.MISSING:
      return {
        state: EvaluationState.FAIL,
        reasonCode: identity.bindingState === BindingState.FIELD_ABSENT
          ? RuleReasonCode.REQUIRED_FIELD_ABSENT
          : RuleReasonCode.REQUIRED_VALUE_MISSING,
      };
    case TemaIdentityState.CONFLICT:
      return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.TEMA_CONFLICT };
    case TemaIdentityState.UNRESOLVED_SOURCE:
      return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.UNRESOLVED_SOURCE };
    default:
      throw new Error('unsupported Tema identity state for required allowed-value evaluator');
  }
}

/**
 * Evaluate Tema requiredness from the specialized A3 result.
 *
 * @param {Object} identity
 * @returns {{state: string, reasonCode: string|null}}
 */
export function evaluateTemaRequired(identity) {
  if (identity.bindingState === BindingState.SCHEMA_UNAVAILABLE) {
    return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.SCHEMA_UNAVAILABLE };
  }
  if (identity.bindingState === BindingState.AMBIGUOUS) {
    return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.BINDING_AMBIGUOUS };
  }
  switch (identity.state) {
    case TemaIdentityState.RESOLVED:
      return { state: EvaluationState.PASS, reasonCode: null };
    case TemaIdentityState.MISSING:
      return {
        state: EvaluationState.FAIL,
        reasonCode: identity.bindingState === BindingState.FIELD_ABSENT
          ? RuleReasonCode.REQUIRED_FIELD_ABSENT
          : RuleReasonCode.REQUIRED_VALUE_MISSING,
      };
    case TemaIdentityState.CONFLICT:
      return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.TEMA_CONFLICT };
    case TemaIdentityState.UNRESOLVED_SOURCE:
      return { state: EvaluationState.INDETERMINATE, reasonCode: RuleReasonCode.UNRESOLVED_SOURCE };
    default:
      throw new Error('unsupported Tema identity state for required evaluator');
  }
}

/**
 * Evaluate a prerequisite rule against one input's already-owned evidence.
 * This deliberately stays per ObjectRef and does not consume aggregate rule
 * results or depend on registry execution order.
 */
export function evaluateRelationshipPrerequisite(rule, evidence) {
  if (rule.evaluatorKind === RuleEvaluatorKind.FIELD_POLICY) {
    return rule.canonicalFieldId === 'tema'
      ? evaluateTemaRequiredAllowedValue(evidence, rule.allowedValues)
      : evaluateAllowedValue(evidence, rule.allowedValues);
  }
  if (rule.evaluatorKind === RuleEvaluatorKind.REQUIRED_ALLOWED_VALUE) {
    return rule.canonicalFieldId === 'tema'
      ? evaluateTemaRequiredAllowedValue(evidence, rule.allowedValues)
      : evaluateRequiredAllowedValue(evidence, rule.allowedValues, rule.valueComparison);
  }
  if (rule.evaluatorKind === RuleEvaluatorKind.ALLOWED_VALUE) {
    return evaluateAllowedValue(evidence, rule.allowedValues);
  }
  if (rule.evaluatorKind === RuleEvaluatorKind.REQUIRED) {
    return rule.canonicalFieldId === 'tema'
      ? evaluateTemaRequired(evidence)
      : evaluateRequiredField(evidence);
  }
  throw new Error('unsupported relationship prerequisite evaluator');
}

function getResolvedRelationshipValue(evidence) {
  if (typeof evidence.sourceLexeme === 'string' && evidence.sourceLexeme !== 'UNAVAILABLE') {
    return evidence.sourceLexeme;
  }
  return evidence.canonicalFieldId === 'tema' || evidence.state === TemaIdentityState.RESOLVED
    ? evidence.resolvedValue
    : evidence.sourceValue;
}

/**
 * Evaluate an exact allowed-pairs relationship after its independently owned
 * list prerequisites. Inputs and prerequisite rules must have matching order.
 */
export function evaluateFieldRelationship({
  inputFieldIds,
  evidenceByField,
  prerequisiteRules,
  relationship,
}) {
  const prerequisiteEvaluations = prerequisiteRules.map((rule, index) => ({
    fieldId: inputFieldIds[index],
    ruleId: rule.ruleId,
    evaluation: evaluateRelationshipPrerequisite(rule, evidenceByField[inputFieldIds[index]]),
  }));
  const optionalIndex = inputFieldIds.indexOf(relationship.optionalInputFieldId);
  if (
    optionalIndex >= 0 &&
    prerequisiteEvaluations[optionalIndex].evaluation.state === EvaluationState.NOT_EVALUATED
  ) {
    return {
      state: EvaluationState.NOT_EVALUATED,
      reasonCode: relationship.optionalInputReasonCode,
      details: { optionalInputFieldId: relationship.optionalInputFieldId },
    };
  }

  const blockingRuleIds = prerequisiteEvaluations
    .filter(({ evaluation }) => evaluation.state === EvaluationState.FAIL)
    .map(({ ruleId }) => ruleId);
  if (blockingRuleIds.length > 0) {
    return {
      state: EvaluationState.NOT_EVALUATED,
      reasonCode: RuleReasonCode.RELATIONSHIP_PREREQUISITE_FAILED,
      details: { blockingRuleIds },
    };
  }

  const indeterminateInputs = prerequisiteEvaluations.filter(
    ({ evaluation }) => evaluation.state === EvaluationState.INDETERMINATE
  );
  if (indeterminateInputs.length > 0) {
    const inputReasons = Object.fromEntries(indeterminateInputs.map(({ fieldId, evaluation }) => [
      fieldId,
      evaluation.reasonCode,
    ]));
    const distinctReasons = new Set(Object.values(inputReasons));
    return {
      state: EvaluationState.INDETERMINATE,
      reasonCode: distinctReasons.size === 1
        ? [...distinctReasons][0]
        : RuleReasonCode.RELATIONSHIP_INPUT_INDETERMINATE,
      details: { inputReasons },
    };
  }

  if (prerequisiteEvaluations.some(({ evaluation }) => evaluation.state !== EvaluationState.PASS)) {
    throw new Error('relationship prerequisite did not resolve to a supported terminal state');
  }

  const inputValues = inputFieldIds.map((fieldId) =>
    getResolvedRelationshipValue(evidenceByField[fieldId]));
  const allowed = relationship.allowedPairs.some((pair) =>
    pair.every((value, index) => Object.is(value, inputValues[index])));
  return {
    state: allowed ? EvaluationState.PASS : EvaluationState.FAIL,
    reasonCode: allowed ? null : relationship.failureReasonCode,
    details: { inputValues },
  };
}
