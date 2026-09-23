# S3A product identity and left shell

Date: 2026-09-23. Starting SHA: `5c2309173a247b174f0edb8b704ac8faa725e59a` on `feature/styling-overhaul-integrated`, tracking `origin/feature/styling-overhaul-integrated`. Repository root and branch matched; the working tree was clean.

## Ownership before and after

Before S3A, the normal `Sidebar` owned a gradient pin, product title, Om/version action, and the full-height resize handle. Validator replaced that entire sidebar branch and had its own Om action beside Kontakt. The initial screen showed a text-only product title. `page.js` already owned one `AppInfoModal`, its automatic opening policy, selected tab, and opener ref.

After S3A, `WorkspaceShell` owns one non-shrinking `ProductHeader` above its conditional normal/Validator feature slot. `ProductHeader` places `BrandWordmark` on the left and the sole working Om utility button on the right. Both the working header and initial upload composition use the same unchanged `/brand/gmi-validator-logo.svg` asset as the visual G followed directly by **MI Validator**, with **INNMÅLINGSKONTROLL** beneath the textual portion in both sizes. This full two-line composition is the canonical BrandWordmark for these placements. The accepted large composition remains a 64px logo, 30px title on a 36px line, and 12px subtitle on a 15px line. The compact composition uses a 48px logo, 22.5px title on a 27px line, and the unchanged 9px subtitle on an 11px line, with the same zero CSS gap between logo/text and title/subtitle. Logo, title, title line, and subtitle size are each 75% of large; the subtitle line is about 73%. The subtitle stays clearly secondary. The decorative image has an empty alternative, and the heading exposes one accessible full product name, **GMI Validator**, while its visible text is hidden from assistive technology. The subtitle remains separate descriptive text, outside the heading's accessible name. The initial upload's supporting copy, actions, and flow remain in place.

The page still owns exactly one `AppInfoModal`, its automatic first-visit/release decision, tab state, and callbacks. The shared Om control is a compact InfoIcon button to the right of the wordmark. It uses the original opener ref, opens the `about` tab, and exposes Om and the current version through its accessible label and browser title. Its neutral Subtle foreground becomes Navy on hover over a Soft surface; the existing Interactive focus ring remains. The initial upload retains its visibly labelled Om/version and Kontakt controls. Kontakt remains in the normal and Validator footers and opens the `contact` tab. Manual openers are recorded from the clicked control and focused before the modal opens, so the existing modal restoration code returns focus to the actual invoking control, including Kontakt. `AppInfoModal` and `ContactForm` were not edited.

The page still passes one conditional `fieldValidationOpen ? FieldValidationSidebar : Sidebar` element to the shell. The shell does not keep both feature components mounted, add keys, or change Validator state/cleanup ownership.

## Files changed

- `src/components/BrandWordmark.js` — shared two-placement logo and name composition.
- `src/components/ProductHeader.js` — compact working identity and Om/version entry.
- `src/components/WorkspaceShell.js` — persistent header and bounded flexible feature slot.
- `src/components/Sidebar.js` — removed the old identity/Om block, retained the normal-only resize logic, extended the same handle through the new 76px header, and bounded the LayerManager/legacy scroll region above the footer.
- `src/components/FieldValidationSidebar.js` — removed its duplicate Om action; retained Kontakt and the Validator feature branch.
- `src/app/page.js` — uses the large wordmark on upload, passes shared-header access, and records the invoking AppInfo control for focus restoration.
- `tests/appInfoUiContract.test.mjs` — updated old Sidebar-owned Om assertions and added a focused shell/branch/resize contract. Behavioural AppInfo assertions remain.
- `docs/agent-reports/20260923-styling-overhaul-s3a-product-identity.md` — this report.

## Geometry and lifecycle protections

The shared header occupies only the left shell and is 76px high; the remaining feature slot uses `min-h-0 flex-1`. Normal Sidebar and Validator roots retain their internal flex/scroll ownership. A bounded wrapper gives the existing `LayerManager` `h-full` a finite remaining height, preserving footer reachability. The normal Sidebar's existing handle and mouse listeners remain its own; its `200 < newWidth < 800` bounds and page default width of 380px remain unchanged. The handle reaches the top of the working column across the header via the matching 76px negative top offset. Validator does not acquire a resize handle. No map, table, inspector, profile, Leaflet, portal, or Stats geometry/logic changed.

## Verification

- `git diff --check` — passed.
- `npm.cmd run build` — passed.
- `node --test tests/appInfoUiContract.test.mjs tests/appInfoState.test.mjs tests/mapPaneToolbar.test.mjs tests/statsUiContract.test.mjs tests/testMode.test.mjs tests/validationV2GmiA7.test.mjs tests/validationV2WorkspaceInspector.test.mjs` — passed, 51/51, including 11 AppInfo/UI contracts and 40 other relevant contracts. Old assertions locating Om in the feature branches were updated for the intentional shared-header ownership change; no behaviour checks were weakened.
- Approved SVG SHA-256 remains `50CA31A6B7D4A5D5376ACC89E275B0C28CBEED23BB98F866F8E0E802628241DC`.

Source contracts confirm ownership and protected constants; they cannot certify rendered sizes, scroll reachability, or actual focus behavior. Manual browser review before committing should cover:

1. Initial/upload screen: logo/name, upload, Om, Kontakt, automatic AppInfo.
2. Normal loaded workspace: one compact header and reachable Kontakt/footer.
3. Validator mode: same header, Validator controls, reachable Kontakt/footer.
4. Normal ↔ Validator switching: expected feature remount/cleanup, no added reset on unrelated rerenders.
5. Normal sidebar resize near default 380px and both 200/800px bounds, including the top of the header; confirm Validator has no resize handle.
6. Narrow and short viewport: identity legibility, LayerManager/Validator scrolling and footer reachability.
7. Om from the working header opens the Om tab and returns focus to its button.
8. Kontakt from normal mode opens Kontakt and returns focus to its footer button.
9. Kontakt from Validator mode opens Kontakt and returns focus to its footer button.
10. Close AppInfo by button and Escape, including after automatic opening and across the five tabs.

The S3B shell/onboarding appearance pass, later feature styling, AppInfo token adoption, and QR/favicon branding remain outside this slice. The approved SVG, S1 tokens, S2 recipes and consumers, AppInfo visuals, Contact transport, Stats predicate, and Validator rules were not changed.

## Final status

No commit, push, deploy, branch switch, Vercel change, or dependency upgrade was made. Final `git status --short`:

```text
 M src/app/page.js
 M src/components/FieldValidationSidebar.js
 M src/components/Sidebar.js
 M src/components/WorkspaceShell.js
 M tests/appInfoUiContract.test.mjs
?? docs/agent-reports/20260923-styling-overhaul-s3a-product-identity.md
?? src/components/BrandWordmark.js
?? src/components/ProductHeader.js
```
