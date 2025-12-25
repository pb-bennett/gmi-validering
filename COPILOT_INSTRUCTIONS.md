# GMI Validation Webapp – Overview & Aim

## Purpose

This project aims to provide a simple, web-based tool for **validating GMI files** delivered to Norwegian municipalities by contractors. These GMI files contain **as-built data** for water and wastewater (VA) infrastructure.

Before a municipality imports such files into its main VA database, the content must be checked to ensure:

- All **required fields** are present.
- The **values** follow expected formats and domains.
- No key information is missing for pipes, manholes (kummer), or related infrastructure.

This application will **automate** that checking process to reduce manual QA work.

## Core Features (Initial Scope)

- **Upload and parse GMI files** from contractors.
- **Automatically validate** the file structure and required fields.
- **Flag missing or invalid values** in a clear, user-friendly way.
- **Optional map view**: display the GMI geometry as vector data on a simple 2D map for visual inspection.

## Target Users

- Municipal engineers receiving as-built documentation.
- Contractors who want to pre-validate their GMI files before submission.

## Project Status

Planning stage — scope and requirements still being defined.

---

## Language & Terminology Rules

- **Development discussion language:** All coding conversation, design notes, and technical explanations must be in **English**.
- **Allowed Norwegian terms in dev chat:** You may freely use specific domain words interchangeably within English text, e.g. **“kommune”**, **“ledning”**, **“kum”**, **“kumbilde”**, **“VA”**.
- **User Interface language:** The application’s **entire UI must be in Norwegian (bokmål)** — no English strings, labels, tooltips, error messages, or placeholders in the UI.
  - Provide Norwegian bokmål text for all user-facing content.
  - Only use an English term if it is unavoidable (e.g., a proper noun or a technical name with no Norwegian equivalent).

---

## Design — Colour scheme

We will use the following palette consistently across the UI (except in the map section where local map standards apply):

- **Page background:** `#FAF3E1`
- **Cards / sections:** `#F5E7C6`
- **Primary actions:** `#CC4A09` (updated from `#FF6D1F` to meet WCAG AA for white text)
- **Text & icons:** `#222222`

> Note: The palette is chosen for a warm, high-contrast look. Map visuals should follow the mapping standards and may use different colors for layers and symbology.

**Decision log:**

- Updated primary color to **`#CC4A09`** on 2025-12-24 to ensure white button labels meet WCAG AA contrast requirements; previous primary was `#FF6D1F`.
- Tailwind now references CSS variables for colors (e.g., `--color-primary`) to allow runtime theming and easier review/changes.

---

## Design — Typography

We use a **dual-font system** to establish clear visual hierarchy while maintaining readability and professionalism for a municipal data-validation tool:

---

## Landing page — Onboarding & copy

When the app loads, the user must see a **clear, centered onboarding card** prompting them to upload a GMI file. All user-facing copy on this screen must be in **Norwegian (bokmål)**. Keep the UI minimal, modern, and accessible.

**Mandatory strings (Norwegian Bokmål):**

- **Title:** `Last opp en GMI-fil`
- **Instruction text:** `Dra og slipp en .gmi-fil her, eller klikk for å velge en fil.`
- **Primary action / file label:** `Velg fil`
- **Explanation summary:** `Om denne appen`
- **Short explanation (details):** `Denne applikasjonen sjekker at GMI-filer inneholder nødvendige felter og at verdier følger forventet format. Den flagger manglende eller ugyldige verdier før import til VA-databaser.`

**Behavioral notes:**

- The card should be centered vertically and horizontally on the page and use the project palette (`bg-card`, `text-text`, `bg-primary` for actions).
- The `Velg fil` control must be an accessible label for an actual `<input type="file">` (hidden input with visible label or button).
- Provide a brief, collapsible explanation using `<details><summary>` for quick access to the app purpose without leaving the page.
- Keep copy short and actionable — the goal is to get the user to upload a file quickly.

**Accessibility:**

- Use semantic elements (`section`, `h2`, `p`, `label`, `input`) and `aria-label` where appropriate.
- Ensure focus styles are visible for keyboard users (use `focus-visible` and ring utilities).
- Verify color contrast with current palette (primary button has white text on `#CC4A09` which meets WCAG AA).

**Implementation guidance:**

- Example: see `src/app/page.js` for a simple, copy-ready onboarding card and the exact Norwegian text to use.

---

### Font Stack

| Element              | Font         | Weight         | Usage                                        |
| -------------------- | ------------ | -------------- | -------------------------------------------- |
| **Body text**        | Roboto       | 400 (regular)  | Paragraph copy, form labels, table content   |
| **Body emphasis**    | Roboto       | 600 (semibold) | Strong emphasis within body text             |
| **Headings (h1–h3)** | Roboto Serif | 600–700        | Page titles, section headings, form sections |
| **UI elements**      | Roboto       | 600            | Button labels, badges, small caps            |

### Implementation Details

- **Google Fonts import:** Both fonts are loaded via Google Fonts with `display=swap` to prevent layout shift.
- **Font variables:** Configured in `src/app/layout.js` using Next.js's `next/font/google` module:
  - `--font-roboto` (Roboto weights 400, 600)
  - `--font-roboto-serif` (Roboto Serif weights 600, 700)
- **CSS class assignment:** Applied via Tailwind utility classes and `font-sans` / `font-serif` modifiers in component markup.
- **Language support:** Both fonts fully support Norwegian bokmål diacritics (æ, ø, å).

### Usage Examples

```jsx
// Heading example (h1)
<h1 className="font-serif font-bold text-3xl text-text">
  Validerings resultat
</h1>

// Body text example
<p className="font-sans font-normal text-base text-text">
  Dokumentasjonen er godkjent og klar for import.
</p>

// Button example
<button className="font-sans font-semibold px-4 py-2 bg-primary text-white">
  Last opp GMI-fil
</button>
```

### Rationale

- **Roboto (sans-serif)** for body: excellent readability at all sizes, clean and professional, optimal for forms and data display.
- **Roboto Serif (serif)** for headings: creates visual distinction and hierarchy; conveys authority appropriate for a municipal tool; pairs naturally with Roboto due to shared proportions.
- **Weight discipline:** 400 for reading, 600 for emphasis or headings, 700 only for major headings (h1). Avoids visual clutter.

---

## State Management — Zustand Architecture

This application uses **Zustand** for global state management. Zustand provides a lightweight, performant store with selective subscriptions and minimal boilerplate.

### Why Zustand?

- **Small bundle** — minimal overhead compared to Redux or Context.
- **Selective subscriptions** — components only re-render when their slice changes.
- **Simple API** — easy to read, test, and extend.
- **DevTools integration** — full Redux DevTools support for debugging.
- **Worker-friendly** — easy to update from Web Worker messages (for parsing large files).

### Store Structure

The global store is located at `src/lib/store.js` and is organized into **logical slices**:

#### 1. **File Slice** — uploaded file metadata

- `file`: `{ name, size, lastModified, type }` or `null`
- Actions: `setFile(fileMeta)`, `clearFile()`
- **Important:** Do NOT store raw file binary in the store. Keep files in-memory/ephemeral using refs or worker scope.

#### 2. **Parsing Slice** — parsing progress and status

- `parsing.status`: `'idle' | 'parsing' | 'done' | 'error'`
- `parsing.progress`: `0-100` (percentage)
- `parsing.error`: `string | null`
- `parsing.startedAt`, `parsing.completedAt`: timestamps
- Actions: `startParsing()`, `setParsingProgress(n)`, `setParsingDone()`, `setParsingError(msg)`, `resetParsing()`

#### 3. **Validation Slice** — validation results

- `validation.records`: Array of parsed GMI records
- `validation.summary`: `{ totalRecords, errorCount, warningCount, validCount }`
- `validation.errors`: Array of `{ line, field, message, severity }`
- `validation.warnings`: Array of warnings
- `validation.fieldStats`: Optional field presence/quality statistics
- Actions: `setValidationResults(results)`, `clearValidationResults()`

#### 4. **UI Slice** — UI state and interactions

- `ui.detailsPanelOpen`: boolean
- `ui.selectedRecordId`: string | null
- `ui.filterSeverity`: `'all' | 'errors' | 'warnings'`
- `ui.mapViewOpen`: boolean
- `ui.sidebarOpen`: boolean
- Actions: `toggleDetailsPanel()`, `selectRecord(id)`, `setFilterSeverity(severity)`, `toggleMapView()`, `toggleSidebar()`

#### 5. **Settings Slice** — user preferences (can be persisted to localStorage)

- `settings.theme`: `'light' | 'dark'` (future support)
- `settings.locale`: `'nb-NO'` (Norwegian bokmål)
- `settings.autoValidateOnUpload`: boolean
- `settings.showWarnings`: boolean
- `settings.lastFileName`: string | null
- Actions: `updateSettings(newSettings)`

#### 6. **Global Actions**

- `resetAll()`: Clears all state except settings (use when starting fresh validation)

#### 7. **Selectors** — computed/derived values

- `getFilteredErrors()`: Returns filtered errors/warnings based on `ui.filterSeverity`
- `isProcessing()`: Returns `true` if parsing is in progress
- `hasResults()`: Returns `true` if validation results exist

### Usage in Components

**Import the store:**

```jsx
import useStore from '@/lib/store';
```

**Subscribe to specific slices (selective):**

```jsx
// Only re-renders when file changes
const file = useStore((state) => state.file);
const setFile = useStore((state) => state.setFile);

// Only re-renders when parsing status changes
const parsingStatus = useStore((state) => state.parsing.status);

// Use multiple slices
const { errors, warnings } = useStore((state) => state.validation);
```

**Call actions:**

```jsx
// Set file metadata after user selects file
const handleFileChange = (e) => {
  const file = e.target.files[0];
  if (file) {
    useStore.getState().setFile({
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      type: file.type,
    });
    // Start parsing...
  }
};

// Clear all state when user wants to upload new file
const handleReset = () => {
  useStore.getState().resetAll();
};
```

**Use selectors:**

```jsx
const filteredErrors = useStore((state) => state.getFilteredErrors());
const isProcessing = useStore((state) => state.isProcessing());
```

### Best Practices

1. **Never store raw file binary** — keep file contents ephemeral (in refs, worker scope, or temporary variables).
2. **Use selective subscriptions** — subscribe only to the slice you need to avoid unnecessary re-renders.
3. **Keep actions simple** — actions should update state; complex logic goes in separate utilities or workers.
4. **Web Workers for parsing** — offload heavy parsing to a Web Worker; post progress updates that call `setParsingProgress()`.
5. **Norwegian strings only** — all error messages, status text, and user-facing strings in the store must be Norwegian (bokmål).
6. **DevTools** — use Redux DevTools browser extension to inspect state changes during development.
7. **Persistence** — only persist small metadata (settings) to localStorage; never persist file contents or sensitive data.

### Integration with Other Tools

- **TanStack Query / SWR**: Use for server-side validation API calls and caching. Keep server results separate from client parsing results.
- **Web Workers**: Post messages to update Zustand store (e.g., `postMessage({ type: 'PROGRESS', progress: 50 })` → `setParsingProgress(50)`).
- **Error Boundaries**: Wrap components with error boundaries; on parsing errors, call `setParsingError()` with Norwegian error message.

### Testing

- **Unit tests**: Test actions and selectors in isolation (e.g., verify `setFile()` updates state correctly).
- **Integration tests**: Test component interactions with store (e.g., file upload triggers parsing state change).
- **Mock store**: Use `create()` without devtools middleware for test environments.

---

## Available Resources & Reference Material

We have access to reference implementations and real-world data samples to guide development.

### 1. GMI Parser Implementation

A reference JavaScript parser is available in `REF_FILES/JS/lib/gmiParser.js`.

- **Type:** Class-based ES6 module (`GMIParser`).
- **Capabilities:**
  - Parses GMI headers (including coordinate systems).
  - Extracts feature definitions (`[L_]`, `[P_]`) and field names.
  - Parses feature data (`[+L_]`, `[+P_]`) including attributes and `/XYZ` coordinates.
  - Normalizes field values (integers, floats, booleans).
  - Extracts GUIDs.
- **Usage:** This script should be adapted or used as a reference for the client-side parsing logic in the Web Worker.

### 2. Validation Rules (Innmålingsinstruks)

We have a complete set of validation rules exported from a previous database in `src/data/fields.json` and the schema definition in `REF_FILES/JS/models/Field.js`.

- **Structure:** The rules define required fields, formats, and allowed values (codelists) for GMI objects.
- **Key Properties:**
  - `fieldKey`: The attribute name in the GMI file (e.g., "Høydereferanse").
  - `objectTypes`: Applies to "punktobjekter" (Points) or "ledninger" (Lines).
  - `required`: Validation strictness (`always`, `optional`, `conditional`, etc.).
  - `fieldFormat`: Data type (`Heltall`, `Desimaltall`, `Tekst`, `Kode`, `DD.MM.YYYY`, etc.).
  - `acceptableValues`: List of allowed values for "Kode" fields.

**Implementation Strategy:**

1.  **Static Config:** Use `src/data/fields.json` as the source of truth for validation rules. Import this JSON directly into the validation logic.
2.  **Validation Engine:** Create a pure JavaScript utility function (e.g., `validateRecord(record, rules)`) that:
    - Checks for missing required fields.
    - Validates data types against `fieldFormat`.
    - Validates enum values against `acceptableValues` when format is "Kode".
    - Returns an array of error/warning objects.
3.  **Integration:** Run this validation logic inside the Web Worker immediately after parsing, or in a separate "validate" step.

**Critical Constraint: Point vs. Line Separation**

- **Strict Separation:** Validation rules for **Points** (`punktobjekter`) and **Lines** (`ledninger`) must be kept completely separate.
- **Name Collision:** Fields often share names (e.g., "Materiale") but may have different allowed values or requirements depending on whether they belong to a Point or a Line.
- **Implementation:** The application must treat these as distinct schemas. Do not merge them into a generic "Field" definition. When validating, the engine must look up the rule set corresponding to the feature type (Point or Line).

### 3. Real-world GMI Examples

We have a library of actual GMI files from two Norwegian municipalities with different coordinate systems. Use these for testing parsing robustness and validation rules.

#### Færder Kommune (FK)

- **Location:** `REF_FILES/GMI/FK/`
- **Coordinate System:** EUREF89 UTM Zone 32 (`EPSG:25832`).
- **Header Example:**
  ```
  COSYS EUR89 32
  COSYS_EPSG 25832
  ```

#### Hadsel Kommune (HK)

- **Location:** `REF_FILES/GMI/HK/`
- **Coordinate System:** EUREF89 UTM Zone 33 (`EPSG:25833`).
- **Header Example:**
  ```
  COSYS EUR89 33
  COSYS_EPSG 25833
  ```

**Note:** When implementing map visualization, ensure the application correctly handles or transforms these different coordinate zones (e.g., using `proj4` as seen in the reference parser).

---

## Data Handling, Security & Architecture Constraints

### Data Handling

- **No server-side persistence**: Do not store uploaded `.gmi` contents on the server. Process files **in-memory only**, during a single request.
- **Browser-side storage allowed**: Parsed data and validation results may be stored **locally in the user's browser** (e.g., `localStorage` or `IndexedDB`) so results can be revisited during the session.
- **Temporary objects**: All backend temporary objects must be discarded immediately after the response is sent.

### Users & Authentication

- **No users**: There is **no authentication** or user system in v1.
- **No sessions**: Do not implement login, cookies, or persistent server
