# New features and some fixes to be worked January 17, 2026. **Remember all UI will be in Norwegian. All communications with me during development should be in English**.

## New Features/Bugs:

1. IN PROFILANALYSE: We will have 2 options for the "Krav til fall", ie the acceptable slop/greadient before a warning is given. The default will now be a constant 10‰ not dependant on the pipe dimensions. At the moment there is a pop up window that opens when the "Krav til fall" button is clicked. Currently this window just contains information. Now it should contain two options selectable by radio buttons.

Option1: 10‰ for all diameters. This is the default and will be selected on load.
Option2: Variable fall requirement based on pipe diameter as per the current implementation.

The otions should be described properly.

Ensure that the selected onption is used in the profile analysis calculations. Reevaluate for all pipes when the option is changed.

### Questions for you (feature 1)

1. Where should the selected option be stored: session-only, or persisted between sessions (local storage via settings)? - `Persisted between sessions (local storage via settings)`
2. Should the fixed 10‰ option apply only to gravity pipes (SP/OV/AF) or also to pressure pipes (VL/trykk)? `Yes, only to gravity pipes (SP/OV/AF)`
3. If pipe dimension is missing/invalid, should Option1 always force 10‰, and Option2 keep the current fallback (4‰)? `Yes, Option1 always forces 10‰ for all pipes, Option2 should assume the smallest diameter and apply the corresponding fall requirement, ie 10‰`
4. Do you want the modal to keep the current info text plus a short description for each option, or replace the info text entirely? `You can keep as is, just in the section "Minimumskrav til fall" add the two radio options with descriptions by each`
5. Please confirm the exact Norwegian labels/descriptions for the two radio options. `Option1: Fast krav til fall: 10‰ for alle dimensjoner. Dette er standard og vil være valgt ved lasting.Option2: Dimensjon < 200 mm:10 ‰ (1:100) Dimensjon 200 - 315 mm:4 ‰ (1:250) Dimensjon > 315 mm:2 ‰ (1:500) `
6. Should the chosen option be shown anywhere outside the modal (e.g., in the analysis header or result details)? `No, not necessary`
7. When switching option, do you want the selection to immediately re-run analysis even if the modal is closed, or only when the user clicks a button? `Immediately re-run the section of the analysis that applies the gradeint requirements (I am not sure when this is applied) when the selection is changed, there should then be no need to do it again when modal is changed`

## Observations after review:

- When running the analysis every section along the pipe should be looked at, together with the total gradeint for the entire pipe. If either of these are outside the requirements a warning should be given. I see that currently only the total gradient is looked at. This should be changed. I found a pipe with negative gradient sections that was not flagged as warning because the total gradient was acceptable.

---

2. Adjustments to the "Feltvalidering" section.

- Reduce the width of Feltvalidering section to 1/3 screen width to give the map more space. Adjust the grid of cards so that they fit nicely in the reduced width. Have 2 per row. Adjust padding inside the cards if needed.
- Add functionality in Feltvalidering to allow the user to view the objects that caused a warning or error. Each card should have a button "Vis objekter" that hides all other objects in the map view. Also add functionaily that highlights the affected objects on hover with mouse pointer in the same way as the Tema and Felt views. When feltvalidering is open all other filter settings should be overridden to ensure the user can see the affected objects. The map can zoom/pan to the extents of the affected objects when the button is clicked.
- When the user clicks "Vis objekter" the button text should change to "Tilbake til full visning" which when clicked restores the full map view and all filter settings.

## Completion status ✅

1. [x] Krav til fall, change in krav.
2. [ ] Adjustments to the "Feltvalidering" section.
