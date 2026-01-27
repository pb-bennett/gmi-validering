# NEW FEATURES AND FIXES - JANUARY 27, 2026

## 1. We need to recheck the way filtering and highlighting works for Tema and Felt.

It works very well for Tema. However highlighting on hover for Felt does not work. There are also bugs in the filtering system for Felt, sometimes when using the show all button the filtering does not reset correctly, and then gets stuck and the app needs to be reloaded. This i find hard to reproduce, but it has happened a few times now.

The filtering sets should be independent for Tema and Felt. Meaning that if I filter on a Tema, and then filter on a Felt, the app should show all objects that match either the Tema or the Felt - depending on what section is active.

I think filtering should be compartmentalized better in the code, so that the filtering for Tema and Felt do not interfere with each other.

Make sure that filtering works in both 2d map and 3d view.

Use Tema as an example of how it should work. Change felt filtering to work the same way. Compartmentalize the filtering code. Make highlighting on hover work for Felt as well.
