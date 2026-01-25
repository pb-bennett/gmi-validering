# NEW FEATURES AND FIXES - 25.01.2026

## 1. Add new WMS map layer to show plot boundaries and gårds- og bruksnummer.

Add this WMS layer over the background map to help users identify plot boundaries and property numbers. It should be turned on by default but have option of disabling in the background menu under "data".
https://wms.geonorge.no/skwms1/wms.matrikkel?service=wms&request=getcapabilities
Layer name: "Eiendomsgrenser"

## 2. Improving the data explorer.

At the very start of developing this app we added the option to inspect the data. This was considered a dev tool, hoever I think it could be useful for all users. The window is a modal that opens when clicking the "inspiser data" button at the bottom middle of the map. This modal should be improved in the following ways:

a. There is currently no display of coordintes. The points should have XYZ coordinates displayed. Also the lines should have an expandable list of line points XYZ coordinates.
b. There should also be a way to expand to show all the height data points for the lines, the height data that is fetched from the profile analysis and fills the gaps bewteen the line points. This list will end up very long for some lines, so it should be collapsible by default.
c. This modal should be openable from other places in the app, for example from the profile analysis results and from tooltips in both 2D and 3D views. The modal should display the object from which it was accessed. For example if opened from a profile analysis result, it should show the line object that was analyzed, with all its data including the height data points.
d. The modal should have same functionaly in 3d as in 2d. Make sure the inspect data button is visible in 3d view as well.

## 3. Check that all objects have height data.

All objects should in theory have height data. All line points should have Z values. When the app first loads I want to check all objects, and in lines all line points.

There will be a new analysis tool in the alalyse section that can be opened to validate that all points have Z values.

When the app first loads the analysis is run and if there are missing Z values a warning pops up with deatails on how many objects are affected. The user is presented with option to run the analysis tool from the popup modal and also have option to run it later from the analysis section.

## 4. Make parsing of KOF files more sturdy.

At present roughly half of the KOF files I have available fail during parsing, and set their pointsfar from Norway. I believe this is an issue with parsing of the files, as KOF files do not follow hard rules and can vary in number of speces between columns/fields.

Also we need to be able to fetch out all of the data. As I understand it the second column is often used to label the points, this data needs to be fetched out. Together with the coordintes and where avilalbe Z values. Also any header data.

I have collected a number of KOF files that fail, together with a number that pass parsing. They can be found here:

`\REF_FILES\KOF2\FEIL` - files that fail parsing

`\REF_FILES\KOF2\RIKTIG` - files that parse correctly

Examine the current parsing methods and compare the files. Develop a more sturdy parsing method that can handle the variety of KOF files available.

# Checklist of completed features and fixes - 25.01.2026

1. [x] New WMS for plot boundaries and property numbers added and enabled by default.

2. [x] Data explorer modal improved with XYZ coordinates for points and lines.

3. [x] Data explorer modal can be opened from profile analysis results and tooltips in both 2D and 3D views.

4. [ ] Review and fix KOF file parsing.
