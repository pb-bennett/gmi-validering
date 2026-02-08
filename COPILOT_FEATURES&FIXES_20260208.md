# REWORKING FELTVALIDATOR FEATURE

I want us to work on the way the app enables the user to analyse and validate fields in the data sets. This will mean adding extra functionality in the Tema and Felt filtering lists and revisiting the feltvalidering tool.

1. In an earlier version of the app the Tema list also had a sub diving and filtering by the Type field for punkter. So in essence where a point has a type this is included as a sub pivot table with its own filtering checkboxes and on hover highlighting. This is because points are often sub identified by type. Can you readd this to the app. `COMPLETE`
2. Add a button to each layer to completely reset all filtering settings, this will reset filtering for both tema and felt. The button can be small icon butten in the same line as the other analysis buttons etc. `Change colout to same blue as the other icons here`

3. We have earlier attempted to have a data table that shows the entire data in table view, that is sortable by columns, with column order changable etc. However I was never happy with how the original implementation worked, and the feature disappeared when we added multiple layer support. I want us to revist the table feature, but begin from the ground up with a new table. Find the old table and remove the code. Then look into how we can implement a new table

- Are there any packages that can help here?
- The table should occupy the same approximate area as the profile analysis
- A user should still be able to view the map/3d view, and each row of the table should have a "zoom to" icon
- The table will need to be scrollable both up and down, and sideways.
