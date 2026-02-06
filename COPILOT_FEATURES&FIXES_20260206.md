# NEW FEATURES AND FIXES 06.02.2026

1. We need to check the "Inspiser data" logic. As it stands only the latest file loaded is able to display the data using inspiser data. HAll the data exists in the store, however there is a problem displaying it. Have a look and see if you can figure out how to make this work for all files/layers. `FIXED!`

2. We need to look at the way the app fetches height data. It is getting confused sometimes now that multi layer is added. Sometimes It does not fetch all the data. Sometimes a ledningen only has half the height data, sometimes none. Though most often it has all. It is hard to put my finger on why it happens. We need a more robust way to ensure that data is fetched for all ledninger, without abusing the API with uneeded calls.

3. We should also fetch height data for all punkter. This can be stored and displayed in the data for that point, it will be useful when checking if the survey data seems legit.
