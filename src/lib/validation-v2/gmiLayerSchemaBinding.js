import {
  AuthorityState,
  BindingState,
  Confidence,
  GeometryScope,
  GMI_SOURCE_FORMAT,
  MappingKind,
  SourceFieldDiagnosticKind,
  SourceKind,
} from './contracts.js';
import {
  getCanonicalFields,
} from './registry/registry.js';

const GEOMETRY_CONTEXTS = [
  {
    scope: GeometryScope.POINT,
    collectionKey: 'points',
    fieldAnalysisKey: 'points',
  },
  {
    scope: GeometryScope.LINE,
    collectionKey: 'lines',
    fieldAnalysisKey: 'lines',
  },
];

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

function assertValidInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('bindGmiLayerSchema requires an input object');
  }
  if (typeof input.layerId !== 'string' || input.layerId.trim().length === 0) {
    throw new TypeError('bindGmiLayerSchema requires a non-empty layerId');
  }
  if (!input.dataset || typeof input.dataset !== 'object' || Array.isArray(input.dataset)) {
    throw new TypeError('bindGmiLayerSchema requires a dataset object');
  }
  if (
    typeof input.datasetRevision !== 'string' ||
    input.datasetRevision.trim().length === 0
  ) {
    throw new TypeError('bindGmiLayerSchema requires a non-empty datasetRevision');
  }
  if (input.sourceFormat !== GMI_SOURCE_FORMAT) {
    throw new TypeError('bindGmiLayerSchema requires sourceFormat to be exactly gmi');
  }
}

function normalizeForComparison(value) {
  return value.normalize('NFC');
}

function isCaseOnlyMatch(sourceKey, targetKey) {
  const sourceNfc = normalizeForComparison(sourceKey);
  const targetNfc = normalizeForComparison(targetKey);

  if (sourceKey === targetKey) {
    return false;
  }
  if (Array.from(sourceNfc).length !== Array.from(targetNfc).length) {
    return false;
  }
  return sourceNfc.toUpperCase() === targetNfc.toUpperCase();
}

function getAcceptedMatch(field, sourceKey) {
  if (sourceKey === field.directGmiSourceKey) {
    return {
      sourceKey,
      mappingKind: MappingKind.DIRECT,
      rank: 0,
    };
  }
  if (isCaseOnlyMatch(sourceKey, field.directGmiSourceKey)) {
    return {
      sourceKey,
      mappingKind: MappingKind.CASE_NORMALIZED,
      rank: 1,
    };
  }

  const exactFallback = field.acceptedFallbackKeys.find(
    (fallbackKey) => sourceKey === fallbackKey
  );
  if (exactFallback) {
    return {
      sourceKey,
      mappingKind: MappingKind.ACCEPTED_FALLBACK,
      rank: 2,
    };
  }

  const caseFallback = field.acceptedFallbackKeys.find((fallbackKey) =>
    isCaseOnlyMatch(sourceKey, fallbackKey)
  );
  if (caseFallback) {
    return {
      sourceKey,
      mappingKind: MappingKind.ACCEPTED_FALLBACK,
      rank: 3,
    };
  }
  return null;
}

function getUnsupportedMatch(field, sourceKey) {
  if (field.recognizedUnresolvedKeys.includes(sourceKey)) {
    return {
      sourceKey,
      classification: SourceFieldDiagnosticKind.RECOGNIZED_UNRESOLVED,
      validationAuthoritative: null,
      authorityState: AuthorityState.UNRESOLVED,
    };
  }
  if (field.disabledLegacyAliases.includes(sourceKey)) {
    return {
      sourceKey,
      classification: SourceFieldDiagnosticKind.DISABLED_UNSUPPORTED,
      validationAuthoritative: false,
      authorityState: AuthorityState.NON_AUTHORITATIVE,
    };
  }
  return null;
}

function getSchemaKeys(dataset, context) {
  const fieldAnalysis = dataset.fieldAnalysis;
  if (
    fieldAnalysis &&
    typeof fieldAnalysis === 'object' &&
    !Array.isArray(fieldAnalysis) &&
    Object.prototype.hasOwnProperty.call(fieldAnalysis, context.fieldAnalysisKey)
  ) {
    const explicitSchema = fieldAnalysis[context.fieldAnalysisKey];
    if (
      explicitSchema &&
      typeof explicitSchema === 'object' &&
      !Array.isArray(explicitSchema)
    ) {
      return {
        schemaSource: 'FIELD_ANALYSIS',
        schemaKeys: Object.keys(explicitSchema).sort(),
      };
    }
  }

  const features = dataset[context.collectionKey];
  if (!Array.isArray(features) || features.length === 0) {
    return {
      schemaSource: 'SCHEMA_UNAVAILABLE',
      schemaKeys: [],
    };
  }

  const schemaKeys = new Set();
  let hasAttributeSchema = false;
  for (const feature of features) {
    if (!feature || typeof feature !== 'object') {
      continue;
    }
    const attributes = feature.attributes;
    if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
      continue;
    }
    hasAttributeSchema = true;
    for (const key of Object.keys(attributes)) {
      schemaKeys.add(key);
    }
  }

  if (!hasAttributeSchema) {
    return {
      schemaSource: 'SCHEMA_UNAVAILABLE',
      schemaKeys: [],
    };
  }
  return {
    schemaSource: 'FEATURE_ATTRIBUTES',
    schemaKeys: [...schemaKeys].sort(),
  };
}

function candidateFromAcceptedMatch(field, match) {
  return {
    canonicalFieldId: field.canonicalFieldId,
    sourceKey: match.sourceKey,
    mappingKind: match.mappingKind,
    sourceKind: SourceKind.DELIVERED_GMI_PROPERTY,
    validationAuthoritative: true,
    authorityState: AuthorityState.AUTHORITATIVE,
    confidence: field.mappingEvidenceConfidence,
  };
}

function candidateFromUnsupportedMatch(field, match) {
  return {
    canonicalFieldId: field.canonicalFieldId,
    sourceKey: match.sourceKey,
    mappingKind: MappingKind.UNSUPPORTED_CANDIDATE,
    sourceKind: SourceKind.DELIVERED_GMI_PROPERTY,
    validationAuthoritative: match.validationAuthoritative,
    authorityState: match.authorityState,
    confidence: field.mappingEvidenceConfidence,
  };
}

function resolveAcceptedSourceKeys(fields, schemaKeys) {
  const acceptedFieldBySourceKey = new Map();
  const ambiguousTargetsBySourceKey = new Map();
  for (const sourceKey of schemaKeys) {
    const matches = fields
      .map((field) => {
        const match = getAcceptedMatch(field, sourceKey);
        return match ? { field, match } : null;
      })
      .filter(Boolean);
    if (matches.length < 2) {
      if (matches.length === 1) {
        acceptedFieldBySourceKey.set(
          sourceKey,
          matches[0].field.canonicalFieldId
        );
      }
      continue;
    }
    const bestRank = Math.min(...matches.map(({ match }) => match.rank));
    const bestMatches = matches.filter(({ match }) => match.rank === bestRank);
    if (bestMatches.length > 1) {
      ambiguousTargetsBySourceKey.set(
        sourceKey,
        bestMatches.map(({ field }) => field.canonicalFieldId)
      );
    } else {
      acceptedFieldBySourceKey.set(
        sourceKey,
        bestMatches[0].field.canonicalFieldId
      );
    }
  }
  return { acceptedFieldBySourceKey, ambiguousTargetsBySourceKey };
}

function createBinding({
  field,
  layerId,
  datasetRevision,
  geometryScope,
  schemaAvailable,
  schemaKeys,
  acceptedFieldBySourceKey,
  ambiguousTargetsBySourceKey,
}) {
  const accepted = [];
  const unsupported = [];
  const conflicts = [];

  for (const sourceKey of schemaKeys) {
    const acceptedMatch = getAcceptedMatch(field, sourceKey);
    const ambiguousTargets = ambiguousTargetsBySourceKey.get(sourceKey);
    if (
      acceptedMatch &&
      (ambiguousTargets || acceptedFieldBySourceKey.get(sourceKey) === field.canonicalFieldId)
    ) {
      accepted.push({ field, match: acceptedMatch });
    }
    const unsupportedMatch = getUnsupportedMatch(field, sourceKey);
    if (unsupportedMatch) {
      unsupported.push(candidateFromUnsupportedMatch(field, unsupportedMatch));
    }
  }

  const sortedAccepted = accepted
    .filter(({ match }) => !ambiguousTargetsBySourceKey.has(match.sourceKey))
    .sort((left, right) => {
      if (left.match.rank !== right.match.rank) {
        return left.match.rank - right.match.rank;
      }
      return left.match.sourceKey < right.match.sourceKey ? -1 :
        left.match.sourceKey > right.match.sourceKey ? 1 : 0;
    });
  const acceptedCandidates = sortedAccepted.map(({ field: matchedField, match }) =>
    candidateFromAcceptedMatch(matchedField, match)
  );
  const ambiguousCandidates = accepted
    .filter(({ match }) => ambiguousTargetsBySourceKey.has(match.sourceKey))
    .map(({ field: matchedField, match }) => candidateFromAcceptedMatch(matchedField, match));
  if (ambiguousCandidates.length > 0) {
    const canonicalFieldIds = [...new Set(
      ambiguousCandidates.flatMap((candidate) =>
        ambiguousTargetsBySourceKey.get(candidate.sourceKey)
      )
    )];
    conflicts.push({
      sourceKeys: [...new Set(ambiguousCandidates.map((candidate) => candidate.sourceKey))],
      canonicalFieldIds,
    });
  }

  const candidates = [...acceptedCandidates, ...ambiguousCandidates, ...unsupported];
  let state = BindingState.FIELD_ABSENT;
  if (!schemaAvailable) {
    state = BindingState.SCHEMA_UNAVAILABLE;
  } else if (ambiguousCandidates.length > 0) {
    state = BindingState.AMBIGUOUS;
  } else if (acceptedCandidates.length > 1) {
    state = BindingState.MULTIPLE_ACCEPTED;
  } else if (acceptedCandidates.length === 1) {
    state = BindingState.BOUND;
  } else if (unsupported.length > 0) {
    state = BindingState.UNRESOLVED_SOURCE;
  }

  const preferred = acceptedCandidates[0];
  const unsupportedAuthority = unsupported.length === 1
    ? unsupported[0]
    : null;
  return {
    layerId,
    datasetRevision,
    sourceFormat: GMI_SOURCE_FORMAT,
    geometryScope,
    canonicalFieldId: field.canonicalFieldId,
    state,
    preferredSourceKey: preferred?.sourceKey ?? null,
    mappingKind: preferred?.mappingKind ?? null,
    sourceKind: SourceKind.DELIVERED_GMI_PROPERTY,
    validationAuthoritative: preferred?.validationAuthoritative ??
      unsupportedAuthority?.validationAuthoritative ?? null,
    authorityState: preferred?.authorityState ??
      unsupportedAuthority?.authorityState ?? AuthorityState.UNRESOLVED,
    confidence: field.mappingEvidenceConfidence || Confidence.LOW,
    candidates,
    conflicts,
  };
}

function createSourceFieldDiagnostics({
  fields,
  schemaKeys,
  geometryScope,
  layerId,
  datasetRevision,
}) {
  return schemaKeys.map((sourceKey) => {
    // Accepted evidence wins globally, even when another canonical field lists
    // the same literal as disabled or unresolved metadata.
    const acceptedMatch = fields.some((field) => getAcceptedMatch(field, sourceKey));
    if (acceptedMatch) {
      return null;
    }

    const unsupportedMatches = fields
      .map((field) => {
        const match = getUnsupportedMatch(field, sourceKey);
        return match ? { field, match } : null;
      })
      .filter(Boolean);

    if (unsupportedMatches.length === 0) {
      return {
        layerId,
        datasetRevision,
        geometryScope,
        sourceKey,
        classification: SourceFieldDiagnosticKind.UNKNOWN_SOURCE_FIELD,
        canonicalFieldId: null,
        possibleCanonicalFieldIds: [],
        mappingKind: null,
        sourceKind: SourceKind.DELIVERED_GMI_PROPERTY,
        validationAuthoritative: null,
        authorityState: AuthorityState.UNRESOLVED,
        confidence: Confidence.LOW,
      };
    }

    const recognized = unsupportedMatches.some(({ match }) =>
      match.classification === SourceFieldDiagnosticKind.RECOGNIZED_UNRESOLVED
    );
    const canonicalFieldIds = [...new Set(
      unsupportedMatches.map(({ field }) => field.canonicalFieldId)
    )];
    const firstMatch = unsupportedMatches[0].match;
    return {
      layerId,
      datasetRevision,
      geometryScope,
      sourceKey,
      classification: recognized
        ? SourceFieldDiagnosticKind.RECOGNIZED_UNRESOLVED
        : SourceFieldDiagnosticKind.DISABLED_UNSUPPORTED,
      canonicalFieldId: canonicalFieldIds.length === 1 ? canonicalFieldIds[0] : null,
      possibleCanonicalFieldIds: canonicalFieldIds,
      mappingKind: MappingKind.UNSUPPORTED_CANDIDATE,
      sourceKind: SourceKind.DELIVERED_GMI_PROPERTY,
      validationAuthoritative: recognized ? null : false,
      authorityState: recognized
        ? AuthorityState.UNRESOLVED
        : firstMatch.authorityState,
      confidence: unsupportedMatches[0].field.mappingEvidenceConfidence,
    };
  }).filter(Boolean);
}

function bindGeometryContext({
  fields,
  input,
  context,
}) {
  const schema = getSchemaKeys(input.dataset, context);
  const schemaAvailable = schema.schemaSource !== 'SCHEMA_UNAVAILABLE';
  const acceptedResolution = resolveAcceptedSourceKeys(fields, schema.schemaKeys);
  return {
    context: {
      geometryScope: context.scope,
      schemaSource: schema.schemaSource,
      schemaKeys: schema.schemaKeys,
    },
    bindings: fields.map((field) => createBinding({
      field,
      layerId: input.layerId,
      datasetRevision: input.datasetRevision,
      geometryScope: context.scope,
      schemaAvailable,
      schemaKeys: schema.schemaKeys,
      ...acceptedResolution,
    })),
    sourceFieldDiagnostics: createSourceFieldDiagnostics({
      fields,
      schemaKeys: schema.schemaKeys,
      geometryScope: context.scope,
      layerId: input.layerId,
      datasetRevision: input.datasetRevision,
    }),
  };
}

/**
 * Internal registry-parameterized entry point used to test future registry
 * collision handling. It is intentionally not exported through index.js.
 *
 * @param {import('./contracts.js').GmiLayerAdapterInput} input
 * @param {Array<Object>} fields
 * @returns {import('./contracts.js').GmiLayerSchemaBindingResult}
 * @internal
 */
export function bindGmiLayerSchemaWithRegistry(input, fields) {
  assertValidInput(input);
  const contexts = GEOMETRY_CONTEXTS.map((context) =>
    bindGeometryContext({ fields, input, context })
  );

  return deepFreeze({
    layerId: input.layerId,
    datasetRevision: input.datasetRevision,
    sourceFormat: GMI_SOURCE_FORMAT,
    geometryContexts: {
      point: contexts[0].context,
      line: contexts[1].context,
    },
    bindings: contexts.flatMap(({ bindings }) => bindings),
    sourceFieldDiagnostics: contexts.flatMap(({ sourceFieldDiagnostics }) =>
      sourceFieldDiagnostics
    ),
  });
}

/**
 * Bind one selected dataset against the frozen A0 canonical registry.
 *
 * @param {import('./contracts.js').GmiLayerAdapterInput} input
 * @returns {import('./contracts.js').GmiLayerSchemaBindingResult}
 */
export function bindGmiLayerSchema(input) {
  return bindGmiLayerSchemaWithRegistry(input, getCanonicalFields());
}
