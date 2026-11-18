# Usage statistics: consolidated implementation plan

**Status:** PLANNING REFERENCE. This is the authoritative implementation plan for usage statistics. It is not an implementation and it is not legal advice. The privacy and legal assessment is **not resolved**.
**Date:** 2026-11-18. First written 11:24, then consolidated the same day after the owner's production inspection (revision record in section 10).
**Branch / HEAD:** `planning/usage-statistics` at `9c772d1`.
**Baseline:** `docs/agent-reports/20261118-103909-usage-statistics-preliminary-investigation.md` (unchanged). This plan supersedes it where they differ.

**Release rule.** No new production collection is switched on until the privacy and legal requirements in section 8 are met. All four assignments can be merged and deployed with collection disabled. Collection is controlled by explicit, fail-closed production switches that default to off.

**Labels used in this report**

| Label | Meaning |
|---|---|
| **Verified** | Observed in production by the owner, or read in the repository at `9c772d1` |
| **Done** | Configuration change the owner has already made |
| **Decided** | Agreed owner decision |
| **Recommended** | Proposal in this plan, to be followed unless the owner decides otherwise |
| **Open** | Unresolved owner, legal or contractual question (section 8) |

**Correction to the baseline.** The baseline wrongly said `/api/track/debug` accepts `?secret=`. That route is a fixed empty 404, covered by `tests/trackDebugRouteHardening.test.mjs`. The query-string secret is accepted by the keepalive route `src/app/api/track/health/route.js` (section 5.3).

## 1. Status register

### 1.1 Verified production infrastructure

The owner and ChatGPT inspected these manually. I had no production access, so the facts below are the owner's.

**Supabase**

| Item | Verified state |
|---|---|
| Plan and region | Free plan, Nano instance, Ireland `eu-west-1`. Database usage 28/500 MB. |
| `aggregates` (legacy) | 739 rows. **RLS disabled.** |
| `upload_metric_daily`, `municipality_resolution_daily` (Stage 1) | Exist, empty, RLS enabled. |
| Table privileges | All three tables grant SELECT, INSERT and UPDATE to `service_role` only. No privileges for `anon`, `authenticated` or PUBLIC. |
| Functions | `increment_aggregate` with 7, 8 and 9 parameters, and the 18-parameter `increment_upload_diagnostics`. All four are `SECURITY INVOKER`, executable by `service_role` only. |
| Stage 1 contract | The production definition and constraints match the expected strict allowlists, daily aggregation and schema version 1. Formats allowed: GMI, SOSI and KOF. **Not GML.** |
| Extensions | `pg_cron` 1.6.4 available, **not installed**. `pgcrypto` 1.3 installed. |
| Backups | Scheduled backups are not accessible on the Free plan. Provider-side residual retention cannot be quantified, so do not assume deletion is immediate and permanent. |
| Contract | The DPA is part of Supabase's Terms of Service for all organisations, with no separate signature. A Transfer Impact Assessment is available. |
| AI | Supabase Assistant data sharing disabled. |

**Vercel**

| Item | Verified state |
|---|---|
| Plan and project | Hobby plan, project `gmi-validator`, domain `gmi-validator.no`. The owner has sole account and project access, with two-factor authentication. |
| Production-only variables | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TRACKING_STORAGE_PATH`. |
| All-environment variables | `TRACKING_KEEPALIVE_SECRET`, `NEXT_PUBLIC_TRACKING_DEBUG`. |
| Variable type | The service-role key and the keepalive secret are ordinary variables, flagged by Vercel's Needs Attention warnings. No evidence of compromise. |
| Observability | Standard Observability, without Observability Plus. Hobby runtime log retention is one hour. That figure covers runtime logs only, not other infrastructure telemetry or trace retention. |
| Drains | No external data drains. |
| Web Analytics | Active but unused by the owner. |
| Fluid Compute | Enabled (unchanged). |

**Repository facts behind the plan** (verified at `9c772d1`)
- `NEXT_PUBLIC_TRACKING_DEBUG` has no reference under `src/`, so it is unused.
- `TRACKING_STORAGE_PATH` is read by the JSON file fallback in `src/lib/tracking/aggregates.js:16` and `src/app/api/stats/route.js:44`.

**External keepalive (cron-job.org)**

| Item | Verified state |
|---|---|
| Job | "GMI-Validator Maintainer", `GET https://gmi-validator.vercel.app/api/track/health?write=true` |
| Schedule | Daily at 18:14 Europe/Oslo. Timeout 30 s. Response storage disabled. |
| Authentication | `X-Keepalive-Secret` request header. There is no secret in the URL. |
| Last run | Successful, HTTP 200. No configuration changes have been made. |

### 1.2 Configuration changes already made

- **Done:** Vercel project-level AI model training and data sharing disabled.
- **Done:** function region changed from `iad1` (USA) to Dublin `dub1` (`eu-west-1`) as the sole region. **It takes effect only on the next deployment**, and still needs post-deployment verification (section 7, A4).

### 1.3 Agreed owner decisions

- **Decided:** remove Vercel Web Analytics completely, both from the application and in the Vercel project. Standard technical Observability stays.
- **Decided:** reuse Supabase, and activate the Stage 1 richer upload diagnostics.
- **Decided:** counters for tool openings and completed operations, using the inventory in section 3.
- **Decided:** new statistics are national daily aggregates only, with no user, session or kommune association.
- **Decided:** retain historical upload statistics where lawful (that question is still open, L2).
- **Decided:** keep the public dashboard, with disclosure safeguards.
- **Decided:** collection is production-only, fail-closed and non-blocking.
- **Decided:** seven-day survey-file fingerprinting is part of the first release, subject to privacy and legal approval. There are no photo fingerprints, and the `exact-bytes` fallback never enters analytics.
- **Decided:** the keepalive keeps its existing `X-Keepalive-Secret` header and is not migrated to Bearer authentication.
- **Decided:** the consent heading and core wording in section 2.3. This is a product decision, not legal approval.
- **Decided:** prepare the statistics contracts for future GML infrastructure imports. Implementing GML parsing or vector import is out of scope.
- **Decided:** four implementation assignments (section 7).

## 2. Privacy and consent

### 2.1 Legal findings (unchanged; sources in section 9)

- **Ekomloven § 3-15** (LOV-2024-12-13-76, in force 2025-01-01).
  - Storing information on, or gaining access to information in, the user's equipment requires prior information and GDPR-standard consent.
  - The only exceptions are transmission over a network, and what is "strengt nødvendig" to deliver a service the user has explicitly requested.
  - Nkom and Datatilsynet both describe these exceptions as narrow.
  - The provision applies whether or not personal data is involved.
- **EDPB Guidelines 2/2023 v2.0.**
  - JavaScript instructing the browser to send targeted information is within scope (para. 33).
  - Locally produced information that is then sent to a server is "gaining of access" (para. 53).
  - Information entered by the user is still covered (para. 62).
- **Datatilsynet.**
  - Consent must be prior, voluntary, specific, informed, unambiguous, active and documentable.
  - Refusing must be as easy as accepting, and withdrawing as easy as giving consent.
  - Using the service must not depend on consent.
  - For processing after the access, other legal bases are "nesten aldri" suitable where § 3-15 requires consent.
- **Pseudonymisation.**
  - EDPB 01/2025 (consultation version) and CJEU C-413/23 P *EDPS v SRB*: for the key holder, pseudonymised data remains personal data.
  - A keyed MAC is stronger than a plain hash, but the output is still pseudonymous, not anonymous.
- **No exemption found.** Neither authority identifies an exemption for statistics or audience measurement. Nothing suggests that first-party, cookieless or aggregated statistics fall outside § 3-15. **Hashing, aggregation, short retention and the absence of cookies do not establish an exemption.**

### 2.2 Assessment by collection type

| | A. Existing upload statistics | B. Tool and workflow counters | C. Seven-day fingerprints |
|---|---|---|---|
| What is sent | An event, plus one coordinate derived from the opened file (used for the kommune lookup) | An event, a bounded variant and a quantity | A SHA-256 digest of the survey file |
| § 3-15 | **Consent very likely required.** It has run without consent since 2026-02-19. | **Consent very likely required.** | **Consent required.** This is locally produced information (EDPB para. 53). |
| GDPR | IP address in transit at Vercel. One coordinate is sent server-side to Geonorge. Stored rows (date, hour, kommune, count) hold no identifier, but low hourly counts in small kommuner could point to a sole-trader contractor. | IP address in transit only. Stored national daily rows are anonymous. | **Treat the HMAC as personal data** (pseudonymous, controller holds the key). Legal basis: consent. Article 11 applies. Disclose retention, including residual backups. |
| Open | L2: status of the historical rows | L1: confirm the broad reading of "access" | L3: whether survey-file fingerprints relate to natural persons at all (this does not change the § 3-15 answer) |
| Safeguards | Same consent as B and C. Historical rows published only behind the section 6 safeguards. A series break at the consent date. | Fixed allow-list, national daily rows, no identifiers | Section 4 |

**Infrastructure processing in all three cases.**
- Vercel runtime logs (one hour on Hobby) record request paths, times and client IPs. They never include bodies, which must never be logged.
- So for up to an hour the logs can show that one IP address called `/api/track` and `/api/track/import` close together.
- This is processor-side processing of IP addresses, and it must be disclosed.

**Function region.** Once the `dub1` region change is deployed, functions run in the EU, but Vercel Inc. remains a US processor (L5).

### 2.3 Consent prompt

**Decided wording** (product decision):

> **Bidra til videreutviklingen av GMI Validator**
>
> Vi har begrensede ressurser til videreutvikling av GMI Validator. Ved å samle inn bruksstatistikk kan vi få bedre innsikt i hvilke verktøy og funksjoner som faktisk brukes, og prioritere utviklingsarbeidet der det gir størst nytte for brukerne.

**Recommended draft for the remaining text** (to be reviewed with the privacy text; not yet approved):

> Hvis du tillater det, registrerer vi:
> - hvilke verktøy som åpnes og hvilke operasjoner som fullføres
> - egenskaper ved innleste filer, som format, antall punkter og linjer, koordinatkvalitet og hvilken kommune datasettet ligger i
> - et midlertidig fingeravtrykk av innleste innmålingsfiler, slik at vi kan telle hvor ofte samme fil leses inn på nytt
>
> Bruk av verktøy og egenskaper ved filer lagres bare som samlede antall. Kommunen finnes ut fra én koordinat i datasettet, og koordinaten lagres ikke.
>
> Fingeravtrykket er en nøkkelbeskyttet kontrollsum av filinnholdet. Det lagres midlertidig og atskilt fra den øvrige statistikken.
> - Det brukes bare i sju dager fra registreringen. Deretter regnes det ikke lenger med.
> - Det slettes automatisk, normalt innen en time etter dette.
> - Kopier kan likevel finnes i leverandørens sikkerhetskopier en begrenset periode etter sletting.
>
> Vi lagrer ikke filnavn, filinnhold, koordinater eller bilder, og vi bruker ingen bruker- eller nettleser-ID.
>
> Det er frivillig. Alle funksjoner virker på samme måte uansett hva du velger. Du kan endre valget når som helst under «Om GMI Validator». [Personvernerklæring]
>
> [Ikke tillat] [Tillat]

**Draft accuracy note.** Every claim in the text must remain true of the implementation.
- **No "only aggregates" claim.** The draft does not say that only daily aggregates are stored. Legacy upload statistics are hourly per kommune, and the fingerprint table holds individual temporary records.
- **Four stages of fingerprint storage, described separately:**
  1. Temporary storage: one keyed HMAC and an expiry per file.
  2. Logical expiry: seven days after registration, the record is no longer used.
  3. Physical deletion: an hourly job. It is "normalt innen en time", not guaranteed, because the job does not run while the project is paused.
  4. Residual backups: provider-side, for a period that is not visible to us.
- **"Koordinaten lagres ikke"** is accurate only while the coordinate is discarded after the kommune lookup.
- **"Ingen bruker- eller nettleser-ID"** is accurate, but Vercel's technical logs hold IP addresses briefly. The privacy notice must say so.
- **The privacy notice** must also name Vercel, Supabase and Kartverket/Geonorge, the residual backup retention and the controller.

**Behaviour (Recommended)**
- **Prominent purpose.** The purpose, prioritising limited development resources, is the heading and first paragraph.
- **Equal choices.** "Tillat" and "Ikke tillat" are equally prominent: the same size, style and weight, one tab stop each, with no pre-selection.
- **Equal access.** Both choices close the prompt and the app works identically either way.
- **Before consent.** Shown before any statistics request. Until a choice is made, nothing is sent.
- **Where the choice is stored.** Only the choice, consent version and date are stored locally (for example `gmi-usage-stats-consent-v1`), whether to allow or to refuse. Whether this local storage needs consent of its own is open (L4).
- **No repeat prompts.** A user who declined is never prompted again. If the consent scope later widens, only users who had allowed are asked again.
  - If local storage is blocked or cleared, the prompt reappears.
  - That is unavoidable without tracking, and it is acceptable because nothing is sent without a choice.
- **Withdrawal.** Withdrawing in Om is one control.
  - It takes effect immediately for anything not yet sent: queued work is dropped, and the results of pending hashing are discarded when they complete (section 4.1).
  - Requests already transmitted cannot be recalled (L7).
- **Only when collection is on.** The prompt follows its own eligibility rule, which does not require consent (section 5.2). It is shown only when production collection is switched on, which avoids asking for consent to collection that is not happening.
- **UI standards.** AGENTS UI rules apply: Norwegian accessible names, keyboard access, focus handling and checks at 1280×720 and 1366×768.

**Still open (section 8):**
- separate fingerprint consent (O2);
- controller identity (O6);
- how to demonstrate valid consent without a per-user consent log (L6);
- withdrawal semantics for data already aggregated (L7);
- the full privacy disclosures (O11);
- the legal status of historical statistics (L2).

**Recommended way to demonstrate consent without tracking.** Rely on versioned evidence instead of a per-user log:
- the consent text and UI for each version, kept in Git and tied to the release commit;
- automated tests proving that nothing is sent before consent or after refusal;
- the activation date of each series.

Whether this suffices is L6.

## 3. Statistics contracts and inventory

### 3.1 Counting model

All new statistics share one record shape in `usage_event_daily`, keyed by `(date, event, format, variant)`.

| Field | Meaning |
|---|---|
| `date` | UTC date |
| `event` | What happened. Fixed catalogue. |
| `format` | Survey format the event concerns: `gmi`, `sosi`, `kof`, later `gml`. `none` where no file format applies. Fixed catalogue. |
| `variant` | Bounded sub-type, method, outcome or size bucket. Fixed catalogue per event. |
| `count` | **Number of operations**: the completed imports, commits, downloads or openings |
| `quantity` | **Sum of items** handled by those operations (photos, objects, points, lines), where the event defines one, otherwise 0 |

**Three kinds of figure, never mixed:**
1. **Operations** (`count`): how many times something was done.
2. **Quantities** (`quantity`): how many items those operations handled. One photo positioned twice contributes 2.
3. **Distinct items:** these can only be counted *within one operation* and are recorded as their own variant, for example the distinct photo references in one GMI file. Distinct objects or photographs *across* operations are never computed, because that would need identifiers.

**Distributions.** These use their own event with size-bucket variants, so one operation adds `count = 1` to exactly one bucket.
- Buckets for photo counts: `1`, `2-10`, `11-50`, `51-200`, `201-1000`, `>1000`.

**Rules:**
- Emit from the owner of the operation (session, registry or wizard), never from both the UI and a library.
- Count on success only, and count a retried operation once.
- Never await an emission, and never let an emission change UI behaviour.
- The server clamps `quantity` to 0–1 000 000.
- Unknown `(event, format, variant)` combinations are rejected by the server allow-list, and again by catalogue foreign keys.

### 3.2 Content classification and future GML

**Classify by parsed content and entry context, never by file extension.**

| Entry context | Parsed content | Class | Statistics |
|---|---|---|---|
| Survey import (`FileUpload`) | GMI, SOSI or KOF with ≥1 point or line | infrastructure | Stage 1 diagnostics, points and lines, fingerprint |
| Survey import (future GML) | VA vector features | infrastructure, `format = gml` | Same |
| Survey import (future GML) | VA features plus photo links or positions | mixed | Same, plus photo-reference counts. Fingerprint, because the file contains infrastructure. |
| Survey import (future GML) | Photo positions only | photo-only | Not a survey import. No diagnostics, no fingerprint. |
| FOTO positioning GML (`PhotoImportPlacementStep`, `PhotoPositioningWizard`) | Photo positions | FOTO GML | `photos_positioned` with variant `gml`. No diagnostics, no fingerprint. |
| FOTO GMI source (placement and positioning wizards) | GMI used as a photo source | photo source | Not a survey import. No diagnostics, no fingerprint. |
| Delivery output (`deliveryGml.mjs`) | FOTO GML written by the app | delivery | `photos_delivered`. Never an import. |
| Gemini WFS responses | VA reference data | reference | `gemini_wfs_retrieval` only. Never an import or fingerprint. |
| Photographs | Images | photo | FOTO counters only. Never fingerprinted. |

**Contract preparation (Recommended; no GML parsing is implemented here):**
- **One classifier.** A single pure function returns `infrastructure`, `mixed`, `photo-only` or `empty` from the parser result and the entry context. It decides eligibility for diagnostics, the `survey_features` counter and fingerprinting.
  - Today GMI, SOSI and KOF imports with ≥1 point or line are `infrastructure`.
  - GMI files with photo references are also counted by `gmi_photo_references`.
- **Normalised parser output.** A future GML survey parser must return the same normalised `{ points, lines }` model as the existing parsers. Then the Stage 1 classifiers (object count, mix, XY and Z quality, coordinate count, CRS) and `survey_features` apply without change.
- **New statistics:** `format` is a catalogue row, so adding `gml` is one reviewed `INSERT`.
- **Stage 1 diagnostics:** the verified production contract allows only GMI, SOSI and KOF. Adding GML is one small migration that extends the format allowlist in the CHECK constraints and the RPC validation, plus the matching server allow-list and client classifier. That is an additive value, so the telemetry schema version stays 1. Bump it only if the meaning of an existing metric changes.
  - Do not restructure the verified Stage 1 contract now.

### 3.3 Inventory

**Imports and files**

| Event | Format | Variant | `count` | `quantity` | Hook point | Rules |
|---|---|---|---|---|---|---|
| `upload_success` (legacy `aggregates`) | — | — | Imports per hour and kommune | — | `FileUpload` success (existing) | Unchanged, but behind consent |
| Stage 1 diagnostics (`upload_metric_daily`, `municipality_resolution_daily`) | gmi/sosi/kof | The 15 existing metrics | Imports | — | Same request; server calls `increment_upload_diagnostics` | `lookupKommuneFromCoord` must return an outcome code instead of only `null` |
| `survey_features` | gmi/sosi/kof (later gml) | `point` / `line` | Imports containing that geometry type | Points or lines imported | `FileUpload` success, survey class only | Totals of imported objects, not distinct objects |
| `gmi_photo_references` | gmi (later gml) | `total` / `distinct` | GMI imports with ≥1 reference | References. Distinct means distinct `comparison` keys within the file. | `createGmiPhotoSource` result at `FileUpload` success | Counts only, never filenames |
| `survey_import_eligible` | gmi/sosi/kof (later gml) | — | **Consented eligible survey imports, exactly once each** | — | `FileUpload` success, when the classifier returns `infrastructure` or `mixed`, emitted once before any hashing | The coverage denominator (section 4.4). Separate request from any fingerprint. |
| `survey_import` | gmi/sosi/kof (later gml); `none` for `rejected` | `window_opened` / `window_repeat` / `rejected` | Fingerprint submissions | — | Server: `record_survey_import` writes the first two; the endpoint writes `rejected` (invalid input, nothing stored) | Never written by the client. Meaning in section 4.4. |
| `survey_fingerprint_skipped` | gmi/sosi/kof | `too_large` / `no_webcrypto` / `hash_failed` | Eligible imports not fingerprinted | — | Client fingerprint helper | Separate request from any fingerprint. A result discarded because consent was withdrawn sends nothing and is not counted. |

**Tool openings** (`tool_opened`, format `none`)
- Counted on an explicit user open action only, never on mount, re-render or restored state.

| Variant | Owner of the open action |
|---|---|
| `validator` | `ValidationV2Workspace` opened |
| `rettinger` | `GmiEditWorkspace` opened |
| `datatabell` | `openDataInspector` |
| `visning_3d` | 3D view opened (`viewer3DOpen`) |
| `hoydekontroll`, `profilanalyse`, `topplok` | The respective modal or control opened |
| `wms` | `WmsLayerModal` opened |
| `gemini_wfs` | `GeminiConnectionModal` opened |
| `foto` | Photo workspace entered |
| `foto_import` | `PhotoImportWizard` opened |
| `foto_posisjonering` | "Koble og posisjoner bilder…" (`PhotoPositioningWizard`) opened |
| `foto_juster` | **"Juster plassering og retning"**, counted once in `photoSession.beginPhotoEdits` (`src/lib/photos/photoSession.mjs:857`) |
| `foto_fullfor` | Completion dialog opened |
| `leveranse` | `DeliveryWizard` opened |

**"Juster plassering og retning".** It has two entry points, the Verktøy menu item `edit` and the map-preview button (`PhotoWorkspaceMapPreview`). Both reach `runWorkspaceTool('edit')` (`src/app/page.js:450`, `:1007`), so counting in `beginPhotoEdits` covers both without double counting.

**Completed operations**

| Event | Format | Variant | `count` | `quantity` | Hook point | Rules |
|---|---|---|---|---|---|---|
| `validator_result` | gmi/sosi/kof | `feil` / `sjekk` / `ok` (worst status) | Layers validated | — | First successful `runValidation` per layer | Validation re-runs automatically on every revision and reference-date change, so count once per layer id per page session |
| `rettinger_correction_applied` | gmi | `object-editor` / `batch` / `hyperlink-removal` | Staged change sets | Objects changed (`objectCount`) | Successful `gmiEditSessions.stage(...)` | Counted when staged. Undo, redo and discard are neither counted nor subtracted. Independent of export. The quantity is not a count of distinct objects. |
| `photos_imported` | none | `new-layer` / `append` / `loaded-gmi` | Imports | Photos | `photoSession.completeImport` / `applyLoadedGmiImport` with `ok: true` | — |
| `photos_per_import` | none | Photo-count bucket | Imports | — | Same | Distribution |
| `photos_positioned` | none | `exif` / `gmi` / `gml` | Positioning commits | Photos given a position from that source | Import placement, `applyPhotoPositioning`, `applySourceWorkflowPositions`, `acceptCandidates` | **Source-based positioning.** Re-positioning counts again. Confirm that no commit calls another public commit, or count in the inner one only. |
| `photos_adjusted` | none | `placed` / `moved` / `rotated` | Manual edit commits | Photos per variant | `photoSession.applyPhotoEdits` success | **Manual adjustment** in Juster plassering og retning (defined below) |
| `delivery_downloaded` | none | `gmi-only` / `photos-only` / `split` / `combined` | Delivery packages | — | `DeliveryWizard` download | Once per plan object. Repeating the download of the same plan does not count. |
| `photos_delivered` | none | `gmi` / `gml` / `excluded` | Packages containing photos | Photos per delivery intent | Same download | `excluded` counts photos left out of the package |
| `photos_per_delivery` | none | Photo-count bucket | Packages containing photos | — | Same download | Distribution |
| `photo_export_profile` | none | `legacy2019` / `gemini-legacy2019` / `asbuilt52` | Packages containing photos | — | Same download | A different metric from the delivery mode, not double counting |
| `analysis_run` | none | `hoydekontroll` / `profilanalyse` / `topplok` | User-triggered runs | — | Run action | Automatic recomputation excluded |
| `gemini_wfs_session` | none | `verified` / `authentication_failed` / `permission_denied` / `failed` | First upstream outcome after credentials are entered | — | `geminiSession` | Defined below |
| `gemini_wfs_retrieval` | none | `survey` / `map` | Successful reference-data retrievals | — | `geminiSession` fetch outcomes | Cached (`reused`), cancelled and aborted results are not counted. A refresh counts. No URL, username, bbox or extent. |
| `wms_layer_added` | none | — | Layers added | — | `WmsLayerModal` | No URL |

**Manual adjustment variants** (classified per photo within one `applyPhotoEdits` commit):
- `placed`: the photo had no position and is given one manually;
- `moved`: the photo already had a position, and it is changed;
- `rotated`: the direction is changed.

A photo whose position and direction both change in one commit counts in both `moved` (or `placed`) and `rotated`. Drag steps, previews and undo steps are not counted, only the commit. Positions applied from EXIF, GMI or GML sources are `photos_positioned`, not adjustments.

**Gemini WFS: verification versus retrieval.** This rests on a verified finding.
- `geminiSession.setCredentials` sets `connectionStatus: 'connected'` locally, without any network request (`src/lib/gemini-wfs/geminiSession.mjs:194`).
- The modal then calls `fetch()`. If no survey layer is loaded, `fetch()` sends no request and still returns `ok: true`.
- So **"connected" does not mean the credentials were verified.**
- The plan therefore counts `gemini_wfs_session` from the first upstream outcome after credentials are entered:
  - `verified` when the first upstream request succeeds;
  - `authentication_failed` or `permission_denied` from those error codes;
  - otherwise `failed`.
  - A session with no upstream request yet records nothing.
- `gemini_wfs_retrieval` separately counts successful survey and map retrievals.

**Delivery coverage.** Verified at `9c772d1`:
- `PhotoExportWizard` renders only `DeliveryWizard` (`src/components/photos/PhotoExportWizard.js:7`).
- `GmiExportDialog` also uses `DeliveryWizard`.
- The only file-download trigger in `src/` is `DeliveryWizard.js:184`.

So the single hook covers standalone FOTO exports, Rettinger exports and combined deliveries. **Count only in `DeliveryWizard`**, never in `GmiExportDialog` or `PhotoExportWizard`. A new download path added later must route through `DeliveryWizard`, or add its own reviewed hook.

**Further double-counting rules:**
- A GMI file chosen inside a FOTO wizard is a photo source, not a survey import.
- Positioning applied during import is counted once, at the import placement commit, and not again by the inner source-workflow call.
- One download emits `delivery_downloaded`, plus, when photos are present, `photos_delivered`, `photos_per_delivery` and `photo_export_profile`. These are different metrics.

## 4. Seven-day fingerprints

### 4.1 Flow

1. **Client (eligibility).** Fingerprint only after a successful **survey import** in `FileUpload` whose content class is `infrastructure` or `mixed` (section 3.2). That means GMI, SOSI and KOF today, and GML only once survey GML import exists. All of these must also hold:
   - consent is granted;
   - production collection is enabled;
   - the app is hydrated;
   - Testmodus is off.

   Never fingerprint photographs, FOTO GML, FOTO GMI sources, delivery outputs or Gemini data.
2. **Client (hashing).**
   - Use a **new dedicated helper**: `crypto.subtle.digest('SHA-256', bytes)` → 64-character lowercase hex.
   - It returns `null`, and nothing is sent, when WebCrypto is unavailable or hashing fails. It never falls back.
   - **Never** reuse `computeGmiSourceFingerprint` or `gmiSourceFingerprint`: both fall back to `exact-bytes:<full file hex>`.
   - Hash the original file bytes. GMI already has an `ArrayBuffer` and can reuse it; SOSI and KOF need a separate `arrayBuffer()` read.
   - Skip files above the size cap (O8). The skip is recorded only as a `survey_fingerprint_skipped` counter.
   - Run as a background task.
3. **Client (withdrawal and transmission).**
   - **Pending work cannot be interrupted.** An active `crypto.subtle.digest` call, or an `arrayBuffer()` read, cannot be aborted. The plan does not assume otherwise.
   - **Consent generation.** Each job records the consent generation (a counter that changes on every withdrawal or change of choice) when it is queued.
   - **On withdrawal:**
     - queued jobs that have not started are dropped;
     - a running job is invalidated, so when its digest resolves the result is discarded without being sent;
     - the digest is never kept, retried or sent later.
   - **Immediately before `fetch`,** recheck synchronously that consent is still granted with the same generation, the production switch is on and Testmodus is off. If any check fails, discard the digest and send nothing.
   - **Already transmitted.** A request handed to `fetch` before withdrawal has been transmitted. It is processed normally and cannot be recalled. Its window row expires and is deleted as usual, and its counter remains part of the aggregate (L7).
   - The request is fire-and-forget: never awaited by UI paths, errors swallowed, no retries.
   - `POST /api/track/import` with body `{ "sha256": "<hex>", "format": "gmi" }`.
   - `format` is a catalogue value only, needed for the per-format `survey_import` counter. It is not stored with the fingerprint.
   - The request carries no coordinate, filename, size, tool or session.
4. **Server.**
   - Production switch, then the existing 1 KiB, JSON and same-origin request policy.
   - `sha256` must match `^[0-9a-f]{64}$` and `format` must be in the allow-list. Anything else is rejected with a generic answer and counted as a `rejected` variant with no fingerprint stored.
   - Compute `HMAC-SHA256(STATS_FINGERPRINT_HMAC_KEY, raw 32 digest bytes)`. The key is at least 32 random bytes, stored as a Vercel sensitive variable in Production only.
   - Call the RPC, then discard the digest.
   - **One constant response.** For every request that passes the shared request policy, the endpoint returns exactly the same status, headers and body (`204 No Content`). This holds whether a window was opened or repeated, the input was rejected, the production gate is closed or the database call failed.
   - **No `stored` field.** The generic gate response `{ ok: true, stored: false }` from section 5.2 is **not** used on this endpoint, so the gate state cannot be confused with a classification outcome.
   - **Classification takes one path.** A window opened and a repeat run the same single RPC, so they also cannot be told apart by timing.
   - **Policy failures.** Only failures of the shared request policy (wrong origin, content type or size) get their own error. Those depend on the request's form, never on the file.
   - Never log the body.

### 4.2 Database

```sql
-- Requires: CREATE EXTENSION pg_cron;  (available 1.6.4, not installed)
CREATE TABLE public.survey_import_window (
  digest_hmac bytea PRIMARY KEY CHECK (octet_length(digest_hmac) = 32),
  expires_at  timestamptz NOT NULL
);
ALTER TABLE public.survey_import_window ENABLE ROW LEVEL SECURITY;  -- no policies
REVOKE ALL ON public.survey_import_window FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.record_survey_import(p_digest_hmac bytea, p_format text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_new boolean;
BEGIN
  INSERT INTO survey_import_window (digest_hmac, expires_at)
  VALUES (p_digest_hmac, now() + interval '7 days')               -- exact seven days
  ON CONFLICT (digest_hmac) DO UPDATE SET expires_at = EXCLUDED.expires_at
    WHERE survey_import_window.expires_at <= now()                 -- renew only after logical expiry
  RETURNING true INTO v_new;                                       -- NULL => live row => repeat
  PERFORM increment_usage_event('survey_import', p_format,
    CASE WHEN v_new THEN 'window_opened' ELSE 'window_repeat' END, 0);
END $$;
REVOKE ALL ON FUNCTION public.record_survey_import(bytea, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_survey_import(bytea, text) TO service_role;

SELECT cron.schedule('survey-import-window-expiry', '7 * * * *',
  $$DELETE FROM public.survey_import_window WHERE expires_at <= now()$$);
```

`increment_usage_event` validates `p_format` against the catalogue (section 5.1), so an invalid format fails the whole transaction and stores no fingerprint.

### 4.3 Properties

| Requirement | Design |
|---|---|
| Window starts at first recognised import | `expires_at = now() + 7 days` is set only when the row is inserted, or renewed after logical expiry |
| Repeats never extend expiry | The conflict update fires only when `expires_at <= now()` |
| Exact window | No hour rounding. The window is exactly seven days from the first recognised import. |
| Logical expiry | At `expires_at`, the row stops counting. An expired row that is still present is treated as absent, so the next import is `window_opened` and starts a fresh window. Correctness never depends on the cron job. |
| Physical deletion | An hourly `pg_cron` job deletes expired rows. A row is physically present for at most about 7 days and 1 hour, plus any job delay. If the Free-plan project is paused, the job does not run; logical expiry still holds, and the first run after resuming deletes the backlog. |
| Residual retention | Deleted rows may persist in provider-side backups, WAL or storage for a period Supabase does not expose on the Free plan. Disclose this as "kan finnes i leverandørens sikkerhetskopier en begrenset periode", and do not claim immediate permanent deletion (O10). |
| Atomicity | One `INSERT … ON CONFLICT` serialises concurrent imports of the same file. The counter is incremented in the same transaction. |
| Isolated storage | Separate table, endpoint and request. The application's `service_role` has no table privileges: the `SECURITY DEFINER` RPC is a deliberate deviation from the Stage 1 `SECURITY INVOKER` convention, so a leaked service key cannot dump fingerprints. |
| No permanent history | The table holds only the HMAC and an expiry: no per-fingerprint counts, no audit trail. The permanent output is the national daily `survey_import` counter only. |
| No association | No kommune, tool, session, user or Stage 1 metric. The only residual link is the hour-long Vercel runtime-log record of request paths and IPs (section 2.2). |
| No oracle | The endpoint's response is constant (section 4.1, step 4), so it never reveals the outcome for an individual file. The dashboard publishes fingerprint figures for completed weeks only, with suppression (section 6). |
| No photo fingerprints | Eligibility comes from the survey classifier (section 4.1, step 1). |
| Key rotation | Optional (O9). Rotation only means that imports falling inside a window opened before the rotation are recorded as `window_opened` rather than `window_repeat`, for at most seven days. |

**A trade-off of the exact window.** `expires_at` minus seven days reveals the time of the first import to the key holder. Hour rounding would blur that. The owner preferred the exact window, and the difference is minor because the row holds no other data. Truncating to the minute is an acceptable middle ground if legal review asks for it.

### 4.4 What the figures mean

The window is fixed. It opens at a registration and closes exactly seven days later, and repeats never extend it.

- **`window_opened`:** no active recognition window existed for these exact bytes, so this import opened one.
  - This does **not** mean the file was not imported in the preceding seven days.
  - Example: a file imported on day 0 opens a window that closes on day 7. Importing it again on day 6 is a repeat. Importing it on day 8 opens a new window, even though the last import was two days earlier.
- **`window_repeat`:** the same bytes were imported while a window opened by an earlier import was still active.
- **Neither is a count of unique files or surveys.**
  - A file imported regularly opens a new window each time the previous one has closed.
  - Two byte-different exports of the same survey are two files.
  - A file imported by two contractors within one window is one `window_opened` and one `window_repeat`.
- **Dashboard labels** (provisional Norwegian):
  - "Ny registrering" for `window_opened`;
  - "Gjentatt import" for `window_repeat`;
  - always shown with this explanation: «Når en fil leses inn, registreres den i sju dager. Leses nøyaktig samme fil inn igjen i denne perioden, telles det som en gjentatt import. Perioden forlenges ikke av gjentatte importer. Når den er over, telles neste import som en ny registrering. Tallene viser derfor ikke antall unike filer eller innmålinger.»
  - Do not use "unike filer", "unike innmålinger" or "ikke lest inn de siste 7 dagene".
- **Coverage** is computed per format and per completed week:

  coverage = (`window_opened` + `window_repeat`) ÷ `survey_import_eligible`

  - **Denominator:** `survey_import_eligible` counts each consented eligible survey import exactly once.
  - **Do not use `survey_features` as the denominator.** Its `point` and `line` variants each count the imports containing that geometry type, so summing them counts a mixed-geometry import twice.
  - **Do not use Stage 1 metric counts either.** They also include imports the classifier does not treat as eligible.
  - **Show alongside:** `survey_fingerprint_skipped` by reason.
  - **The remaining gap** covers fingerprints that were not sent. That includes results discarded because consent was withdrawn, transit failures and closed gates; these are not separately countable.
  - Rejected input (`rejected`) is shown separately and is not part of the numerator.

### 4.5 Alternatives considered

| Alternative | Verdict |
|---|---|
| Fixed weekly epochs, `HMAC(key, week ‖ digest)` | Repeats across a week boundary count as `window_opened`. Simpler deletion only. Fallback if `pg_cron` cannot be used. |
| Browser-only detection (`localStorage` or IndexedDB) | Detects repeats in the same browser only. It is itself device storage for statistics under § 3-15. Weaker data, with no legal gain. |
| HyperLogLog or Bloom sketches | Give distinct estimates, not per-import classification. Needs custom code. Disproportionate here. |
| No fingerprint (format, size and object buckets) | Different survey files commonly share buckets, so this is not useful. |

**Recommendation:** the sliding-window table.

## 5. Infrastructure changes

### 5.1 Database

| # | Change | Assignment |
|---|---|---|
| D1 | Enable RLS on legacy `aggregates`, with no policies. The verified grants already exclude `anon` and `authenticated`, so this is defence in depth and clears the Supabase advisor warning. `service_role` bypasses RLS, so the existing RPCs are unaffected. | A1 |
| D2 | `usage_format_catalog(format)`, seeded with `none`, `gmi`, `sosi` and `kof`. `usage_event_catalog(event, format, variant)`. `usage_event_daily(date, event, format, variant, count, quantity)` with a primary key on the first four, a foreign key to the catalogue and non-negative CHECKs. `increment_usage_event(p_event, p_format, p_variant, p_quantity)`, which is `SECURITY INVOKER` and executable by `service_role` only. RLS on, no policies. | A2 |
| D3 | `pg_cron` extension, `survey_import_window`, `record_survey_import`, the cron job (section 4.2) | A3 |
| D4 | No change to the Stage 1 objects. The GML format extension waits for GML survey import (section 3.2). | Later |
| D5 | Suppressed public reads (section 6), in `/api/stats` or in SQL views or RPCs | A4 |
| D6 | Optional (O4): coarsen the stored `hour` in historical `aggregates` rows | Owner |

### 5.2 Production gates and environment

**Server (fail-closed).** Write only when all of these hold:
- `VERCEL_ENV === 'production'`;
- `STATS_WRITE_ENABLED === 'true'`;
- Supabase is configured;
- for fingerprints, `STATS_FINGERPRINT_HMAC_KEY` is valid.

Otherwise write nothing.
- `/api/track` returns the generic `{ ok: true, stored: false }`. That reveals only the configuration, not anything about a file.
- `/api/track/import` instead returns its constant response (section 4.1, step 4).

Remove the JSON file fallback for writes outside local development, and with it the production use of `TRACKING_STORAGE_PATH`.

**Client.** There are two separate eligibility rules.

**Collection available** (shared by both rules) when all of these hold:
- `GMI_BUILD_ENV === 'production'`;
- a public collection switch is on (for example `NEXT_PUBLIC_STATS_COLLECTION=enabled`, Production only);
- the app is hydrated;
- Testmodus is off, including `?testmodus=1`.

**Prompt eligibility:**
- collection is available;
- **and** no current choice is stored. That means no choice at all, or an earlier "Tillat" for an older consent version whose scope has since widened.

The prompt does not require consent, since asking for consent is its purpose. A stored "Ikke tillat" never makes the prompt eligible again.

**Transmission eligibility** (any statistics request):
- collection is available;
- **and** consent is granted for the current version.

This is checked at the moment of sending (section 4.1, step 3, for fingerprints).

**Effect on today's legacy tracking.** With the switch off, today's non-consented `upload_success` tracking also stops when A1 deploys. That is the recommended way to settle O3.

**Vercel environment (Recommended):**
- **Service-role key.** Re-enter `SUPABASE_SERVICE_ROLE_KEY` as a sensitive variable, Production only.
- **Keepalive secret.**
  - Restrict `TRACKING_KEEPALIVE_SECRET` to Production and store it as sensitive.
  - Rotate it in one coordinated step: new value in Vercel, redeploy, update the cron-job.org header, confirm HTTP 200.
- **Rotation.** Because there is no evidence of compromise, rotating the service-role key is an owner decision (O12).
- **Unused variables.** Delete `NEXT_PUBLIC_TRACKING_DEBUG`, which is unused in `src/`. Delete `TRACKING_STORAGE_PATH` once the fallback is removed.
- **New variables.** Add `STATS_WRITE_ENABLED`, `STATS_FINGERPRINT_HMAC_KEY` (sensitive) and `NEXT_PUBLIC_STATS_COLLECTION`, all Production only and off by default. Also add the Stage 1 start date `DETAILED_STATS_START_DATE`. Document them all in `docs/development.md`.
- **Web Analytics.** Disable it in the Vercel project after the code removal is deployed.

### 5.3 Keepalive endpoint `/api/track/health` (revised)

- **Header.** Accept the secret **only** from the existing `X-Keepalive-Secret` header.
  - The `Authorization: Bearer` path is removed, because the only verified caller does not use it (a single mechanism).
  - The cron-job.org job needs no change, unless the secret is rotated.
- **Query string.** Remove `?secret=` support. A request carrying a `secret` query parameter is rejected with a generic 400 and no work is done.
- **Comparison.** Compare in constant time: SHA-256 both values and compare with `crypto.timingSafeEqual`. This also avoids leaking the length.
- **Unauthenticated requests.** Return a generic 401 with no database work. The current unauthenticated read path is removed.
- **No disclosure.** Responses contain no raw Supabase error message and no `sample` row. Return a short status only (for example `{ ok: true }` or `{ ok: false }`). Server logs can keep a coded error, never secrets.
- **Production only.** Return 404 when `VERCEL_ENV !== 'production'`.
- **Independent of statistics.** `?write=true` keeps its maintenance write (the `health_check` row, which prevents Free-plan pausing).
  - This is a maintenance operation, unaffected by consent or `STATS_WRITE_ENABLED`.
  - Dashboard reads continue to filter on `upload_success`.
- **Domain.** The caller uses `gmi-validator.vercel.app`, which is a Production alias. The production check must accept it.

### 5.4 Vercel Web Analytics removal

- Remove `<Analytics />` and its import from `src/app/layout.js`.
- Remove `@vercel/analytics` from `package.json` and the lockfile.
- Remove the mentions in `src/components/AppInfoModal.js:229`, the README and `docs/privacy.md`.
- Update `tests/appInfoUiContract.test.mjs:265`. This is an approved contract change.
- Disable Web Analytics in the Vercel project.

## 6. Dashboard

**Content:**
- **Existing "Bruksstatistikk":** uploads over time, kommune ranking and map. Retained, with a series-break marker at the consent date.
  - **Historical statistics remain subject to L2.** Continued public display of the historical series collected without consent, including the kommune breakdown, depends on the unresolved legal assessment.
  - If the advice is negative, the historical series is withdrawn from the public dashboard, whatever the safeguards below.
- **Filer:**
  - format, size, object and coordinate buckets, CRS status;
  - points and lines imported;
  - GMI photo references (files with references, total, distinct within a file);
  - **for completed weeks only:** "Ny registrering" versus "Gjentatt import", with the explanation from section 4.4, fingerprint coverage and skipped reasons.
- **Verktøy:** openings and completed operations per tool, weekly or monthly.
- **Rettinger:** corrections applied (change sets and objects) and deliveries downloaded, as separate series.
- **FOTO:**
  - photos imported, with the per-import distribution;
  - positioned by source;
  - manually placed, moved and rotated;
  - delivered as GMI or GML, and excluded, with the per-delivery distribution;
  - export profiles.
- **Gemini WFS:** verified sessions and failures, separate from retrievals.
- **Leveranser:** delivery modes.

**Each series shows:**
- its activation date;
- "Tallene gjelder brukere som har samtykket";
- the wording from section 4.4 for fingerprint figures.

**Disclosure safeguards.** These are enforced server-side, in the response itself, not only in the UI. Suppressing individual cells is not enough on its own: no suppressed value may be recoverable from anything else the dashboard publishes.

1. **Fixed query grid.**
   - The public API accepts only enumerated periods: completed calendar weeks, months and years, and "since activation".
   - It accepts only enumerated filters: kommune for the legacy series only, and the documented variant groups.
   - There are no free date ranges and no arbitrary combinations of filters. This prevents differencing between overlapping requests, such as a range compared with the same range plus one day.
2. **Primary suppression.** Any value from 1 to the threshold minus 1 is returned as "<5". The threshold is O5 (proposal: 5). Zero may be shown.
3. **Secondary (complementary) suppression.**
   - Every published group is treated as a whole: the categories of one event, complementary pairs such as "Ny registrering" and "Gjentatt import", `feil` / `sjekk` / `ok`, the kommune list, and the weeks within a month.
   - If a group contains a suppressed cell, either suppress at least one further cell in the group, or round the group's total.
   - The aim is that a suppressed value cannot be derived as the total minus the visible categories.
4. **Consistency across granularities.**
   - Where a finer series contains suppressed cells, coarser figures that include those cells (monthly, yearly, since activation, national totals of kommune figures) are published rounded (proposal: to the nearest 5).
   - Differencing a month against its visible weeks, or a national total against the visible kommuner, must then not recover a suppressed cell.
5. **Repeated queries.**
   - Responses are deterministic for the same grid cell, and are computed from completed periods only, so repeating a query reveals nothing new.
   - Do not use random noise. It averages out over repeated queries.
   - The current, incomplete period is not published for fingerprint figures, or for any kommune-filtered figure.
6. **No hourly kommune views.** No hourly distribution or weekday×hour heatmap for kommune-filtered selections. `legacyStats.mjs` exposes `hourly` and `heatmap` today.
7. **National only.** New statistics are national.
8. **Fingerprint figures** are weekly, for completed weeks only.
9. **No raw data.** No row-level or export endpoint.

**UI standards.** Norwegian labels and existing `StatsModal` patterns. AGENTS UI standards and the `dataviz` guidance apply at implementation time.

## 7. Implementation: four assignments

Each assignment can be merged and deployed with collection switched off. Every assignment runs focused tests and lints the files it touches. Each one also runs `npm run build`, and the browser checks relevant to it, as AGENTS.md requires.

### A1. Infrastructure, privacy and consent

**Scope:**
- D1;
- production gates (section 5.2);
- removal of the JSON write fallback;
- keepalive hardening (section 5.3);
- Web Analytics removal (section 5.4);
- consent prompt and Om control (section 2.3);
- existing `upload_success` behind consent;
- privacy text in `docs/privacy.md`, the README and AppInfo, in Norwegian;
- the Vercel environment clean-up and rotation (section 5.2);
- deployment, which also activates the `dub1` region.

**Acceptance:**
- `@vercel/analytics` is in neither the bundle nor `package.json`, and Web Analytics is disabled in Vercel.
- Keepalive:
  - `?secret=` returns 400;
  - a missing or wrong header returns 401 with no database work;
  - the correct `X-Keepalive-Secret` returns 200;
  - comparison is constant-time;
  - no raw errors or sample rows;
  - 404 outside production.
- The cron-job.org job still returns HTTP 200 after deployment, and after any rotation.
- Preview and local builds perform no statistics write. This is proven by tests with injected dependencies.
- Browser tests show no `/api/track*` request in any of these states:
  - before a choice;
  - after "Ikke tillat";
  - after withdrawal;
  - in Testmodus;
  - with the collection switch off;
  - outside production.
- With the switch on and no stored choice, the prompt appears before consent is granted, while no statistics request is sent.
- The prompt is not shown with the switch off, and it is never shown again after a refusal.
- Consent UI:
  - refusing is as prominent as accepting;
  - keyboard and screen-reader access;
  - focus restoration;
  - checks at 1280×720 and 1366×768;
  - Norwegian text reviewed.
- A statistics failure never affects parsing, validation or export (existing tests pass).

### A2. File, tool and workflow statistics

**Scope:**
- Stage 1 activation: send the derived telemetry that is now discarded (`void boundedTelemetry`), add app version and kommune resolution outcome on the server, and call `increment_upload_diagnostics`;
- D2;
- the content classifier (section 3.2);
- the extended `/api/track` request policy for `{ event, format, variant, quantity }`;
- emitters at the section 3.3 hook points.

**Acceptance:**
- Synthetic-fixture tests check the exact Stage 1 RPC argument shape, including the `smallint` schema version.
- No filename, coordinate or raw value is stored.
- One emission per operation, including these double-counting cases:
  - automatic Validator re-runs;
  - repeated download of the same plan;
  - Rettinger, standalone FOTO and combined exports through `DeliveryWizard`;
  - both entry points to Juster plassering og retning;
  - undo and redo;
  - placement during import;
  - failed operations.
- `count` and `quantity` match the section 3.1 definitions in tests, with distributions adding to exactly one bucket.
- Gemini WFS:
  - entering credentials with no survey layer records no `verified`;
  - reused, cancelled and aborted retrievals record nothing.
- The classifier returns `photo-only` for FOTO GML inputs and never marks FOTO GMI sources as survey imports.
- Unknown events, formats and variants are rejected by both the server and the database.

### A3. Seven-day fingerprints

**Scope:**
- D3, including installing `pg_cron`;
- `/api/track/import`;
- the dedicated hashing helper;
- skip counters;
- the consent recheck.

**Acceptance:**
- `exact-bytes` values, non-hex input and wrong lengths are never sent or accepted.
- Status, headers and body are byte-identical for these outcomes: `window_opened`, `window_repeat`, rejected input, closed production gate and database failure. The response never carries `stored`.
- Concurrent duplicate submissions produce exactly one `window_opened`.
- A repeat within the window does not change `expires_at`.
- An import after logical expiry is `window_opened`, even if the expired row has not yet been deleted.
- The cron job deletes expired rows.
- `survey_import_eligible` is emitted exactly once per consented eligible import, including mixed-geometry imports.
- Withdrawal, tested with a deferred digest stub:
  - consent withdrawn while a digest is pending: the digest resolves, its result is discarded and nothing is sent;
  - queued jobs are dropped;
  - a request already passed to `fetch` before withdrawal is not retried or duplicated.
- Photo, FOTO GML, FOTO GMI source and delivery paths never call the helper.
- In production:
  - `service_role` cannot `SELECT` the window table;
  - the cron job is listed and has run;
  - the HMAC key is a Production-only sensitive variable.

### A4. Dashboard and production acceptance

**Scope:**
- D5 suppressed reads;
- the new dashboard sections;
- the production activation and acceptance checklist.

**Acceptance:**
- **Suppression.** Enforced in API responses, tested with synthetic low counts.
  - A single suppressed cell cannot be recovered from a visible total, a complementary category, an overlapping or coarser period, or the national total of kommune figures.
  - Requests outside the fixed grid are rejected.
  - Repeated identical requests return identical responses.
- **Labelling.** Series start dates, the consent note, and the "Ny registrering" / "Gjentatt import" labels with the section 4.4 explanation are shown.
- **Historical series.** Published only in line with the recorded L2 outcome.
- **Legacy view.** Unchanged apart from the safeguards.
- **Region and APIs.** After deployment:
  - the function region is confirmed as `dub1` (for example from the `x-vercel-id` response header, or the deployment's function details);
  - these work from `dub1`: `/api/track`, `/api/stats`, `/api/track/health`, the Gemini WFS and WMS proxies, and the Geonorge kommune lookup.
- **Activation** only after the section 8 legal prerequisites are recorded:
  1. Set `STATS_WRITE_ENABLED`, `NEXT_PUBLIC_STATS_COLLECTION` and `DETAILED_STATS_START_DATE`, then deploy.
  2. In a production browser, confirm the prompt appears and that "Ikke tillat" sends nothing.
  3. After a consented import, confirm the first Stage 1, `usage_event_daily` and `survey_import` rows appear with the expected values, and that `survey_import_window` holds only 32-byte HMACs with expiries seven days ahead.
  4. Confirm the first hourly cron run.
- **Record.** Write a completion report containing no secrets.

## 8. Unresolved questions

### Owner decisions

| # | Question | Recommendation |
|---|---|---|
| O2 | One consent for everything, or a separate fingerprint choice | One consent that names the fingerprint explicitly, unless legal advice prefers granularity |
| O3 | Pause non-consented `upload_success` now, or when consent ships | Pause when A1 deploys, with the switch off |
| O4 | Historical aggregates: keep, coarsen the hour, or limit display | Keep, behind the section 6 safeguards, subject to L2 |
| O5 | Suppression threshold, rounding base and period grid | Threshold 5, rounding to the nearest 5, completed weeks, months and years only, and fingerprint figures for completed weeks only |
| O6 | Controller identity and contact for the privacy notice | — |
| O7 | Final list of tool openings | Section 3.3 |
| O8 | Fingerprint size cap | 100 MiB |
| O9 | HMAC key rotation policy | No scheduled rotation; rotate on suspicion |
| O10 | Accept residual provider backup retention, and how to word it | Accept and disclose (section 4.3) |
| O11 | Final privacy notice and the remaining consent text | Section 2.3 draft |
| O12 | Rotate the Supabase service-role key when converting it to a sensitive variable | Optional, since there is no evidence of compromise |

**O1** (opt-in consent model) is settled by the approved prompt, subject to legal advice.

### Legal questions (before any collection is switched on)

- **L1** Confirm that first-party client-side statistics requests, including bare counters, fall under § 3-15, and that no measurement exemption applies.
- **L2** Whether historical aggregates collected since 2026-02-19 without consent may be retained and published.
- **L3** Whether HMAC fingerprints of survey files are personal data.
- **L4** Whether storing the consent choice locally is exempt.
- **L5** Processor and transfer basis:
  - **Supabase:** EU region; the DPA is in the Terms; a TIA is available. Confirm its sub-processors are acceptable.
  - **Vercel:** a US entity, with EU functions after the region change. Whether the DPA applies on Hobby is open.
- **L6** Whether versioned evidence (section 2.3) demonstrates consent sufficiently without a per-user consent log.
- **L7** Withdrawal semantics: confirm that stopping future collection is sufficient for data already aggregated or held within the seven-day window.

### Contractual questions

- **C1** Whether Vercel's DPA applies to the Hobby plan.
- **C2** Whether the Hobby plan is suitable for this application's use.

**Production verification still needed.** The earlier V1–V8 are resolved by section 1.1, except for these:
- the post-deployment region and API checks (A4);
- installing and running `pg_cron` (A3);
- Web Analytics disabled and the environment clean-up confirmed (A1);
- whether any caller other than cron-job.org uses `/api/track/health`, including any that rely on the unauthenticated read or Bearer authentication (A1).

## 9. Authoritative references

- Lovdata, ekomloven § 3-15: https://lovdata.no/lov/2024-12-13-76/§3-15
- Nkom, "Informasjonskapsler/cookies": https://nkom.no/internett/informasjonskapsler-cookies
- Datatilsynet, "Samtykke til bruk av informasjonskapsler og andre sporingsteknologier" (updated 2025-04-03): https://www.datatilsynet.no/personvern-pa-ulike-omrader/internett-og-apper/bruk-av-informasjonskapsler-og-andre-sporingsteknologier/
- Datatilsynet, "Bruk av informasjonskapsler (cookies)": https://www.datatilsynet.no/personvern-pa-ulike-omrader/internett-og-apper/cookies/
- EDPB Guidelines 2/2023 v2.0, paras. 33, 53, 55, 62: https://edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf
- EDPB Guidelines 01/2025 on Pseudonymisation (consultation version): https://www.edpb.europa.eu/our-work-tools/documents/public-consultations/2025/guidelines-012025-pseudonymisation_en
- CJEU C-413/23 P, *EDPS v SRB*, 4 September 2025. The holding was read through commentary; verify it against the judgment text.
- Prop. 93 LS (2023–2024): https://www.regjeringen.no/contentassets/096a9d827c8f48c3ae8b7817fe463a25/no/pdfs/prp202320240093000dddpdfs.pdf
- Vercel, Runtime Logs: https://vercel.com/docs/logs/runtime
- Vercel, Web Analytics privacy: https://vercel.com/docs/analytics/privacy-policy
- Supabase, Backups: https://supabase.com/docs/guides/platform/backups
- Supabase, Cron: https://supabase.com/docs/guides/cron

**Source limitations.** I did not read the Prop. 93 commentary on § 3-15, the final EDPB pseudonymisation guidelines or the SRB judgment text directly.

## 10. Revision record, checks and Git

**Revision 2 (consolidation, 2026-11-18):**
- Added the verified production infrastructure, the configuration changes already made, and the status labels.
- Revised the keepalive hardening to keep `X-Keepalive-Secret`, removing Bearer and query-string support.
- Added to the inventory:
  - points and lines;
  - photo distributions;
  - the Juster plassering og retning opening;
  - definitions of manual positioning and adjustment;
  - the Gemini WFS verification/retrieval distinction;
  - the verified delivery coverage;
  - the operation, quantity and distinct definitions.
- Added the `format` dimension and the GML-ready content classification.
- Fingerprints:
  - changed to an exact seven-day window;
  - documented logical expiry versus physical deletion;
  - added the consent recheck, coverage and skip counters, and the Free-plan pause and backup notes;
  - added the "recognised within seven days" semantics.
- Added the approved consent wording and the draft of the remaining text.
- Consolidated six slices into four assignments.
- Replaced V1–V8 with the remaining verification items.

**Revision 3 (targeted corrections, 2026-11-18):**
- **Fingerprint terminology.** Variants renamed to `window_opened` and `window_repeat`, and their meaning corrected: no active window existed, not "not imported in the preceding seven days". Provisional labels "Ny registrering" and "Gjentatt import", with a Norwegian explanation (section 4.4).
- **Coverage denominator.** The new `survey_import_eligible` counter counts each eligible import once. Summing the `survey_features` point and line variants is explicitly ruled out.
- **Prompt and transmission.** Prompt eligibility is now separate from transmission eligibility (section 5.2).
- **Withdrawal.** Pending digests are invalidated and their results discarded, not interrupted. Consent is rechecked before `fetch`. Requests already transmitted are handled separately (sections 2.3 and 4.1).
- **Consent wording.** The draft no longer claims aggregates-only storage or deletion after exactly seven days. It now distinguishes temporary storage, logical expiry, physical deletion and residual backups. The approved heading and introduction are unchanged.
- **Suppression.** Requirements against reconstruction added: fixed grid, secondary suppression, rounding across granularities, deterministic responses. Historical publication is tied to L2.
- **Fingerprint response.** The endpoint's constant `204` response is reconciled with the generic gate response. `/api/track/import` never returns `stored`.
- The four assignments and the decision register are preserved, with O4 and O5 refined.

**Commands (this revision):**
- Read-only `git rev-parse` and `git status`.
- `grep` and `sed` over these files:
  - `src/lib/telemetry/uploadTelemetry.mjs`, `src/lib/gemini-wfs/geminiSession.mjs`, `src/lib/gemini-wfs/geminiErrors.mjs`;
  - `src/components/gemini-wfs/GeminiConnectionModal.js`, `src/components/photos/*`, `src/components/delivery/DeliveryWizard.js`, `src/components/FileUpload.js`;
  - `src/lib/photos/photoSession.mjs`, `src/lib/delivery/deliveryGml.mjs`;
  - `src/app/page.js`, `src/app/api/track/health/route.js`, `src/app/api/stats/route.js`, `src/lib/tracking/aggregates.js`, `docs/development.md`.
- `git diff --check`.

**Access:** no database, Vercel or cron-job.org access. The production facts are the owner's. No statistics events submitted. No new web research in this revision.

**Builds and tests:** none run, because this is documentation only.

**Git:** the two untracked reports are the only changes. The preliminary report is unchanged. Nothing was staged, committed or pushed.
