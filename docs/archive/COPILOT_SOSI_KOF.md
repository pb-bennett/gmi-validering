## New Feature: SOSI and KOF file support for app

### Description

Implement support for loading and visualizing SOSI and KOF file formats in the application. This includes parsing the file structures, extracting relevant geospatial data, and rendering the data accurately in both 2D and 3D views.

The main function of this app is to validate and analyse GMI files, and that content should remain the primary focus. However, adding support for SOSI and KOF files will enhance the app's versatility and usability for users who work with these formats.

SOSI is a national standard for for geospatial data in Norway, while KOF is a common format for exchanging geospatial data. Both formats are widely used in the industry, and their inclusion will broaden the app's applicability.

### SOSI

SOSI files can and should contain the same levels of detail as GMI files, including objects like KUM, SLUK, LOK, LEDNING etc. The app should be able to parse these objects and their attributes correctly.

### KOF

KOF files are much more primative and many of the apps current features will not be applicable. However, basic visualization of points and lines should be supported.

### Approach

1. Critical: The implementation of support for these new file formats should in no way impact the current function of the app with GMI files. The app must continue to perform all existing analyses and visualizations for GMI files without any degradation in performance or functionality.
2. Implement file upload functionality for SOSI and KOF files, allowing users to select and load these files into the app. The app should detect the file type based on the extension or file content.
3. Develop parsers for SOSI and KOF file formats to extract geospatial data and relevant attributes into the same internal data structures used for GMI files. These structures should not be altered in a way that affects GMI processing.
4. Ensure that the extracted data from SOSI and KOF files can be visualized in both 2D and 3D views, using the same rendering logic as for GMI files.
5. Test the implementation thoroughly with a variety of SOSI and KOF files to ensure compatibility and correct rendering, while also verifying that GMI file functionality remains intact.

---

## Findings & Recommendations

- **SOSI (recommended first-class support):** national Norwegian exchange format (Kartverket); contains rich object types (PUNKT, KURVE, FLATE, TRASE, etc.), attributes and often an explicit CRS (commonly EPSG:25832 or EPSG:4326). Common pitfalls include legacy encodings, multiline records, Z-values and vendor-specific object codes. Use a JS parser for prototyping (`sosijs`) and extend with in-app parsing heuristics and optional lightweight server-side helpers (for example a small Python service using `sosi`) for complex or legacy files. (refs: https://github.com/atlefren/sosijs, https://pypi.org/project/sosi/)

- **KOF (treat as ad-hoc):** no single authoritative modern public spec; typically simple coordinate/attribute text files (CSV/fixed-width). Expect missing CRS and dialect differences. Implement a tolerant, previewable parser and a small UI to let users map columns → fields.

## Available tools & libraries

- **sosijs** (Node) — lightweight JS SOSI parser; good for quick prototyping and small files: https://github.com/atlefren/sosijs
- **sosi (older)** — streaming parser but limited and older: https://github.com/mmichelli/sosi

- **proj4js / proj** — for coordinate reprojection (client-side vs server-side choices)

## Integration approach (high-level)

1. **File detection & upload**: Accept `.sos/.sosi/.kof/.txt` and sniff file content (`HODE`, `PUNKT`, `KOF` hints).
2. **Parser adapters**: Add `src/lib/parsing/sosiParser.js` (use `sosijs` primarily; extend with in-app parsing heuristics and optional Python helper for edge cases) and `src/lib/parsing/kofParser.js` (extensible, tolerant text parser with delimiter detection).
3. **Normalization**: Convert parsed features to a single internal model `{ id, geometry, objectType, properties, source: {format, filename} }` so existing GMI validators and renderers can be reused unchanged.
4. **Preview & mapping UI (KOF)**: Provide `KofImportPreview` for previewing rows, choosing CRS, and mapping columns to internal fields before import.
5. **Visualization**: Feed normalized GeoJSON into existing 2D/3D rendering (`MapView.js`, 3D components). Add toggle to show original object codes & source metadata.
6. **Tests & fixtures**: Add unit tests for parsing PUNKT/KURVE/FLATE with/without Z, encoding cases, and integration tests that compare outputs to authoritative fixtures and, where useful, to Python `sosi` conversions.

## Parsing & validation strategy

- Prefer **streaming** parsing for large files and emit features incrementally to enable progressive rendering.
- For topology or grouping that needs whole-file context, perform a light in-memory index or two-pass processing.
- Reprojection: prefer explicit SRID from file header; if missing, prompt the user to select CRS (commonly EPSG:25832 or EPSG:4326) and use `proj4js` client-side or server-side `proj`/Python helpers when needed.
- Malformed files: implement strict/lenient modes and collect parse warnings/errors for UI display.

## Risks & mitigations

- **Performance with large files** — mitigate via streaming, progress UI and optional server-side conversion.
- **Spec variability / legacy encodings** — add heuristics for encoding detection and strict/lenient parsing modes; consider using Python `sosi` on the server-side for particularly stubborn files.
- **Missing/incorrect CRS** — prompt user to disambiguate CRS and include axis-order tests.
- **KOF dialect fragmentation** — provide a preview & mapping UI and keep KOF parser plugin-friendly.

## Sample files & test sources

- Geonorge / Kartverket datasets (often available in SOSI): https://www.geonorge.no/
- `sosijs` test fixtures: https://github.com/atlefren/sosijs/tree/master/data

## Example files

- Example files can be found in `REF_FILES/SOSI` and `REF_FILES/KOF` directories in the project repository. These should be used to test and adapt the new parsing methods.
- Some of these files are older and may not contain many of the required data fields. These should be enough though to get started with initial parsing and visualization tests.
