// Public M1 API for source-preserving GMI editing. Pure library; no UI.
// See docs/agent-reports/*-gmi-edit-m1-source-patch-engine.md.
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
