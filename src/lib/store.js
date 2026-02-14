import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { detectOutliers } from './analysis/outliers';
import { analyzeIncline } from './analysis/incline';
import { analyzeZValues } from './analysis/zValidation';

const STORAGE_VERSION = 3;

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
            layerId: null,
            layerId: null,
            hoveredPointIndex: null,
            hoveredSegment: null,
            hoveredTerrainPoint: null,
          },
          zValidation: {
            results: null,
            isOpen: false,
          },
          terrain: {
            // Per-line terrain data: { [lineIndex]: { points: [], status: 'idle'|'loading'|'done'|'error' } }
            data: {},
            // Queue of line indices to fetch
            fetchQueue: [],
            // Currently fetching line index
            currentlyFetching: null,
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
            sidebarOpenSection: 'oversikt',
            sidebarOpenSectionBeforeFieldValidation: null,
            highlightedCode: null,
            hiddenCodes: [],
            highlightedType: null,
            highlightedTypeContext: null,
            hiddenTypes: [],
            layerDataTable: {
              isOpen: false,
              layerId: null,
              activeTabByLayer: {},
              sortingByLayer: {},
              columnOrderByLayer: {},
            },
            highlightedFeatureId: null,
            highlightedFeatureIds: null,
            fieldValidationOpen: false,
            missingReportOpen: false,
            filteredFeatureIds: null,
            viewer3DOpen: true,
            activeViewTab: 'map',
            selectedObject3D: null,
            mapCenterTarget: null,
            mapBaseLayer: 'Kartverket Topo',
            mapOverlayVisibility: {
              data: true,
              geminiWms: true,
              eiendomsgrenser: true,
            },
            measureMode: false,
            measurePoints: [],
            feltFilterActive: false,
            feltHiddenValues: [],
            feltSearchText: '',
            // Felt highlighting on hover (similar to highlightedCode for Tema)
            highlightedFeltField: null,
            highlightedFeltValue: null,
            highlightedFeltObjectType: null,
            outlierPromptOpen: false,
            missingHeightPromptOpen: false,
            missingHeightDetailsOpen: false,
            missingHeightLines: [],
            fieldValidationFilterActive: false,
            dataInspectorOpen: false,
            dataInspectorTarget: null,
            zValidationPromptOpen: false,
            // Layer management UI state
            expandedLayerId: null, // Only one layer expanded at a time
            highlightedLayerId: null, // Layer being hovered in sidebar
            mapUpdateNonce: 0,
            multiLayerModeEnabled: false,
          },
          // Initial layer state template for creating new layers
          layerTemplate: {
            id: null,
            name: '',
            file: null, // { name, size, lastModified, type, format }
            data: null, // { header, points, lines, format }
            visible: true,
            highlightAll: false,
            // Per-layer filter state
            hiddenCodes: [],
            hiddenTypes: [],
            feltHiddenValues: [],
            // Per-layer analysis results
            analysis: {
              results: [],
              isOpen: false,
              selectedPipeIndex: null,
            },
            zValidation: {
              results: null,
              isOpen: false,
            },
            outliers: {
              results: null,
              hideOutliers: false,
            },
            terrain: {
              data: {},
              fetchQueue: [],
              currentlyFetching: null,
            },
          },
        },

        // ============================================
        // LAYERS SLICE — multi-file layer management
        // ============================================
        layers: {}, // { [layerId]: LayerState }
        layerOrder: [], // Array of layerIds in display order

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

              const zValidationResults = analyzeZValues(data);
              const hasMissingZ =
                (zValidationResults?.summary?.missingPointObjects ||
                  0) > 0 ||
                (zValidationResults?.summary?.missingLineObjects ||
                  0) > 0;

              const initial = get()._initial;
              const preservedMapOverlayVisibility = {
                ...(initial.ui.mapOverlayVisibility || {}),
                ...(state.ui?.mapOverlayVisibility || {}),
              };
              const preservedMapBaseLayer =
                state.ui?.mapBaseLayer ||
                initial.ui.mapBaseLayer ||
                'Kartverket Topo';

              // Auto-run incline analysis for all lines
              const inclineResults = analyzeIncline(data, {
                minInclineMode: state.settings.inclineRequirementMode,
              });

              // Build terrain fetch queue from analysis results (all analyzed lines)
              const terrainFetchQueue = inclineResults.map(
                (r) => r.lineIndex,
              );

              return {
                data,
                outliers: {
                  results: outlierResults,
                  hideOutliers: false,
                },
                // Auto-populate analysis results
                analysis: {
                  ...initial.analysis,
                  results: inclineResults,
                },
                zValidation: {
                  ...initial.zValidation,
                  results: zValidationResults,
                },
                // Reset terrain and populate fetch queue
                terrain: {
                  ...initial.terrain,
                  fetchQueue: terrainFetchQueue,
                },
                ui: {
                  ...initial.ui,
                  mapBaseLayer: preservedMapBaseLayer,
                  mapOverlayVisibility:
                    preservedMapOverlayVisibility,
                  // Keep sidebar open by default
                  sidebarOpen: true,
                  outlierPromptOpen: hasOutliers,
                  missingHeightPromptOpen: false,
                  missingHeightDetailsOpen: false,
                  missingHeightLines,
                  zValidationPromptOpen: hasMissingZ,
                },
              };
            },
            false,
            'data/set',
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
              zValidation: {
                results: null,
                isOpen: false,
              },
            },
            false,
            'data/clear',
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
            'parsing/start',
          ),

        setParsingProgress: (progress) =>
          set(
            (state) => ({
              parsing: { ...state.parsing, progress },
            }),
            false,
            'parsing/progress',
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
            'parsing/done',
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
            'parsing/error',
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
            'parsing/reset',
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
            'validation/setResults',
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
            'validation/clear',
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
          hoveredTerrainPoint: null, // { dist, lineDist?, terrainZ, pipeZ } | null
        },

        zValidation: {
          results: null,
          isOpen: false,
        },

        setAnalysisResults: (results) =>
          set(
            (state) => ({
              analysis: { ...state.analysis, results },
            }),
            false,
            'analysis/setResults',
          ),

        setAnalysisLayerId: (layerId) =>
          set(
            (state) => ({
              analysis: { ...state.analysis, layerId },
            }),
            false,
            'analysis/setLayerId',
          ),

        setZValidationResults: (results) =>
          set(
            (state) => ({
              zValidation: { ...state.zValidation, results },
            }),
            false,
            'zValidation/setResults',
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
                  layerId: newIsOpen ? state.analysis.layerId : null,
                },
                // Clear highlighted feature when closing analysis
                ui: !newIsOpen
                  ? { ...state.ui, highlightedFeatureId: null }
                  : state.ui,
              };
            },
            false,
            'analysis/toggleModal',
          ),

        toggleZValidationModal: (isOpen) =>
          set(
            (state) => {
              const newIsOpen =
                isOpen !== undefined
                  ? isOpen
                  : !state.zValidation.isOpen;
              return {
                zValidation: {
                  ...state.zValidation,
                  isOpen: newIsOpen,
                },
              };
            },
            false,
            'zValidation/toggleModal',
          ),

        selectAnalysisPipe: (index, layerId = null) =>
          set(
            (state) => ({
              analysis: {
                ...state.analysis,
                selectedPipeIndex: index,
                layerId: layerId,
              },
              // Also highlight on map - prefix with 'ledninger-' to match MapInner ID format
              ui: {
                ...state.ui,
                highlightedFeatureId: layerId
                  ? `ledninger-${layerId}-${index}`
                  : `ledninger-${index}`,
                selectedObject3D: {
                  type: 'line',
                  index,
                  layerId,
                },
              },
            }),
            false,
            'analysis/selectPipe',
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
            'analysis/setHoveredPoint',
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
            'analysis/setHoveredSegment',
          ),

        setHoveredTerrainPoint: (point) =>
          set(
            (state) => ({
              analysis: {
                ...state.analysis,
                hoveredTerrainPoint: point,
              },
            }),
            false,
            'analysis/setHoveredTerrainPoint',
          ),

        // ============================================
        // TERRAIN SLICE — terrain profile data
        // ============================================
        terrain: {
          // Per-line terrain data: { [lineIndex]: { points: [], status: 'idle'|'loading'|'done'|'error', error?: string } }
          data: {},
          // Queue of line indices to fetch
          fetchQueue: [],
          // Currently fetching line index
          currentlyFetching: null,
        },

        setTerrainData: (lineIndex, terrainPoints) =>
          set(
            (state) => {
              // Find corresponding analysis result to get pipe profile points
              const analysisResult = state.analysis.results.find(
                (r) => r.lineIndex === lineIndex,
              );
              const pipePoints =
                analysisResult?.details?.profilePoints || [];
              const minOvercover = state.settings.minOvercover;

              // Import and run overcover analysis
              let overcoverAnalysis = null;
              if (pipePoints.length > 0 && terrainPoints.length > 0) {
                // Calculate overcover for each pipe point
                const warnings = [];
                let minOC = Infinity;
                let maxOC = -Infinity;
                let sumOC = 0;
                let countOC = 0;

                for (const pp of pipePoints) {
                  let closestTerrain = null;
                  let minDistDiff = Infinity;

                  for (const tp of terrainPoints) {
                    const terrainZ = tp.terrainZ ?? tp.z ?? null;
                    if (terrainZ === null || terrainZ === undefined)
                      continue;
                    const diff = Math.abs(tp.dist - pp.dist);
                    if (diff < minDistDiff) {
                      minDistDiff = diff;
                      closestTerrain = { ...tp, z: terrainZ };
                    }
                  }

                  if (!closestTerrain) continue;

                  const overcover = closestTerrain.z - pp.z;

                  if (overcover < minOC) minOC = overcover;
                  if (overcover > maxOC) maxOC = overcover;
                  sumOC += overcover;
                  countOC++;

                  // Flag warning if overcover is below minimum
                  if (overcover >= 0 && overcover < minOvercover) {
                    warnings.push({
                      pipeZ: pp.z,
                      terrainZ: closestTerrain.z,
                      overcover,
                      dist: pp.dist,
                      required: minOvercover,
                    });
                  }
                }

                overcoverAnalysis = {
                  hasData: countOC > 0,
                  warnings,
                  minOvercover: countOC > 0 ? minOC : null,
                  maxOvercover: countOC > 0 ? maxOC : null,
                  avgOvercover: countOC > 0 ? sumOC / countOC : null,
                };
              }

              return {
                terrain: {
                  ...state.terrain,
                  data: {
                    ...state.terrain.data,
                    [lineIndex]: {
                      points: terrainPoints,
                      status: 'done',
                      overcover: overcoverAnalysis,
                    },
                  },
                },
              };
            },
            false,
            'terrain/setData',
          ),

        setTerrainStatus: (lineIndex, status, error = null) =>
          set(
            (state) => ({
              terrain: {
                ...state.terrain,
                data: {
                  ...state.terrain.data,
                  [lineIndex]: {
                    ...state.terrain.data[lineIndex],
                    status,
                    error,
                  },
                },
              },
            }),
            false,
            'terrain/setStatus',
          ),

        setTerrainFetchQueue: (queue) =>
          set(
            (state) => ({
              terrain: {
                ...state.terrain,
                fetchQueue: queue,
              },
            }),
            false,
            'terrain/setFetchQueue',
          ),

        addToTerrainQueue: (lineIndex) =>
          set(
            (state) => {
              // Don't add if already in queue or already loaded
              if (
                state.terrain.fetchQueue.includes(lineIndex) ||
                state.terrain.data[lineIndex]?.status === 'done' ||
                state.terrain.data[lineIndex]?.status === 'loading'
              ) {
                return state;
              }
              return {
                terrain: {
                  ...state.terrain,
                  fetchQueue: [
                    ...state.terrain.fetchQueue,
                    lineIndex,
                  ],
                },
              };
            },
            false,
            'terrain/addToQueue',
          ),

        forceTerrainFetch: (lineIndex) =>
          set(
            (state) => {
              const nextQueue = state.terrain.fetchQueue.filter(
                (i) => i !== lineIndex,
              );
              return {
                terrain: {
                  ...state.terrain,
                  data: {
                    ...state.terrain.data,
                    [lineIndex]: {
                      ...(state.terrain.data[lineIndex] || {}),
                      status: 'loading',
                      error: null,
                    },
                  },
                  fetchQueue: [lineIndex, ...nextQueue],
                },
              };
            },
            false,
            'terrain/forceFetch',
          ),

        prioritizeTerrainFetch: (lineIndex) =>
          set(
            (state) => {
              // If already done or loading, no need to prioritize
              if (
                state.terrain.data[lineIndex]?.status === 'done' ||
                state.terrain.data[lineIndex]?.status === 'loading'
              ) {
                return state;
              }
              // Remove from current position and add to front
              const newQueue = state.terrain.fetchQueue.filter(
                (i) => i !== lineIndex,
              );
              return {
                terrain: {
                  ...state.terrain,
                  fetchQueue: [lineIndex, ...newQueue],
                },
              };
            },
            false,
            'terrain/prioritize',
          ),

        setCurrentlyFetching: (lineIndex) =>
          set(
            (state) => ({
              terrain: {
                ...state.terrain,
                currentlyFetching: lineIndex,
              },
            }),
            false,
            'terrain/setCurrentlyFetching',
          ),

        popFromTerrainQueue: () => {
          const state = get();
          const [next, ...rest] = state.terrain.fetchQueue;
          set(
            {
              terrain: {
                ...state.terrain,
                fetchQueue: rest,
                currentlyFetching: next ?? null,
              },
            },
            false,
            'terrain/popQueue',
          );
          return next;
        },

        clearTerrainData: () =>
          set(
            (state) => ({
              terrain: {
                data: {},
                fetchQueue: [],
                currentlyFetching: null,
              },
            }),
            false,
            'terrain/clear',
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
            'outliers/setResults',
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
            'outliers/toggleHide',
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
            'outliers/clear',
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
          sidebarOpenSection: 'oversikt',
          sidebarOpenSectionBeforeFieldValidation: null,
          highlightedCode: null,
          hiddenCodes: [],
          highlightedType: null,
          highlightedTypeContext: null, // Track which code the type is under
          hiddenTypes: [], // Array of {type, code} objects for context-aware hiding
          layerDataTable: {
            isOpen: false,
            layerId: null,
            activeTabByLayer: {},
            sortingByLayer: {},
            columnOrderByLayer: {},
          },
          highlightedFeatureId: null, // ID of feature to highlight on map
          highlightedFeatureIds: null, // Set<string> | null - multiple feature highlight
          fieldValidationOpen: false, // Field validation sidebar visibility
          missingReportOpen: false, // Missing fields report modal visibility
          filteredFeatureIds: null, // Set<string> | null - IDs of features to exclusively show
          viewer3DOpen: true, // 3D visualization viewer visibility - always open
          activeViewTab: 'map', // 'map' | '3d' - Current active view tab (default to 2D map)
          selectedObject3D: null, // Currently selected 3D object { type, index, data }
          mapCenterTarget: null, // { coordinates, zoom, featureId } - Target for map centering
          mapBaseLayer: 'Kartverket Topo', // Selected background map in LayersControl
          mapOverlayVisibility: {
            data: true,
            geminiWms: true,
            eiendomsgrenser: true,
          },
          layerFitBoundsTarget: null, // { layerId, nonce } - Target layer for fit bounds
          layerFitBoundsTarget: null, // { layerId, nonce } - Target layer for fit bounds
          measureMode: false, // Whether the measure tool is active
          measurePoints: [], // Array of {lat, lng} points for measuring
          feltFilterActive: false, // Whether Felt filtering overrides Tema
          feltHiddenValues: [], // Array of {fieldName, value, objectType} - 'points' or 'lines'
          feltSearchText: '', // Search text for Felt filtering
          outlierPromptOpen: false, // Ask user whether to ignore outliers on load
          missingHeightPromptOpen: false, // Warn if one or more lines are missing Z
          missingHeightDetailsOpen: false, // Details popup listing lines missing Z
          missingHeightLines: [], // Array<{index:number, fcode:string|null, type:string|null}>
          fieldValidationFilterActive: false, // Whether field validation is overriding filters
          dataInspectorOpen: false, // Data inspector modal visibility
          dataInspectorTarget: null, // { type: 'point'|'line', index: number } | null
          zValidationPromptOpen: false, // Prompt to review missing Z values
          multiLayerModeEnabled: false,
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
            'ui/setOutlierPromptOpen',
          ),

        setMapBaseLayer: (name) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                mapBaseLayer: name,
              },
            }),
            false,
            'ui/setMapBaseLayer',
          ),

        setMapOverlayVisibility: (overlay, visible) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                mapOverlayVisibility: {
                  ...(state.ui.mapOverlayVisibility || {}),
                  [overlay]: visible,
                },
              },
            }),
            false,
            'ui/setMapOverlayVisibility',
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
            'ui/setMissingHeightPromptOpen',
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
            'ui/setMissingHeightDetailsOpen',
          ),

        setZValidationPromptOpen: (isOpen) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                zValidationPromptOpen:
                  isOpen !== undefined
                    ? isOpen
                    : !state.ui.zValidationPromptOpen,
              },
            }),
            false,
            'ui/setZValidationPromptOpen',
          ),

        openDataInspector: (target = null) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                dataInspectorOpen: true,
                dataInspectorTarget: target,
              },
            }),
            false,
            'ui/openDataInspector',
          ),

        closeDataInspector: () =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                dataInspectorOpen: false,
                dataInspectorTarget: null,
              },
            }),
            false,
            'ui/closeDataInspector',
          ),

        setDataInspectorTarget: (target) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                dataInspectorTarget: target,
              },
            }),
            false,
            'ui/setDataInspectorTarget',
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
            'ui/toggleMeasureMode',
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
            'ui/addMeasurePoint',
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
            'ui/clearMeasurePoints',
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
            'ui/setFeltFilterActive',
          ),

        toggleFeltHiddenValue: (fieldName, value, objectType) =>
          set(
            (state) => {
              const current = state.ui.feltHiddenValues;
              const existingIndex = current.findIndex(
                (item) =>
                  item.fieldName === fieldName &&
                  item.value === value &&
                  item.objectType === objectType,
              );
              const newHidden =
                existingIndex >= 0
                  ? current.filter((_, i) => i !== existingIndex)
                  : [...current, { fieldName, value, objectType }];
              return {
                ui: {
                  ...state.ui,
                  feltHiddenValues: newHidden,
                  mapUpdateNonce: (state.ui.mapUpdateNonce || 0) + 1,
                },
              };
            },
            false,
            'ui/toggleFeltHiddenValue',
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
            'ui/setFeltSearchText',
          ),

        // Set Felt highlighting (for hover effect in map/3D)
        setHighlightedFelt: (fieldName, value, objectType) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                highlightedFeltField: fieldName,
                highlightedFeltValue: value,
                highlightedFeltObjectType: objectType,
              },
            }),
            false,
            'ui/setHighlightedFelt',
          ),

        clearFeltFilter: () =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                feltFilterActive: false,
                feltHiddenValues: [],
                feltSearchText: '',
                // Also clear highlighting when clearing filter
                highlightedFeltField: null,
                highlightedFeltValue: null,
                highlightedFeltObjectType: null,
              },
            }),
            false,
            'ui/clearFeltFilter',
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
            'ui/setFilteredFeatureIds',
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
            'ui/toggleMissingReport',
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
                sidebarOpenSectionBeforeFieldValidation:
                  isOpen === true
                    ? state.ui.sidebarOpenSection
                    : state.ui
                        .sidebarOpenSectionBeforeFieldValidation,
                sidebarOpenSection:
                  isOpen === false
                    ? state.ui
                        .sidebarOpenSectionBeforeFieldValidation ||
                      'analyse'
                    : state.ui.sidebarOpenSection,
              },
            }),
            false,
            'ui/toggleFieldValidation',
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
            'ui/toggle3DViewer',
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
            'ui/setActiveViewTab',
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
            'ui/setSelected3DObject',
          ),

        viewObjectInMap: (
          featureId,
          coordinates,
          zoom = 18,
          options = {},
        ) =>
          set(
            (state) => {
              const newState = {
                ui: {
                  ...state.ui,
                  // Don't change activeViewTab - let zooming work in current view
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
                  layerId: options.layerId || null,
                };
              }

              if (options.layerId) {
                newState.ui = {
                  ...newState.ui,
                  selectedObject3D: {
                    type:
                      options.objectType === 'pipe'
                        ? 'line'
                        : 'point',
                    index:
                      options.lineIndex !== undefined
                        ? options.lineIndex
                        : options.pointIndex,
                    layerId: options.layerId,
                  },
                };
              }

              return newState;
            },
            false,
            'ui/viewObjectInMap',
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
            'ui/clearMapCenterTarget',
          ),

        setLayerFitBoundsTarget: (layerId) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                layerFitBoundsTarget: {
                  layerId,
                  nonce: Date.now(),
                },
              },
            }),
            false,
            'ui/setLayerFitBoundsTarget',
          ),

        clearLayerFitBoundsTarget: () =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                layerFitBoundsTarget: null,
              },
            }),
            false,
            'ui/clearLayerFitBoundsTarget',
          ),

        setHighlightedCode: (code) =>
          set(
            (state) => ({
              ui: { ...state.ui, highlightedCode: code },
            }),
            false,
            'ui/setHighlightedCode',
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
            'ui/setHighlightedType',
          ),

        toggleHiddenCode: (code) =>
          set(
            (state) => {
              const currentHidden = state.ui.hiddenCodes;
              const newHidden = currentHidden.includes(code)
                ? currentHidden.filter((c) => c !== code)
                : [...currentHidden, code];
              return {
                ui: {
                  ...state.ui,
                  hiddenCodes: newHidden,
                  mapUpdateNonce: (state.ui.mapUpdateNonce || 0) + 1,
                },
              };
            },
            false,
            'ui/toggleHiddenCode',
          ),

        toggleHiddenType: (typeVal, codeContext = null) =>
          set(
            (state) => {
              const currentHidden = state.ui.hiddenTypes;
              // Find if this type+code combination exists
              const existingIndex = currentHidden.findIndex(
                (ht) =>
                  ht.type === typeVal && ht.code === codeContext,
              );
              const newHidden =
                existingIndex >= 0
                  ? currentHidden.filter(
                      (_, i) => i !== existingIndex,
                    )
                  : [
                      ...currentHidden,
                      { type: typeVal, code: codeContext },
                    ];
              return {
                ui: {
                  ...state.ui,
                  hiddenTypes: newHidden,
                  mapUpdateNonce: (state.ui.mapUpdateNonce || 0) + 1,
                },
              };
            },
            false,
            'ui/toggleHiddenType',
          ),

        openLayerDataTable: (layerId) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                layerDataTable: {
                  ...(state.ui.layerDataTable || {}),
                  isOpen: true,
                  layerId,
                },
              },
            }),
            false,
            'ui/openLayerDataTable',
          ),

        closeLayerDataTable: () =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                layerDataTable: {
                  ...(state.ui.layerDataTable || {}),
                  isOpen: false,
                  layerId: null,
                },
              },
            }),
            false,
            'ui/closeLayerDataTable',
          ),

        setLayerDataTableTab: (layerId, tab) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                layerDataTable: {
                  ...(state.ui.layerDataTable || {}),
                  activeTabByLayer: {
                    ...(state.ui.layerDataTable?.activeTabByLayer || {}),
                    [layerId]: tab,
                  },
                },
              },
            }),
            false,
            'ui/setLayerDataTableTab',
          ),

        setLayerDataTableSorting: (layerId, tab, sorting) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                layerDataTable: {
                  ...(state.ui.layerDataTable || {}),
                  sortingByLayer: {
                    ...(state.ui.layerDataTable?.sortingByLayer || {}),
                    [layerId]: {
                      ...(state.ui.layerDataTable?.sortingByLayer?.[
                        layerId
                      ] || {}),
                      [tab]: sorting,
                    },
                  },
                },
              },
            }),
            false,
            'ui/setLayerDataTableSorting',
          ),

        setLayerDataTableColumnOrder: (layerId, tab, order) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                layerDataTable: {
                  ...(state.ui.layerDataTable || {}),
                  columnOrderByLayer: {
                    ...(state.ui.layerDataTable?.columnOrderByLayer || {}),
                    [layerId]: {
                      ...(state.ui.layerDataTable?.columnOrderByLayer?.[
                        layerId
                      ] || {}),
                      [tab]: order,
                    },
                  },
                },
              },
            }),
            false,
            'ui/setLayerDataTableColumnOrder',
          ),

        setHighlightedFeature: (featureId) =>
          set(
            (state) => ({
              ui: { ...state.ui, highlightedFeatureId: featureId },
            }),
            false,
            'ui/setHighlightedFeature',
          ),

        setHighlightedFeatureIds: (featureIds) =>
          set(
            (state) => ({
              ui: { ...state.ui, highlightedFeatureIds: featureIds },
            }),
            false,
            'ui/setHighlightedFeatureIds',
          ),

        setFieldValidationFilterActive: (active) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                fieldValidationFilterActive: active,
              },
            }),
            false,
            'ui/setFieldValidationFilterActive',
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
            'ui/toggleDetails',
          ),

        selectRecord: (recordId) =>
          set(
            (state) => ({
              ui: { ...state.ui, selectedRecordId: recordId },
            }),
            false,
            'ui/selectRecord',
          ),

        setFilterSeverity: (severity) =>
          set(
            (state) => ({
              ui: { ...state.ui, filterSeverity: severity },
            }),
            false,
            'ui/setFilter',
          ),

        toggleMapView: () =>
          set(
            (state) => ({
              ui: { ...state.ui, mapViewOpen: !state.ui.mapViewOpen },
            }),
            false,
            'ui/toggleMap',
          ),

        toggleSidebar: () =>
          set(
            (state) => ({
              ui: { ...state.ui, sidebarOpen: !state.ui.sidebarOpen },
            }),
            false,
            'ui/toggleSidebar',
          ),

        setSidebarOpenSection: (section) =>
          set(
            (state) => ({
              ui: { ...state.ui, sidebarOpenSection: section },
            }),
            false,
            'ui/setSidebarOpenSection',
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
          minOvercover: 1.6, // Minimum overcover in meters (default 1.6m)
        },

        updateSettings: (newSettings) =>
          set(
            (state) => {
              const prevMinOvercover = state.settings.minOvercover;
              const updated = {
                settings: { ...state.settings, ...newSettings },
              };

              if (
                typeof newSettings.minOvercover === 'number' &&
                newSettings.minOvercover !== prevMinOvercover
              ) {
                const nextMinOvercover = newSettings.minOvercover;
                const newTerrainData = { ...state.terrain.data };

                state.analysis.results.forEach((result) => {
                  const lineIndex = result.lineIndex;
                  const terrainEntry = state.terrain.data[lineIndex];
                  if (!terrainEntry || !terrainEntry.points) return;
                  const pipePoints =
                    result.details?.profilePoints || [];
                  if (pipePoints.length === 0) return;

                  const warnings = [];
                  let minOC = Infinity;
                  let maxOC = -Infinity;
                  let sumOC = 0;
                  let countOC = 0;

                  for (const pp of pipePoints) {
                    let closestTerrain = null;
                    let minDistDiff = Infinity;

                    for (const tp of terrainEntry.points) {
                      const terrainZ = tp.terrainZ ?? tp.z ?? null;
                      if (terrainZ === null || terrainZ === undefined)
                        continue;
                      const diff = Math.abs(tp.dist - pp.dist);
                      if (diff < minDistDiff) {
                        minDistDiff = diff;
                        closestTerrain = { ...tp, z: terrainZ };
                      }
                    }

                    if (!closestTerrain) continue;

                    const overcover = closestTerrain.z - pp.z;
                    if (overcover < minOC) minOC = overcover;
                    if (overcover > maxOC) maxOC = overcover;
                    sumOC += overcover;
                    countOC++;

                    if (
                      overcover >= 0 &&
                      overcover < nextMinOvercover
                    ) {
                      warnings.push({
                        pipeZ: pp.z,
                        terrainZ: closestTerrain.z,
                        overcover,
                        dist: pp.dist,
                        required: nextMinOvercover,
                      });
                    }
                  }

                  newTerrainData[lineIndex] = {
                    ...terrainEntry,
                    overcover: {
                      hasData: countOC > 0,
                      warnings,
                      minOvercover: countOC > 0 ? minOC : null,
                      maxOvercover: countOC > 0 ? maxOC : null,
                      avgOvercover:
                        countOC > 0 ? sumOC / countOC : null,
                    },
                  };
                });

                updated.terrain = {
                  ...state.terrain,
                  data: newTerrainData,
                };
              }

              return updated;
            },
            false,
            'settings/update',
          ),

        // ============================================
        // CUSTOM WMS SLICE — authenticated WMS layer
        // NOTE: This is intentionally NOT persisted for security.
        // Credentials are only kept in memory during the session.
        // ============================================
        customWmsConfig: null, // { url, username, password, layers?, enabled }

        setCustomWmsConfig: (config) =>
          set(
            { customWmsConfig: config },
            false,
            'customWms/setConfig',
          ),

        toggleCustomWmsEnabled: (enabled) =>
          set(
            (state) => {
              if (!state.customWmsConfig) return state;
              return {
                customWmsConfig: {
                  ...state.customWmsConfig,
                  enabled: enabled ?? !state.customWmsConfig.enabled,
                },
              };
            },
            false,
            'customWms/toggleEnabled',
          ),

        clearCustomWmsCredentials: () =>
          set(
            (state) => {
              if (!state.customWmsConfig) return state;
              // Clear credentials but keep URL preference
              return {
                customWmsConfig: {
                  ...state.customWmsConfig,
                  username: '',
                  password: '',
                  enabled: false,
                },
              };
            },
            false,
            'customWms/clearCredentials',
          ),

        // ============================================
        // LAYER ACTIONS — multi-file layer management
        // ============================================

        /**
         * Add a new layer with parsed data
         * @param {Object} layerData - { file, data } where file is metadata and data is parsed content
         * @returns {string} The new layer's ID
         */
        addLayer: (layerData) => {
          const layerId = `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const { file, data } = layerData;
          const initial = get()._initial;
          const inclineRequirementMode =
            get().settings.inclineRequirementMode;

          // Run initial analysis on the new layer's data
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
          const inclineResults = analyzeIncline(data, {
            minInclineMode: inclineRequirementMode,
          });
          const zValidationResults = analyzeZValues(data);
          const terrainFetchQueue = inclineResults.map(
            (r) => r.lineIndex,
          );

          const newLayer = {
            ...initial.layerTemplate,
            id: layerId,
            name: file?.name || `Lag ${get().layerOrder.length + 1}`,
            file,
            data,
            visible: true, // Explicitly set visible
            analysis: {
              results: inclineResults,
              isOpen: false,
              selectedPipeIndex: null,
            },
            zValidation: {
              results: zValidationResults,
              isOpen: false,
            },
            outliers: {
              results: outlierResults,
              hideOutliers: false,
            },
            terrain: {
              data: {},
              fetchQueue: terrainFetchQueue,
              currentlyFetching: null,
            },
          };

          set(
            (state) => ({
              layers: {
                ...state.layers,
                [layerId]: newLayer,
              },
              layerOrder: [...state.layerOrder, layerId],
              ui: {
                ...state.ui,
                expandedLayerId: layerId, // Auto-expand new layer
                multiLayerModeEnabled: true,
              },
            }),
            false,
            'layers/add',
          );

          return layerId;
        },

        /**
         * Remove a layer by ID
         */
        removeLayer: (layerId) =>
          set(
            (state) => {
              const { [layerId]: removed, ...remainingLayers } =
                state.layers;
              const nextLayerOrder = state.layerOrder.filter(
                (id) => id !== layerId,
              );
              const baseState = {
                layers: remainingLayers,
                layerOrder: nextLayerOrder,
                ui: {
                  ...state.ui,
                  expandedLayerId:
                    state.ui.expandedLayerId === layerId
                      ? null
                      : state.ui.expandedLayerId,
                  highlightedLayerId:
                    state.ui.highlightedLayerId === layerId
                      ? null
                      : state.ui.highlightedLayerId,
                  multiLayerModeEnabled: true,
                },
              };

              if (nextLayerOrder.length > 0) return baseState;

              return {
                ...baseState,
                file: null,
                data: null,
                analysis: {
                  results: [],
                  isOpen: false,
                  selectedPipeIndex: null,
                },
                zValidation: {
                  results: null,
                  isOpen: false,
                },
                outliers: {
                  results: null,
                  hideOutliers: false,
                },
                terrain: {
                  data: {},
                  fetchQueue: [],
                  currentlyFetching: null,
                },
                ui: {
                  ...baseState.ui,
                  outlierPromptOpen: false,
                  missingHeightPromptOpen: false,
                  missingHeightDetailsOpen: false,
                  missingHeightLines: [],
                  zValidationPromptOpen: false,
                },
              };
            },
            false,
            'layers/remove',
          ),

        /**
         * Update a layer's properties
         */
        updateLayer: (layerId, updates) =>
          set(
            (state) => ({
              layers: {
                ...state.layers,
                [layerId]: {
                  ...state.layers[layerId],
                  ...updates,
                },
              },
            }),
            false,
            'layers/update',
          ),

        /**
         * Toggle layer visibility
         */
        toggleLayerVisibility: (layerId) =>
          set(
            (state) => ({
              layers: {
                ...state.layers,
                [layerId]: {
                  ...state.layers[layerId],
                  visible: !state.layers[layerId].visible,
                },
              },
              ui: {
                ...state.ui,
                mapUpdateNonce: (state.ui.mapUpdateNonce || 0) + 1,
              },
            }),
            false,
            'layers/toggleVisibility',
          ),

        /**
         * Set layer opacity (0-1)
         */
        /**
         * Show all layers
         */
        showAllLayers: () =>
          set(
            (state) => {
              const updatedLayers = {};
              for (const id of state.layerOrder) {
                updatedLayers[id] = {
                  ...state.layers[id],
                  visible: true,
                };
              }
              return {
                layers: { ...state.layers, ...updatedLayers },
                ui: {
                  ...state.ui,
                  mapUpdateNonce: (state.ui.mapUpdateNonce || 0) + 1,
                },
              };
            },
            false,
            'layers/showAll',
          ),

        /**
         * Hide all layers
         */
        hideAllLayers: () =>
          set(
            (state) => {
              const updatedLayers = {};
              for (const id of state.layerOrder) {
                updatedLayers[id] = {
                  ...state.layers[id],
                  visible: false,
                };
              }
              return {
                layers: { ...state.layers, ...updatedLayers },
                ui: {
                  ...state.ui,
                  mapUpdateNonce: (state.ui.mapUpdateNonce || 0) + 1,
                },
              };
            },
            false,
            'layers/hideAll',
          ),

        /**
         * Set which layer is expanded in sidebar (only one at a time)
         */
        setExpandedLayer: (layerId) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                expandedLayerId:
                  state.ui.expandedLayerId === layerId
                    ? null
                    : layerId,
              },
            }),
            false,
            'layers/setExpanded',
          ),

        /**
         * Set highlighted layer (for hover effect)
         */
        setHighlightedLayer: (layerId) =>
          set(
            (state) => ({
              ui: {
                ...state.ui,
                highlightedLayerId: layerId,
              },
            }),
            false,
            'layers/setHighlighted',
          ),

        /**
         * Toggle per-layer highlight for all features in a layer
         */
        toggleLayerHighlightAll: (layerId) =>
          set(
            (state) => {
              const layer = state.layers[layerId];
              if (!layer) return state;
              return {
                layers: {
                  ...state.layers,
                  [layerId]: {
                    ...layer,
                    highlightAll: !layer.highlightAll,
                  },
                },
                ui: {
                  ...state.ui,
                  mapUpdateNonce: (state.ui.mapUpdateNonce || 0) + 1,
                },
              };
            },
            false,
            'layers/toggleHighlightAll',
          ),

        /**
         * Toggle hidden code for a specific layer
         */
        toggleLayerHiddenCode: (layerId, code) =>
          set(
            (state) => {
              const layer = state.layers[layerId];
              if (!layer) return state;
              const currentHidden = layer.hiddenCodes || [];
              const newHidden = currentHidden.includes(code)
                ? currentHidden.filter((c) => c !== code)
                : [...currentHidden, code];
              return {
                layers: {
                  ...state.layers,
                  [layerId]: { ...layer, hiddenCodes: newHidden },
                },
                ui: {
                  ...state.ui,
                  mapUpdateNonce: (state.ui.mapUpdateNonce || 0) + 1,
                },
              };
            },
            false,
            'layers/toggleHiddenCode',
          ),

        /**
         * Toggle hidden type for a specific layer
         */
        toggleLayerHiddenType: (
          layerId,
          typeVal,
          codeContext = null,
        ) =>
          set(
            (state) => {
              const layer = state.layers[layerId];
              if (!layer) return state;
              const currentHidden = layer.hiddenTypes || [];
              const existingIndex = currentHidden.findIndex(
                (ht) =>
                  ht.type === typeVal && ht.code === codeContext,
              );
              const newHidden =
                existingIndex >= 0
                  ? currentHidden.filter(
                      (_, i) => i !== existingIndex,
                    )
                  : [
                      ...currentHidden,
                      { type: typeVal, code: codeContext },
                    ];
              return {
                layers: {
                  ...state.layers,
                  [layerId]: { ...layer, hiddenTypes: newHidden },
                },
                ui: {
                  ...state.ui,
                  mapUpdateNonce: (state.ui.mapUpdateNonce || 0) + 1,
                },
              };
            },
            false,
            'layers/toggleHiddenType',
          ),

        /**
         * Toggle felt hidden value for a specific layer
         */
        toggleLayerFeltHiddenValue: (
          layerId,
          fieldName,
          value,
          objectType,
        ) =>
          set(
            (state) => {
              const layer = state.layers[layerId];
              if (!layer) return state;
              const current = layer.feltHiddenValues || [];
              const existingIndex = current.findIndex(
                (item) =>
                  item.fieldName === fieldName &&
                  item.value === value &&
                  item.objectType === objectType,
              );
              const newHidden =
                existingIndex >= 0
                  ? current.filter((_, i) => i !== existingIndex)
                  : [...current, { fieldName, value, objectType }];
              return {
                layers: {
                  ...state.layers,
                  [layerId]: {
                    ...layer,
                    feltHiddenValues: newHidden,
                  },
                },
                ui: {
                  ...state.ui,
                  mapUpdateNonce: (state.ui.mapUpdateNonce || 0) + 1,
                  feltFilterActive: true,
                },
              };
            },
            false,
            'layers/toggleFeltHiddenValue',
          ),

        /**
         * Reset all per-layer filtering (Tema + Felt)
         */
        resetLayerFilters: (layerId) =>
          set(
            (state) => {
              const layer = state.layers[layerId];
              if (!layer) return state;
              const remainingLayerFelt = Object.entries(
                state.layers,
              ).some(
                ([id, l]) =>
                  id !== layerId &&
                  (l?.feltHiddenValues?.length || 0) > 0,
              );
              const hasGlobalFelt =
                (state.ui.feltHiddenValues || []).length > 0;

              return {
                layers: {
                  ...state.layers,
                  [layerId]: {
                    ...layer,
                    hiddenCodes: [],
                    hiddenTypes: [],
                    feltHiddenValues: [],
                  },
                },
                ui: {
                  ...state.ui,
                  mapUpdateNonce: (state.ui.mapUpdateNonce || 0) + 1,
                  feltFilterActive:
                    remainingLayerFelt || hasGlobalFelt,
                },
              };
            },
            false,
            'layers/resetFilters',
          ),

        /**
         * Set layer analysis results
         */
        setLayerAnalysisResults: (layerId, results) =>
          set(
            (state) => {
              const layer = state.layers[layerId];
              if (!layer) return state;
              return {
                layers: {
                  ...state.layers,
                  [layerId]: {
                    ...layer,
                    analysis: { ...layer.analysis, results },
                  },
                },
              };
            },
            false,
            'layers/setAnalysisResults',
          ),

        /**
         * Toggle layer analysis modal
         */
        toggleLayerAnalysisModal: (layerId, isOpen) =>
          set(
            (state) => {
              const layer = state.layers[layerId];
              if (!layer) return state;
              const newIsOpen =
                isOpen !== undefined
                  ? isOpen
                  : !layer.analysis.isOpen;
              return {
                layers: {
                  ...state.layers,
                  [layerId]: {
                    ...layer,
                    analysis: {
                      ...layer.analysis,
                      isOpen: newIsOpen,
                    },
                  },
                },
              };
            },
            false,
            'layers/toggleAnalysisModal',
          ),

        /**
         * Select a pipe in layer analysis
         */
        selectLayerAnalysisPipe: (layerId, pipeIndex) =>
          set(
            (state) => {
              const layer = state.layers[layerId];
              if (!layer) return state;
              return {
                layers: {
                  ...state.layers,
                  [layerId]: {
                    ...layer,
                    analysis: {
                      ...layer.analysis,
                      selectedPipeIndex: pipeIndex,
                    },
                  },
                },
                ui: {
                  ...state.ui,
                  highlightedFeatureId: `${layerId}-ledninger-${pipeIndex}`,
                  selectedObject3D: {
                    type: 'line',
                    index: pipeIndex,
                    layerId,
                  },
                },
              };
            },
            false,
            'layers/selectAnalysisPipe',
          ),

        /**
         * Set layer Z validation results
         */
        setLayerZValidationResults: (layerId, results) =>
          set(
            (state) => {
              const layer = state.layers[layerId];
              if (!layer) return state;
              return {
                layers: {
                  ...state.layers,
                  [layerId]: {
                    ...layer,
                    zValidation: { ...layer.zValidation, results },
                  },
                },
              };
            },
            false,
            'layers/setZValidationResults',
          ),

        /**
         * Toggle layer Z validation modal
         */
        toggleLayerZValidationModal: (layerId, isOpen) =>
          set(
            (state) => {
              const layer = state.layers[layerId];
              if (!layer) return state;
              const newIsOpen =
                isOpen !== undefined
                  ? isOpen
                  : !layer.zValidation.isOpen;
              return {
                layers: {
                  ...state.layers,
                  [layerId]: {
                    ...layer,
                    zValidation: {
                      ...layer.zValidation,
                      isOpen: newIsOpen,
                    },
                  },
                },
              };
            },
            false,
            'layers/toggleZValidationModal',
          ),

        /**
         * Set layer terrain data
         */
        setLayerTerrainData: (layerId, lineIndex, terrainPoints) =>
          set(
            (state) => {
              const layer = state.layers[layerId];
              if (!layer) return state;

              // Calculate overcover similar to the main terrain logic
              const analysisResult = layer.analysis.results.find(
                (r) => r.lineIndex === lineIndex,
              );
              const pipePoints =
                analysisResult?.details?.profilePoints || [];
              const minOvercover = get().settings.minOvercover;
              let overcoverAnalysis = null;

              if (pipePoints.length > 0 && terrainPoints.length > 0) {
                const warnings = [];
                let minOC = Infinity,
                  maxOC = -Infinity,
                  sumOC = 0,
                  countOC = 0;

                for (const pp of pipePoints) {
                  let closestTerrain = null;
                  let minDistDiff = Infinity;

                  for (const tp of terrainPoints) {
                    const terrainZ = tp.terrainZ ?? tp.z ?? null;
                    if (terrainZ === null || terrainZ === undefined)
                      continue;
                    const diff = Math.abs(tp.dist - pp.dist);
                    if (diff < minDistDiff) {
                      minDistDiff = diff;
                      closestTerrain = { ...tp, z: terrainZ };
                    }
                  }

                  if (!closestTerrain) continue;
                  const overcover = closestTerrain.z - pp.z;
                  if (overcover < minOC) minOC = overcover;
                  if (overcover > maxOC) maxOC = overcover;
                  sumOC += overcover;
                  countOC++;

                  if (overcover >= 0 && overcover < minOvercover) {
                    warnings.push({
                      pipeZ: pp.z,
                      terrainZ: closestTerrain.z,
                      overcover,
                      dist: pp.dist,
                      required: minOvercover,
                    });
                  }
                }

                overcoverAnalysis = {
                  hasData: countOC > 0,
                  warnings,
                  minOvercover: countOC > 0 ? minOC : null,
                  maxOvercover: countOC > 0 ? maxOC : null,
                  avgOvercover: countOC > 0 ? sumOC / countOC : null,
                };
              }

              return {
                layers: {
                  ...state.layers,
                  [layerId]: {
                    ...layer,
                    terrain: {
                      ...layer.terrain,
                      data: {
                        ...layer.terrain.data,
                        [lineIndex]: {
                          points: terrainPoints,
                          status: 'done',
                          overcover: overcoverAnalysis,
                        },
                      },
                    },
                  },
                },
              };
            },
            false,
            'layers/setTerrainData',
          ),

        /**
         * Set layer terrain status for a specific line
         */
        setLayerTerrainStatus: (
          layerId,
          lineIndex,
          status,
          error = null,
        ) =>
          set(
            (state) => {
              const layer = state.layers[layerId];
              if (!layer) return state;
              return {
                layers: {
                  ...state.layers,
                  [layerId]: {
                    ...layer,
                    terrain: {
                      ...layer.terrain,
                      data: {
                        ...layer.terrain.data,
                        [lineIndex]: {
                          ...(layer.terrain.data[lineIndex] || {}),
                          status,
                          error,
                        },
                      },
                    },
                  },
                },
              };
            },
            false,
            'layers/setTerrainStatus',
          ),

        /**
         * Pop next item from a layer's terrain fetch queue
         */
        popFromLayerTerrainQueue: (layerId) => {
          const state = get();
          const layer = state.layers[layerId];
          if (!layer?.terrain?.fetchQueue?.length) return undefined;
          const [next, ...rest] = layer.terrain.fetchQueue;
          set(
            {
              layers: {
                ...state.layers,
                [layerId]: {
                  ...layer,
                  terrain: {
                    ...layer.terrain,
                    fetchQueue: rest,
                    currentlyFetching: next ?? null,
                  },
                },
              },
            },
            false,
            'layers/popTerrainQueue',
          );
          return next;
        },

        /**
         * Prioritize a specific line in a layer's terrain fetch queue
         */
        prioritizeLayerTerrainFetch: (layerId, lineIndex) =>
          set(
            (state) => {
              const layer = state.layers[layerId];
              if (!layer) return state;
              if (
                layer.terrain.data[lineIndex]?.status === 'done' ||
                layer.terrain.data[lineIndex]?.status === 'loading'
              ) {
                return state;
              }
              const newQueue = layer.terrain.fetchQueue.filter(
                (i) => i !== lineIndex,
              );
              return {
                layers: {
                  ...state.layers,
                  [layerId]: {
                    ...layer,
                    terrain: {
                      ...layer.terrain,
                      fetchQueue: [lineIndex, ...newQueue],
                    },
                  },
                },
              };
            },
            false,
            'layers/prioritizeTerrainFetch',
          ),

        forceLayerTerrainFetch: (layerId, lineIndex) =>
          set(
            (state) => {
              const layer = state.layers[layerId];
              if (!layer) return state;
              const nextQueue = layer.terrain.fetchQueue.filter(
                (i) => i !== lineIndex,
              );
              return {
                layers: {
                  ...state.layers,
                  [layerId]: {
                    ...layer,
                    terrain: {
                      ...layer.terrain,
                      data: {
                        ...layer.terrain.data,
                        [lineIndex]: {
                          ...(layer.terrain.data[lineIndex] || {}),
                          status: 'loading',
                          error: null,
                        },
                      },
                      fetchQueue: [lineIndex, ...nextQueue],
                    },
                  },
                },
              };
            },
            false,
            'layers/forceTerrainFetch',
          ),

        /**
         * Get combined data from all visible layers (for components that need merged view)
         */
        getVisibleLayersData: () => {
          const { layers, layerOrder } = get();
          const combinedPoints = [];
          const combinedLines = [];

          for (const layerId of layerOrder) {
            const layer = layers[layerId];
            if (!layer || !layer.visible || !layer.data) continue;

            // Add points with layer reference
            layer.data.points?.forEach((point, index) => {
              combinedPoints.push({
                ...point,
                _layerId: layerId,
                _originalIndex: index,
              });
            });

            // Add lines with layer reference
            layer.data.lines?.forEach((line, index) => {
              combinedLines.push({
                ...line,
                _layerId: layerId,
                _originalIndex: index,
              });
            });
          }

          return { points: combinedPoints, lines: combinedLines };
        },

        /**
         * Check if we're in multi-layer mode (more than one layer)
         */
        isMultiLayerMode: () => {
          return get().layerOrder.length > 1;
        },

        /**
         * Get all visible layer IDs
         */
        getVisibleLayerIds: () => {
          const { layers, layerOrder } = get();
          return layerOrder.filter((id) => layers[id]?.visible);
        },

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
                layers: {},
                layerOrder: [],
                parsing: { ...initial.parsing },
                validation: { ...initial.validation },
                analysis: { ...initial.analysis },
                terrain: { ...initial.terrain },
                outliers: { ...initial.outliers },
                ui: { ...initial.ui },
                // Keep settings as-is
                settings: state.settings,
              };
            },
            false,
            'global/resetAll',
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
        version: STORAGE_VERSION,
        // SECURITY: Exclude customWmsConfig from persistence
        // Avoid persisting large datasets (terrain/layers/data) to prevent quota errors
        // Credentials should NEVER be stored in localStorage
        partialize: (state) => ({
          settings: state.settings,
          ui: state.ui,
          lastActive: state.lastActive,
        }),
        migrate: (persistedState, version) => {
          if (!persistedState) return persistedState;

          const fromVersion =
            typeof version === 'number' ? version : 0;
          let nextState = persistedState;

          if (fromVersion < 3) {
            const currentMin = nextState?.settings?.minOvercover;
            if (currentMin === 2) {
              nextState = {
                ...nextState,
                settings: {
                  ...nextState.settings,
                  minOvercover: 1.6,
                },
              };
            }
          }

          return nextState;
        },
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
                sidebarOpenSection: 'oversikt',
                sidebarOpenSectionBeforeFieldValidation: null,
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
                highlightedFeatureIds: null,
                fieldValidationFilterActive: false,
              };
            } else {
              if (state.ui.sidebarOpenSection === undefined) {
                state.ui.sidebarOpenSection = 'oversikt';
              }
              if (
                state.ui.sidebarOpenSectionBeforeFieldValidation ===
                undefined
              ) {
                state.ui.sidebarOpenSectionBeforeFieldValidation =
                  null;
              }
              if (state.ui.highlightedCode === undefined) {
                state.ui.highlightedCode = null;
              }
              if (state.ui.mapBaseLayer === undefined) {
                state.ui.mapBaseLayer = 'Kartverket Topo';
              }
              if (state.ui.mapOverlayVisibility === undefined) {
                state.ui.mapOverlayVisibility = {
                  data: true,
                  geminiWms: true,
                  eiendomsgrenser: true,
                };
              } else {
                if (
                  state.ui.mapOverlayVisibility.data === undefined
                ) {
                  state.ui.mapOverlayVisibility.data = true;
                }
                if (
                  state.ui.mapOverlayVisibility.geminiWms ===
                  undefined
                ) {
                  state.ui.mapOverlayVisibility.geminiWms = true;
                }
                if (
                  state.ui.mapOverlayVisibility.eiendomsgrenser ===
                  undefined
                ) {
                  state.ui.mapOverlayVisibility.eiendomsgrenser =
                    true;
                }
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
              if (state.ui.layerDataTable === undefined) {
                state.ui.layerDataTable = {
                  isOpen: false,
                  layerId: null,
                  activeTabByLayer: {},
                  sortingByLayer: {},
                  columnOrderByLayer: {},
                };
              } else {
                if (state.ui.layerDataTable.isOpen === undefined) {
                  state.ui.layerDataTable.isOpen = false;
                }
                if (state.ui.layerDataTable.layerId === undefined) {
                  state.ui.layerDataTable.layerId = null;
                }
                if (
                  state.ui.layerDataTable.activeTabByLayer ===
                  undefined
                ) {
                  state.ui.layerDataTable.activeTabByLayer = {};
                }
                if (
                  state.ui.layerDataTable.sortingByLayer ===
                  undefined
                ) {
                  state.ui.layerDataTable.sortingByLayer = {};
                }
                if (
                  state.ui.layerDataTable.columnOrderByLayer ===
                  undefined
                ) {
                  state.ui.layerDataTable.columnOrderByLayer = {};
                }
              }
              if (state.ui.highlightedFeatureIds === undefined) {
                state.ui.highlightedFeatureIds = null;
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
              if (
                state.ui.fieldValidationFilterActive === undefined
              ) {
                state.ui.fieldValidationFilterActive = false;
              }
              // Layer UI state migration
              if (state.ui.expandedLayerId === undefined) {
                state.ui.expandedLayerId = null;
              }
              if (state.ui.highlightedLayerId === undefined) {
                state.ui.highlightedLayerId = null;
              }
            }

            // Initialize layers if not present
            if (!state.layers) {
              state.layers = {};
            }
            if (!state.layerOrder) {
              state.layerOrder = [];
            }

            if (!state.settings) {
              state.settings = {
                theme: 'light',
                locale: 'nb-NO',
                autoValidateOnUpload: true,
                showWarnings: true,
                lastFileName: null,
                inclineRequirementMode: 'fixed10',
                minOvercover: 1.6,
              };
            } else if (
              state.settings.inclineRequirementMode === undefined
            ) {
              state.settings.inclineRequirementMode = 'fixed10';
            }

            if (state.settings.minOvercover === undefined) {
              state.settings.minOvercover = 1.6;
            }

            const now = Date.now();
            const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds

            if (
              state.lastActive &&
              now - state.lastActive > oneHour
            ) {
              console.log(
                'Session expired (1h timeout). Clearing persisted data.',
              );
              state.clearFile();
              state.clearData();
              state.resetParsing();
              state.clearValidationResults();
              state.updateLastActive();
            }
          }
        },
      },
    ),
    { name: 'GMI-Validator-Store' },
  ),
);

export default useStore;
