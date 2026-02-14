# Fixes and features for 14.02.2026

1. Filtering of objects using the Tema and Felt sections in sidebar do not seem to update the rendering in the 3d map. When a user moves back to 2d view, then back again to 2d view the filter changes seem to take affect. There should be a rerender when filters are changes, but no constant checking that could slow the app down. Sound reasonable? Make sure this works with multiple layers. Each layer has its own set of filters. `COMPLETE`

2. Background map choice and what wms layers are showing need to persist. At present they reset to default when new files are added. This should be stored in local storage in the browser `COMPLETE`

3. At present the data table view works very well, it is tied to filtering for both felt and tema. I would like to add a feature very similar to what happens when hovering over values in Tema and Felt lists on the left sidebar. When hovering over the objects in the data table I want that object to highlight in the map. `COMPLETE`

4. Have another look at the way the app fetches and stores height data for the profile analysis. I still find sometime that when using multiple files some ledninger do not have or have partial lines on them. Although this could be a rendering problem rather than problem with fetching the data. Can you have a good look at see if you can figure out what could be causing this. It is hard to replicate, but does happen. You need to think performance here. No constant checks etc that will degrade performance. `COMPLETE`
