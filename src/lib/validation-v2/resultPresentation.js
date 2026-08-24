import { getFieldInformation } from './registry/fieldInformation.js';

export const ValidationV2AggregateStatus = Object.freeze({
  NOT_MET: 'NOT_MET',
  PARTIALLY_MET: 'PARTIALLY_MET',
  MET: 'MET',
});

export const ValidationV2StatusFilter = Object.freeze({
  ALL: 'ALL',
  ATTENTION: 'ATTENTION',
  NOT_MET: 'NOT_MET',
  PARTIALLY_MET: 'PARTIALLY_MET',
  MET: 'MET',
});

export const ValidationV2SortMode = Object.freeze({
  ATTENTION: 'ATTENTION',
  NAME_ASC: 'NAME_ASC',
  NAME_DESC: 'NAME_DESC',
  REGISTRY: 'REGISTRY',
});

const EMPTY_COUNTS = Object.freeze({
  evaluatedCount: 0,
  passCount: 0,
  failCount: 0,
  notEvaluatedCount: 0,
  indeterminateCount: 0,
});

const STATUS_DETAILS = Object.freeze({
  [ValidationV2AggregateStatus.NOT_MET]: Object.freeze({
    label: 'Ikke oppfylt',
    attentionRank: 0,
    visualToken: 'red',
    reasonCode: 'FAILURES_WITHOUT_PASS',
  }),
  [ValidationV2AggregateStatus.PARTIALLY_MET]: Object.freeze({
    label: 'Delvis oppfylt',
    attentionRank: 1,
    visualToken: 'amber',
    reasonCode: 'HAS_FAILURE_OR_INDETERMINATE',
  }),
  [ValidationV2AggregateStatus.MET]: Object.freeze({
    label: 'Oppfylt',
    attentionRank: 2,
    visualToken: 'green',
    reasonCode: 'ALL_APPLICABLE_PASS',
  }),
});

const STATUS_FILTER_LABELS = Object.freeze({
  [ValidationV2StatusFilter.ALL]: 'Alle',
  [ValidationV2StatusFilter.ATTENTION]: 'Krever oppmerksomhet',
  [ValidationV2StatusFilter.NOT_MET]: 'Ikke oppfylt',
  [ValidationV2StatusFilter.PARTIALLY_MET]: 'Delvis oppfylt',
  [ValidationV2StatusFilter.MET]: 'Oppfylt',
});

const SORT_MODE_LABELS = Object.freeze({
  [ValidationV2SortMode.ATTENTION]: 'Status – krever oppmerksomhet',
  [ValidationV2SortMode.NAME_ASC]: 'Navn A–Å',
  [ValidationV2SortMode.NAME_DESC]: 'Navn Å–A',
  [ValidationV2SortMode.REGISTRY]: 'Instruksrekkefølge',
});

const collator = new Intl.Collator('nb-NO', {
  sensitivity: 'base',
  numeric: true,
});

function getCount(counts, key) {
  const value = counts?.[key];
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

/**
 * Derive the user-facing state of one control without changing engine state.
 */
export function getValidationV2AggregateStatus(counts = EMPTY_COUNTS) {
  const passCount = getCount(counts, 'passCount');
  const failCount = getCount(counts, 'failCount');
  const indeterminateCount = getCount(counts, 'indeterminateCount');
  const applicableCount = passCount + failCount + indeterminateCount;

  let statusEnum;
  let reasonCode;
  if (failCount > 0 && passCount === 0) {
    statusEnum = ValidationV2AggregateStatus.NOT_MET;
    reasonCode = 'FAILURES_WITHOUT_PASS';
  } else if (failCount > 0 || indeterminateCount > 0) {
    statusEnum = ValidationV2AggregateStatus.PARTIALLY_MET;
    reasonCode = 'HAS_FAILURE_OR_INDETERMINATE';
  } else if (passCount > 0) {
    statusEnum = ValidationV2AggregateStatus.MET;
    reasonCode = 'ALL_APPLICABLE_PASS';
  } else {
    statusEnum = ValidationV2AggregateStatus.PARTIALLY_MET;
    reasonCode = applicableCount === 0
      ? 'NO_APPLICABLE_EVALUATIONS'
      : 'HAS_FAILURE_OR_INDETERMINATE';
  }

  return Object.freeze({
    enum: statusEnum,
    ...STATUS_DETAILS[statusEnum],
    reasonCode,
    applicableCount,
  });
}

export function getValidationV2StatusFilterLabel(filter) {
  return STATUS_FILTER_LABELS[filter] || STATUS_FILTER_LABELS[ValidationV2StatusFilter.ALL];
}

export function getValidationV2SortModeLabel(sortMode) {
  return SORT_MODE_LABELS[sortMode] || SORT_MODE_LABELS[ValidationV2SortMode.ATTENTION];
}

export function matchesValidationV2Status(status, filter = ValidationV2StatusFilter.ALL) {
  if (filter === ValidationV2StatusFilter.ALL) return true;
  if (filter === ValidationV2StatusFilter.ATTENTION) {
    return status.enum === ValidationV2AggregateStatus.NOT_MET ||
      status.enum === ValidationV2AggregateStatus.PARTIALLY_MET;
  }
  return status.enum === filter;
}

export function getValidationV2RulePresentation(ruleResult, geometryScope, registryIndex = 0) {
  const counts = ruleResult?.geometryBreakdown?.[geometryScope] || EMPTY_COUNTS;
  const fieldInformation = getFieldInformation(ruleResult?.rule?.canonicalFieldId);
  const displayName = fieldInformation?.displayName || ruleResult?.rule?.canonicalFieldId || 'Ukjent kontroll';
  const status = getValidationV2AggregateStatus(counts);
  return {
    ruleResult,
    rule: ruleResult?.rule,
    counts,
    displayName,
    status,
    registryIndex,
    expansionKey: `${geometryScope}:${ruleResult?.rule?.ruleId || registryIndex}`,
  };
}

export function getValidationV2RulePresentations(ruleResults = [], geometryScope) {
  return ruleResults.flatMap((ruleResult, index) => {
    const scopes = ruleResult?.rule?.geometryScopes;
    if (geometryScope && Array.isArray(scopes) && !scopes.includes(geometryScope)) {
      return [];
    }
    return [getValidationV2RulePresentation(ruleResult, geometryScope, index)];
  });
}

function matchesSearch(presentation, searchQuery) {
  const query = String(searchQuery || '').trim().toLocaleLowerCase('nb-NO');
  if (!query) return true;
  return presentation.displayName.toLocaleLowerCase('nb-NO').includes(query);
}

export function filterValidationV2RulePresentations(
  presentations,
  { searchQuery = '', statusFilter = ValidationV2StatusFilter.ALL } = {},
) {
  return presentations.filter((presentation) =>
    matchesSearch(presentation, searchQuery) &&
    matchesValidationV2Status(presentation.status, statusFilter)
  );
}

export function sortValidationV2RulePresentations(
  presentations,
  sortMode = ValidationV2SortMode.ATTENTION,
) {
  return [...presentations].sort((left, right) => {
    if (sortMode === ValidationV2SortMode.NAME_ASC || sortMode === ValidationV2SortMode.NAME_DESC) {
      const nameOrder = collator.compare(left.displayName, right.displayName);
      if (nameOrder !== 0) {
        return sortMode === ValidationV2SortMode.NAME_DESC ? -nameOrder : nameOrder;
      }
    } else if (sortMode === ValidationV2SortMode.ATTENTION) {
      const statusOrder = left.status.attentionRank - right.status.attentionRank;
      if (statusOrder !== 0) return statusOrder;
    }
    return left.registryIndex - right.registryIndex;
  });
}

export function getValidationV2PresentationRules(
  ruleResults,
  geometryScope,
  options = {},
) {
  return sortValidationV2RulePresentations(
    filterValidationV2RulePresentations(
      getValidationV2RulePresentations(ruleResults, geometryScope),
      options,
    ),
    options.sortMode,
  );
}

export function createValidationV2PresentationState() {
  return {
    searchQuery: '',
    statusFilter: ValidationV2StatusFilter.ALL,
    sortMode: ValidationV2SortMode.ATTENTION,
    expandedRuleKey: null,
  };
}

export function reduceValidationV2PresentationState(state, action) {
  switch (action.type) {
    case 'TOGGLE_RULE':
      return {
        ...state,
        expandedRuleKey: state.expandedRuleKey === action.expansionKey
          ? null
          : action.expansionKey,
      };
    case 'SET_SORT':
      return { ...state, sortMode: action.sortMode };
    case 'SET_SEARCH':
    case 'SET_STATUS_FILTER': {
      const next = {
        ...state,
        ...(action.type === 'SET_SEARCH'
          ? { searchQuery: action.searchQuery }
          : { statusFilter: action.statusFilter }),
      };
      return action.visibleExpansionKeys?.includes(state.expandedRuleKey)
        ? next
        : { ...next, expandedRuleKey: null };
    }
    case 'GEOMETRY_CHANGED':
    case 'LAYER_CHANGED':
    case 'NEW_RESULT':
      return {
        ...state,
        searchQuery: action.type === 'GEOMETRY_CHANGED' ? state.searchQuery : '',
        statusFilter: action.type === 'GEOMETRY_CHANGED'
          ? state.statusFilter
          : ValidationV2StatusFilter.ALL,
        expandedRuleKey: null,
      };
    case 'RESET_PRESENTATION':
      return {
        ...createValidationV2PresentationState(),
      };
    default:
      return state;
  }
}
