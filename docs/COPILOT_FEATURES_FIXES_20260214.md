# Fixes and features for 14.02.2026

1. Filtering of objects using the Tema and Felt sections in sidebar do not seem to update the rendering in the 3d map. When a user moves back to 2d view, then back again to 2d view the filter changes seem to take affect. There should be a rerender when filters are changes, but no constant checking that could slow the app down. Sound reasonable? Make sure this works with multiple layers. Each layer has its own set of filters. `COMPLETE`

2. Background map choice and what wms layers are showing need to persist. At present they reset to default when new files are added. This should be stored in local storage in the browser `COMPLETE`
