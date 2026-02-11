# NEW FEATURE - ALLOW A USER TO ADD A CUSTOM WMS LAYER FROM A PROVIDED URL, USERNAME AND PASSWORD

## Overview

I want to add the functionality to allow a user to add a WMS layer of the water and waste infrastructure in the kommune where they work. This WMS is delivered by Gemini directly from the database. It is secured by username and password, and must not be distributed beyond a few workers.

I want us to investigate how we can give a user the option to do add the WMS without any data about the URL, username or password being stored on the server. What I would conisder ideal is if the browser storage can keep the URL stored, and then the password manager can keep the username and password.

When the WMS is added it should be enabled by default, but also be able to be disabled.

There should be an "add wms" or similar button, however it should not be large as probably most users would not have the details to use the WMS. Clicking the button should open a modal where the URL can be pasted in, together with entering username and password.

We must be careful with security here. Make this top priority.
