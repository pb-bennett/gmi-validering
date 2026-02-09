# Kommune lookup from uploaded datasets

This app can derive kommune from the uploaded dataset coordinates (one lookup per upload).

How it works
- The client computes a representative coordinate (centroid of sampled points/lines).
- The server calls Kartverket kommuneinfo:
  - https://ws.geonorge.no/kommuneinfo/v1/punkt?ost=<x>&nord=<y>&koordsys=<epsg>
- The response is used to set `areaType=kommune`, `areaName` and `areaId`.

Notes
- We send a single coordinate per upload and do not store coordinates in the DB.
- If lookup fails, the server falls back to Vercel geo headers (country/region/city).

Troubleshooting
- Ensure EPSG is detected in the uploaded file header (25832/25833 are supported).
- If EPSG is missing or unsupported, kommune lookup is skipped.
- Check the API response by calling `/api/track/debug` and inspecting header-based location.
