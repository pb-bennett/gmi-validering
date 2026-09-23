# Executive conclusion

Date: 2026-09-23. This focused source-based delta review supplements the 20260915 audit at `641387f` for the integrated application at `f2c34b4`. It does not repeat the whole application audit or implement styling.

The canonical extended palette genuinely describes AppInfo's intended visual language. Its principal neutral, cyan, surface and border colours match the installed Tailwind 4 palette at rounded 8-bit sRGB precision. The logo contains the expected literal colours. AppInfo already uses the corresponding navy and brand cyan utilities, but its dark hero uses **Ink**, not Navy. White and its explicitly authored `#CBD5E1` hero subtitle are exact literal matches; Tailwind's OKLCH declarations are not literally identical to canonical hex declarations.

Authority is: approved SVG and core brand colours → current AppInfo/Om visual language → canonical semantic implementation palette. Preserve AppInfo's restrained light surfaces, dark reading hero, neutral selection and hierarchy. Resolve its extra shades and inconsistent focus treatments through scoped normalisation. Do not spread its reading dimensions into dense GIS surfaces.

Retain the S0–S12 sequence and A/B checkpoints. S0's missing-asset prerequisite is satisfied; S1 should be additive against this baseline; AppInfo/Contact needs a named acceptance checkpoint inside S10. Preserve the separate S3A ownership/geometry gate and correct Stats visibility in all later acceptance criteria. The September 21 foundations implementation was deliberately discarded and must not be treated as work to resume or restore.

# Current integrated baseline

Mandatory checks ran before source inspection:

| Check | Result |
| --- | --- |
| Repository root | `C:/GitHub/gmi-validering-test` |
| Branch | `test/validator-v2-v32-ui` |
| HEAD | `f2c34b478cca510b0c0c14a59084fe772292985a` |
| Initial working tree | Clean; `git status --porcelain=v1` returned no entries |

Evidence: `src/components/AppInfoModal.js`, `ContactForm.js`, `src/app/page.js`, `globals.css`, `layout.js`, the SVG, current Sidebar/FieldValidationSidebar/WorkspaceShell composition, `src/lib/appInfoState.mjs`, `src/data/appReleases.mjs`, relevant current contract tests, and `git diff 641387f HEAD`. Both historical reports were read. Current source and the user's accepted behaviour supersede historical assumptions.

Tailwind is **4.1.18** in both the lockfile and installed local package. Exact utilities below resolve from the existing `node_modules/tailwindcss/theme.css`. Global CSS imports Tailwind/Leaflet, still contains five legacy theme palettes, and has no implemented `--gmi-*` foundations or authored semantic `@theme` mapping. Page and WorkspaceShell still paint `bg-gray-50`. The discarded report's alias rewiring, theme removal and recipe adoption are not current facts; its old test/build and missing-dependency results are historical too.

Page owns one AppInfo instance independently of the loaded workspace. Om/Kontakt are available on upload and in normal and Validator working modes. Automatic first-visit/release opening uses `appInfoState.mjs`; manual actions select the requested tab. Release content comes from `appReleases.mjs`. Fremtiden still describes Validator 2.0 as a future beta although this test branch integrates it: record that release-copy distinction without editing it in a styling task.

This is a static source review, not a browser visual/accessibility certification. No dev server, build, application tests, upload, contact submission or dependency installation was run. Native-control appearance, clipping, computed styles and actual focus behaviour need later authorised browser verification. Colour conversions were calculated in memory from local definitions; no external palette was introduced.

# Approved logo findings

Authoritative source: `public/brand/gmi-validator-logo.svg`.

| Property | Verified source |
| --- | --- |
| ViewBox | `0 0 512 512`; no fixed width/height |
| Colours | Navy `#0F172B`, cyan `#53EAFD`, off-white `#F8FAFC`; declared in comments and used by artwork |
| Main structure | Two navy paths, fill none, stroke width 58, round caps/joins |
| Lower-left arc | Cyan path, stroke width 58, round caps/joins |
| Nodes | Paired circles at (130,245), (300,85), (269,418); navy outer radius 47, off-white inner radius 22 |
| Checkmark | Cyan path through (283,324), (323,364), (383,298); stroke width 36, round caps/joins |
| Actual layer order | Two navy paths → cyan arc → node group → cyan checkmark |
| Accessibility metadata | role=img; aria-labelledby title/desc; title and description present |
| SHA-256 | `50CA31A6B7D4A5D5376ACC89E275B0C28CBEED23BB98F866F8E0E802628241DC` |

The asset is ready to be canonical. Preserve all paths, geometry, viewBox, line widths/caps/joins, node construction and layer order. Its off-white node centres and transparent background are intentional. The old audit's “cyan behind dark geometry” prose must not override the actual approved SVG ordering. No tracing, recreation, recolouring, currentColor substitution or second drawing is needed.

Use a larger identity on initial/upload and a compact persistent identity atop the working left sidebar. AppInfo's current Info icon is expected; do not insert a decorative logo there. Existing QR/favicon touchpoints remain separately reviewed scope, subject to readability/scan checks; the asset being ready does not certify small rendered sizes or authorise an adapted drawing.

# Exact AppInfo modal palette

These are the exact installed Tailwind declarations, not Tailwind 3 assumptions. Hex columns are **rounded, clipped 8-bit sRGB conversions for comparison**, not exact replacements for OKLCH source. Out-of-gamut components are clipped for this comparison; browser gamut mapping/compositing may differ. “Same hex” does not establish identical CSS or pixels. White is exactly `#fff`; the hero subtitle is separately authored `rgb(203 213 225)` = `#CBD5E1`.

| Utility colour | Exact installed declaration | Rounded sRGB comparison |
| --- | --- | --- |
| `cyan-50` | `oklch(98.4% 0.019 200.873)` | `#ECFEFF` |
| `cyan-100` | `oklch(95.6% 0.045 203.388)` | `#CEFAFE` |
| `cyan-200` | `oklch(91.7% 0.08 205.041)` | `#A2F4FD` |
| `cyan-300` | `oklch(86.5% 0.127 207.078)` | `#53EAFD` |
| `cyan-400` | `oklch(78.9% 0.154 211.53)` | `#00D3F2` |
| `cyan-500` | `oklch(71.5% 0.143 215.221)` | `#00B8DB` |
| `cyan-600` | `oklch(60.9% 0.126 221.723)` | `#0092B8` |
| `cyan-700` | `oklch(52% 0.105 223.128)` | `#007595` |
| `cyan-800` | `oklch(45% 0.085 224.283)` | `#005F78` |
| `blue-100` | `oklch(93.2% 0.032 255.585)` | `#DBEAFE` |
| `blue-600` | `oklch(54.6% 0.245 262.881)` | `#155DFC` |
| `blue-800` | `oklch(42.4% 0.199 265.638)` | `#193CB8` |
| `pink-600` | `oklch(59.2% 0.249 0.584)` | `#E60076` |
| `pink-700` | `oklch(52.5% 0.223 3.958)` | `#C6005C` |
| `pink-900` | `oklch(40.8% 0.153 2.432)` | `#861043` |
| `rose-700` | `oklch(51.4% 0.222 16.935)` | `#C70036` |
| `slate-50` | `oklch(98.4% 0.003 247.858)` | `#F8FAFC` |
| `slate-100` | `oklch(96.8% 0.007 247.896)` | `#F1F5F9` |
| `slate-200` | `oklch(92.9% 0.013 255.508)` | `#E2E8F0` |
| `slate-300` | `oklch(86.9% 0.022 252.894)` | `#CAD5E2` |
| `slate-400` | `oklch(70.4% 0.04 256.788)` | `#90A1B9` |
| `slate-500` | `oklch(55.4% 0.046 257.417)` | `#62748E` |
| `slate-600` | `oklch(44.6% 0.043 257.281)` | `#45556C` |
| `slate-700` | `oklch(37.2% 0.044 257.287)` | `#314158` |
| `slate-800` | `oklch(27.9% 0.041 260.031)` | `#1D293D` |
| `slate-900` | `oklch(20.8% 0.042 265.755)` | `#0F172B` |
| `slate-950` | `oklch(12.9% 0.042 264.695)` | `#020618` |

Blue-100/800 belong to ReleaseMeta's `announced` branch, but no current caller supplies that flag: those declarations are not an active visible badge. Pink occurs in the aria-hidden StatisticsMockup within Nytt. Its illustrative chart colours and 8–10px labels are not live chart/control standards.

| Element / surface | Actual styling |
| --- | --- |
| Backdrop | Fixed inset, z-index 10050, slate-950 at 60%; backdrop-blur-sm = 8px; 8px outer padding, 16px at sm |
| Frame | White, rounded-2xl (1rem), overflow hidden, column flex, shadow-2xl |
| Frame geometry | Width min(1180px, calc(100vw - 48px)); height min(86dvh, 56rem); min-height 34rem; max-height calc(100dvh - 2rem). Inner column max-width 56rem |
| Responsive frame | Below 640px: width 100%, height calc(100dvh - 1rem), no minimum/max height. At width ≥640px and height ≤720px: height calc(100dvh - 2rem), no minimum |
| Outer header | White/slate-200 bottom border; padding 20px vertically, 20/28px horizontally; 16px gap; inner right reservation 56px |
| Header title/subtitle/icon | 20/24px bold slate-950, tracking-tight (-.025em); 14px slate-500 subtitle with 4px top margin. Info icon regular 32px, cyan-700, in a 40px box |
| Header version | Cyan-100/cyan-800 pill; 11px bold, 8×4px padding |
| Shared dark hero | Slate-950; white inherited text; top corners 16px, bottom square; shadow-sm; padding 20×24px then 28×20px at sm. 128px decorative circle translated ±48px, 18px cyan-400/20 border |
| Hero eyebrow/title | Cyan-300 eyebrow, 12px semibold uppercase, .16em tracking, 8px gaps, 4px dot. Actual h3 title: 18/20px, weight 500, line-height 1.55, max-width 42rem, margin-top 16px, literal #CBD5E1 |
| Tab strip | Slate-50 at 80%, slate-200 bottom border; horizontal overflow; 4px gaps; 20/28px horizontal and 8px vertical padding |
| Selected tabs | Slate-200 fill, slate-900 text, shadow-sm, 1px slate-300 ring; 8px radius; minimum height 44px; horizontal padding 12/16px; 14px semibold |
| Unselected tabs | Slate-600 text; transparent base; hover white/slate-900; same dimensions |
| Modal focus | Tabs, tabpanel, close and history use 2px blue-600 outline; +2px offset except history disclosure's -2px inset |
| Close | Absolute top 20px/right 20/28px; minimum 44×44px, 8px radius, 20px regular X; slate-500 → slate-900 and slate-100 hover; accessible label Lukk |
| Scrolling | Header/tabs shrink-0; main min-h-0 flex-1 overflow-y-auto overscroll-contain; stable scrollbar gutter; padding 20×24px then 28×28px. Body scroll locked while open |
| Om | 28px section rhythm; direct children after hero have 8px horizontal margins. 20px bold slate-900 section headings, -.01em tracking. 16px slate-700 body, line-height 1.6, max-width 54rem; 16px paragraph spacing, 8px list spacing |
| Om dividers | 1px slate-200, 28px padding-top, 48×1px cyan-300 leading accent |
| Source link | GitHub anchor styled as button: slate-700 fill/border, slate-200 text; hover slate-600 fill/border, white text; 44px minimum, 8px radius, 16px horizontal padding, 14px semibold. 2px slate-400 focus/+2px. Regular GitHub 23px and external-link 15px/slate-400 icons |
| Nytt | Same hero/28px rhythm; white/slate-200 cards, 12px radius/shadow-sm; 16/20px padding, 20px gaps; lg grid includes 16rem illustration column; headings 18px bold, body 15px slate-600/1.6 |
| Nytt mockups | Slate-100/200/300/950, cyan accents, 8–10px decorative labels. White bars at 90/25/15%; pink-600 promo with pink-700 border and pink-900/20 shadow; white/20 badge. Chart series cyan-600/slate-500/slate-300 |
| Versjonshistorikk | Hero and 15px slate-600 intro; slate-200 timeline border, 16/20px left inset, 12px row gaps. 10px cyan-500 dots, 2px white border, 1px cyan-200 ring. White/slate-200 cards, 12px radius/shadow-sm |
| History disclosure/details | Minimum 80px full-width button, 16px padding/gap, hover slate-50; regular 20px slate-500 caret rotates. Bold slate-900 title; 15px slate-600 summary. Details margin-top 24px, slate-200 divider, padding-top 20px; 14px uppercase slate-500/.12em heading; 15px slate-600 list, 6px cyan-500 dots |
| Release metadata | Version chip slate-900/white, 6px radius, 8×4px padding, semibold; 12px medium slate-500 metadata; current-version cyan-100/cyan-800 pill, 11px semibold |
| Fremtiden | Hero; slate-50/slate-200 cards, 12px radius, 16px padding; cyan-700 planned label, 12px semibold uppercase/.12em; 16px bold slate-900 title, 15px slate-600 body. Caveat 14px slate-400, 24px line-height. Two adjacent cards have no explicit sibling gap utility |
| Kontakt | Hero, denser 16px rhythm; 16px slate-700 introduction. Planned-screenshot notice cyan-50/70, cyan-100 border, 8px radius, 12×10px padding, 14px slate-700/24px line-height; cyan-100/cyan-800 badge |
| Contact labels/help | 14px semibold slate-800 labels; normal slate-500 required/optional qualifiers; 12px slate-500 help/privacy, privacy line-height 20px |
| Contact fields | Native select/input/textarea; white, 14px slate-900; slate-300 border, 8px radius, 12×10px padding, shadow-sm, margin-top 4px. Focus removes default outline, uses cyan-600 border and 2px cyan-100 ring; disabled slate-100. No custom placeholder colour |
| Contact layout | Form margin-top and vertical spacing 16px; 16px grid gap, two columns at sm; category occupies one column; name/email share row. Message rows=6, min-height 128px, vertical resize; offscreen honeypot |
| Submit | Slate-900/white, hover slate-800; 14px semibold, shadow-sm, 8px radius, minimum 44px, horizontal padding 20px; cyan-700 2px focus outline/+2px |
| Submitting | Sender …; native disabled fields/button; aria-busy; button cursor-wait/opacity .6; no separate spinner |
| Validation / failure | Rose-700/14px field errors, aria-invalid/describedby, focus first invalid field. Server validation, rate-limited, unavailable, network/generic failure use distinct messages with same rose-700 polite status region, min-height 20px |
| Success | Cyan-50/cyan-200 card, 12px radius, 20px padding, margin-top 24px; 14px semibold slate-900 message. New-message button white/slate-300/slate-700, hover slate-50, 8px radius, min-height 40px, cyan-700 focus; focus moves to it then category on return |

Pixels above assume existing 16px root for rem utilities. Tailwind sm is 40rem; authored CSS uses 640px media queries. Do not change the root to tune appearance.

Exact shadow-sm: `0 1px 3px 0 rgb(0 0 0 / .1), 0 1px 2px -1px rgb(0 0 0 / .1)`. Shadow-2xl: `0 25px 50px -12px rgb(0 0 0 / .25)`. Mockup shadow-md geometry is `0 4px 6px -1px` plus `0 2px 4px -2px`, coloured pink-900/20. Rounded-md/lg/xl/2xl correspond to 6/8/12/16px; plain rounded is 4px; pills are rounded-full.

Roboto is loaded at 300/400/500/700; semibold requests 600 without a separately loaded 600 face. Verify font matching before finalising weight recipes; no font install or global metric change follows from this finding. There is no modal dark-mode variant: light body and dark hero coexist intentionally. Transparent backgrounds/shadows are recipes, not additional opaque palette values.

# Logo / modal / canonical palette comparison

“Exact match” means literal where noted, otherwise the qualified 8-bit equivalence above. Distinct shades are not automatically mistakes.

| Role | Actual modal value/style | Logo/canonical value | Classification | Recommendation |
| --- | --- | --- | --- | --- |
| Navy headings/chips/submit | slate-900 → #0F172B | Navy #0F172B | Exact match at comparison precision | Expose exact canonical token |
| Hero/title/backdrop source | slate-950 → #020618 | Ink #020618 | Exact match at comparison precision | Preserve Ink hero; do not force Navy everywhere |
| Eyebrow/divider/dot | cyan-300 → #53EAFD | Brand cyan #53EAFD | Exact match at comparison precision | Brand/decorative role |
| Body | slate-700 → #314158 | Text #314158 | Exact match at comparison precision | Body token |
| Supporting copy | slate-600 → #45556C | Muted #45556C | Exact match at comparison precision | Supporting token |
| Metadata/help | slate-500 → #62748E | Subtle #62748E | Exact match at comparison precision | Verify small-text/background pairs |
| Hero subtitle | literal rgb(203 213 225) | Text on dark #CBD5E1 | Exact literal match | Preserve inverse token |
| Frame/cards | white #FFFFFF, slate-50 → #F8FAFC | Base/soft and logo off-white | Exact literal / comparison match | Shared surface roles |
| Dividers/selected fill | slate-200 → #E2E8F0 | Border #E2E8F0 | Exact match at comparison precision | Separate selection alias may share value |
| Field/selected boundary | slate-300 → #CAD5E2 | Strong border #CAD5E2 | Exact match at comparison precision | Strong-boundary role |
| Soft cyan | cyan-100 → #CEFAFE | Cyan soft #CEFAFE | Exact match at comparison precision | Keep accent distinct from status |
| Icon/planned label/button focus | cyan-700 → #007595 | Interactive #007595 | Exact match at comparison precision | Preferred light-surface action/focus |
| Close hover/disabled/mock surface | slate-100 → #F1F5F9 | Soft #F8FAFC / border #E2E8F0 | Not represented in canonical palette | Decide soft/selected alias versus explicit retained shade |
| Pale caveat/icon/link focus | slate-400 → #90A1B9 | Subtle #62748E / inverse #CBD5E1 | Same intended family but different value | Caveat → readable subtle role; inverse focus/icon needs pair-specific decision |
| Label/submit hover | slate-800 → #1D293D | Navy/Text | Not represented in canonical palette | Decide dark-label/hover mapping; no invented ramp |
| Decorative hero ring | cyan-400 → #00D3F2 at .2 | Brand #53EAFD | Same intended family but different value | Candidate brand at existing alpha; review appearance |
| Timeline/change dots | cyan-500 → #00B8DB | Brand / interactive | Same intended family but different value | Choose decorative vs legible marker responsibility |
| Field focus/mock chart | cyan-600 → #0092B8 | Interactive #007595 | Same intended family but different value | Field border → interactive; illustration series separate |
| Badge text | cyan-800 → #005F78 | Interactive #007595 | Same intended family but different value | Candidate interactive; check soft-cyan contrast |
| Notice/success surfaces/edges | cyan-50 #ECFEFF, cyan-200 #A2F4FD | Cyan soft #CEFAFE | Not represented in canonical palette | Decide retention/consolidation; no global cyan-success inference |
| Modal keyboard focus | blue-600 → #155DFC | Interactive #007595 | Incidental legacy value that should migrate later | Normalise light-surface focus in S10; retain width/offset |
| Unused announced badge | blue-100/800 → #DBEAFE/#193CB8 | No approved announcement pair | Not represented in canonical palette | Inactive branch; no reason to introduce global blue branding |
| Form errors | rose-700 → #C70036 | Separate error role; no canonical hex supplied | Semantic colour that should remain separate | Retain meaning/current value until explicit semantic mapping |
| Mockup promotion | pink-600/700/900 → #E60076/#C6005C/#861043 | No canonical promotion pair | Incidental legacy value that should migrate later | Coordinate with S11; not universal accent |
| Alpha/elevation recipes | Ink .6 backdrop, soft .8 tabs, cyan-50 .7 notice, black shadows | Palette does not specify these recipes | Not represented in canonical palette as recipes | Preserve scoped alpha/elevation; no invented flat composite hex |

Explicitly: **yes**, AppInfo uses approved Navy through slate-900; **yes**, it uses brand cyan through cyan-300; **yes**, it uses corresponding canonical text, surface and border colours. The primary near-match is representation precision, not an incorrect Tailwind 3 navy such as #0F172A. Literal inverse text #CBD5E1 intentionally differs from Tailwind 4 slate-300 #CAD5E2 and must not be “corrected” to that border colour.

The canonical palette is a valid core vocabulary, not a complete catalogue of all current shades/states. Extra ramps, blue/slate/cyan focus differences, contact success and promotion need explicit role decisions; no new colours are invented here.

# Application-wide visual vocabulary

- Light base/soft surfaces, Ink/Navy hierarchy, distinct Text/Muted/Subtle roles and intentional inverse regions.
- Roboto hierarchy with reading, compact workspace and dense table density kept separate; preserve code/coordinate monospace and tabular figures where useful.
- Bright cyan for brand/decoration, interactive cyan for light-surface small actions/links/focus. Navy with white remains a primary-button option, as AppInfo demonstrates.
- Neutral selection with stronger fill/boundary/weight; preserve labels and aria states. Do not conflate selected, informational and success/warning/error states.
- Thin neutral dividers, stronger control borders, restrained small shadows; standard 8px controls, 12px cards, 16px dialogs as vocabulary, with smaller dense controls retaining their footprint.
- Explicit hover/focus/disabled recipes appropriate to background and density. Preserve current native elements, focus ownership, refs and interactions.
- Phosphor regular action icons, stable names and alignment, decorative icons hidden from accessibility. GIS symbols, QR, charts, scene geometry and logo remain separate.
- Shared panel/dialog appearance classes without changing scrolling, portal/container ownership, stacking, or modal versus non-modal semantics.

# Modal-specific styling that should not propagate literally

Do not copy the 1180px dialog, 56rem reading column, 34rem minimum height, large dark hero, decorative ring, 28px section rhythm, 16px reading body or 44px reading controls into Validator/table/map surfaces. Wide informational tabs, 16rem mockup columns, timeline treatment and 16–20px card padding serve this dialog.

The prominent close reservation differs from docked inspector geometry. Mockup 8–10px text is illustration, not a general typography target. Contact's cyan success card does not define application-wide success. GitHub identity does not become product branding. No requirement follows to repeat hero strips, rings, badges or logo in each panel. Consistency means shared roles with useful local density, not uniform layouts.

# Missing surfaces from the old 641387f audit

| Delta / source | Current responsibility | Roadmap correction |
| --- | --- | --- |
| New AppInfoModal.js, scoped global CSS | Five tabs, hero, cards/timeline/mockups, backdrop/frame/scroll/focus | Primary S1/S2 reference; explicit S10 normalisation checkpoint |
| New ContactForm.js | Form, validation/busy/success/server states, local profile | S10 with AppInfo; protect privacy/payload/storage/focus |
| New appInfoState.mjs, appReleases.mjs | First-visit/release opening and persistence/version content | Protected dependencies, not styling targets |
| New api/contact/route.js and src/lib/contact/* | Request policy, rate limits and email delivery | Functional boundary; later state checks use mocks, not real email |
| Modified page/Sidebar/FieldValidationSidebar | Om/Kontakt on upload and both modes; page-owned dialog | S3A ownership/ref acceptance; S3B/S4/S5A entry appearance |
| Added approved SVG | Canonical asset now available | S0 asset intake complete; S3A intended placements |
| New src/lib/map/featurePopupContent.mjs; modified MapInner | Popup now uses DOM nodes and textContent | Add helper to S7 style-owner map; preserve hooks and safe text construction |
| Modified LayerDataTable | Width-aware visibleHeaderLabel/ellipsis with full-label title | S6 protects current truncation/full-value behaviour |
| Modified diagnostics/policy/runner | Current optional-Type and other accepted outcomes | S5A/B preserve current wording/counts/exact-object requests |
| Modified TestModeControl/FileUpload/telemetry | Early URL test-mode activation/current upload tracking; wrapping control | Preserve in S3B/local fixture work; no telemetry redesign |
| Existing StatsModal/stats/StatsMap | Already present at 641387f; component files unchanged in source delta | Keep S11; correct trigger policy, not a new Stats architecture |
| Removed generic public SVGs, Sidebar.js.bak and research/data files | Old inventory lists absent files | Do not restore or treat as remaining migration targets |

The old popup interpolation concern is superseded for this active path: the helper constructs DOM/text nodes. Do not reintroduce the old string block or repeat that exact finding as unresolved. This is not an end-to-end security certification. The old audit's lexical counts are historical; unaffected feature/layout analysis remains useful. AppInfo already has explicit dialog/tab/focus handling and must not be swept into the old generic “dialogs lack shared focus behaviour” assumption.

# Stats policy correction

Current page predicate is exactly `!(layerDataTableOpen || dockedInspectorOpen)`, outside the loaded-workspace conditional. `tests/statsUiContract.test.mjs` explicitly checks this condition and initial-screen placement.

| State | Trigger |
| --- | --- |
| Initial/upload, neither surface open | Visible |
| Loaded workspace, no table/docked inspector | Visible |
| Bottom LayerDataTable open | Hidden |
| Docked right Validator inspector open | Hidden |
| Both open | Hidden |
| Last such surface closes | Visible again |

Do not restore “map owns bottom-right corner,” require loaded data or add map/3D/profile predicates. Fallback modal inspection is not docked inspection. Already-open StatsModal is independently controlled by showStats; suppressing the trigger must not close it. Preserve cue lifecycle and reduced-motion handling.

Live trigger literals are #DB2777 background, #BE185D border/hover and #9D174D hover border, with existing pink shadows. Nytt's Tailwind 4 mockup uses different pink values above. Record this concrete mismatch for S11; it does not make pink canonical branding. Resolve promotion appearance and reconcile the illustration without recolouring chart/map data categories.

# Product-header / BrandWordmark re-evaluation

S3A remains justified. Normal Sidebar owns the old gradient pin/title; Validator replaces that branch. Integrated Om/Kontakt solves access, not persistent identity. One compact ProductHeader should sit above the feature slot within the working left shell, composing the unchanged SVG and text. Upload uses a larger separate composition. No full-width header, feature-panel logos or new navigation follows.

Keep the established name **GMI Validator**. Old G + MI-Validator and 30px/28px proposals are not requirements. Do not assume the icon replaces a letter or silently introduce a hyphenated product name. Review optical scale/composition at S3A using this approved asset, with one full accessible name.

Recommended bounded access change: move normal header's Om/version action into shared ProductHeader and remove the duplicate Om from Validator footer. Keep Kontakt in both existing feature footers to avoid adding header height; initial screen retains both actions. Page continues owning one modal, initial-tab selection, callbacks and opener ref. Shared Om attaches the existing ref; Kontakt must restore focus to its invoking control. Do not alter automatic announcement/storage policy.

Use a non-shrinking header and bounded min-h-0 flexible feature area. Review full-height roots, LayerManager scroll and Validator footer reachability. Preserve default 380px and normal-mode mouse resize bounds `200 < width < 800`. Sidebar currently owns the resize handle: retain its effective vertical reach/stacking when moving the header; do not add Validator resizing.

Persistent identity does not imply feature keep-alive: current conditional branches unmount across mode switches. Preserve existing Validator reset/cleanup and avoid additional keys/remounts on unrelated rerenders.

# Revised S0-S12 roadmap

Default order remains:

`S0 → S1 → S2 → S3A → S3B → S4 → S5A → S5B → S6 → S7 → S8A → S8B → S9 → S10 → S11 → S12`.

Retain old scope/exclusions except explicit corrections here. This is a review sequence, not sixteen architecture projects or mandatory releases. Existing optional scheduling flexibility for independent dialogs/Stats remains; no current evidence requires reordering.

| Stage / scope | Work and delta | Acceptance update |
| --- | --- | --- |
| S0 — Supplied authority and unresolved roles | Logo acquisition complete; this report records provenance, palette and precedence | No missing-vector blocker. Record relevant unresolved state mappings before adoption; no replacement logo or duplicate intake project |
| S1 — Additive semantic foundations/reference contract | Core tokens, explicit utility/class exposure, density/type/contrast samples; AppInfo is reference | Do not globally rebind legacy aliases/remove themes. Capture reference states; preserve font/rem/geometry and unmigrated consumers |
| S2 — Shared appearance/control recipes | Same classes-first toolbar/WMS proof; AppInfo neutral selection/navy primary/interactive focus vocabulary | Same DOM/refs/events/native fields/overflow focus; compact dimensions retained; no universal 44px controls |
| S3A — Shared identity and left-shell/access ownership | ProductHeader/BrandWordmark with actual SVG and integrated Om/Kontakt | One header, no duplicate Om/version, reachable Kontakt, correct tabs/ref restoration, same resize/scroll/cleanup/lifecycle |
| S3B — Shell/onboarding | Same upload/error/add-file/drop/toolbar/map-3D/Testmodus styling; initial Om/Kontakt | Preserve early test-mode activation and telemetry suppression; current Stats matrix; same upload/retry behaviour |
| S4 — Layers/sidebar | Same cards/filter/analysis/WMS/removal/active legacy content; normal Kontakt appearance | Same state/actions/KOF meaning; scroll/footer reachability; no duplicate product header |
| S5A — Validator list/filter/sort/count | Same Workspace/RuleList/error-boundary checkpoint; footer/access appearance | Same Feil/Sjekk/Pass counts/order; compact 380px fit; no rule or copy changes |
| S5B — Detail/inspector/fallback | Same shared details and both frames; preserve presentational adapter boundary | Current optional-Type wording says field not required, check relevant Type, otherwise may remain empty. Same exact actions, tab/field state/focus, docking/fallback and docked-only Stats suppression |
| S6 — Bottom LayerDataTable | Same isolated virtualization/sticky/selection pass; current header truncation protected | 28px rows, complete-scope widths, opaque pinned columns, ellipsis/full title, Utvalg/Alle, exact targets, hover/click/zoom/cleanup unchanged; Stats hidden |
| S7 — Map chrome/developer panel | Same legend/measurement/popup/diagnostics styling; add featurePopupContent.mjs | Keep safe DOM/textContent, action data attributes/hooks, domain colours, thresholds/observers/map actions |
| S8A — Data inspection/height validation | Unchanged native data tables and Z frame/states | Native overflow/target checks separate from S6; no layer-targeting/calculation repair |
| S8B — Profile/standards | Unchanged lower profile, SVG/list/settings/terrain presentation | Preserve 55%/45vh layout, plot area, hover/settings/terrain and table exclusion |
| S9 — 3D chrome | Unchanged HTML controls/legend/object panel | Preserve materials/domain colours, canvas/camera/object actions |
| S10 — Dialogs, AppInfo/Contact normalisation, sharing | Retain WMS/Share; add named AppInfo/Contact reference checkpoint across both components/scoped CSS | Token/focus/extra-shade normalisation, five compositions preserved. Check tabs/disclosures/Escape/trap/restoration/scroll/auto-open and all contact states with mocks; no email, API/storage/payload change or decorative logo. WMS/QR retain independent checks |
| S11 — Statistics/promotion | Same modal/chart/map/ranking/timeline/trigger scope; correct policy and Nytt depiction | Exact visibility matrix, independent modal/cue/reduced motion, unchanged data/filter/timeline semantics; no blanket cyan data series |
| S12 — Final convergence | Same enumerated residual consumers/bridge retirement/cross-feature checks | Include AppInfo/Contact and all entries; reconcile mockup after S11; no dormant cleanup, dependency change or release implied |

AppInfo/Contact gets its **own named acceptance checkpoint inside S10**, not a new top-level stage. S1/S2 extract its vocabulary now; S10 later adopts final tokens without redesigning the reference. This keeps active form/error/focus states visible in the plan while preserving sequence. “Normalise to logo” means consistent brand colours/name, not inserting the SVG in the modal.

Old S7 string-popup and security assumptions, S0 missing-logo assumptions, broad Stats ownership, missing AppInfo inventory and discarded-foundations implementation assumptions are superseded. Unaffected classes-first scope, density, data-colour separation, A/B boundaries and functional backlog exclusions remain valid.

# Recommended authoritative token set

Proposed implementation values, not current declarations:

| Token | Exact value | Responsibility |
| --- | --- | --- |
| --gmi-ink | #020618 | Strongest text, hero/inverse foundation |
| --gmi-navy | #0F172B | Brand structure, headings, dark primary control |
| --gmi-text | #314158 | Main content |
| --gmi-text-muted | #45556C | Supporting content |
| --gmi-text-subtle | #62748E | Metadata/help, subject to contrast |
| --gmi-text-on-dark | #CBD5E1 | Inverse supporting text |
| --gmi-border-strong | #CAD5E2 | Fields/strong boundaries |
| --gmi-border | #E2E8F0 | Separators/neutral selection fill alias |
| --gmi-surface-soft | #F8FAFC | Soft/page/inset |
| --gmi-surface | #FFFFFF | Base/elevated surface, on-navy text |
| --gmi-brand-cyan | #53EAFD | Brand/decorative accent |
| --gmi-cyan-soft | #CEFAFE | Soft accent |
| --gmi-interactive | #007595 | Light-surface actions/focus |

Semantic aliases need not add colours: primary action surface/text→Navy/Base; selected surface/text/border→Border/Navy/Strong border; light link/focus→Interactive; ordinary hover→Soft; inverse support→Text on dark; backdrop→Ink at existing .6 alpha. Keep current outline widths/offsets when normalising colour. Do not make every interactive surface cyan-soft.

Core tokens are sufficient to begin S1, not to declare every state resolved. Before adopting affected recipes, record decisions for slate-100 hover/disabled, slate-800 label/hover, slate-400 pale/inverse use, cyan-50/200 informational/success surfaces, cyan-400/500 decoration, cyan-800 badges and dark-background focus. Candidate canonical reuse appears in the comparison table. If an existing reference shade must remain, document its exact declaration and reason as a bounded migration exception, not a silently approved palette expansion.

Success/warning/error/info require separate semantic aliases and explicit per-consumer mapping. Preserve existing red/rose, amber/orange and green outcome colours until agreed; do not convert them to cyan. Contact's existing cyan success confirmation is a decision to record, not a general Pass-colour precedent. No approved new semantic-status ramp is supplied by the core palette, and none is invented here. Data visualisation remains a separate colour contract.

Use observed radius/elevation/alpha recipes and separate standard/compact density. Expose semantic utilities deliberately in Tailwind 4 or authored classes; ordinary CSS variables alone do not guarantee generated utility classes. Leave legacy variables with existing consumers until regional migration; do not replay the discarded global alias rewiring or remove theme code as incidental cleanup.

# First implementation checkpoint

First future implementation task: **S1, additive canonical tokens/utility exposure and the AppInfo reference-state contract**, after documenting unresolved S0 decisions relevant to those roles. Not logo creation, restoring the discarded foundations, product-header restructuring or broad screen restyling.

A later authorised change should introduce exact core values and deliberate class/utility exposure without globally switching existing consumers. Capture AppInfo's five tabs, expanded history and contact idle/invalid/submitting/success/rate-limited/unavailable/error using mocks, plus upload/default workspace. No real email is required.

Acceptance: styles exist; exact canonical values and representative contrast pairs are checked; bright/interactive cyan stay separate; AppInfo remains the visual reference; no root/font/density/geometry or legacy-consumer changes. Record unresolved roles rather than invent them. S2 then proves agreed recipes locally, before S3A changes ownership. Full AppInfo token adoption remains the S10 checkpoint.

During authorised implementation use relevant existing AppInfo/state/release contracts, toolbar/inspector and Stats tests. Source-regex assertions do not prove rendered colour/focus. Adjust styling-specific assertions only for deliberate token adoption, preserving behavioural assertions; add behaviour tests only where structural changes need them. Build/lint/browser checks belong to implementation, not this one-file review.

# Risks / protected geometry

Keep unaffected old guards: sidebar 380px/default resize bounds; inspector 38rem, fallback 44rem; 480px map allowance and JavaScript's 16px/rem assumption (default docking boundary 1468px); 62/38 workspace/table and full centre/right table span; separate 55%/45vh profile; virtual rows 28px, action gutter 36px; content-width estimation, sticky offsets and opaque pinned cells. Preserve toolbar thresholds 580/860px, independent legend threshold 1100px, Leaflet clearance 58px, observers, portal ownership, stacking and parent-sized Canvas.

New reference risks include overriding .app-info-hero-title through global selectors, treating OKLCH/hex precision differences as design errors, copying reading density into tables, collapsing selection/status into cyan, and assuming hero styling means full dark mode. S3A must preserve opener refs, automatic AppInfo behaviour, resize reach, scrolling and Validator lifecycle. S10 must retain tab keyboard navigation, focus trap/restoration/Escape, scroll lock and constrained-height scrolling. Backdrop clicks currently do not close AppInfo; styling must not add that behaviour.

Protect Contact validation, native disabled/busy state, live regions, success-focus transitions, local name/email persistence, minimal payload, honeypot and existing field limits. Planned screenshots remain planned. Release copy, optional-Type wording, rules/counts, exact selection, telemetry and contact transport are not styling scope.

Later visual checks should cover 1920×1080, short/constrained windows, 390px AppInfo fallback, sidebar bounds, docking boundary/actual map thresholds, all tabs/contact states, keyboard/zoom/long text, table/inspector combinations, map/3D/profile transitions. This report claims no runtime pass.

# Read-only safety confirmation

Only `docs/agent-reports/20260923-current-ui-design-reference-and-roadmap.md` was created. Application source, logo, prior reports, dependencies and Git refs were not modified. No checkout/switch/reset/stash/clean, commit, push, deploy, dependency installation, external message or sub-agent was used. Commands inspected repository/files/package definitions and performed in-memory calculations; no build artifacts were requested.

Final verification: same branch/full HEAD, only this report untracked, no tracked-file diff; git diff --check clean. The untracked report is checked separately for whitespace because ordinary git diff excludes it. SVG SHA-256 remains as recorded above.

1. **Does the canonical palette match AppInfo?** Yes for core vocabulary and rounded sRGB values; not a complete state palette or literally identical to OKLCH declarations.
2. **Exact discrepancies?** Extra slate-100/400/800, cyan-50/200/400/500/600/800, blue-600 focus, semantic rose-700, pink mockup promotion, inactive blue announcement pair and opacity recipes; exact definitions above. Inverse #CBD5E1 intentionally differs from slate-300 #CAD5E2.
3. **Is S0–S12 usable?** Yes; preserve order and major boundaries.
4. **What changes?** Close missing-logo intake; use AppInfo in S1/S2; protect integrated access in S3A; named AppInfo/Contact S10 checkpoint; corrected Stats policy and current popup/table/diagnostic inventory; discard historical implementation assumptions.
5. **Is the logo ready?** Yes, unchanged as canonical asset; rendered-size checks remain for implementation.
6. **First implementation task?** Additive S1 tokens/utility exposure and reference-state contract, documenting relevant unresolved roles; no global restyling.
7. **Exact report path:** `C:\GitHub\gmi-validering-test\docs\agent-reports\20260923-current-ui-design-reference-and-roadmap.md`.

