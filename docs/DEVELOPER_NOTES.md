# Developer Notes

This repository contains a Next.js web app for validating Norwegian VA (water/wastewater) delivery datasets, primarily **GMI** files, with additional support for **SOSI** and **KOF**.

These notes are aimed at developers who want to understand how the app works behind the scenes.

---

## High-level Architecture

- **Client-first processing:** parsing, validation, and analysis run in the browser.
- **App Router + small API surface:** only a couple of server routes exist for stateless helpers (WMS proxy + anonymous usage tracking).
- **Zustand store:** global state lives in a single store with slices for parsing/validation/analysis/UI.

Key folders:

- `src/lib/parsing/` — parsers and adapters for GMI/SOSI/KOF
- `src/lib/validation/` — rule-based field validation
- `src/lib/analysis/` — incline, Z checks, terrain sampling, outlier detection, “topplokk” checks
- `src/components/` — UI (sidebar, tables, map, 3D viewer)
- `src/app/api/` — API routes (`track/`, `wms-proxy/`)

---

## Parsing & Normalisation

The goal of parsing is to convert multiple file formats into a shared internal representation (points/lines with geometry + attributes).

- **GMI:** `src/lib/parsing/gmiParser.js` implements signature checks, header parsing, and extraction of points/lines with CRS handling (via `proj4`).
- **SOSI:** `src/lib/parsing/sosiParser.js` uses `sosijs` and then normalises features.
- **KOF:** `src/lib/parsing/kofParser.js` is a tolerant text parser designed for real-world dialect differences.

`src/lib/parsing/normalizeFeature.js` is used to keep downstream rendering and validation consistent across formats.

---

## Validation

Field validation is rule-driven:

- Base rules are JSON: `src/data/rules/points.json` and `src/data/rules/lines.json`
- Domain-specific logic lives in custom rule modules: `src/data/rules/custom/`
- The rule engine is in `src/lib/validation/validator.js`

This makes it straightforward to add or adjust requirements without changing UI code.

---

## Analyses

Analyses run client-side and produce UI-friendly summaries + object lists:

- **Incline analysis:** detects backfall/flat/low incline for gravity pipes (`src/lib/analysis/incline.js`)
- **Z validation:** flags missing/invalid Z-values in points and vertices (`src/lib/analysis/zValidation.js`)
- **Terrain comparison:** fetches elevation from Geonorge Høydedata, with batching/caching (`src/lib/analysis/terrain.js`)
- **Outliers:** spatial outlier detection to catch “far away” objects (`src/lib/analysis/outliers.js`)
- **Topplokk check:** verifies lids (LOK) for relevant objects (`src/lib/analysis/topplok.js`)

---

## Visualisation (2D + 3D)

- **2D map:** Leaflet/React-Leaflet render geometry and overlays; layers can be toggled and inspected.
- **WMS:** the app supports adding WMS overlays; a server-side proxy avoids CORS issues.
- **3D viewer:** React Three Fiber + Drei render the pipe network and point objects with layer support.

---

## API Routes

- `src/app/api/wms-proxy/route.js`
  - Proxies WMS requests to avoid CORS.
  - Stateless: does not store credentials, data, or cache responses.
  - Includes basic SSRF protection by validating target URLs.

- `src/app/api/track/route.js`
  - Anonymous usage tracking endpoint.
  - Stores only aggregated location-level usage (see privacy section below).

---

## Security & Privacy (Implementation Summary)

Design goal: **avoid handling sensitive delivery data on the server**.

- **No persistence of uploaded files on the server.** Parsing/validation/analysis happen in the browser.
- **Anonymous usage tracking (opt-in via env vars):**
  - When configured, the app increments aggregate counters in Supabase.
  - The persisted “where” is the dataset kommune (from dataset coordinates via Geonorge services), plus time buckets.
  - No file contents, filenames, usernames, passwords, or IP addresses are stored.
- **WMS credentials:** provided by the user at runtime and forwarded only for proxying requests; never persisted.

---

## Archived Copilot Notes

Historic Copilot prompts/specs/reviews were consolidated from the repository root and stored under:

- `docs/archive/`

These are kept for context and traceability, but they are not required to build or run the app.
