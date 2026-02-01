# CODE REVIEW - POTENTIAL IMPROVEMENTS TO CODEBASE

**Date:** January 31, 2026  
**Reviewed by:** GitHub Copilot  
**Project:** GMI Validering (gmi-validering)

---

## Executive Summary

This document provides a comprehensive code review of the GMI Validering codebase, focusing on efficiency, scalability, code organization, and potential refactoring opportunities. The application is a Next.js-based tool for validating GMI, SOSI, and KOF files used for water/wastewater infrastructure data in Norwegian municipalities.

### Key Findings

- **Several large monolithic files** that would benefit from modularization
- **Duplicated UI patterns** that could be extracted into reusable components
- **State management** could be optimized with slice separation
- **Opportunities for performance optimization** in map rendering and data processing
- **Alternative packages** worth considering for specific use cases

---

## 1. File Size & Complexity Analysis

### Critical Files Requiring Refactoring

| File                                                              | Lines | Issue                                                 |
| ----------------------------------------------------------------- | ----- | ----------------------------------------------------- |
| [MapInner.js](src/components/MapInner.js)                         | 3,121 | Far too large; contains rendering, styling, utilities |
| [store.js](src/lib/store.js)                                      | 2,553 | Monolithic store with too many concerns               |
| [Sidebar.js](src/components/Sidebar.js)                           | 2,027 | Multiple embedded controls that should be extracted   |
| [InclineAnalysisModal.js](src/components/InclineAnalysisModal.js) | 1,642 | Complex modal with chart rendering                    |
| [LayerPanel.js](src/components/LayerPanel.js)                     | 1,345 | Similar to Sidebar - embedded sub-components          |

**Recommendation:** Any file over 500 lines should be considered for splitting. The industry standard is to keep components under 200-300 lines for maintainability.

---

## 2. Component Refactoring Opportunities

### 2.1 Extract Reusable UI Components

The codebase has repeated UI patterns that should be abstracted:

#### A. Button Component

Multiple components define similar button styling inline:

```javascript
// Pattern seen in Sidebar.js, LayerPanel.js, InclineAnalysisModal.js
<button
  className="w-full px-3 py-2 text-xs font-medium rounded transition-colors border"
  style={{
    backgroundColor: 'var(--color-primary)',
    color: 'white',
    borderColor: 'var(--color-primary-dark)',
  }}
  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-dark)')}
  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
>
```

**Recommendation:** Create a `Button.js` component with variants:

```javascript
// src/components/ui/Button.js
export function Button({
  variant = 'primary',
  size = 'sm',
  children,
  ...props
}) {
  // Centralized styling logic
}
```

#### B. Modal Component

There are 8+ modal implementations with similar patterns:

- `DataDisplayModal.js`
- `ZValidationModal.js`
- `InclineAnalysisModal.js`
- `WmsLayerModal.js`
- `FieldDetailModal.js`
- `StandardsInfoModal.js`
- Add layer modal (inline in page.js)

**Recommendation:** Create a generic `Modal.js` wrapper:

```javascript
// src/components/ui/Modal.js
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50">
      {/* Standard modal shell */}
    </div>
  );
}
```

#### C. Analysis Control Component

The pattern for analysis buttons is repeated in both `Sidebar.js` and `LayerPanel.js`:

- `InclineAnalysisControl`
- `ZValidationControl`
- `FieldValidationControl`
- `TopplokControl`

**Recommendation:** Extract to `src/components/controls/AnalysisControls.js` and pass layer-specific props.

#### D. Icon Components

SVG icons are inlined throughout the codebase. Consider:

- Creating an `Icon.js` component with a lookup table
- Or using a lightweight icon library like `lucide-react` (~50KB gzipped)

### 2.2 MapInner.js Decomposition

This 3,121-line file should be split into:

| Proposed File                      | Responsibility                                                  |
| ---------------------------------- | --------------------------------------------------------------- |
| `map/constants.js`                 | `FCODE_COLORS`, `INFRA_CATEGORIES`, `LEGEND_ITEMS`              |
| `map/markers.js`                   | `createSvgMarker()`, `getLegendSvg()`                           |
| `map/styling.js`                   | `getColorByFCode()`, `getCategoryByFCode()`, `normalizeFcode()` |
| `map/layers/PointsLayer.js`        | Point rendering logic                                           |
| `map/layers/LinesLayer.js`         | Line/polyline rendering logic                                   |
| `map/layers/MeasurementLayer.js`   | Measurement tool overlay                                        |
| `map/handlers/MapEventHandlers.js` | Click, hover, zoom events                                       |
| `MapInner.js`                      | Composition of the above                                        |

### 2.3 Store Slice Separation

The current [store.js](src/lib/store.js) is a 2,553-line monolith. Zustand supports slice patterns:

**Current Structure (problematic):**

```javascript
const useStore = create(
  persist((set, get) => ({
    // 2500+ lines of everything mixed together
  })),
);
```

**Recommended Structure:**

```
src/lib/store/
├── index.js           # Combines slices
├── slices/
│   ├── fileSlice.js   # File metadata
│   ├── dataSlice.js   # Parsed data
│   ├── parsingSlice.js
│   ├── validationSlice.js
│   ├── analysisSlice.js
│   ├── terrainSlice.js
│   ├── outlierSlice.js
│   ├── layerSlice.js
│   ├── uiSlice.js
│   ├── settingsSlice.js
│   └── wmsSlice.js
├── middleware.js      # persist, devtools config
└── types.js           # TypeScript types (if migrating)
```

**Example slice:**

```javascript
// src/lib/store/slices/terrainSlice.js
export const createTerrainSlice = (set, get) => ({
  terrain: {
    data: {},
    fetchQueue: [],
    currentlyFetching: null,
  },
  setTerrainData: (lineIndex, terrainPoints) => {
    /* ... */
  },
  setTerrainStatus: (lineIndex, status, error) => {
    /* ... */
  },
  // ... other terrain actions
});
```

---

## 3. Performance Optimizations

### 3.1 Map Rendering

**Issue:** GeoJSON features are re-rendered on every state change.

**Current approach:**

```javascript
const geoJsonData = useMemo(() => { /* builds GeoJSON */ }, [data, layers, ...]);
```

**Recommendations:**

1. **Virtualization for large datasets:** Consider `react-leaflet-markercluster` or custom clustering for files with 1000+ points
2. **Canvas rendering:** For very dense data, switch from SVG markers to Canvas tiles using `leaflet.canvas-markers`
3. **Web Workers:** Move GeoJSON transformation to a worker to avoid blocking the main thread

### 3.2 Terrain Fetching

The current implementation in `TerrainFetcher.js` is well-designed with queuing, but could benefit from:

1. **IndexedDB caching:** Persist terrain data across sessions using `idb-keyval`:

   ```javascript
   import { get, set } from 'idb-keyval';
   // Cache terrain responses for reuse
   ```

2. **Request deduplication:** Ensure identical coordinates don't trigger multiple API calls

### 3.3 Store Subscriptions

**Issue:** Components subscribe to entire state objects rather than specific fields.

**Current (triggers re-renders):**

```javascript
const ui = useStore((state) => state.ui);
```

**Better (selective subscription):**

```javascript
const fieldValidationOpen = useStore(
  (state) => state.ui.fieldValidationOpen,
);
const dataTableOpen = useStore((state) => state.ui.dataTableOpen);
```

The codebase already uses `useShallow` in some places - this should be applied consistently.

### 3.4 Memoization Gaps

Several expensive computations could benefit from memoization:

- `createSvgMarker()` - memoize by (category, color, isHighlighted)
- Style functions in GeoJSON layers
- Coordinate transformation with proj4

---

## 4. Package Alternatives

### 4.1 Current Dependencies Review

| Package              | Version | Purpose               | Assessment                        |
| -------------------- | ------- | --------------------- | --------------------------------- |
| `react-leaflet`      | 5.0.0   | Map rendering         | ✅ Good choice                    |
| `leaflet`            | 1.9.4   | Map core              | ✅ Stable                         |
| `zustand`            | 5.0.9   | State management      | ✅ Excellent for this use case    |
| `@react-three/fiber` | 9.5.0   | 3D rendering          | ✅ Good, but heavy                |
| `sosijs`             | 0.0.11  | SOSI parsing          | ⚠️ Low maintenance, consider fork |
| `proj4`              | 2.20.2  | Coordinate transforms | ✅ Standard choice                |
| `iconv-lite`         | 0.7.1   | Encoding              | ✅ Needed for legacy files        |

### 4.2 Recommended Additions

| Package                 | Purpose            | Why                                              |
| ----------------------- | ------------------ | ------------------------------------------------ |
| `@tanstack/react-table` | Data table         | Virtualization, sorting, filtering out-of-box    |
| `recharts` or `nivo`    | Charts             | Replace custom SVG chart in InclineAnalysisModal |
| `lucide-react`          | Icons              | Consistent, tree-shakeable icon set              |
| `zod`                   | Validation schemas | Type-safe parsing of GMI/KOF/SOSI fields         |
| `idb-keyval`            | IndexedDB          | Persist terrain cache across sessions            |
| `comlink`               | Web Workers        | Easier worker communication for parsing          |

### 4.3 Consider Removing

| Package        | Reason                                  |
| -------------- | --------------------------------------- |
| `@types/three` | Only needed if using TypeScript         |
| `buffer`       | Possibly redundant with modern bundlers |

---

## 5. Architecture Improvements

### 5.1 Error Boundaries

**Issue:** No error boundaries exist. A parsing error or map crash takes down the entire app.

**Recommendation:** Add error boundaries at key points:

```
App
├── ErrorBoundary (app-level)
│   ├── FileUpload
│   └── MainLayout
│       ├── ErrorBoundary (sidebar)
│       │   └── Sidebar
│       ├── ErrorBoundary (map)
│       │   └── MapView
│       └── ErrorBoundary (3D)
│           └── Viewer3D
```

### 5.2 TypeScript Migration

The project uses JavaScript with JSDoc comments in some places. Consider gradual TypeScript adoption:

**Benefits:**

- Type safety for complex data structures (GeoJSON, attributes)
- Better IDE support and refactoring
- Self-documenting interfaces

**Migration path:**

1. Enable `// @ts-check` in critical files
2. Add `.d.ts` files for key types (GmiData, ParsedFeature, etc.)
3. Rename files to `.tsx` one at a time
4. Set `strict: false` initially, increase strictness over time

### 5.3 Testing Strategy

**Current:** No test files found.

**Recommended structure:**

```
src/
├── lib/
│   ├── parsing/
│   │   ├── gmiParser.js
│   │   └── __tests__/
│   │       └── gmiParser.test.js
│   └── analysis/
│       ├── incline.js
│       └── __tests__/
│           └── incline.test.js
└── components/
    └── __tests__/
        └── FileUpload.test.js
```

**Priority test targets:**

1. Parsers (gmiParser, sosiParser, kofParser) - high risk, pure functions
2. Analysis functions (incline, zValidation, outliers)
3. Validation logic
4. Store actions (using `zustand/testing`)

### 5.4 API Route Structure

Currently only one API route exists (`/api/wms-proxy`). Consider organizing for future expansion:

```
src/app/api/
├── wms-proxy/route.js      # ✅ Exists
├── terrain/route.js        # Future: proxy Geonorge API
├── export/
│   ├── gmi/route.js        # Future: export modified GMI
│   └── report/route.js     # Future: PDF validation report
└── validate/route.js       # Future: server-side validation
```

---

## 6. Code Quality Improvements

### 6.1 Consistent Naming

**Issues found:**

- `linesParsed` vs `lines` (in parsers)
- `S_FCODE` vs `Tema` vs `FCODE` (attribute access patterns)
- Mixed Hungarian notation (`isOpen`, `hasData`) and plain names

**Recommendation:** Document naming conventions in `COPILOT_INSTRUCTIONS.md`.

### 6.2 Dead Code Removal

Found potentially unused files:

- `DataTable.js.old`
- `Sidebar.js.bak`

**Recommendation:** Remove these or move to a `/deprecated` folder.

### 6.3 Console Logging

Multiple `console.log` and `console.error` statements throughout production code.

**Recommendation:**

1. Remove debug logs
2. Use a logging utility that respects `NODE_ENV`
3. Consider error tracking (Sentry integration)

### 6.4 Magic Numbers

Several hardcoded values should be constants:

```javascript
// In incline.js
if (dim < 200) return { min: 10 };
if (dim <= 315) return { min: 4 };
return { min: 2 };

// Better:
const INCLINE_REQUIREMENTS = {
  SMALL: { maxDim: 200, minIncline: 10 },
  MEDIUM: { maxDim: 315, minIncline: 4 },
  LARGE: { minIncline: 2 },
};
```

---

## 7. Scalability Considerations

### 7.1 Large File Handling

**Current limitation:** Files are parsed entirely in memory.

**Improvements for large files (>50MB):**

1. Streaming parser using `ReadableStream`
2. Progress reporting during parsing
3. Lazy loading of coordinate data
4. IndexedDB storage for parsed data

### 7.2 Multi-Layer Performance

The layer system is well-designed but may slow with many layers:

**Recommendations:**

- Limit visible layers to 5-10
- Add layer merging/flattening option
- Implement level-of-detail (LOD) for zoomed-out views

### 7.3 State Persistence

**Current:** `zustand/persist` to localStorage.

**Issues:**

- localStorage limit is ~5-10MB
- Large files can exceed quota

**Recommendation:** Use IndexedDB for data storage, localStorage only for settings:

```javascript
persist(
  (set, get) => ({
    /* ... */
  }),
  {
    name: 'gmi-settings',
    partialize: (state) => ({
      settings: state.settings,
      ui: { theme: state.ui.theme },
    }),
  },
);
```

---

## 8. Quick Wins (Low Effort, High Impact)

| Task                                 | Effort | Impact                       |
| ------------------------------------ | ------ | ---------------------------- |
| Extract `Button` component           | 2h     | Consistency, maintainability |
| Extract `Modal` wrapper              | 3h     | Reduce duplication           |
| Move constants from MapInner.js      | 1h     | Cleaner imports, reusability |
| Add error boundary to MapView        | 1h     | Prevent full app crashes     |
| Remove .old/.bak files               | 10min  | Clean repo                   |
| Add `constants.js` for magic numbers | 2h     | Maintainability              |
| Consistent selector subscriptions    | 2h     | Performance                  |

---

## 9. Recommended Refactoring Priority

### Phase 1: Immediate (1-2 weeks)

1. Extract reusable UI components (Button, Modal, Icon)
2. Split MapInner.js into modules
3. Add error boundaries
4. Clean up dead code

### Phase 2: Short-term (1 month)

1. Refactor store into slices
2. Extract analysis controls to shared components
3. Add unit tests for parsers
4. Implement proper logging

### Phase 3: Medium-term (2-3 months)

1. TypeScript migration (gradual)
2. Performance optimization (virtualization, workers)
3. IndexedDB caching
4. Comprehensive test coverage

---

## 10. Conclusion

The GMI Validering application is functional and well-suited to its purpose. The main opportunities for improvement are:

1. **Modularization** - Breaking up large files into focused modules
2. **Component reuse** - Extracting common patterns
3. **Performance** - Optimizing for larger datasets
4. **Robustness** - Error handling and testing

The architecture is sound, and the choice of Zustand + React-Leaflet + Three.js is appropriate. The recommended changes are evolutionary improvements rather than fundamental restructuring.

---

_This review was generated based on analysis of the current codebase structure, file contents, and industry best practices._
