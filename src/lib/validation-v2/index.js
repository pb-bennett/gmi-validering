export {
  AuthorityState,
  BindingState,
  CaseNormalizationPolicy,
  Confidence,
  GeometryScope,
  GMI_SOURCE_FORMAT,
  MappingKind,
  ObjectValueState,
  SourceKind,
  SourceFieldDiagnosticKind,
  TemaIdentityState,
} from './contracts.js';
export { bindGmiLayerSchema } from './gmiLayerSchemaBinding.js';
export {
  getCanonicalField,
  getCanonicalFieldByDirectSourceKey,
  getCanonicalFields,
  hasCanonicalField,
  validateCanonicalRegistry,
} from './registry/registry.js';
