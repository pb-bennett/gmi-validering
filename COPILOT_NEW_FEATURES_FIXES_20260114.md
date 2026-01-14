# Implementation Brief — Apply Requested Changes & Bug Fixes

## Scope & Objective

Implement the following items exactly as specified. Keep changes minimal and localized. Preserve existing behavior where not explicitly stated. UI labels must remain in **Norwegian Bokmål** as quoted.

## Change Requests & Bug Fixes

### [BUG] LFL-001 — White tile edges, white grid on Leaflet map (Edge, work PC)

- **Symptom:** White grid render on Leaflet map in Edge on work PC; not reproducible on other PCs.

- **Area:** Map rendering (Leaflet), browser-specific behavior.

- **Acceptance:**

- Map tiles render correctly in Edge on the affected environment.

- No regressions in Chrome/Firefox/Edge on other machines.

- Add a short note in release notes describing the fix.

---

### [BUG] GMI-002 — “unknown” point highlight state in Gemini VA file. Punkt without any data in the fields.

- **File:** `Gemini VA _ VA og Kummer Bergvika 18.09.2025.gmi`, can be found in `REF_FILES/BROKEN_GMI/`

- **Symptom:** Point with status ‘unknown’ appears highlighted; on click it becomes unhighlighted (inconsistent state).

- **Area:** GMI parsing/feature state + selection/highlight sync.

- **Acceptance:**

- Initial highlight state reflects true selection/attention rules.

- State persists when switching layers/views.

---

### [CHANGE] HYD-003 — “krav til fall” default & options

- **Request:** Set **default** “krav til fall” to **10 ‰** for all dimensions (no dimension-based differences by default).

- **Option:** Add a configurable option in “krav til fall” to apply **current settings** (lower standard for large diameters).

- **Area:** Hydraulic rules/config UI & validation.

- **Acceptance:**

- Default behavior is 10 ‰ across all diameters.

- A switch/option restores current dimension-based rules.

- Documentation/help text explains both modes.

---

### [FEATURE] PRF-005 — Profilanalyse usable with 3D view + highlighting parity

- **Request:** Allow **Profilanalyse** window to remain open when **3D** view is active. Add highlighting in a similar way as in **2D** (display pipe sections, points, etc.).

- **Area:** 2D/3D coordination, selection/highlight bridge, window lifecycle.

- **Acceptance:**

- Profilanalyse stays open when switching to/from 3D.

- Selecting in the profile highlights the corresponding geometry in 3D.

- Parity with 2D highlighting (sections, points) is maintained.

---

### [QUESTION] QA-006 — What is “Avviksdeteksjon”?

- **Request:** Clarify purpose/definition and expected behavior of **“Avviksdeteksjon”**. If obsolete, propose removal or rename.

- **Area:** Product terminology, UX information architecture.

- **Acceptance:**

- Decision recorded: keep (with definition), rename (new label), or remove.

- If kept/renamed: update label/tooltips/help for consistency.

---

### [UX] FLD-007 — “Feltvalidering” panel width & navigation controls

- **Request:** Reduce **Feltvalidering** width to **1/3** of screen. Address inconsistency of **“Tilbake”** (Back) and **“Lukk”** (Close) button locations.

- **Area:** Panel layout/responsiveness; control placement conventions.

- **Acceptance:**

- Panel renders at ~33% width on desktop; responsive behavior documented.

- Back/Close use consistent placement across all panels per app standard.

- No overlap/clipping with other UI elements.

---

### [FEATURE] FLD-008 — Map filtering within “Feltvalidering”

- **Request:** In **Feltvalidering** analysis, add functionality to filter in map, same as **“Felt”** and **“Tema”** sections. When **Feltvalidering** is open, its filters **override** filters from those sections. The user can then see which objects are refered to in the analysis

- **Area:** Filter model, precedence rules, UI controls.

- **Acceptance:**

- Users can apply filters from within Feltvalidering / hover for highlighting.

- While open, Feltvalidering filters take precedence over Felt/Tema filters.

- On close, previous Felt/Tema filters are restored without loss.

---

### [FEATURE] VIEW-009 — Sidebar & filters/highlighting in 3D; seamless 2D↔3D swap

- **Request:** Make the sidebar visible in **3D**, and ensure all sections (Felt, Tema, Feltvalidering, Profilanalyse) filter/highlight **in 3D**. 3D should directly replace 2D; users can swap between them with **the same active filters** applied. At present I think the Tema filtering works in 3D, but not the Felt filtering.

- **Area:** View management, shared filter/highlight pipeline, UI visibility rules.

- **Acceptance:**

- Sidebar is available and usable in 3D view.

- Filters/highlighting work equivalently in 3D as in 2D.

- Switching between 2D/3D preserves selections/filters and visual states.

---

### [CHANGE] SYM-010 — 3D colour for **Kumlok (LOK)**: set to bright yellow

- **Request:** In **3D view**, colour **Kumlok (LOK)** bright yellow. Currently red and visually too similar to **kummer**.

- **Area:** 3D symbology/style rules, legend.

- **Acceptance:**

- Kumlok (LOK) renders in bright yellow in 3D across all relevant zoom levels and themes.

- Clear visual distinction from kummer and other assets.

- Legend/tooltip labels and colour chips updated accordingly.

- No unintended changes to 2D styling.

---

### [FEATURE] PRF-011 — “Åpne Profilanalyse” action in object tooltip (2D & 3D) for **ledning**

- **Request:** In the **object tooltip**:

- In **3D view**, there is currently a button to “Vis i 2D-kart”.

- In **2D-kart**, there is currently a button to “Vis i 3D”.

- **Add a new button shown when a _ledning_ is selected:** **“Åpne Profilanalyse”**, which opens **Profilanalyse** with that **ledning** preselected. This must work in **both 2D and 3D** views.

- **Area:** Tooltip actions (2D/3D), Profilanalyse deep-link/open API, selection sync.

- **Acceptance:**

- The **“Åpne Profilanalyse”** button appears **only** for eligible **ledning** features.

- Clicking the button opens **Profilanalyse** (or brings it to front if already open) and **preselects the ledning**, with corresponding highlighting in the active view.

- Works identically from **2D** and **3D**; preserves current map extent/view.

- Respects existing filters; if the ledning is filtered out, it is temporarily surfaced or the user is clearly notified.

- Disabled/hidden for non-ledning features; no errors on unsupported layers.

- Label localized exactly as **“Åpne Profilanalyse”**; tooltip/help text updated.

---

### [FEATURE] PRF-012 — Switch Profilanalyse by clicking **ledning** in 2D map/3D view

- **Request:** When **Profilanalyse** is open, allow the user to **click another _ledning_ directly in the map (2D) or 3D view** to switch the active profile to that ledning. Keep the **list** as an alternative way to switch.

- **Area:** Profilanalyse selection controller, map/3D hit-testing, selection→profile sync.

- **Acceptance:**

- With Profilanalyse open, clicking a **ledning** in **2D** or **3D** switches the active profile to that feature and updates highlighting and the chart immediately.

- The existing **list of ledninger** remains available and fully functional as an alternative method to switch.

- Non-ledning clicks do nothing (or clear selection if that is current standard)—no errors thrown.

- Honors active filters; if the clicked ledning is filtered out by other sections, it is surfaced for the session or the user receives a clear notice.

- Works consistently across 2D↔3D, including when switching views with Profilanalyse already open.

- No unintended changes to selection behavior outside Profilanalyse mode.

---

## Constraints & NonGoals

- Do **not** change unrelated features or public APIs unless required by these items.

- Preserve Norwegian UI labels as given (“Profilanalyse”, “Feltvalidering”, “Avviksdeteksjon”, “Tema”, “Felt”, “Kumlok (LOK)”, “kummer”, “Åpne Profilanalyse”).

- No breaking changes without migration notes.

## Quality & Verification (for all items)

- All relevant tests pass; add/adjust unit/integration tests for changed logic.

- Linting/formatting clean; types/static analysis pass.

- No secrets in logs; no performance regressions.

- Accessibility and localization maintained.

## Deliverables

- Commits referencing IDs (e.g., `fix: LFL-001 leaflet white tiles in Edge`, `feat: PRF-012 map/3D click to switch ledning in Profilanalyse`).

- Updated code + tests + user-facing notes (where applicable).

- PR containing:

- Summary of changes

- Checklist mapping each ID → verification steps

- Screenshots/GIFs for UI/UX changes (2D and 3D)

## Suggested Ordering / Dependencies

1. LFL-001 (baseline stability)

2. GMI-002

3. HYD-003

4. PRF-005 (3D parity for Profilanalyse)

5. PRF-011 (deep link from tooltips to Profilanalyse)

6. PRF-012 (click-to-switch ledning while Profilanalyse is open)

7. FLD-007 → FLD-008 (panel UX then filter precedence)

8. VIEW-009 (global 3D parity)

9. SYM-010 (finalize 3D symbology)

10. QA-006 (finalize terminology)

## PR Checklist (paste and tick)

- [ ] LFL-001

- [ ] GMI-002

- [ ] HYD-003

- [ ] PRF-005

- [ ] PRF-011

- [ ] PRF-012

- [ ] FLD-007

- [ ] FLD-008

- [ ] VIEW-009

- [ ] SYM-010

- [ ] QA-006 (decision documented)

---

## Queries for Your Input (please answer)

To implement these items “exactly as specified” and avoid guesswork, I need the decisions below.

### General / Applies to multiple items

1. **Release notes location:** Where do you want the user-facing “release notes” entry for LFL-001 (and potentially other items) to live?

   - Options: new `RELEASE_NOTES.md`, append to this file, or a section in `README.md`. `I am thinking that we can wait with this. We need to address documentation in a more general way later on, the README is lacking a lot of information anyway. Wait with this for now.`

2. **Highlighting semantics:** When we say “highlight” (2D/3D), should it mean:

   - A) temporary hover highlight only,
   - B) persistent selection highlight (until click elsewhere),
   - C) both (different colors),
   - and should it override Tema/Felt filters or respect them? `Highlight only while hovering, and respect the filters. Do not highlight if the object is filtered out. Have a look at the highlighting colours, it would be good to use a glow or outline instead of changing the fill colour, especially in 3D where it can be hard to see. It would be good to be able to still see the original colour through the highlight.`

3. **Selection persistence across 2D↔3D:** When switching tabs, should selection persist (same selected object), or clear selection by default? `Selection should persist when switching between 2D and 3D. So should the focus of the map/camera.`

4. **Terminology consistency:** Are you OK with adding short tooltips/help text if the UI label must remain short (e.g., “Avviksdeteksjon”)? `Yes, that is fine.`

---

### LFL-001 — Leaflet tile seams/grid in Edge (work PC)

1. Please provide:

   - Edge version (`edge://version`) and Windows version. `Edge version 143.0.3650.96 (Offisell build) (64-bit)` and `Windows 11 Enterprise, version 10.0.26100 bygg 26100`
   - GPU model + whether “Use hardware acceleration when available” is enabled. `Core ultra 7 155U 1700Mhz 12 kjerner 14 logiske processor - unsure aboutt he hardware acceleration setting - help me at the end when all else is done if this info is needed`
   - Screenshot showing the seams and the zoom level(s) where it occurs. `See attached screenshot`
   - Does it happen on both “Kartverket Topo” and “Kartverket Gråtone”, or only one? `Both, and open street maps`

2. Is the acceptance “fix” allowed to be a **targeted CSS workaround** (Edge-only) if that’s the only reliable reproduction? `Do not break it for other users. At the moment I am the only person who has experienced this issue. If you do not have a good fix you can wait until I can bring in more testers`

---

### GMI-002 — “unknown” point highlight state

1. What is the intended rule for **initial highlight** for a point that has:

   - no attributes (empty fields), and/or
   - type/status “unknown” (or missing `S_FCODE`/`Tema`)?
     `There should be no initial highlight. For some reason this point is highlighted from initial load of the app. It should not be. It then unhighlights if I highlight other objects by hovering over in the sidebar, but the single point highlights again when I move the mousepointer away from the other objects and they become unhighlighted. This is confusing behavior. Suspect it is to do with a point that has not enough information. I have attached a screenshot of the point properties, or lack thereof.`

2. When you click an “unknown” point today, it toggles highlight off. What is the desired behavior?

   - A) Click always selects + highlights.
   - B) Click toggles highlight.
   - C) Click opens details but doesn’t affect highlight.

   `Smae behaviour as any other point. Click to select`

3. Should this “attention” highlight persist when:
   - switching 2D↔3D,
   - switching sidebar sections,
   - opening/closing modals?
     `Yes, the highlight should persist in all cases until another object is selected.`

---

### HYD-003 — “krav til fall” default & option

1. Confirm scope: Is this only for **Profilanalyse (fallanalyse)**, or also for other validations/reports?
   `It is only relevant for Profilanalyse (fallanalyse) at the moment.`

2. For the new option that “restores current settings” (dimension-based):

   - Where should it live?
     - A) inside the Profilanalyse window,
     - B) inside “Krav til fall” / standards modal,
     - C) in a global settings panel.
       `This should be a button that toggles between the two modes and can be inside the explanation section which opens when clicking "Krav til fall" inside the Profilanalyse window.`

3. What should the Norwegian label be?

   - Suggestion: “Bruk dimensjonsavhengige fallkrav” (On/Off)
   - Alternative: “Følg Norsk Vann standard (etter dimensjon)”
     `Have two check boxes, beside each an explanation of the different requirements. No need to mention Norsk van. Just call i Krav til fall or similar, one with be 10 for all, the other will detail the current settings based on dimension.`

4. Should pressure pipes (“trykkledning”) remain exempt (no fall requirement) in both modes?
   `Yes, pressure pipes should remain exempt in both modes.`

---

### PRF-005 — Profilanalyse usable with 3D + highlight parity

1. When Profilanalyse is open and user switches to 3D:

   - Should the 3D camera automatically focus on the selected ledning, or only highlight it?
     `Yes, the camera should focus and highlight on the selected ledning automatically when switching to 3D.`

2. Highlight parity details:

   - In 3D, do you want highlighting of **entire ledning**, or the **currently hovered segment** from the profile, or both? `if we can do both it would be good. The rest of the network can be faded or something, the selected ledning should be fully visible. The ledning points should be shown, and then the sections highlighted when hovering over the profile sections.`
   - Should points along the ledning be highlighted too (start/end + intermediates)?
     `Yes, the points along the ledning should be highlighted too.`

3. Should hovering in Profilanalyse affect the map even when 2D/3D is not currently visible (state stays “armed”)? `One of these modes should always be active, so yes. The default view is 2D`

---

### FLD-007 — Feltvalidering width & Back/Close placement

1. “1/3 width” – confirm behavior on screen sizes:

   - Desktop: 33% fixed?
   - Small screens: 100% (full width) OK? `Nope. Do not plan for small screens at the moment. Just desktop is fine.`

2. Back/Close convention: Where should they be placed (one standard for all panels)?

   - A) Back on left, Close (X) on right.
   - B) Both on top right (Back as arrow + Close as X).
   - C) Something else (please specify).
     `Both I think need to be top left. Problem is the buttons for switching 2D/3D views are in the way of the top right. However after the changing of the width of the panel this could alleviate the problem. Keep top left at the moment, but we may move close to the right if it looks like that will work better after the width change.`

3. Should the panel remain resizable by drag (if present today), or should it snap to 33%?
   `Remove the resize function for the moment. We can come back to it if needed later.`

---

### FLD-008 — Map filtering within Feltvalidering (override + restore)

1. What exactly should be filterable from Feltvalidering?

   - A) by selected field (only show features failing that field)
   - B) by severity (OK/WARNING/ERROR)
   - C) both (plus search)
     `Both A I think is needed. Some kind of toggle that will only show the features failing the selected field. Hovering should highlight the features failing, while still having all other features available, the checkbox or toggle should show just the failed features.`

2. Override rules:

   - When Feltvalidering is open, should its filters override **Tema + Felt** always, or only when user enables an explicit toggle “Filtrer i kart”?
     `Always override Tema + Felt when Feltvalidering is open.`

3. Restore rules:

   - When Feltvalidering closes, should previously active Tema/Felt filters restore exactly as-is, even if user changed Tema/Felt while Feltvalidering was open? `Yes, restore exactly as-is.`

4. Hover behavior:
   - When hovering items in Feltvalidering, should we highlight in 2D/3D the same way as “Tema” hover does?
     `Yes, highlight in 2D/3D the same way as "Tema" hover does.`

---

### VIEW-009 — Sidebar in 3D + seamless 2D↔3D swap

1. Confirm desired layout in 3D:

   - Sidebar stays visible on the left, 3D canvas on the right (same as 2D). `Yes, same as 2D.`

2. Felt filtering in 3D:

   - Should Felt filter hide/show by attribute values for both points and lines in 3D, identical to 2D? `Yes, identical to 2D.`

3. When multiple filters conflict (Tema vs Felt vs Feltvalidering): confirm precedence order.
   - Proposed precedence: Feltvalidering (highest) → Felt → Tema (lowest). `The currently open panel should have the highest precedence. So if Feltvalidering is open it has highest precedence, then Felt, then Tema. This should be the case at all time. So when switching from Tema to Felt the Tema filters should be removed, and the Felt filters applied.`

---

### SYM-010 — 3D colour for Kumlok (LOK): bright yellow

1. Please specify the exact yellow:

   - Example options: `#FFD400` (strong yellow) or `#FFFF00` (pure yellow) `Strong yellow #FFD400`

2. Should the 3D legend use the same yellow chip and label “Kumlokk (LOK)”? (I assume yes.) `Yes, same yellow chip and label "Kumlokk (LOK) - Check all legends use correct colours, I noticed the 2D map legend colours look off as well.`"`

---

### PRF-011 — “Åpne Profilanalyse” tooltip action (2D & 3D)

1. If Profilanalyse is currently closed when clicking “Åpne Profilanalyse”, should the app:

   - A) open Profilanalyse and automatically run the analysis if not already computed,
   - B) open Profilanalyse but require user to run analysis manually,
   - C) show a clear prompt first.
     `A) open Profilanalyse and automatically run the analysis if not already computed,`

2. If the selected ledning is filtered out by active filters, what is preferred:

   - A) temporarily bypass filters to show it,
   - B) keep filters and show a clear message (“Ledningen er filtrert bort”),
   - C) automatically adjust filters to include it.
     `B) keep filters and show a clear message ("Ledningen er filtrert bort"),`

3. Confirm the button label must be exactly “Åpne Profilanalyse” (as stated) and no emoji.
   `Yes, exactly "Åpne Profilanalyse" and no emoji. Remove emojis from the other buttons as well if present. We will have a clean look without emojis. Later we can find some suitable and professional icons.`

---

### PRF-012 — Click ledning in map/3D to switch Profilanalyse

1. When Profilanalyse is open, should clicking a ledning:

   - also open the tooltip as usual, or
   - suppress the tooltip and only switch profile? `Suppress the tooltip and only switch profile.`

2. Clicking a non-ledning while Profilanalyse is open should:
   - A) do nothing,
   - B) clear profile selection,
   - C) follow existing selection rules. `A) do nothing,`

---

### QA-006 — What is “Avviksdeteksjon”?

1. Please confirm what “Avviksdeteksjon” should mean in this product:

   - A) geometric outliers (objects far away)
   - B) validation deviations (missing/invalid fields)
   - C) both (but then we likely need separate sub-features)

2. Decision preference:

   - Keep label “Avviksdeteksjon” + add tooltip definition
   - Rename (provide the exact new label)
   - Remove from UI

   `I do not know what this button does. I want you to figure it out and tell me, then we can decide if it remains or not.`

#### Avviksdeteksjon (slik det fungerer i koden i dag)

- Dette er _geometrisk avviksdeteksjon_ (outliers): den prøver å finne objekter som ligger langt unna resten av datasettet.
- Når du trykker på knappen (nå: “📍 Finn avvik”), kjøres `detectOutliers(data)`.
- Algoritmen tar én “representativ” koordinat per objekt (punkt: punktets koordinat, linje: første koordinat i linja), beregner et sentrum (centroid) for alle objekter, og beregner avstand fra hvert objekt til sentrum.
- Deretter regner den ut z-score på avstandene og markerer objekter med z-score > 3 (standard terskel) som “avvik”.
- Resultatene vises i en liste i sidepanelet; når du klikker et avvik i listen, settes en highlight på det objektet i kartet.
- Det finnes en toggle “Skjul avvik i kart” som kan skjule disse objektene fra kartet (og gjøre dem ikke-interaktive).
- I tillegg kan det dukke opp en prompt over kartet (“Fant N avvikere… Vil du ignorere dem i kartet?”) med valgene “Ignorer”/“Behold” som setter samme skjul/ikke-skjul.
- Avvikere blir også ignorert i automatisk zoom/fit-to-data (bounds-beregning) slik at zoom ikke dras mot et feilplassert objekt.

Begrensninger / konsekvenser av dagens implementasjon:

- For ledninger brukes kun _første koordinat_ som representasjon. En lang ledning som strekker seg langt bort kan derfor slippe unna (eller en “nær” start kan maskere at resten er langt unna).
- Hvis datasettet har blandet/feil koordinatsystem eller en enkelt feil (f.eks. grader vs meter), vil den typisk fange det som avvik (som er ønsket), men terskel/utvalg kan bli grovt.

`This sounds useful, however it needs to be explained. I would suggest we keep it but rename it to "Geometriske avvik" or similar. We can add a tooltip that explains what it does, similar to the explanation you have provided here.`

---

### Siste avklaringer (kun hvis du vil presisere før implementasjon)

1. **Highlight-regel (hover vs valgt):** Ønsker du to nivåer — A) hover-highlight (midlertidig) og B) valgt-highlight (persist til nytt valg) — eller kun hover? `Both levels would be good. Hover highlight when hovering, and persistent highlight when selected.`
2. **VIEW-009 “fjern Tema-filter når Felt er åpen”:** Skal Tema-filtertilstanden bevares men være inaktiv (så den kommer tilbake når Felt lukkes), eller skal den faktisk nullstilles/cleares? `Bevar Tema-filtertilstanden men være inaktiv.`
3. **HYD-003 fallkrav-valg i UI:** Skal “10‰ for alle” og “fallkrav avhengig av dimensjon” være gjensidig eksklusive (radio/én kan være aktiv), eller kan begge være på samtidig? `Gjensidig eksklusive (radio).`

`NOTE! ALL COMMUNICATION UNDER DEVELOPMENT SHOULD BE ENGLISH. ALL UI FEATURES MUST BE IN NORWEGIAN BOKMÅL. THIS IS JUST FOR CLARIFICATION PURPOSES.`
