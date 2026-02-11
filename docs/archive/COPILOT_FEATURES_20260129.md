# NEW CORE FEATURE FOR THE APP

## Multiple file upload support

### Feature Overview

This new feature will allow a user to upload more supported files to the application after the initial file upload. This will allow users to compare the content of multiple files ontop of each other in both 2D and 3D views.

### Map layer management.

The app will now have to be able to compartmentalise each new file as a completely new set of data. So each file will be represented as a new map layer that can be toggled, and filtered on and off independently, or removed entirely. Each layer will add to the legend as required depending on the objects types in the file.

I am thinking that the left hand side bar will now have to be dedicated to layer management, with the ability to expand and collapse each layer to see the Tema and Felt filtering options.

The analysis buttons will need to be miniaturised maybe using only icons and a hover over tooltip to explain the function.

What is at the moment an oversikt section will need to be compressed in size and appear as the name of the layer, with a note of the number of each type of object - punkter and ledninger. No need to display the total length of lines.

Styling will need to be addressed so that the representation of each layer in the side bar is clear and distinct from the others.

We need to think about how much extra storage this will require on the client side, and if there are any performance implications of having multiple layers loaded at once. If possible add a dev display of storage usage in the store package for debugging purposes.

Care must be taken to maintain all core functionality of the app.

---

## Queries for clarification (please answer)

1. Should filters (Tema/Felt/field validation) apply per layer by default, with an optional global “apply to all layers” toggle? `I imagine each layer will have its own set of filters. So the side bar will have a hierachy of expandable sections. The top will be a list of layers. Each layer will then be expandable and under each layer there will be a Tema and Felt filter section which each in turn can be expanded as per the app today. Each layer is affected by its own filters only. Only one layer should be expanded at a time to save space and reduce clutter.At the top of the layer can be a row of small buttons each with a different icon for the different analysis functions. Hovering over each icon will display a tooltip to explain the function. Clicking the icon will run the analysis for that layer only.`
2. Should analysis (profilanalyse, z‑validering, outliers) run per layer only, or allow multi‑layer combined analysis? `Per layer only, each layer will have its own buttons. Care should be taken to compartmentalise the analysis results so that they do not interfere with each other.`
3. How should conflicting S_FCODE/Tema colors be handled across layers (same color per code, or per‑layer palette)? `There should be no difference in color coding between layers. So the same S_FCODE should always be represented by the same color across all layers. This will help the user to visually compare the layers more easily. Hovering over the layer in the side bar should highlight the corresponding objects in the map view to help visual identification.`
4. Should a layer be able to “solo” (show only this layer) in both 2D and 3D? `Have a check box for each layer that enables or disables visibility of the layer, with at the top hide all/show all buttons.`
5. Should the map legend show a merged legend across all visible layers, or per‑layer sections? `Merged legend that describes all types of objects across all layers.`
6. Do you want a per‑layer opacity slider (2D/3D) to help visual comparison? `Yes, try this and we can see how it goes.`
7. How should file removal behave regarding analysis state (clear only that layer’s results, keep others intact)? `Removing a layer should only remove that layer’s data and analysis results. The other layers should remain intact and unaffected.`
8. For KOF/SOSI layers, should we allow a different default styling or grouping than GMI? `No, keep the same styling and grouping conventions across all file types to maintain consistency and usability.`
9. Any hard limit on number of layers or total file size before warning the user? `No hard limit, but if performance degrades significantly we should warn the user. We'll see how it affects performance in testing.`
10. Preferred storage diagnostics: a simple “store size” in DevDiagnosticsPanel, or a dedicated panel in the sidebar? `Simple store size in DevDiagnosticsPanel should suffice for now.`
