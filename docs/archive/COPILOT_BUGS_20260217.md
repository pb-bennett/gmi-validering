# BUGS TO BASH - 17.02.2026

1. When in 3d mode clicking “vis I kart” on the tooltip of an object does not change the view to 3d mode as intended. The opposite does work. Vis i 3d functions as it should. Be careful about which layer the objects are from, not sure if this could have an impact.

2. Opening the datatable view should close the profile analysis if open, and vice versa. At present one appears over the other.

3. When profileanalysis mode the selected ledning i already made thicker and more obvious to the user. I would also like to place points along the line where the line points are in the vector, just to make it easier to see. Make sure it is different colour points to those that are placed on the line when hovering over the terrain.

4. Sometimes when Felt filters are active Tema will not expand. It tries to expand but then Felt opens again. Have to reset all filters to open Tema again. Cannot always recreate. Might be when multiple different fields have some filters active?

5. occasionally one or more objects won't have a Tema, in these cases the points appear as largish circles with cyan stroke. These need to be taken account of in the sidebar under Tema filtering. At present there is no "ingen verdi" or similar to show the user there are objects with a value in that field.

6. The app should detect if a file is missing CRS. In this case give them option to either have zone 33 or zone 32 to see if it will work.

7. Move Gemini WMS layer to the left sidebar together with other layers. This will make it easier for a user to toggle the layer on and off. It can be at the bottom of the list of layers, and only appear when a user adds the custom WMS.
