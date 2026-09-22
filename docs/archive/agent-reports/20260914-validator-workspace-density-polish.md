# Validator workspace density polish

## Changes

Contextual diagnostic groups already had distinct aggregation keys, but their `diagnosticId` discarded the rule and context discriminator. React therefore received duplicate card keys for distinct Type/Tema contexts. The diagnostic presentation ID now includes canonical field, geometry, type, state, rule, reason, and the existing semantic context discriminator. Card wording, object refs, counts, and validation outcomes are unchanged.

Resultat cards are denser: the explicit `Vis N objekter` action shares the status/count row, card padding and supporting gaps are reduced, and the body retains ordinary wrapping and keyboard-accessible controls.

### Structural legend correction

The toolbar and legend were descendants of the same `[data-map-pane]` element, but each independently searched for that ancestor, installed its own `ResizeObserver`, and maintained separate responsive state. The toolbar is mounted persistently at the map-pane boundary. `MapLegend`, however, is dynamically imported inside `MapView`, can be absent until layer data produces visible legend entries, and owned a default-expanded local state. Consequently, a constrained toolbar did not causally imply a constrained legend: the legend depended on its separate mount-time measurement and state update. The earlier focused tests passed because they tested the width helper, compact-transition reducer, and source strings independently; they never reproduced the real owner-first, data-later component lifecycle or proved that toolbar state reached the legend.

`MapPanePresentationProvider` now replaces the raw map-pane wrapper in `page.js`. It owns the actual `[data-map-pane]` DOM node, the only map-pane `ResizeObserver`, the authoritative `normal`/`constrained`/`narrow` mode, and the runtime-only legend collapsed state. Both `MapPaneToolbar` and `MapLegend` consume this state through the same context. Neither child measures DOM width.

Real browser inspection then established the remaining product-boundary error: at 1920x1080 with both Validator surfaces open, the single `[data-map-pane]` measured 970.4px and contained the single visible legend. The provider connection was working. At that width the existing toolbar thresholds correctly return `normal`, so using toolbar compact mode as the legend boundary correctly left the legend expanded according to code but incorrectly for the available map area. The previous architectural correction shared responsive state, but it also shared a breakpoint that serves a different visual purpose.

The provider still performs one authoritative width measurement. It now derives two concepts from that width: toolbar mode with its unchanged 580px/860px thresholds, and `legendCompact` with a separately centralized 1100px threshold. At 970px the toolbar is therefore normal while the legend is compact; at 1100px and above both remain normal/non-compact. No child observer or viewport query was added.

The provider treats `legendCompact` as the legend's compact period independently of toolbar mode. Its first below-1100px measurement collapses the legend even when the legend has not mounted yet. A manual toggle updates provider state, so repeated observer callbacks, toolbar-mode changes below 1100px, table opening, and MapView/legend remounts preserve the user's choice. Crossing to 1100px or wider ends the legend compact period without forcing expansion; a later crossing below 1100px collapses once. The provider itself unmounts only when the map workspace is removed, which is the appropriate full-workspace reset boundary. Measurement uses a layout effect so the compact state is established before a delayed legend paints where React's lifecycle permits.

The regression test now models the actual order with the measured browser width: the page/provider and toolbar mount, the pane measures 970px, toolbar mode remains normal, `legendCompact` becomes true, and the data-dependent dynamic legend arrives afterward and consumes an already-collapsed owner state. It also covers 1100px and 700px boundaries, manual reopening below 1100px, repeated measurements, toolbar-mode changes within one legend compact period, crossing above and back below 1100px, table coexistence, and legend remount persistence. Component source contracts ensure there is one observer in the provider and both consumers use its context.

The default Validator sidebar is now 380px. The existing resizing and docking calculation continue to use the live sidebar width. Field labels and expanded metrics are slightly smaller, and the metrics plus `Vis` button remain a compact non-wrapping row. The docked inspector is now 38rem (608px) through a dedicated shared token; the modal keeps its established 44rem maximum width. The docking threshold derives from the current sidebar width, the shared docked-inspector token, and the existing 480px minimum map width, giving approximately 932px to the map at a 1920px viewport before minor dividers.

## Verification

- Focused map-pane, workspace inspector, statistics, and Testmodus integration tests: pass (22 tests).
- Full Validator suite: `node --loader ./tests/esmJsLoader.mjs --test tests/validationV2*.test.mjs` — pass (252 tests).
- Production build: `npm run build` — pass.
- Diff check: `git diff --check` — pass; Git emitted only existing CRLF conversion warnings.
- Browser/manual verification: attempted, but the in-app browser connection is still rejected because its sandbox metadata is unavailable.

Legend correction files: `src/app/page.js`, `src/components/MapPanePresentationProvider.js`, `src/components/MapPaneToolbar.js`, `src/components/MapLegend.js`, `src/lib/workspace/mapPanePresentation.mjs`, and `tests/mapPaneToolbar.test.mjs`.

Validation semantics, counts, visible diagnostic wording, and exact object scope resolution are unchanged. No Slice 5 table-column work was started.
