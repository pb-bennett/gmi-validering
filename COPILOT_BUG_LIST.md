# COPILOT: Bug / Change List

This file contains reported bugs and requested changes. Each item is numbered so we can refine, prioritize, and convert to issues/tasks for implementation.

1. Kartoversikt / 3D: Tab buttons overlap the close button on the "Felt" analysis view. I feel the "reset app and load a new file" button should be always visible and not only appearing on the main sidebar. It is hidden when other moddules are open. Put the button hovering top right over the map by the background select button. The text can short and concise, with a tooltip for more info.

2. Topplokk analysis: Provide a way for users to identify/select objects that fail validation (e.g., list + highlight on map - at present it only details how many have failed). Also flag any LOK objects that do not have a corresponding KUM/SLUK.

3. "Felt" list: Add filtering of map objects from within the list (filter by code/type, search, visibility toggles) in a similar way to the TEMA list. Tema filtering should be the default, but when the Felt list section is open it should override the filtering from Tema.

4. Default view: Ensure **Kartoversikt (2D)** is the default start view when a file is loaded, not the 3D view.

5. Measure tool: Implement a measurement tool for distance on the map. Ensure that when the tool is active all other click interactions are disabled, so that the tool can measure from object to object.

6. 3D depth calculation: Consider topplokk height when calculating kum/sluk depth for 3D rendering. At present it seems all the objects that are rendered in 3D as cylinders are a fixed height. The measured height is the base of the object (KUM for example) and the topplokk height is ground level, and therefore the top of the KUM object. So the cylinder height needs to vary depending on the topplokk height. In the event that there is no topplokk above the KUM/SLUK, we can use a default height (e.g. 2m). Stop the KUM cylinders at the base of the LOK so the LOK is still visible on top. Colour the LOK differently to the KUM cylinder so it's visually clear which part is which. Check all the colour coding for KUM/SLUK/LOK to ensure it's consistent and logical.

7. 3D rendering heights: Verify and use the correct "Høydereferanse" field when positioning objects vertically. ie selvfall ledningner are often measured from the base inside of pipe, and pressure pipes from the top outside of pipe. Ensure the correct height reference is used for each object type when rendering in 3D.

8. Point rendering: Reduce sphere size for points unless they intersect a large-diameter pipe (avoid visual clutter). Some pipes have large diameters and will completely obscure small spheres along their lengths. Implement some logic for scaling point sizes based on context.

9. 3D UI: Troubleshoot or remove the "Trådramme" button if it is broken or confusing.

10. 3D tooltips: Tooltips in 3D currently display "Kum/Sluk" for all points—fix the tooltip header/content to reflect the actual object type.

11. Kartoversikt tooltip: Add an option "Vis i 3D" (Show in 3D) in the 2D tooltip to jump to the 3D view for that object. Also remember the current camera position and facing angle when switching views normally, so the user doesn't get disoriented. Obviously when switching to 3D from a 2D tooltip, focus on the selected object.

12. Profilanalyse integration: If profilanalyse is open, clicking "Show in map" from a 3D tooltip should move focus to the object (especially for pipes) and respect profilanalyse state.

13. Highlight behavior: When clicking "Show in map" from a 3D tooltip, highlight the object in the map; the highlight should cancel when clicking elsewhere.

14. Robustness: Investigate and fix crashes caused by certain GMI files (add defensive parsing, better error handling, and guards against malformed inputs). Three axamples of such files are included in the folder `/REF_FILES/BROKEN_GMI/`. Examine these files to identify common issues and implement fixes to prevent crashes. We need a system to return useful error messages to the user when a file cannot be loaded, rather than the app crashing.

15. 3D scale / long pipes: Handle excessively long pipes in 3D that render outside of the background. An example file is included in `/REF_FILES/LONG_PIPE_GMI/` for testing.

16. 3D pivot filters: Filtering types on sub-pivot tables under "tema" works in 2D but not in 3D — fix parity between views. Eg when Type is displayed as pivot table under Tema, selecting a type filter should apply in both 2D and 3D views.

17. Outlier detection: On GMI load, detect objects that are far away from the main dataset (outliers), flag them, and offer an option to filter/hide them. An example file is included in `/REF_FILES/OUTLIER_POINT_GMI/` for testing.

---

Notes:

- Add priorities, short reproduction steps, and a responsible owner next to each item when we're ready to triage.
- We can convert high-priority items into GitHub Issues or work items as the next step.
