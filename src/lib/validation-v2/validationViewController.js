import {
  getDefaultValidationV2Geometry,
  getValidationV2GeometryView,
} from './uiIntegration.js';

/**
 * Keep V2 presentation selection and the completed run together without
 * allowing a geometry-tab change to call the validator.
 */
export function createValidationV2ViewController(runValidation) {
  let state = {
    geometryTab: 'point',
    result: null,
  };

  const snapshot = () => ({
    ...state,
    geometryView: state.result
      ? getValidationV2GeometryView(state.result, state.geometryTab)
      : null,
  });

  return {
    selectLayer(layer) {
      state = {
        geometryTab: getDefaultValidationV2Geometry(layer),
        result: null,
      };
      return snapshot();
    },
    run(input) {
      state = { ...state, result: runValidation(input) };
      return snapshot();
    },
    selectGeometry(geometryTab) {
      state = { ...state, geometryTab };
      return snapshot();
    },
    clearResult() {
      state = { ...state, result: null };
      return snapshot();
    },
  };
}
