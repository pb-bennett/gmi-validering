import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

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
            (state) => ({
              data,
              // Reset all UI filters when new data is loaded
              ui: {
                ...state.ui,
                highlightedCode: null,
                hiddenCodes: [],
                highlightedType: null,
                highlightedTypeContext: null,
                hiddenTypes: [],
              },
            }),
            false,
            'data/set'
          ),
        clearData: () => set({ data: null }, false, 'data/clear'),

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
        },

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
            {
              file: null,
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
              ui: {
                detailsPanelOpen: false,
                selectedRecordId: null,
                filterSeverity: 'all',
                mapViewOpen: false,
                sidebarOpen: true,
              },
              // Keep settings
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
