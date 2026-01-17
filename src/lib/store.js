import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { detectOutliers } from './analysis/outliers';

/**
 * GMI Validator — Global State Store (Zustand)
 *
 * This store manages all application state for GMI file validation:
 * - File metadata (NOT raw file contents — keep those in-memory/ephemeral)
 * - Parsing progress and status
 * - Validation results (errors, warnings, records)
 * - UI state (modals, selected items, filters)
 * - User settings and preferences
 *
 * Design principles:
 * - Keep raw file binary OUT of the store (use refs or worker scope)
 * - Use selective subscriptions in components for performance
 * - All user-facing messages/strings must be Norwegian (bokmål)
 * - State is ephemeral by default (no persistence except settings)
 */

const useStore = create(
  devtools(
    persist(
      (set, get) => ({
        // NOTE: These "initial" objects are used for full resets.
        // Keep them in sync with the defaults in each slice.
        _initial: {
          parsing: {
            status: 'idle',
            progress: 0,
            error: null,
            startedAt: null,
            completedAt: null,
          },
          validation: {
            records: [],
            summary: {
              totalRecords: 0,
              errorCount: 0,
              warningCount: 0,
              validCount: 0,
            },
            errors: [],
            warnings: [],
            fieldStats: {},
          },
          analysis: {
            results: [],
            isOpen: false,
            selectedPipeIndex: null,
            hoveredPointIndex: null,
            hoveredSegment: null,
          },
          outliers: {
            results: null,
            hideOutliers: false,
          },
          ui: {
            detailsPanelOpen: false,
            selectedRecordId: null,
            filterSeverity: 'all',
            mapViewOpen: false,
            sidebarOpen: true,
            highlightedCode: null,
            hiddenCodes: [],
            highlightedType: null,
            highlightedTypeContext: null,
            hiddenTypes: [],
            dataTableOpen: false,
            highlightedFeatureId: null,
            fieldValidationOpen: false,
            missingReportOpen: false,
            filteredFeatureIds: null,
            viewer3DOpen: true,
            activeViewTab: 'map',
            selectedObject3D: null,
            mapCenterTarget: null,
            measureMode: false,
            measurePoints: [],
            feltFilterActive: false,
            feltHiddenValues: [],
            feltSearchText: '',
            outlierPromptOpen: false,
            missingHeightPromptOpen: false,
            missingHeightDetailsOpen: false,
            missingHeightLines: [],
          },
        },

        // ============================================
        // FILE SLICE — metadata about uploaded file
        // ============================================
        file: null, // { name: string, size: number, lastModified: number, type: string } | null

        setFile: (fileMeta) =>
          set({ file: fileMeta }, false, 'file/set'),

        clearFile: () => set({ file: null }, false, 'file/clear'),

        // ============================================
        // DATA SLICE — raw parsed data
        // ============================================
        data: null, // { header: {}, points: [], lines: [] } | null

        setData: (data) =>
          set(
            (state) => {
              const isKof = data?.format === 'KOF';
              const outlierResults = isKof
                ? {
                    outliers: [],
                    summary: {
                      totalObjects: 0,
                      outlierCount: 0,
                      threshold: 6,
                    },
                  }
                : detectOutliers(data, 6);
              const hasOutliers =
                !isKof &&
                !!outlierResults &&
                Array.isArray(outlierResults.outliers) &&
                outlierResults.outliers.length > 0;

              // Detect missing height (Z) for any line that has at least one coordinate without a valid z.
              const missingHeightLines = [];
              const lines = Array.isArray(data?.lines)
                ? data.lines
                : [];
              lines.forEach((line, index) => {
                const coords = Array.isArray(line?.coordinates)
                  ? line.coordinates
                  : [];
                if (coords.length === 0) return;

                const hasMissingZ = coords.some((c) => {
                  const z = c?.z;
                  if (z === null || z === undefined) return true;
                  const num = typeof z === 'number' ? z : Number(z);
                  return !Number.isFinite(num);
                });

                if (!hasMissingZ) return;

                const attrs = line?.attributes || {};
                missingHeightLines.push({
                  index,
                  fcode:
                    attrs.S_FCODE ||
                    attrs.Tema ||
                    attrs.FCODE ||
                    null,
                  type:
                    attrs.objekttypenavn ||
                    attrs.OBJEKTTYPENAVN ||
                    attrs.Type ||
                    null,
                });
              });
              const hasMissingHeights = missingHeightLines.length > 0;

              const initial = get()._initial;

              return {
                data,
                outliers: {
                  results: outlierResults,
                  hideOutliers: false,
                },
                // Reset transient UI + analysis when new data is loaded
                analysis: { ...initial.analysis },
                ui: {
                  ...initial.ui,
                  // Keep sidebar open by default
                  sidebarOpen: true,
                  outlierPromptOpen: hasOutliers,
                  missingHeightPromptOpen: hasMissingHeights,
                  missingHeightDetailsOpen: false,
                  missingHeightLines,
                },
              };
            },
            false,
            'data/set'
          ),
        clearData: () =>
          set(
            {
              data: null,
              analysis: {
                results: [],
                isOpen: false,
                selectedPipeIndex: null,
              },
            },
            false,
            'data/clear'
          ),

        // ============================================
        // PARSING SLICE — parsing status & progress
        // ============================================
        parsing: {
          status: 'idle', // 'idle' | 'parsing' | 'done' | 'error'
          progress: 0, // 0-100
          error: null, // string | null
          startedAt: null, // timestamp | null
          completedAt: null, // timestamp | null
        },

        startParsing: () =>
          set(
            (state) => ({
              parsing: {
                ...state.parsing,
                status: 'parsing',
                progress: 0,
                error: null,
                startedAt: Date.now(),
                completedAt: null,
              },
            }),
            false,
            'parsing/start'
          ),

        setParsingProgress: (progress) =>
          set(
            (state) => ({
              parsing: { ...state.parsing, progress },
            }),
            false,
            'parsing/progress'
          ),

        setParsingDone: () =>
          set(
            (state) => ({
              parsing: {
                ...state.parsing,
                status: 'done',
                progress: 100,
                completedAt: Date.now(),
              },
            }),
            false,
            'parsing/done'
          ),

        setParsingError: (error) =>
          set(
            (state) => ({
              parsing: {
                ...state.parsing,
                status: 'error',
                error,
                completedAt: Date.now(),
              },
            }),
            false,
            'parsing/error'
          ),

        resetParsing: () =>
          set(
            {
              parsing: {
                status: 'idle',
                progress: 0,
                error: null,
                startedAt: null,
                completedAt: null,
              },
            },
            false,
            'parsing/reset'
          ),

        // ============================================
        // VALIDATION SLICE — validation results
        // ============================================
        validation: {
          records: [], // Array of parsed GMI records
          summary: {
            totalRecords: 0,
            errorCount: 0,
            warningCount: 0,
            validCount: 0,
          },
          errors: [], // Array of { line, field, message, severity }
          warnings: [],
          fieldStats: {}, // Optional: field presence/quality stats
        },

        setValidationResults: (results) =>
          set(
            { validation: results },
            false,
            'validation/setResults'
          ),

        clearValidationResults: () =>
          set(
            {
              validation: {
                records: [],
                summary: {
                  totalRecords: 0,
                  errorCount: 0,
                  warningCount: 0,
                  validCount: 0,
                },
                errors: [],
                warnings: [],
                fieldStats: {},
              },
            },
            false,
            'validation/clear'
          ),

        // ============================================
        // ANALYSIS SLICE — pipe incline analysis
        // ============================================
        analysis: {
          results: [],
          isOpen: false,
          selectedPipeIndex: null,
          hoveredPointIndex: null,
          hoveredSegment: null, // { p1: number, p2: number } | null
        },

        setAnalysisResults: (results) =>
          set(
            (state) => ({
              analysis: { ...state.analysis, results },
            }),
            false,
            'analysis/setResults'
          ),

        toggleAnalysisModal: (isOpen) =>
          set(
            (state) => {
              const newIsOpen =
                isOpen !== undefined
                  ? isOpen
                  : !state.analysis.isOpen;
              return {
                analysis: {
                  ...state.analysis,
                  isOpen: newIsOpen,
                },
                // Clear highlighted feature when closing analysis
                ui: !newIsOpen
                  ? { ...state.ui, highlightedFeatureId: null }
                  : state.ui,
              };
            },
            false,
            'analysis/toggleModal'
          ),

        selectAnalysisPipe: (index) =>
          set(
            (state) => ({
              analysis: {
                ...state.analysis,
                selectedPipeIndex: index,
              },
              // Also highlight on map - prefix with 'ledninger-' to match MapInner ID format
              ui: {
                ...state.ui,
                highlightedFeatureId: `ledninger-${index}`,
              },
            }),
            false,
            'analysis/selectPipe'
          ),

        setHoveredAnalysisPoint: (pointIndex) =>
          set(
            (state) => ({
              analysis: {
                ...state.analysis,
                hoveredPointIndex: pointIndex,
              },
            }),
            false,
            'analysis/setHoveredPoint'
          ),

        setHoveredAnalysisSegment: (segment) =>
          set(
            (state) => ({
              analysis: {
                ...state.analysis,
                hoveredSegment: segment,
              },
            }),
            false,
            'analysis/setHoveredSegment'
          ),

        // ============================================
        // OUTLIER SLICE — outlier detection results
        // ============================================
        outliers: {
          results: null, // { outliers: [], centroid: {}, summary: {} } | null
          hideOutliers: false, // Whether to filter out outliers from view
        },

        setOutlierResults: (results) =>
          set(
            (state) => ({
              outliers: {
                ...state.outliers,
                results,
              },
            }),
            false,
            'outliers/setResults'
          ),

        toggleHideOutliers: (hide) =>
          set(
            (state) => ({
              outliers: {
                ...state.outliers,
                hideOutliers:
                  hide !== undefined
                    ? hide
                    : !state.outliers.hideOutliers,
              },
            }),
            false,
            'outliers/toggleHide'
          ),

        clearOutliers: () =>
          set(
            {
              outliers: {
                results: null,
                hideOutliers: false,
              },
            },
            false,
            'outliers/clear'
          ),

        // ============================================
        // UI SLICE — UI state and user interactions
        // ============================================
        ui: {
          detailsPanelOpen: false,
          selectedRecordId: null,
          filterSeverity: 'all', // 'all' | 'errors' | 'warnings'
          mapViewOpen: false,
          sidebarOpen: true,
          highlightedCode: null,
          hiddenCodes: [],
          highlightedType: null,
          highlightedTypeContext: null, // Track which code the type is under
          hiddenTypes: [], // Array of {type, code} objects for context-aware hiding
          dataTableOpen: false, // Data table visibility
          highlightedFeatureId: null, // ID of feature to highlight on map
          fieldValidationOpen: false, // Field validation sidebar visibility
          missingReportOpen: false, // Missing fields report modal visibility
          filteredFeatureIds: null, // Set<string> | null - IDs of features to exclusively show
          viewer3DOpen: true, // 3D visualization viewer visibility - always open
          activeViewTab: 'map', // 'map' | '3d' - Current active view tab (default to 2D map)
          selectedObject3D: null, // Currently selected 3D object { type, index, data }
          mapCenterTarget: null, // { coordinates, zoom, featureId } - Target for map centering
          measureMode: false, // Whether the measure tool is active
          measurePoints: [], // Array of {lat, lng} points for measuring
          feltFilterActive: false, // Whether Felt filtering overrides Tema
          feltHiddenValues: [], // Array of {fieldName, value, objectType} - 'points' or 'lines'
          feltSearchText: '', // Search text for Felt filtering
          outlierPromptOpen: false, // Ask user whether to ignore outliers on load
          missingHeightPromptOpen: false, // Warn if one or more lines are missing Z
          missingHeightDetailsOpen: false, // Details popup listing lines missing Z
          missingHeightLines: [], // Array<{index:number, fcode:string|null, type:string|null}>
        },

        setOutlierPromptOpen: (isOpen) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                outlierPromptOpen:
                  isOpen !== undefined
                    ? isOpen
                    : !state.ui.outlierPromptOpen,
              },
            }),
            false,
            'ui/setOutlierPromptOpen'
          ),

        setMissingHeightPromptOpen: (isOpen) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                missingHeightPromptOpen:
                  isOpen !== undefined
                    ? isOpen
                    : !state.ui.missingHeightPromptOpen,
              },
            }),
            false,
            'ui/setMissingHeightPromptOpen'
          ),

        setMissingHeightDetailsOpen: (isOpen) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                missingHeightDetailsOpen:
                  isOpen !== undefined
                    ? isOpen
                    : !state.ui.missingHeightDetailsOpen,
              },
            }),
            false,
            'ui/setMissingHeightDetailsOpen'
          ),

        // Measure tool actions
        toggleMeasureMode: (isActive) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                measureMode:
                  isActive !== undefined
                    ? isActive
                    : !state.ui.measureMode,
                measurePoints:
                  isActive === false ? [] : state.ui.measurePoints,
              },
            }),
            false,
            'ui/toggleMeasureMode'
          ),

        addMeasurePoint: (point) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                measurePoints: [...state.ui.measurePoints, point],
              },
            }),
            false,
            'ui/addMeasurePoint'
          ),

        clearMeasurePoints: () =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                measurePoints: [],
              },
            }),
            false,
            'ui/clearMeasurePoints'
          ),

        // Felt filter actions
        setFeltFilterActive: (active) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                feltFilterActive: active,
              },
            }),
            false,
            'ui/setFeltFilterActive'
          ),

        toggleFeltHiddenValue: (fieldName, value, objectType) =>
          set(
            (state) => {
              const current = state.ui.feltHiddenValues;
              const existingIndex = current.findIndex(
                (item) =>
                  item.fieldName === fieldName &&
                  item.value === value &&
                  item.objectType === objectType
              );
              const newHidden =
                existingIndex >= 0
                  ? current.filter((_, i) => i !== existingIndex)
                  : [...current, { fieldName, value, objectType }];
              return {
                ui: { ...state.ui, feltHiddenValues: newHidden },
              };
            },
            false,
            'ui/toggleFeltHiddenValue'
          ),

        setFeltSearchText: (text) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                feltSearchText: text,
              },
            }),
            false,
            'ui/setFeltSearchText'
          ),

        clearFeltFilter: () =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                feltFilterActive: false,
                feltHiddenValues: [],
                feltSearchText: '',
              },
            }),
            false,
            'ui/clearFeltFilter'
          ),

        setFilteredFeatureIds: (ids) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                filteredFeatureIds: ids,
              },
            }),
            false,
            'ui/setFilteredFeatureIds'
          ),

        toggleMissingReport: (isOpen) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                missingReportOpen:
                  isOpen !== undefined
                    ? isOpen
                    : !state.ui.missingReportOpen,
              },
            }),
            false,
            'ui/toggleMissingReport'
          ),

        toggleFieldValidation: (isOpen) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                fieldValidationOpen:
                  isOpen !== undefined
                    ? isOpen
                    : !state.ui.fieldValidationOpen,
              },
            }),
            false,
            'ui/toggleFieldValidation'
          ),

        toggle3DViewer: (isOpen) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                viewer3DOpen:
                  isOpen !== undefined
                    ? isOpen
                    : !state.ui.viewer3DOpen,
                // When opening 3D viewer, switch to 3D tab
                activeViewTab: isOpen ? '3d' : state.ui.activeViewTab,
              },
            }),
            false,
            'ui/toggle3DViewer'
          ),

        setActiveViewTab: (tab) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                activeViewTab: tab,
              },
            }),
            false,
            'ui/setActiveViewTab'
          ),

        setSelected3DObject: (objectData) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                selectedObject3D: objectData,
              },
            }),
            false,
            'ui/setSelected3DObject'
          ),

        viewObjectInMap: (
          featureId,
          coordinates,
          zoom = 18,
          options = {}
        ) =>
          set(
            (state) => {
              const newState = {
                ui: {
                  ...state.ui,
                  activeViewTab: 'map',
                  highlightedFeatureId: featureId,
                  mapCenterTarget: { coordinates, zoom, featureId },
                },
              };

              // If this is a pipe and profilanalyse is open, also select it in analysis
              if (
                options.objectType === 'pipe' &&
                options.lineIndex !== undefined &&
                state.analysis.isOpen
              ) {
                newState.analysis = {
                  ...state.analysis,
                  selectedPipeIndex: options.lineIndex,
                };
              }

              return newState;
            },
            false,
            'ui/viewObjectInMap'
          ),

        clearMapCenterTarget: () =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                mapCenterTarget: null,
              },
            }),
            false,
            'ui/clearMapCenterTarget'
          ),

        setHighlightedCode: (code) =>
          set(
            (state) => ({
              ui: { ...state.ui, highlightedCode: code },
            }),
            false,
            'ui/setHighlightedCode'
          ),

        setHighlightedType: (typeVal, codeContext = null) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                highlightedType: typeVal,
                highlightedTypeContext: codeContext,
              },
            }),
            false,
            'ui/setHighlightedType'
          ),

        toggleHiddenCode: (code) =>
          set(
            (state) => {
              const currentHidden = state.ui.hiddenCodes;
              const newHidden = currentHidden.includes(code)
                ? currentHidden.filter((c) => c !== code)
                : [...currentHidden, code];
              return {
                ui: { ...state.ui, hiddenCodes: newHidden },
              };
            },
            false,
            'ui/toggleHiddenCode'
          ),

        toggleHiddenType: (typeVal, codeContext = null) =>
          set(
            (state) => {
              const currentHidden = state.ui.hiddenTypes;
              // Find if this type+code combination exists
              const existingIndex = currentHidden.findIndex(
                (ht) => ht.type === typeVal && ht.code === codeContext
              );
              const newHidden =
                existingIndex >= 0
                  ? currentHidden.filter(
                      (_, i) => i !== existingIndex
                    )
                  : [
                      ...currentHidden,
                      { type: typeVal, code: codeContext },
                    ];
              return {
                ui: { ...state.ui, hiddenTypes: newHidden },
              };
            },
            false,
            'ui/toggleHiddenType'
          ),

        toggleDataTable: () =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                dataTableOpen: !state.ui.dataTableOpen,
              },
            }),
            false,
            'ui/toggleDataTable'
          ),

        setHighlightedFeature: (featureId) =>
          set(
            (state) => ({
              ui: { ...state.ui, highlightedFeatureId: featureId },
            }),
            false,
            'ui/setHighlightedFeature'
          ),

        toggleDetailsPanel: () =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                detailsPanelOpen: !state.ui.detailsPanelOpen,
              },
            }),
            false,
            'ui/toggleDetails'
          ),

        selectRecord: (recordId) =>
          set(
            (state) => ({
              ui: { ...state.ui, selectedRecordId: recordId },
            }),
            false,
            'ui/selectRecord'
          ),

        setFilterSeverity: (severity) =>
          set(
            (state) => ({
              ui: { ...state.ui, filterSeverity: severity },
            }),
            false,
            'ui/setFilter'
          ),

        toggleMapView: () =>
          set(
            (state) => ({
              ui: { ...state.ui, mapViewOpen: !state.ui.mapViewOpen },
            }),
            false,
            'ui/toggleMap'
          ),

        toggleSidebar: () =>
          set(
            (state) => ({
              ui: { ...state.ui, sidebarOpen: !state.ui.sidebarOpen },
            }),
            false,
            'ui/toggleSidebar'
          ),

        // ============================================
        // SETTINGS SLICE — user preferences (optional persistence)
        // ============================================
        settings: {
          theme: 'light', // 'light' | 'dark' (future)
          locale: 'nb-NO', // Norwegian bokmål
          autoValidateOnUpload: true,
          showWarnings: true,
          lastFileName: null,
          inclineRequirementMode: 'fixed10', // 'fixed10' | 'variable'
        },

        updateSettings: (newSettings) =>
          set(
            (state) => ({
              settings: { ...state.settings, ...newSettings },
            }),
            false,
            'settings/update'
          ),

        // ============================================
        // GLOBAL ACTIONS — cross-slice operations
        // ============================================
        resetAll: () =>
          set(
            (state) => {
              const initial = get()._initial;
              return {
                file: null,
                data: null,
                parsing: { ...initial.parsing },
                validation: { ...initial.validation },
                analysis: { ...initial.analysis },
                outliers: { ...initial.outliers },
                ui: { ...initial.ui },
                // Keep settings as-is
                settings: state.settings,
              };
            },
            false,
            'global/resetAll'
          ),

        // ============================================
        // SELECTORS (computed/derived values)
        // ============================================
        // Access via: const filteredErrors = useStore(state => state.getFilteredErrors())
        getFilteredErrors: () => {
          const { validation, ui } = get();
          if (ui.filterSeverity === 'all') {
            return [...validation.errors, ...validation.warnings];
          }
          if (ui.filterSeverity === 'errors') {
            return validation.errors;
          }
          if (ui.filterSeverity === 'warnings') {
            return validation.warnings;
          }
          return [];
        },

        isProcessing: () => {
          const { parsing } = get();
          return parsing.status === 'parsing';
        },

        hasResults: () => {
          const { validation } = get();
          return validation.records.length > 0;
        },

        // ============================================
        // SYSTEM SLICE — session management
        // ============================================
        lastActive: Date.now(),
        updateLastActive: () =>
          set({ lastActive: Date.now() }, false, 'system/heartbeat'),
      }),
      {
        name: 'gmi-validator-storage',
        onRehydrateStorage: () => (state) => {
          if (state) {
            if (!state.outliers) {
              state.outliers = { results: null, hideOutliers: false };
            } else {
              if (state.outliers.results === undefined) {
                state.outliers.results = null;
              }
              if (state.outliers.hideOutliers === undefined) {
                state.outliers.hideOutliers = false;
              }
            }

            // Ensure new fields exist (migration for old persisted state)
            if (!state.ui) {
              state.ui = {
                detailsPanelOpen: false,
                selectedRecordId: null,
                filterSeverity: 'all',
                mapViewOpen: false,
                sidebarOpen: true,
                highlightedCode: null,
                hiddenCodes: [],
                highlightedType: null,
                highlightedTypeContext: null,
                hiddenTypes: [],
                feltFilterActive: false,
                feltHiddenValues: [],
                feltSearchText: '',
                outlierPromptOpen: false,
                missingHeightPromptOpen: false,
                missingHeightDetailsOpen: false,
                missingHeightLines: [],
              };
            } else {
              if (state.ui.highlightedCode === undefined) {
                state.ui.highlightedCode = null;
              }
              if (state.ui.hiddenCodes === undefined) {
                state.ui.hiddenCodes = [];
              }
              if (state.ui.highlightedType === undefined) {
                state.ui.highlightedType = null;
              }
              if (state.ui.highlightedTypeContext === undefined) {
                state.ui.highlightedTypeContext = null;
              }
              if (state.ui.hiddenTypes === undefined) {
                state.ui.hiddenTypes = [];
              }
              if (state.ui.feltFilterActive === undefined) {
                state.ui.feltFilterActive = false;
              }
              if (state.ui.feltHiddenValues === undefined) {
                state.ui.feltHiddenValues = [];
              }
              if (state.ui.feltSearchText === undefined) {
                state.ui.feltSearchText = '';
              }
              if (state.ui.outlierPromptOpen === undefined) {
                state.ui.outlierPromptOpen = false;
              }
              if (state.ui.missingHeightPromptOpen === undefined) {
                state.ui.missingHeightPromptOpen = false;
              }
              if (state.ui.missingHeightDetailsOpen === undefined) {
                state.ui.missingHeightDetailsOpen = false;
              }
              if (state.ui.missingHeightLines === undefined) {
                state.ui.missingHeightLines = [];
              }
            }

            if (!state.settings) {
              state.settings = {
                theme: 'light',
                locale: 'nb-NO',
                autoValidateOnUpload: true,
                showWarnings: true,
                lastFileName: null,
                inclineRequirementMode: 'fixed10',
              };
            } else if (state.settings.inclineRequirementMode === undefined) {
              state.settings.inclineRequirementMode = 'fixed10';
            }

            const now = Date.now();
            const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds

            if (
              state.lastActive &&
              now - state.lastActive > oneHour
            ) {
              console.log(
                'Session expired (1h timeout). Clearing persisted data.'
              );
              state.clearFile();
              state.clearData();
              state.resetParsing();
              state.clearValidationResults();
              state.updateLastActive();
            }
          }
        },
      }
    ),
    { name: 'GMI-Validator-Store' }
  )
);

export default useStore;
