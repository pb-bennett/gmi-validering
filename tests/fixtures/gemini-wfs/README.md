# Synthetic Gemini WFS profile fixtures

All coordinates, IDs and attributes in syntheticProfile.mjs are invented test
inputs, not municipal extracts. The independently known projection reference
581932.579311 / 6566001.891835 is already used by the photo projection tests.

The user confirmed http://www.powel.com/gemini as the feature namespace from
the service VA_LINE / VA_MPNT XSD on 2026-10-28. WFS 2 and GML 3.2 namespace
URIs are explicit. Fixtures exercise Point/pos and LineString/posList only.
Alternate prefixes do not change the feature namespace. Repeated pos lines,
other GML versions and multipart geometries are deliberately unsupported.

These fixtures are structural/behavioral tests, not evidence that every
possible live response has the same metadata placement. No schema, external
URL, live feature or credentials are loaded by the tests.
