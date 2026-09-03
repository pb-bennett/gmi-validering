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
    case ObjectValueState.VALUE_PRESENT:
      return {
        state: allowedValues.some((allowedValue) => Object.is(allowedValue, value.sourceValue))
          ? EvaluationState.PASS
          : EvaluationState.FAIL,
        reasonCode: allowedValues.some((allowedValue) => Object.is(allowedValue, value.sourceValue))
          ? null
          : RuleReasonCode.VALUE_NOT_ALLOWED,
      };
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

/**
 * Evaluate a strict allowed-value set against the existing Tema identity
 * result. Resolution remains owned by temaIdentity.js; this only validates
 * its resolved raw value without normalization.
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
      const allowed = allowedValues.some((allowedValue) =>
        Object.is(allowedValue, identity.resolvedValue));
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
