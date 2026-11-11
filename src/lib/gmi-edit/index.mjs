// Public API for source-preserving GMI editing. Pure library; no UI.
// M1 (source document, patch engine, verifier): see
// docs/agent-reports/*-gmi-edit-m1-source-patch-engine.md.
// M2 (ChangeSets, session state, proposed dataset, eligibility, diff): see
// docs/agent-reports/*-gmi-edit-m2-changesets-editing-state.md.
export {
  GMI_SOURCE_STATUS,
  MAX_GMI_EDIT_BYTES,
  computeGmiSourceFingerprint,
  createGmiSourceDocument,
  getGmiSourceBytes,
  getGmiSourceText,
  gmiObjectLexemes,
  gmiSourceIntact,
  isGmiSourceDocument,
  loadGmiSourceDocument,
} from './sourceDocument.mjs';
export { GMI_GEOMETRY_SCOPES } from './sourceIndex.mjs';
export {
  GMI_ENCODING_POLICIES,
  describeGmiBytes,
  validateGmiFieldLexeme,
} from './encoding.mjs';
export { gmiCellKey, listGmiObjectCells, resolveGmiCell } from './targets.mjs';
export { applyGmiPatches, editGmiFields, planGmiFieldPatches } from './patch.mjs';
export { verifyGmiEdit } from './verify.mjs';

// M2
export {
  GMI_CHANGE_SET_MODES,
  GMI_CONFLICT_POLICIES,
  GMI_SKIP_REASONS,
  isGmiChangeSet,
  isGmiFieldEditReservedColumn,
} from './changeSet.mjs';
export {
  canRedoGmiEdit,
  canUndoGmiEdit,
  compileGmiEffectiveEdits,
  createGmiBatchCorrection,
  createGmiEditSession,
  createGmiFieldChangeSet,
  createGmiObjectCorrection,
  discardAllGmiEdits,
  discardGmiChangeSet,
  getGmiEditCell,
  isGmiEditSession,
  listGmiEditCells,
  redoGmiEdit,
  stageGmiChangeSet,
  summarizeGmiEditSession,
  undoGmiEdit,
} from './session.mjs';
export {
  createGmiProposedCache,
  defaultGmiProposedCache,
  getGmiDocumentDataset,
  getGmiProposedBytes,
  getGmiProposedState,
  revalidateGmiEditSession,
  validateGmiDataset,
} from './proposed.mjs';
export { GMI_BATCH_ELIGIBILITY_RULES, evaluateGmiBatchEligibility } from './eligibility.mjs';
export { diffGmiDatasets } from './diff.mjs';
export { dryRunGmiChangeSet, isCurrentGmiDryRun } from './dryRun.mjs';

// M3 (editing-session registry and field-only export): see
// docs/agent-reports/*-gmi-edit-m3-session-lifecycle-export.md.
export { GMI_EDIT_LAYER_STATES, createGmiEditSessions } from './editSessions.mjs';
export {
  GMI_EXPORT_FAILURES,
  GMI_EXPORT_MIME_TYPE,
  buildGmiFieldExport,
  createGmiExportBlob,
  getGmiExportBytes,
  getGmiExportReadiness,
  gmiExportNames,
  isGmiFieldExport,
  recordGmiExportDownload,
} from './exportGmi.mjs';

// M7 (source-preserving S_HYPERLINK reference removal composer): see
// docs/agent-reports/*-gmi-edit-m7-hyperlink-removal.md.
export {
  GMI_HYPERLINK_FIELD,
  GMI_HYPERLINK_ORDINAL_POLICIES,
  GMI_HYPERLINK_REMOVAL_STATUS,
  applyGmiHyperlinkRemoval,
  gmiHyperlinkSelectionKey,
  isGmiHyperlinkRemovalPlan,
  planGmiHyperlinkRemoval,
  verifyGmiHyperlinkRemoval,
} from './hyperlinkRemoval.mjs';
