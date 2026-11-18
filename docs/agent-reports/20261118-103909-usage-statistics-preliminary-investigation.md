# Usage statistics: preliminary investigation

**Status:** PLANNING DRAFT. This is a preliminary, read-only investigation, not an implementation plan or an approval.
**Date:** 2026-11-18
**Branch / HEAD:** `planning/usage-statistics` at `9c772d1`, clean working tree at start.
**Scope:** Inventory of tools and candidate events, existing statistics infrastructure, possible database changes, privacy considerations, open decisions and a recommended first release after GMI Validator 2.0.

No application code, tests, dependencies, configuration, database or schema was changed. No statistics events were submitted. No subagents were used.

## 1. Summary

- Today the application records **one event**, `upload_success`. It is counted per UTC date, hour, area and kommune in the Supabase table `aggregates`. A public dashboard (`StatsModal`) shows it. Vercel Web Analytics is also loaded globally.
- An additive **Stage 1 database contract for richer upload diagnostics already exists**. It consists of `upload_metric_daily`, `municipality_resolution_daily` and the RPC `increment_upload_diagnostics`, defined in `src/features/user-tracking/supabase_richer_usage_diagnostics.sql`. Client-side classifiers that produce its bucketed values also exist. However, the derived telemetry is discarded (`void boundedTelemetry`) and never sent. This is the cheapest route to file-format and dataset-size statistics.
- No statistics exist for any tool or workflow beyond the file upload: Validator, Rettinger, analyses, Gemini WFS, FOTO and the export/delivery wizards all go uncounted.
- **Recommended first release:**
  1. Activate the existing upload diagnostics.
  2. Add a small, fixed vocabulary of **completed-operation** events, stored as national daily counters, plus a few sum quantities such as photos exported.
  3. Gate collection explicitly to production.
- **Defer exact-byte file fingerprints** to a separate, owner-approved phase. They are pseudonymous rather than anonymous data, and they raise the most privacy questions for the least operational value.
- The decision that most affects scope is the **ekom/consent assessment**. It applies to the existing collection too, not only to new events.

## 2. Existing infrastructure (observed)

| Component | Location | Observed behaviour |
|---|---|---|
| Client trigger | `src/components/FileUpload.js`, `src/lib/telemetry/uploadTelemetry.mjs` | After a successful parse, `completeSuccessfulUpload` sends `POST /api/track` with `{eventType: 'upload_success', datasetCoord}`. It is suppressed in Testmodus, by `?testmodus=1` and before hydration. The richer bucketed telemetry is derived and then discarded. |
| Request policy | `src/lib/tracking/trackingRequestPolicy.mjs` | Strict allow-list: 1 KiB body cap, JSON only, same-origin/`Sec-Fetch-Site` check. The only accepted keys are `eventType` and `datasetCoord`, and `TRACKING_EVENT_TYPES = ['upload_success']`. This pattern is a good base to extend. |
| Handler | `src/lib/tracking/trackingHandler.mjs`, `src/app/api/track/route.js` | Validates the request and looks up the kommune once (Geonorge). The coordinate is used for the lookup and is not stored. It then increments an aggregate. The route does not read the client IP. |
| Storage | `src/lib/tracking/aggregates.js`, `supabase.js` | Supabase RPC `increment_aggregate`, called with the service-role key on the server. If Supabase is unconfigured or the RPC fails, it falls back to the JSON file `data/usage/aggregates.json`. |
| Schema (legacy) | `supabase.sql`, `supabase_hourly_migration.sql`, `supabase_normalize_area_names.sql` | `aggregates(date, hour, area_type, area_id, area_name, kommune_number, country, region, event_type, count)`, PK `(date, hour, area_type, area_id, event_type)`. |
| Schema (Stage 1, unused) | `supabase_richer_usage_diagnostics.sql` | `upload_metric_daily(date, metric_name, metric_value, count)` has a CHECK constraint that fixes the allowed metrics: format, extension, file size bucket, object and coordinate count buckets, object mix, CRS/EPSG, XY/Z quality, parser warnings, app version and schema version. `municipality_resolution_daily` records lookup outcomes. Both have RLS enabled with no policies and are service-role only. |
| Read API | `src/app/api/stats/route.js`, `src/lib/stats/statsRoute.mjs`, `legacyStats.mjs` | Public `GET /api/stats` with a kommune filter. Reads only `aggregates` where `event_type = 'upload_success'`, paginated (500 rows/page) from `ANALYTICS_START_DATE = 2026-02-19`. Totals, a timeline and a kommune breakdown are computed server-side. |
| Dashboard | `src/components/StatsModal.js`, `DetailedStatsSection.js`, `stats/StatsMap.js` | "Bruksstatistikk" modal, open to every visitor. Shows uploads over time, a kommune ranking and a map. |
| Ops endpoints | `src/app/api/track/debug/route.js`, `track/health` | A keepalive/health check with an optional secret-protected test write (`event_type = 'health_check'`). |
| Third party | `src/app/layout.js` | `@vercel/analytics` `<Analytics />` is loaded on every page. No custom events are sent to it. |
| Environment | `next.config.mjs`, `docs/development.md` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TRACKING_STORAGE_PATH`, `TRACKING_KEEPALIVE_SECRET`. `GMI_BUILD_ENV` (from `VERCEL_ENV`) already reaches the client. There is no `vercel.json`. |
| Reusable hashing | `src/lib/gmi-edit/sourceDocument.mjs`, `src/lib/photos/gmiPhotoSource.mjs` | `computeGmiSourceFingerprint` returns `sha256:<hex>`. **Without WebCrypto it falls back to `exact-bytes:<hex>`, the full file contents in hex. That fallback must never be used for statistics.** |

**Production status of Stage 1 (reported, not verified).** The archived Stage 2 plan (`docs/agent-reports/20260811-richer-upload-telemetry-stage2-plan.md`, removed in `6685f1a` and read from Git history) states that a production rollout report confirmed the two tables and the RPC exist in production. It also states they were empty, service-role only, and that the richer write remained disabled. That rollout report is not in this repository's history. The Stage 2 plan itself (feature flags, `DETAILED_STATS_START_DATE`, server-supplied app version, read-path panels) was only partly implemented.

**Production-only collection today is implicit.** Non-production deployments are "not connected" only because the Supabase variables are absent there. If they are absent, writes go to the file fallback; on Vercel this presumably fails silently because the filesystem is read-only (not verified). Nothing in code checks `VERCEL_ENV`. A local `.env.local` holding production keys would write to production.

**Incidental observations, out of scope.**
- `track/debug` accepts its secret via a `?secret=` query parameter. `docs/development.md` says secrets must not travel in URLs.
- The legacy `increment_aggregate` has three overloads, according to the archived validation report.

## 3. Tool and event inventory

The principle throughout is to count **completed, meaningful operations** in preference to "opened" events. Opening a tool is a weak signal and is noisy, because wizards are reopened and cancelled. A few "opened" counters are still useful to measure abandonment in the major wizards. "Opened vs completed" below means the ratio is worth measuring.

| Area | Opening signal | Meaningful completion | Candidate bounded dimensions / quantities |
|---|---|---|---|
| File import (`FileUpload`, `GlobalFileDrop`, "Legg til fil") | — | Successful parse (existing `upload_success`); parse failure | format (gmi/sosi/kof), existing Stage 1 buckets, failure class |
| Validator V2 (`ValidationV2Workspace`, `GmiFullValidation`) | Workspace opened | Full validation run completed | outcome tier (no FEIL / has FEIL / SJEKK only), object count bucket |
| Rettinger (`GmiEditWorkspace`, batch dialog, change sets) | Workspace opened for a layer | Edit session applied; revised GMI exported and verified | number of changed objects bucket, single vs batch edit, export verification pass/fail-closed |
| Data Table (`LayerDataTable`) | Table opened | — (navigation tool) | opened only |
| Layer filters / highlight (`LayerFilterSections`, `LayerHighlightPanel`) | — | Filter applied | opened/applied only |
| Height control (Z) (`ZValidationModal`, outliers, missing height) | Prompt/modal opened | Analysis run | — |
| Profile analysis (`InclineAnalysisModal`, terrain fetch) | Modal opened | Profile computed | terrain fetch success/failure |
| Topplok control (`topplok.js`) | — | Check run | — |
| 3D view (`Viewer3D`) | Pane shown | — | opened only |
| WMS overlays (`WmsLayerModal`) | Modal opened | Layer added | provider category, never the URL |
| Gemini WFS (`GeminiConnectionModal`, reference layer) | Connect dialog opened | Connection verified; reference data loaded | success/failure class only; never URL, user name or extent |
| FOTO import (`PhotoImportWizard`) | Wizard opened | Photos added to a layer | photo count (sum), GMI source bound yes/no |
| FOTO positioning (`PhotoPositioningWizard`) | Wizard opened | Positioning applied | photos positioned (sum) by source: EXIF / GMI reference / GML / manual |
| FOTO edit / completion (`PhotoEditLayer`, `PhotoCompletionDialog`) | Mode entered | Changes applied | photos adjusted (sum) |
| FOTO export (`PhotoExportWizard`) | Wizard opened | Package downloaded | profile (`legacy2019`, `gemini-legacy2019`, `asbuilt52`), photos exported/excluded (sums) |
| Delivery wizard (`DeliveryWizard`, `deliveryPlan.mjs`) | Wizard opened | Package downloaded after verification | mode (`gmi-only`, `photos-only`, `split`, `combined`), verification fail-closed count |
| Shell / info (`StatsModal`, `AppInfoModal`, `ShareQrModal`, contact) | Opened | Contact sent (already server-side) | low value; Vercel Analytics already covers page visits |

Before implementation, check each "completion" point against the code. Hook points must sit after the existing success, verification or download step. They must never sit inside the parsing, patching or verification logic.

## 4. File and delivery statistics

| Statistic | Value | Feasibility | Privacy note |
|---|---|---|---|
| Format and extension | High | Already classified; activate Stage 1 | Low risk |
| Dataset size (file size, object and coordinate count buckets) | High | Already classified | Low risk as buckets |
| Exact numbers of points and lines | Medium (total volume handled) | Easy as daily **sums** (points imported, lines imported) | Low risk nationally; do not combine with kommune and hour |
| Photo references in GMI (`S_HYPERLINK`) and distinct references | Medium (FOTO readiness) | `gmiPhotoSource.mjs` already extracts occurrences; count and distinct count per import, bucketed | Counts only; never filenames |
| Photos imported / positioned / exported / excluded | High for FOTO | Sum quantities at the completion points above | Counts only; no per-photo identifiers (as required) |
| Export package types | High | Delivery mode and photo export profile are fixed enums | Low risk |
| Distinct vs repeated imports (file fingerprint) | Medium | See below | **Pseudonymous data; needs a decision** |

**Fingerprints.**

What they would add: they would distinguish "one file opened five times" from "five files". This is a real gap: repeated validation of the same file inflates upload counts.

What they would require:
- The client computes SHA-256 using the existing helper. The `exact-bytes` fallback must be blocked.
- The server replaces it immediately with `HMAC(secret, sha256)`, using a server-side key that is never logged.
- Only the HMAC is stored, in an **isolated** table such as `(hmac, first_seen_date, last_seen_date, seen_count)`. That table has no kommune, hour, tool or app-session link.
- The server writes only a daily aggregate counter, `import_new` / `import_repeat`, that the dashboard reads.
- Retention is bounded, for example by deleting rows unseen for N months, or by rotating the key and destroying the old one, which makes fingerprints unlinkable across periods.

Why HMAC does not make this anonymous:
- An unkeyed SHA-256 of a file is a global identifier. Anyone holding the file (contractor, municipality, consultant) can compute it and confirm that it was processed. HMAC removes that ability for outsiders, but not for the operator who holds the key.
- A file may be attributable to a specific project and contractor, and through them to an individual such as a sole-trader surveyor. Combined with a date, the stored value is therefore pseudonymised data, and GDPR applies.

A simpler alternative, keeping seen hashes in the browser's `localStorage`, only detects repeats per browser. It is also itself storage on the terminal, which raises the same ekom question.

## 5. Potential database changes

| Change | Needed for | Type |
|---|---|---|
| None | Activating Stage 1 upload diagnostics | Reuse existing tables and RPC; verify in production first |
| Extend the `upload_metric_daily` CHECK, or add a sibling table | New import dimensions (point/line sums, photo-reference buckets, failure class) | Additive migration; the CHECK constraint is a deliberate contract, so changing it means a reviewed migration |
| New `usage_event_daily(date, event_name, variant, count, quantity_sum)` with a CHECK allow-list and an `increment_usage_event` RPC (service-role only, RLS on, no policies) | Tool and workflow events | Additive migration, following the Stage 1 conventions |
| Isolated `file_fingerprint_seen` table, a retention job and an aggregate counter | Distinct/repeat imports (optional) | Additive migration, a scheduled deletion or key rotation, and a server secret |
| Legacy `aggregates` | No change | Keep `upload_success` as the continuous historical series |

Keep new tables at **daily, national** granularity. Do not add kommune or hour to tool events: the legacy table already carries geography, and combining dimensions increases re-identification risk on a public dashboard.

The server API would need the `TRACKING_EVENT_TYPES` and key allow-lists extended, a server-supplied app version and an explicit production gate. The dashboard would need new panels and a read path for the new tables.

## 6. Privacy considerations

1. **Aggregation versus pseudonymisation.** Fixed-category daily counters with no identifiers are the low-risk baseline. Fingerprints change the character of the data, as described in section 4, and need their own purpose, legal basis, retention and documentation.
2. **Correlation.** If one request carries a fingerprint together with kommune, time and tool usage, per-file usage profiles become possible. Mitigations:
   - store fingerprints with no other dimensions;
   - never introduce a client or session identifier;
   - avoid combined fact rows: Stage 1 already writes independent counters, not a per-upload row.

   Requests sent close together from the same client remain correlatable in infrastructure logs, so log retention matters (item 3).
3. **IP addresses and logs.**
   - The application code does not read or store the IP for tracking.
   - Vercel's platform request and runtime logs do see client IPs, with plan-dependent retention that has not been verified here.
   - Supabase sees only Vercel's server.
   - The contact rate limiter hashes the requester in memory with a per-instance salt.
   - Vercel Web Analytics, according to Vercel's documentation, is cookieless and uses a short-lived request hash. This needs to be confirmed.

   Owner decision: accept and document Vercel's default logging, or reduce it.
4. **Norwegian GDPR and ekom consent.**
   - Ekomloven § 3-15 has applied since 1 January 2025 (citation to be verified by the owner). It requires consent for storing or accessing information on the user's terminal equipment unless strictly necessary for the service the user requested.
   - Nkom supervises it. Its guidance, read together with EDPB Guidelines 2/2023, suggests that client-side script sending device-derived information can fall within "access" even without cookies.
   - Statistics are generally **not** treated as strictly necessary in Norway.
   - This affects the existing `upload_success` call and Vercel Analytics, not only the new events. It must not be assumed that consent is unnecessary, or that the current setup is compliant.
   - A legal and owner assessment is required before scope is fixed. The likely outcomes are an opt-in or consent mechanism, a server-only design, or a documented exemption.
   - GDPR applies to the fingerprint data and to any IP processing. Datatilsynet is the supervisory authority.
5. **Production-only collection.**
   - Make the gate explicit and fail-closed: write only when the server sees `VERCEL_ENV === 'production'` plus an explicit `STATS_WRITE_ENABLED` flag.
   - Optionally skip the client call when `GMI_BUILD_ENV !== 'production'`.
   - Keep Testmodus suppression.
   - Prevent local or Preview environments from holding production keys.
6. **Transparency.**
   - `docs/privacy.md`, the README and the AppInfo text currently say that only a fixed upload event is counted. Each new category must be described in Norwegian before collection starts.
   - Describe fingerprinting explicitly if it is adopted, including retention.
   - Consider a visible statement in the app, and an opt-out if consent is not the chosen basis.
7. **Public dashboard disclosure.** `/api/stats` is public. New metrics should be national, with small-count suppression or coarse periods for rarely used tools. A single contractor's activity could otherwise be inferred.

## 7. Open decisions

| # | Decision | Owner |
|---|---|---|
| D1 | Legal basis and ekom position: consent/opt-in, exemption, or reducing collection. This covers existing and new collection. | Owner / legal |
| D2 | Whether file fingerprints are collected at all; if so, HMAC key custody, retention period or rotation, and documentation | Owner / legal |
| D3 | Whether the new tool and file statistics stay public in the dashboard, or are partly internal only | Owner |
| D4 | Final event vocabulary: which tools count "opened" as well as "completed" | Owner / product |
| D5 | Verify the Stage 1 production objects (read-only) and approve their activation and start date | Owner, with authorized DB access |
| D6 | Accepted Vercel logging and Vercel Analytics configuration | Owner |
| D7 | Granularity: national daily for new events (recommended) versus kommune-level | Owner |

## 8. Recommended initial scope

**Essential (first release):**
1. An explicit, fail-closed production gate for all statistics writes, server-side first.
2. Activation of the existing Stage 1 upload diagnostics (format, size and object/coordinate buckets, CRS/quality), with a server-supplied app version and an activation start date. No schema change, provided D5 confirms the production objects.
3. One additive table and RPC for daily national counters of **completed** operations:
   - Validator full validation;
   - Rettinger revised-GMI export;
   - analyses run (Z, profile, topplok);
   - Gemini WFS connection verified;
   - FOTO import, positioning and export completed;
   - delivery package downloaded, by mode, and photo export, by profile.

   Add sum quantities for photos imported, positioned (by source) and exported, and for points and lines imported.
4. A minimal dashboard section with national totals per event over time, keeping the existing upload/kommune view unchanged.
5. Updated Norwegian privacy text, and the outcome of D1 implemented (for example consent or opt-out) **before** collection is enabled.

**Optional later improvements:**
- "Opened" counters for the major wizards, to measure abandonment.
- Photo-reference and distinct-reference buckets; parse-failure classes; the `municipality_resolution_daily` diagnostics view.
- Distinct/repeat import fingerprints, only after D2, as a separate, isolated phase.
- Small-count suppression and internal-only views.

The essential scope reuses the existing request policy, RPC pattern and classifiers. It needs one additive migration (or none, if new events go into a new table and the import extras are deferred). Most of the work is placing event calls correctly and reviewing the privacy text.

## 9. Access limitations, checks and Git status

- **Database:** no Supabase or production access was available or used in this session. Schema findings come from the tracked SQL files and archived reports in Git history. The production state of the Stage 1 objects is reported, not verified.
- **Vercel:** no dashboard or project configuration access. Log retention and the Analytics configuration are unverified.
- **Legal:** the ekom and GDPR statements are a technical reading that needs owner or legal confirmation, not legal advice.
- **Commands:** only read-only `git` (`status`, `log`, `show`, `rev-parse`), `ls`, `grep`, `sed`, `cat` and `date`. No tests or builds were run, because this is a documentation-only task.
- **Git:** this report is the only new file. Nothing was staged, committed or pushed.
