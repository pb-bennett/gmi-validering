# SOSI 2D Map Position Regression

## Root cause

Commit `50f41e4` changed `SOSIParser` so it stopped writing the numeric
`header.COSYS_EPSG` field. It retained only `header.SRID` and added the
telemetry-oriented `crsContext`.

The normal 2D map path in `MapInner` selected its source projection from
`header.COSYS_EPSG` or `header.COSYS`. It did not read `SRID` or `crsContext`.
Therefore a declared SOSI `EPSG:25832` file fell through to `EPSG:4326`.
The map then passed metre UTM values such as `[597000, 6643000]` through as
if they were longitude and latitude, so the layer was rendered in the wrong
geographic position.

KOF was unaffected because its parser continued to write
`header.COSYS_EPSG` from `KOORDSYS 22/23` and projection declarations.

## SOSI coordinate convention

SOSI coordinate notation is N-O, meaning northing followed by easting. The
`sosijs` parser stores that as `point.y = northing` and `point.x = easting`.
Its GeoJSON dumper writes the canonical GeoJSON order `[x, y]`, therefore the
application receives `[easting, northing]`. `normalizeFeature` preserves this
as `{x: easting, y: northing, z}`.

The 2D map must pass canonical `[x, y]` to proj4. proj4 returns
`[longitude, latitude]`, which is the order required by GeoJSON and is then
handled by Leaflet. No SOSI or 3D coordinate swap is appropriate.

## Old and broken behavior

Before `50f41e4`, SOSI extracted the declared EPSG value into
`COSYS_EPSG`, so the existing map projection logic selected the correct UTM
zone. After that commit, the telemetry classifier correctly identified the
`SRID` as declared, but the operational map code never consumed that result.

The regression was not caused by a KOORDSYS mapping, UTM axis swap, or
statistics/tracking code. It was the loss of the operational CRS field at the
SOSI parser boundary combined with map code that still depended on that field.

## Fix

`SOSIParser` now derives the numeric operational `COSYS_EPSG` from its strict
shared CRS classification while retaining `SRID` and `crsContext` for
provenance. This keeps telemetry classification strict and does not weaken
any bounded telemetry behavior.

The actual 2D projection paths now use the shared map projection module. It
prefers the parser-owned operational CRS context and retains the existing
header fallbacks. The main GeoJSON layer construction, feature zooming,
map-centering, and analysis map markers all use canonical `[easting,
northing]` input and the declared UTM zone.

The 3D code remains unchanged and continues to center and render the raw
canonical local coordinates.

## Regression test

The production-path integration test uses a representative SOSI parser
boundary with declared `EPSG:25832`, coordinates `[597000, 6643000, 12.5]`,
and a second line coordinate. It verifies:

- strict declared CRS and operational EPSG metadata;
- canonical `x=easting`, `y=northing`, and Z preservation;
- the actual map projection module selects `EPSG:25832`;
- projection lands near longitude 10.73 and latitude 59.91;
- swapped input does not land in the expected area;
- an equivalent KOF coordinate reaches the same map position;
- the existing 3D transformation preserves local geometry and Z values.

## Scope confirmation

KOF, GMI, statistics, Testmodus, tracking, telemetry boundaries, the stats
API/UI, Supabase, SQL, Vercel, and production configuration were not otherwise
changed. The fix only restores SOSI operational CRS availability and makes
the 2D projection consume the correct production CRS representation.
