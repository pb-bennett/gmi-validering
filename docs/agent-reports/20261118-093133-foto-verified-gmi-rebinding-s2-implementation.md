# FOTO verified GMI association and export selection (S2)

18 November 2026, Europe/Oslo. Repository `C:/GitHub/gmi-validering-test`, branch `feature/photo-workspace`, HEAD `5d276c0`. The worktree was clean at the start.

## Automatic and manual association

- The survey store’s existing loaded-GMI subscription in `src/lib/photos/loadedGmiSource.mjs` starts association after publication of a newly registered dataset. The registry already holds its original `File` and parser evidence at that point. It verifies the live layer, original input ID and dataset revision against the current dataset object.
- The registry reuses its per-file fingerprint promise for live peers of the same byte length. It rechecks the peer set after asynchronous reads and compares exact-byte fingerprints. Automatic association requires one matching live survey layer and one matching attached FOTO source across the session. A failed read or ambiguity leaves the source available for the explicit workflow. A second identical layer loaded after a successful association leaves the first live binding in place.
- `src/lib/photos/photoSession.mjs` uses one verifier for the automatic association, the positioning wizard and loaded-GMI append reviews. It requires a live registered identity, equal byte fingerprints and equivalent source evidence. `src/lib/photos/gmiPhotoSource.mjs` compares the object records, CRS, header, issues and the ordered reference records with their source-scoped IDs removed. The verifier refuses to switch a live binding to a different input or layer.
- Automatic association and the positioning wizard’s rebinding checkpoint replace only the immutable binding on the retained source. They preserve the source ID, reference and association ledger identities, occurrence keys, accepted positions, directions, capture metadata and delivery decisions. Rebinding leaves the Rettinger editing owner and its staged corrections intact. The manual checkpoint revalidates the live input and reviewed source before publishing. A removed input is invalid, and a newly registered identical file can qualify using its own identity.
- `src/components/photos/PhotoPositioningWizard.js`, `src/components/photos/PhotoImportReviewStep.js` and `src/lib/photos/photoImportPresentation.mjs` state the proposed binding or explain why it was refused. The append review keeps its target picker available when the selected target already has a binding elsewhere. The positioning wizard retains its existing workflow after saving.
- Combined export still runs the existing source, association, byte and patch verification gates. The GMI document and original attachments stay on the source-preserving export path.

## Export selection

`src/components/delivery/DeliveryWizard.js` and `src/lib/delivery/deliveryWizard.mjs` derive the default survey layer from the selected FOTO layer’s unique live binding. A live stored survey ID is the fallback. An explicit choice in this wizard instance takes priority while valid. A change of FOTO layer recomputes the default. Rettinger’s original survey remains selected on its direct entry, and the FOTO-derived survey remains available when switching to Kun GMI.

## Verification

- **Baseline** — the eight S2 suites passed 138 tests, with one skip. The suites cover `deliveryPlan`, `deliveryExclusion`, `deliveryWizard`, `gmiPhotoAssociations`, `gmiPhotoPlacements`, `gmiEditHyperlinkRemoval`, `photoDeliveryIntent` and `photoDeliveryDefaults`.
- **Node regression** — the same suites plus `photoGmiSourceRebinding`, `photoLoadedGmi`, `photoImportComplete` and `gmiEditSessions` passed 204 tests, with one skip. They cover automatic and manual binding, simultaneous identical registrations, same-name different bytes, evidence mismatches, existing live bindings, removal and stale commit identities, repeated references, preservation, combined export and preselection.
- **Build and lint** — `npm.cmd run build` passed with network access for the existing Roboto font. `npx.cmd --no-install eslint` passed for the changed application and test modules.
- **Browser** — `node --test --test-concurrency=1 tests/deliveryWizardUi.test.mjs tests/photoImportWizardUi.test.mjs` passed 19 cases and subtests against a fresh production build on port `63368`. The new case downloaded a combined ZIP and compared the retained GMI and photo with their original bytes. It also exercised the manual fallback, FOTO-layer switching and explicit GMI selection. The existing GMI-first case passed. The combined export content screenshots at 1280×720 and 1366×768 showed both layer selectors and the footer within the viewport. The server was stopped after the suite.
- **Failed attempts resolved** — the first browser run exposed a selection regression when switching from FOTO to Kun GMI and a test setup that assumed the vector file input was already open. The final implementation retains the FOTO-derived selection across modes. The test now opens «Legg til fil» and waits for the input before loading the vector layer. Both failures cleared in the final run.
- **Whitespace** — `git diff --check` passed.
- **Skipped** — `gmiEditHyperlinkRemoval` skipped its private-corpus case because `GMI_EDIT_CORPUS` was unset. Manual real-data acceptance is deferred to the consolidated browser testing session.

The new regression files and cases are in `tests/photoGmiSourceRebinding.test.mjs`, `tests/deliveryWizard.test.mjs` and `tests/deliveryWizardUi.test.mjs`. All inputs are synthetic.

## Scope and limitations

Automatic association is tied to vector registration. If the FOTO source is attached after its vector layer was already loaded, or if concurrent matching candidates make association ambiguous, the explicit positioning workflow remains available. The amendments extend the plan to perform automatic verified association after registration and make the manual rebind a binding-only write. Existing matching evidence stays intact through that checkpoint. Independent source attachment and genuine same-binding rechecks retain their ordinary behavior.

Manual acceptance should repeat FOTO-first and GMI-first combined export with the contractor data, verify the expected GMI preselection, inspect the retained FOTO and Rettinger work, and compare the resulting package with the consolidated acceptance criteria.

## Git

HEAD remains `5d276c0` on `feature/photo-workspace`. The only changes are the implementation, tests and this report. No staging, commits, pushes or deployment took place.
