# Stage 2 Slice 1B statistics and Testmodus review

**Review date:** 2026-08-12
**Branch:** `feature/richer-upload-telemetry-app`
**Scope:** complete uncommitted Slice 1B diff; repository-only review
**Verdict:** **GO WITH CHANGES**

## Decision summary

- Safe to commit Slice 1B: **No**.
- Test-mode public activation UX acceptable: **No**.
- Persisted-state tracking race present: **Yes**.
- Stats filtering/pagination trustworthy: **Yes**, subject to the medium-strength hardening and test gaps below.
- BLOCKER findings: **0**.
- HIGH findings: **2**.

The statistics work is a sound improvement. It applies one normalized and filtered row set to the headline total, municipality count, monthly and cumulative uptake, ranking, timeline, and map input. Supabase pagination follows the complete legacy primary key, configured-source failures no longer masquerade as local complete data, and public errors are fixed Norwegian strings. No richer telemetry was activated or transmitted.

Slice 1B is not ready to commit because Testmodus is intended to protect the developer's own test uploads, yet the current implementation both exposes a general opt-out to every visitor and lacks an explicit fail-closed hydration boundary for a previously persisted `testMode=true` value.

## Findings

### BLOCKER

None.

### HIGH

#### H1. Persisted Testmodus is not fail-closed across Next.js hydration

**Relevant code:**

- `src/lib/store.js`, persisted `settings.testMode` and `onRehydrateStorage`;
- `src/components/FileUpload.js`, `useFileLoader` selection of `settings.testMode`;
- `src/components/TestModeControl.js`, initial inactive/active rendering; and
- `tests/testMode.test.mjs`, persistence-only test.

**Concrete failure mode:**

The server store starts with `testMode=false`; browser-local state cannot be read during SSR. The tracking decision consumes only that boolean and has no separate “persistence has hydrated” state. Zustand/React hydration must reconcile the server snapshot with the persisted client value. Until that reconciliation is known complete, the application cannot distinguish “saved false” from “saved true but not restored yet.” A user with persisted Testmodus can therefore encounter an initial false view/closure, and an upload initiated at that boundary can call `/api/track` before the saved opt-out is reflected.

The exact timing is implementation-dependent, but the safety property is not established by the code or tests. For an opt-out whose sole purpose is preventing test events, absence of proof must fail closed. The same initial-state difference can also make the inactive control server markup disagree with the active client state.

**Smallest safe correction:**

Expose a minimal persisted-store hydration boolean. Gate successful-upload tracking so the only state that permits `/api/track` is `hydrated === true && testMode === false`; an unknown/not-yet-hydrated state should skip tracking while parsing, validation, layer creation, and `onComplete` continue normally. Render no activation control until hydration is known, then render the active banner or developer activation state. Add a focused test with persisted `testMode=true` proving zero tracking before and after hydration and no SSR/localStorage access crash. This does not require a broad loading architecture.

#### H2. The current public Testmodus activation is an unrestricted analytics opt-out for every visitor

**Relevant code:**

- `src/app/page.js`, unconditional `<TestModeControl />`; and
- `src/components/TestModeControl.js`, ordinary inactive “Testmodus” button.

**Concrete failure mode:**

Every visitor sees a fixed control that disables all upload tracking persistently in that browser. This is broader than the stated product goal of suppressing the owner's development/test uploads and makes uptake statistics user-selectively incomplete. The control is especially easy to activate because it is permanently visible and requires one click, with no developer-oriented entry mechanism.

The active behavior itself is good: the banner is prominent, explains that uploads are not registered, and has an obvious off action. The problem is ordinary public activation.

**Smallest safe correction:**

Keep browser-local persistence and the active banner/off action, but expose activation only through a deliberate developer-oriented mechanism such as a specific bounded query parameter processed client-side. Do not send that parameter to `/api/track`, store it as telemetry, or add authentication. Once activated, persist the boolean and remove/ignore the activation parameter from ordinary navigation where practical. Ordinary visitors should not receive a prominent enable toggle. Add tests for hidden-by-default activation, deliberate activation, persistent active banner, and immediate deactivation.

### MEDIUM

#### M1. Unknown-location uploads need an explicit presentation contract

**Relevant code:** `src/lib/stats/legacyStats.mjs`, `processRows` and `filterRowsByKommune`; `src/components/StatsModal.js`, ranking display.

All mode keeps unknown-location rows. Only mode excludes them because they do not match a municipality number. Exclude mode keeps them because they are not the excluded municipality. This is internally consistent and is the preferable behavior for preserving registered-upload totals.

However, unknown rows contribute to the headline total and monthly/cumulative series while they do not contribute to `uniqueKommuner`, cannot appear on the map, and are removed from the visible ranking when their name is `unknown`. Users can therefore see totals that exceed the visible municipality breakdown without explanation.

**Smallest correction:** document and display a short Norwegian note that uploads without resolved municipality remain in all/exclude totals but cannot be shown in municipality ranking/map. Do not fabricate a municipality or silently discard these uploads.

#### M2. Filter parsing permits duplicate allowed query parameters

**Relevant code:** `src/lib/stats/legacyStats.mjs`, `parseKommuneFilter`.

Unknown keys, invalid modes, missing IDs, and SQL-like values are rejected. Filtering occurs in memory against a validated identifier from the known municipality option set, so duplicate parameters do not create SQL injection. Nevertheless, `URLSearchParams.get` accepts the first value when `kommuneMode` or `kommuneId` is repeated, leaving ambiguous requests accepted.

**Smallest correction:** require each allowed key to appear at most once and add duplicate-mode and duplicate-ID tests, matching the repository's fail-closed request-policy posture.

#### M3. Count validation should use safe integers

**Relevant code:** `src/lib/stats/legacyStats.mjs`, `isValidCount`.

Negative, non-finite, fractional, string, and invalid-date records are rejected. JavaScript integers beyond `Number.MAX_SAFE_INTEGER` still satisfy `Number.isInteger`, however, and can lose precision in totals and cumulative values.

**Smallest correction:** use `Number.isSafeInteger(value) && value >= 0`; add an unsafe-integer case. This is defensive hardening rather than a likely current production failure.

#### M4. Route-level and hydration behavior are not meaningfully tested

**Relevant tests:**

- `tests/legacyStats.test.mjs`;
- `tests/statsUiContract.test.mjs`; and
- `tests/testMode.test.mjs`.

The legacy stats tests exercise the production pure helpers, including pagination chaining, normalization, filtering, month filling, cumulative reconciliation, and source selection. They do not execute `GET`, so they do not prove route-level unknown-ID rejection, sanitized 400/503 responses, absence of raw rows, coordinate enrichment containment, or configured/unconfigured wiring.

The UI contract test reads source text and checks labels only; it does not exercise filter transitions, low-volume chart rendering, or map/ranking filtering. The Testmodus persistence test proves synchronous local persistence updates but does not simulate SSR, hydration, or persisted-true tracking safety. The modified parser integration test does meaningfully exercise the production tracking seam for active/off behavior.

**Smallest correction:** add narrow route-handler tests with injected/stubbed read and coordinate dependencies, plus the hydration test required by H1. A full browser framework is not necessary. At minimum, add assertions for exact-multiple and partial final pagination pages, duplicate query keys, unknown route IDs, sanitized configured failure, response key containment, and unknown-location mode semantics.

### LOW

#### L1. Ranking tie-breaking can be made explicitly total

`byKommune` sorts by descending count and Norwegian area name. Modern JavaScript stable sort plus deterministic source ordering makes current output repeatable, but two distinct municipality numbers with the same display name compare equal.

Smallest correction: add municipality number/area ID as a final tie-breaker and test equal-count/equal-name records.

#### L2. Selecting only/exclude before a municipality temporarily leaves prior all-mode results visible

When a user changes from all to only/exclude, the effect returns while `selectedKommune` is empty and sets loading false, leaving the previous all-mode `stats` rendered below an incomplete filter. This lasts until a municipality is selected but can momentarily imply that the chosen mode is already applied.

Smallest correction: hide results or show a fixed “Velg kommune” state while a mode requires a selection. No API change is needed.

## Legacy statistics correctness

The production pagination helper is correct for the current legacy schema:

- it filters `event_type=upload_success`;
- orders by the complete primary key `(date, hour, area_type, area_id, event_type)` on every page;
- uses non-overlapping inclusive ranges;
- continues after a full page;
- terminates on a partial or empty page; and
- fails rather than returning a silently truncated result after the bounded page limit.

Offset pagination cannot provide a transaction-wide snapshot if live rows change while pages are read, but deterministic full-key ordering prevents ambiguity in a stable checkpoint and is appropriate for this read-only legacy dashboard.

Normalization rejects invalid calendar dates and malformed counts before aggregation. Invalid hours are reduced to hour zero only for retained compatibility outputs; they do not change total/month grouping. Configured Supabase failures propagate to a fixed Norwegian 503 and never invoke the local reader. Local JSON remains an intentional fallback only when Supabase is unconfigured. The route catch does not expose raw dependency messages.

## Filter validation and consistency

No-filter requests remain equivalent to all mode. Accepted modes are exactly `all`, `only`, and `exclude`. Only/exclude require a bounded identifier, and the route additionally requires that identifier to exist in the normalized municipality option set. Display names are not accepted as the matching field; filtering compares stable `kommuneNumber` values. No filter expression enters Supabase: the route reads the fixed legacy query and filters normalized rows in application memory.

The response contains derived aggregates and municipality reference options, not raw legacy rows. Municipality centroid coordinates are fetched reference data, not upload coordinates.

For all three modes, `filteredRows` is the sole source for summary totals, municipality count, daily/monthly/cumulative series, ranking, heatmap compatibility output, timeline, and map enrichment. Only mode reports one municipality when matching rows exist. Exclude mode counts the remaining resolved municipalities. Unknown-location behavior is consistent as described in M1.

## Monthly uptake assessment

Month keys derive from validated `YYYY-MM-DD` dates. Lexical ordering is chronological, including year boundaries. Missing calendar months are inserted only between the first and last observed month in the filtered set; no leading or trailing history is fabricated. Empty input produces empty monthly and cumulative arrays. Counts are non-negative, so cumulative values are monotonic, and the final cumulative value equals the filtered total.

The monthly/cumulative toggle, integer Y axis, 220-pixel chart, and dots for series up to 24 months are suitable for the current relatively low volumes. Monthly aggregation is clearer than the prior daily/hourly emphasis.

## Municipality ranking and map assessment

Ranking is descending by count with stable Norwegian name ordering. The same filtered `byKommune` and `timeline` arrays feed the ranking and map. A selected-only response contains only that municipality; an excluded municipality is absent from both arrays and therefore cannot appear as a marker. Unknown rows have no municipality centroid and do not enter map markers. No upload coordinates are returned; `lat`/`lng` values are municipality reference centroids fetched by municipality number.

## Testmodus tracking assessment

At the pure success seam:

- default/false mode derives browser-local telemetry, calls legacy tracking exactly once, and completes once;
- true mode returns before richer derivation, calls tracking zero times, and completes once;
- no `test` field, test category, ID, or alternate event exists;
- enabled tracking retains exactly `{ eventType: 'upload_success', datasetCoord }`; and
- parsing, parser errors, validation, state/layer installation, and upload UI behavior occur before this post-success gate and remain unchanged.

The active behavior is therefore correct after the state value is trustworthy. H1 concerns only the persisted-state hydration boundary.

## UI and product priority assessment

The redesigned modal correctly prioritizes registered uploads, municipality adoption, uptake over time, ranking, and map. Hour-of-day and weekday heatmap presentation has been removed from the main UI while compatibility API fields remain. New visible wording is Norwegian and refers to registered uploads/municipal activity, not unique or authenticated users. Filtering is presented as a view operation and does not imply deletion. The UI does not claim that past test events were removed.

H2 must change the inactive Testmodus activation UX before commit. The active warning/banner and off action should be retained.

## Detailed telemetry boundary

Slice 1B does not send `boundedTelemetry`, alter the enabled legacy tracking payload, query either richer table, call `increment_upload_diagnostics`, add an activation date, enable richer writes, or modify Stage 1 SQL. No server-side richer telemetry or Vercel behavior was added.

## Validation performed

- `node --test tests/*.test.mjs` — **PASS**, 76/76 tests.
- `npm.cmd run build` — **PASS**, optimized Next.js production build completed.
- `git diff --check` — recorded after this report was written.
- `git status --short --branch` — recorded after this report was written.

## Final verdict

**GO WITH CHANGES.**

The statistics filtering and pagination implementation is trustworthy and the richer-telemetry boundary remains intact. Slice 1B is **not safe to commit** until Testmodus fails closed while persistence hydration is unknown and ordinary visitors no longer receive a prominent activation control. The smallest acceptable revision is a hydration-known tracking gate plus deliberate developer-only activation, while retaining the persistent active banner and one-click off action.
