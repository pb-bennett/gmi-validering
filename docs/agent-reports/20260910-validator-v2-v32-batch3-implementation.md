# Summary

Batch 3 activates the six independent line/DIMENSION/SHAPE policy owners. Batch 4 hydraulic policy remains deferred.

# Baseline before Batch 3

158 passed, 0 failed, 5 explicit Batch 3 skips.

# Nett_type

Exact eight-value domain; F/H/O/S Pass and O1/O2/S6/S7 Sjekk.

# Material

Exact 45-value domain; nine preferred values Pass and every other valid value, including AN, Sjekk.

# Dimensjon

Required strict line integer; 0–31 Sjekk, >=32 Pass, malformed/decimal/sign/negative Feil.

# Line Tykkelse

Settled plain-number policy: positive integers and one/two decimals Pass, extra precision/zero Sjekk, negative or malformed Feil.

# Rørform

Exact seven-value domain; A/X Sjekk and other valid values Pass.

# VertikalDimensjon

Rørform-dependent conditional requiredness/ranges are active. Unresolved shape suppresses contextual missing/range conclusions while invalid supplied vertical values still fail.

# Dependency / suppression behavior

Uses completed `NOT_EVALUATED` outcomes with `PIPE_SHAPE_UNRESOLVED`, without duplicating Rørform failure.

# Field Info

All six line fields have complete runtime Field Info and contextual requiredness composition.

# Fildata

Fildata consumes completed outcomes, so contextual VertikalDimensjon Pass/Sjekk differences are retained.

# Synthetic fixture/oracle

The existing Latin-1-safe `line-dimensions-shapes` fixture is decoded through `decodeGmiBytes`; its Batch 3 oracle asserts 10 completed outcomes.

# A8 Batch 3 activation

All five previous Batch 3 A8 skips are active and pass.

# Owner inventory

42 exact active owners: six Batch 3 line owners added; Batch 4 hydraulic owners absent.

# Batch 1/2 regression status

Green.

# Full validationV2 suite

169 passed, 0 failed, 0 skipped.

# Files changed

Rule registry, field policy/context, Field Info data/composition, A5/A7/A8 and Batch 3 tests, and the settled policy document.

# Known limitations

No hydraulic classification is evaluated.

# Batch 4 deferred scope

SDR, Ringstivhet, Trykklasse, hydraulic Tema/material classification and related interactions remain deferred.

# Batch 3 completion assessment

Complete for the independent six-field Batch 3 scope. No commit, push, merge, deploy, or production action was performed.
