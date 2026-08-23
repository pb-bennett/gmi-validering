import {
  BindingState,
  EvaluationState,
  ObjectValueState,
  RuleReasonCode,
  TemaIdentityState,
} from './contracts.js';

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
