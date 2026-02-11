# New feature: Terrain Profile

## Description

The aim of this feature is to overlay a relatively accurate terrain profile onto the profilanalyse plots. This will help users better understand how the terrain affects pipe gradients and identify potential issues in the design and issues with too little overcover.

### Data Source

The terrain data will be fetched from Geonorges height data API. Specifications for the API can be found here: https://ws.geonorge.no/hoydedata/v1/

Maxmium 50 set of points can be requested in a single API call. Each point request requires X and Y coordinates, and requires the coordinate reference system to be specified (EPSG:25832 or EPSG:4326).

### Thoughts on implementation

1. Ledninger vary greatly in length. We need a method to calculate coordinates along the path of each ledning. A simple approach would be to sample points at regular intervals (e.g., every 1 meter) along the ledning's geometry.
2. Each ledning point that already exists in the profilanalyse a height should be fetched. Then interpolate additional points along the ledning to ensure a smooth terrain profile.
3. To optimize API calls, we can batch requests for multiple ledninger. Group ledninger that are close together and fetch their terrain data in a single API call.
4. Care should be taken not to over load the API with too many requests in a short period. Implementing a rate-limiting mechanism or caching previously fetched terrain data can help mitigate this.
5. Once the terrain data is fetched, it should be integrated into the existing profilanalyse plots. The terrain profile can be displayed as a separate line on the plot, allowing users to compare the pipe gradient against the terrain elevation.
6. Hovering over a point in the profilanalyse should show both the pipe elevation and the terrain elevation at that point.
7. An automatic validation will check for sections where the pipe is too close to the terrain (e.g., less than a specified minimum overcover). Warnings should be generated for these sections. Use 2m as a starting standard for this check, but make it changable. There will therefore we two flags that can be shown on the profilanalyse: one for pipe gradient issues and one for overcover issues.
8. The profilanalyse should run as soon as the app loads the GMI file, rather than waiting for the user to click on the profilanalyse button.
9. Ledninger can have a loading spinner or similar way to show that it is not done loading height data yet. However the app should be fully usable while height data is loading in the background. The app should prioritise the currently viewed ledning for data fetching if it is not already loaded.

---

## Copilot notes (2026-01-18)

### Observations from existing code

- Profilanalyse is driven by `analyzeIncline()` in [src/lib/analysis/incline.js](src/lib/analysis/incline.js) and the UI is rendered in [src/components/InclineAnalysisModal.js](src/components/InclineAnalysisModal.js).
- Analysis is currently executed manually via the sidebar button in [src/components/Sidebar.js](src/components/Sidebar.js) and not on file load.
- Analysis state is stored in the zustand store at [src/lib/store.js](src/lib/store.js) (`analysis.results`, `analysis.isOpen`, etc.).

### API specs summary (Geonorge Høydedata)

- Recommended endpoint: `GET /punkt` (selects best available height automatically).
- Multiple points are supported via `punkter=[[øst,nord],[øst,nord],...]` with **max 50 points per request**.
- Coordinate system is required via `koordsys` (EPSG as integer, e.g., 25832 or 4326).
- Single-point queries can use `ost` + `nord`, but batching should prefer `punkter`.
- Response schema: `{ koordsys, punkter: [{ x, y, z, datakilde, terreng }] }`.
- OpenAPI: https://ws.geonorge.no/hoydedata/v1/openapi.json

### Implementation plan (draft)

1. **Terrain service layer**
   - Add a small client in `src/lib/analysis/terrain.js` (or similar) that builds `/punkt` requests, batches into 50-point chunks, handles EPSG, and caches results by `(epsg,x,y)`.
   - Add rate limiting (simple queue + concurrency limit) to avoid request bursts.

2. **Sampling points along a line**
   - Extend `analyzeIncline()` (or a new terrain-specific analysis) to build a sampled `profilePoints` list for each ledning (e.g., endpoints + interpolated points at fixed spacing).
   - Track cumulative distance for each sampled point to align with the existing profile visualization.

3. **Fetch terrain heights**
   - For each sampled point, request terrain height from the service.
   - Store `terrainZ` alongside `z` in `profilePoints` (or store a parallel `terrainProfilePoints`).

4. **Overcover validation**
   - Add a configurable `minOvercover` (default 2m) in settings.
   - Compute `overcover = terrainZ - pipeZ` per point/segment and flag violations.
   - Expose a distinct flag set for overcover warnings alongside existing incline warnings.

5. **Visualization updates**
   - In [src/components/InclineAnalysisModal.js](src/components/InclineAnalysisModal.js), render a terrain line over the pipe line and show both elevations on hover.
   - Add overcover warning markers on the profile (distinct from incline warning markers).

6. **Background loading + UX**
   - Track per-ledning terrain loading state in the store (e.g., `analysis.terrainStatus[lineIndex]`).
   - Show a spinner/indicator on the list item while terrain data is pending.
   - Prioritize terrain fetch for the currently selected ledning.

7. **Auto-run analysis on file load**
   - Trigger incline analysis (and terrain bootstrap) in the `setData` flow or in [src/components/FileUpload.js](src/components/FileUpload.js) once parsing completes.
   - Keep modal closed by default, but results should be ready immediately.

### Questions to resolve before implementation

1. Which EPSG should be used by default (25832 vs 4326), and is EPSG known per file or per project?
   `It is stated in the file`
2. What sampling interval should we use along each ledning (e.g., 1m, 2m, 5m)?
   `1m should be sufficient - we try this first but may adjust later if performance is an issue`
3. Should we use `/punkt` (best available) or a specific `/datakilder/{datakilde}/punkt`?
   `Use /punkt for best available data`
4. Is caching in-memory sufficient, or should we persist cached terrain heights between sessions?
   `In-memory caching should be sufficient for now`
5. Should terrain lookups run for all ledninger eagerly, or only on-demand + prefetch for nearby lines?
   `Eagerly for all ledninger, but prioritize the currently viewed ledning first`
6. How should overcover warnings be presented (icons on profile only, list badges, or both)?
   `Both on the profile and in the analysis result list with distinct icons/badges`
7. Should overcover warnings affect the global analysis `status` (e.g., add a new status or separate badges)?
   `Add separate badges for overcover warnings to keep them distinct from incline warnings`
8. Should terrain heights be fetched for pressure pipes too, or only gravity pipes?
   `It is relavant for all pipe types, so yes for both gravity and pressure pipes`
9. Confirm default overcover threshold (2m) and where it should be configurable (standards modal vs separate settings).
   `2m is fine as default, it can be configurable in the standards modal under "Krav til overdekning"`

## New thoughts after review

- Display a some stats for use during development to help tune performance, e.g., number of terrain requests made, average points per ledning, average request time, cache hit rate. Make this data copyable to clipboard for easy sharing.

---

## Copilot feedback + coordinate sampling details (2026-01-18)

### Additional feedback on your responses

- Great clarity on EPSG selection and the /punkt endpoint choice; this removes a major ambiguity.
- Eager fetch + priority for the current ledning suggests we should implement a fetch queue with “front-of-queue” inserts for the active line to keep UX responsive.
- Since overcover warnings will be shown in the list and profile, the analysis result object should carry a distinct `overcoverWarnings` summary (e.g., count + worst value) to render badges without conflating incline status.
- Adding performance stats is a good idea; we can gate them behind a simple “Dev diagnostics” accordion and keep the data in-memory only.

### How to calculate coordinates along lines (no heavy package needed)

We already have a polyline as an ordered list of points. We can generate sample points at fixed spacing (1m) using straightforward vector math per segment:

1. **Segment representation**
   - For each pair of consecutive points $P_i = (x_i, y_i)$ and $P_{i+1} = (x_{i+1}, y_{i+1})$ compute:
     - Vector $\vec{v} = (dx, dy) = (x_{i+1}-x_i, y_{i+1}-y_i)$
     - Segment length $L = \sqrt{dx^2 + dy^2}$

2. **Place samples at fixed interval**
   - Let the sampling interval be $s=1$ meter.
   - Maintain a running “distance since last sample” accumulator so spacing is uniform across segments.
   - For each segment, compute the first sample position at distance $d$ from the segment start (carried over from the previous segment). Then place samples every $s$ meters until the end of the segment.
   - Each sample point is:
     - $P = P_i + t \cdot \vec{v}$ where $t = d / L$ (a fraction between 0 and 1).

3. **Carry remainder across segments**
   - If a segment ends before you reach the next sample, carry the leftover distance to the next segment.
   - This keeps the 1m spacing consistent across the whole polyline rather than restarting at each segment.

4. **Include endpoints**
   - Always include the first and last vertices so the terrain profile aligns with the pipe endpoints.

5. **Edge cases**
   - Skip zero-length segments (duplicate coordinates).
   - If the total length is shorter than the sampling interval, use just the endpoints.

### Should we use a package?

- **If EPSG is projected in meters** (likely 25832 for Norwegian data), the above math is correct and no package is needed.
- **If EPSG is 4326 (lat/long)**, the spacing in meters is not linear; we should either:
  - Convert to a projected CRS (e.g., 25832) using a small package like `proj4`, then sample in meters; or
  - Approximate using geodesic distance (more complex and slower).

Given your note that EPSG is stated in the file, I recommend:

- Use **simple linear sampling** when EPSG is projected (25832, 25833, etc.).
- If EPSG is 4326, **use `proj4`** to project to meters before sampling, then convert sampled points back to 4326 for the API call (or call the API directly in the original EPSG if we keep points in 4326). This keeps spacing accurate with minimal added complexity.

---

## Copilot thoughts on terrain profile plotting (2026-01-18)

### Line style: smooth vs. raw

- **Default: straight polyline** between sampled terrain points. This is faithful to the data and keeps the profile “honest,” especially when heights come from a raster or mixed sources.
- **Optional smoothing (UI toggle)**: a subtle smoothing pass can make the profile easier to read, but it can also hide sharp terrain changes that may matter for overcover checks.

### If we add smoothing, keep validation on raw data

- Use **raw samples for all calculations** (overcover warnings, min/max, stats), and **only smooth the rendered SVG path**.
- This avoids false negatives/positives from curve interpolation.

### Suggested smoothing approach (if needed)

- A light **moving average** window (e.g., 3–5 points) on the terrain $z$ values only.
- Keep endpoints fixed so the terrain line still meets the start/end points.
- Do not smooth the pipe line; it should reflect the actual measured pipe geometry.

### Practical plotting details

- Render terrain line **above** the pipe line with a lighter, semi-transparent stroke.
- Use a **dashed style** or thinner stroke to visually differentiate terrain from pipe geometry.
- When hovering, show both $z_{pipe}$ and $z_{terrain}$, plus $overdekning = z_{terrain} - z_{pipe}$.
- If smoothing is enabled, show a small badge “Smoothed” so users know what they’re seeing.

### Recommendation

Start with **raw polyline only** (no smoothing). If users find it visually noisy, add a **toggleable smoothing** layer later. This keeps the initial implementation simpler and the validation reliable.

## Thoughts on terrain type

- The API returns a `terreng` field indicating terrain type (e.g., land, water, built-up). Let's start by including a list of different terrain types in the dev diagnostics panel to see what data we get. This data can be used to potentially generate a colour coded overlay on the profile in future iterations, but for now just collecting the data will be useful.
