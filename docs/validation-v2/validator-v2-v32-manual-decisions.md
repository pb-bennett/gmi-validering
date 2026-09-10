# Validator 2.0 v3.2 — consolidated manual field decisions

**Status:** implementation-ready baseline for planning
**Purpose:** consolidate the field-by-field decisions made during the manual review of Innmålingsinstruks v3.2 / Vedlegg A.
**Important:** this is a practical v3.2 baseline, not a claim that every rule is permanent. Several applicability rules are expected to be tuned as real files are tested.

## Result semantics

The user-facing validator should use only these three outcomes:

- **Feil** — definite violation of the agreed rule.
- **Sjekk** — manual inspection is warranted. This does **not** always mean the value is probably wrong. It can also mean valid-but-unusual, informational highlighting, uncertain applicability, or a field that is present where it normally would not be expected.
- **Pass** — the agreed rule is satisfied, including cases where an optional/irrelevant field is correctly absent.

Avoid introducing extra user-facing states such as “Må rettes”, “neutral”, or “not evaluated” where one of the three outcomes above can express the result.

---

# A. Common fields

## 1. Anleggsår

**Scope:** point + line

- Exact four ASCII digits (`YYYY`).
- Malformed / non-year value → **Feil**.
- Future year → **Feil**.
- `Stedfestingsårsak = NYTT` + missing Anleggsår → **Feil**.
- `NYTT` + year from current year down to current year − 5 → **Pass**.
- `NYTT` + year older than current year − 5 → **Sjekk**.
- Non-`NYTT` + missing Anleggsår → **Sjekk**.
- Any numeric year `< 1900` → **Sjekk**.
- `0000` is therefore **Sjekk**, not a special hard failure, unless another stronger rule applies.
- Current year must be dynamic.

## 2. Datafangstdato

**Scope:** point + line

- Required on all objects.
- Missing → **Feil**.
- Exact shape `DD.MM.YYYY` plus real calendar validity.
- Malformed or impossible date → **Feil**.
- Future date → **Feil**.
- If a valid Anleggsår exists and Datafangstdato is earlier than that installation year → **Feil**.
- Valid date older than five years from the current date → **Sjekk**.
- Otherwise → **Pass**.
- If Anleggsår is missing/uncertain, evaluate Datafangstdato independently.

## 3. Innmålt_av

**Scope:** point + line

- Missing / empty / whitespace-only → **Feil**.
- Ordinary non-empty string → **Pass**.
- Obvious placeholders → **Sjekk**.
- Placeholder comparison should be trimmed and case-insensitive for:
  - `-`
  - `?`
  - `ukjent`
  - `unknown`
  - `n/a`
  - `na`
  - `ikke kjent`
  - `ikke oppgitt`
- Do not attempt to verify whether the value is a real person/company.
- Field information/details should show unique values and counts.

## 4. Saksnummer

**Scope:** point + line

- Missing / empty → **Pass**.
- Reasonable string or number → **Pass**.
- Same obvious placeholder list as `Innmålt_av` → **Sjekk**.
- No strict regex or project-number format.
- Field information/details should make unique values and counts easy to inspect.

## 5. Høydereferanse

**Scope:** point + line

- Missing → **Feil**.
- Invalid / unlisted → **Feil**.
- `UKJENT` → **Sjekk**.
- All other approved values → **Pass**.

Approved values:

`BUNN_INNVENDIG, PÅ_BAKKEN, SENTER, TOPP_INNVENDIG, TOPP_UTVENDIG, UKJENT, UNDERKANT_UTVENDIG`

## 6. Målemetode

**Scope:** point + line

- Missing → **Feil**.
- `96` → **Pass**.
- Any other valid official XY code, including `97` → **Sjekk**.
- Invalid / unlisted → **Feil**.

## 7. Nøyaktighet

**Scope:** point + line

- Missing → **Feil**.
- Malformed / non-numeric → **Feil**.
- Negative → **Feil**.
- `0` → **Sjekk**.
- `1–3 cm` → **Pass**.
- `>3 cm` → **Sjekk**.
- Baseline format remains integer unless deliberately changed later.

## 8. MålemetodeHøyde

**Scope:** point + line

- Missing → **Feil**.
- `96` → **Pass**.
- Any other valid official height-method code → **Sjekk**.
- `97` → **Sjekk** as an explicit special case even though it is not in the official height list.
- Other invalid / unlisted values → **Feil**.

## 9. NøyaktighetHøyde

**Scope:** point + line

- Missing → **Feil**.
- Malformed / non-numeric → **Feil**.
- Negative → **Feil**.
- `0` → **Sjekk**.
- `1–5 cm` → **Pass**.
- `>5 cm` → **Sjekk**.
- Baseline format remains integer unless deliberately changed later.

## 10. Stedfestingsforhold

**Scope:** point + line

- Missing → **Feil**.
- Invalid / unlisted → **Feil**.
- `ÅPEN_GRØ` → **Pass**.
- `ÅPEN_KUM` → **Pass**.
- Any other valid code → **Sjekk**.

## 11. Stedfestingsårsak

**Scope:** point + line

- Missing → **Feil**.
- Invalid / unlisted → **Feil**.
- Valid code → normally **Pass**.

Approved values:

`FJERN, FLYTT_DELV, FLYTT_HELT, NYTT, PÅVI, UENDR`

### Dataset-level plausibility check

- Build the set of valid Anleggsår values used by `NYTT` objects in the same delivery.
- A non-`NYTT` object whose valid Anleggsår matches a year used by `NYTT` objects → **Sjekk** under Stedfestingsårsak.
- Example: `NYTT 2026`, `NYTT 2026`, `UENDR 2026` → the `UENDR` object gets **Sjekk**.
- `NYTT` + missing/old Anleggsår is owned by the Anleggsår rule; avoid duplicating the same underlying warning here.

## 12. Synbarhet

**Scope:** point + line

- Retired in v3.2.
- Missing → **Pass**.
- Present → **Pass**.
- No validation findings based on its value.
- If present, still display it.
- Clearly label it as no longer required / not validated in v3.2.
- Move it toward the end of field presentation because it is no longer important.

## 13. Merknad

**Scope:** canonical field is point + line; current implementation coverage must be checked by the planner.

- Missing → **Pass**.
- Present with `<=255` Unicode code points → **Pass**.
- `>255` Unicode code points → **Feil**.
- When present, make it prominent in details; it can contain important explanatory context.

## 14. Eier

**Scope:** point + line

- Missing / empty → **Sjekk**.
- `AN` → **Sjekk**.
- Any other valid listed code → **Pass**.
- Invalid / unlisted → **Feil**.

Approved values:

`AN, F, I, K, K1, K2, L, P, P1, S, S1, S2, S3`

## 15. Vertikalnivå

**Scope:** point + line

- Missing → **Feil**.
- Invalid / unlisted → **Feil**.
- `UNDER_GRUNN` → **Pass**.
- `PÅ_GRUNN_VANNOVERF` → **Pass**.
- Other valid values → **Sjekk**.

Approved values:

`UNDER_GRUNN, PÅ_GRUNN_VANNOVERF, OVER_GRUNN, PÅ_BUNN, I_VANNSØYL, SLISSING, UNDER_BUNN`

## 16. MaksAvvikVertikalt

**Scope:** point + line

- Required on all objects.
- Integer only.
- Missing → **Feil**.
- Negative / malformed / non-integer → **Feil**.
- `0` → **Sjekk**.
- `1–30` → **Pass**.
- `>30` → **Feil**.
- Validate only the supplied value; do not calculate deviation from geometry/observations.

## 17. MaksAvvikHorisontalt

**Scope:** point + line

- Required on all objects.
- Integer only.
- Missing → **Feil**.
- Negative / malformed / non-integer → **Feil**.
- `0` → **Sjekk**.
- `1–20` → **Pass**.
- `>20` → **Feil**.
- Validate only the supplied value; do not calculate deviation from geometry/observations.

---

# B. Tema resolution — early validation gate

## 18. Tema / S_FCODE

**Scope:** point + line, using geometry-specific Tema lists.

`Tema` and `S_FCODE` represent the same concept and should be interchangeable as input sources.

### Resolution rules

- `S_FCODE` only + valid value for geometry → **Pass**.
- `Tema` only + valid value for geometry → **Pass**.
- Neither present → **Feil**.
- Supplied invalid / unlisted Tema code → **Feil**.
- If both fields exist in the same file/schema → file-level **Sjekk** explaining that they represent the same concept and coexistence should be inspected.
- Both present on an object and values agree → Tema resolves normally; dependent validation may continue.
- Both present and values disagree → object-level **Sjekk** at the Tema stage; Tema is unresolved for that object.
- Never silently prefer one over the other when both are present and disagree.
- Tema identity resolution should happen near the start of validation.
- Tema-dependent rules should not repeat the Tema conflict. If Tema is unresolved, suppress/skip dependent Tema judgements for that object.

This supersedes the current “direct Tema preferred, S_FCODE fallback” behaviour.

---

# C. Point-specific / applicability-driven fields

## Shared point applicability policy

Where a field uses the v3.2 applicability metadata:

- **APPLICABLE + missing** → **Feil** when the field is required for applicable Tema.
- **APPLICABLE + valid** → **Pass**.
- **NOT_APPLICABLE + supplied valid** → **Sjekk**.
- **UNKNOWN + missing** → **Pass**.
- **UNKNOWN + supplied valid** → **Sjekk**.
- Supplied invalid / malformed / unlisted value → **Feil**.

Current core applicability set used by several manhole-like fields:

**APPLICABLE**
`KUM, SAN, SLS, SLU, KUMI, SANI, SLI, SLG, KOTREKUM, MKS, MKV, PMK, PMKAF, PMKOV, PMKSP, PMKVL, RED`

**NOT_APPLICABLE**
`STR, KRN`

`LOK` varies by field: it is applicable to Byggemetode but not to Kumform/Kjegle.
`KMR`, `SUMP`, and all unclassified Tema remain UNKNOWN unless explicitly classified later.

## 19. Type

**Scope:** point

- `Tema = DIV` + missing Type → **Feil**.
- Other resolved Tema that participate in at least one approved Type↔Tema mapping + missing Type → **Sjekk**.
- Tema that never uses Type + missing Type → **Pass**.
- Supplied Type not in the approved Type list → **Feil**.
- Supplied valid Type but not allowed for resolved Tema → **Feil**.
- Supplied valid Type and allowed for resolved Tema → **Pass**.
- If Tema is unresolved because Tema/S_FCODE disagree, do not emit a duplicate Type conflict or compatibility judgement.

## 20. Kumform

**Scope:** point

Approved values:

`AN, F, FK, FR, N, R, X`

- APPLICABLE + missing → **Feil**.
- APPLICABLE + valid → **Pass**.
- Invalid / unlisted → **Feil**.
- NOT_APPLICABLE + supplied valid → **Sjekk**.
- UNKNOWN + missing → **Pass**.
- UNKNOWN + supplied valid → **Sjekk**.

For Kumform, `LOK` is NOT_APPLICABLE.

## 21. Bredde

**Scope:** point

- APPLICABLE + missing → **Feil**.
- Valid integer `>=20` → **Pass** when applicable.
- Integer `1–19` → **Sjekk**.
- `0` → **Sjekk**.
- Negative / malformed / non-integer → **Feil**.
- NOT_APPLICABLE + supplied valid → **Sjekk**.
- UNKNOWN + missing → **Pass**.
- UNKNOWN + supplied valid → **Sjekk**.

The `20 mm` plausibility threshold is deliberately practical and can be tuned later.

## 22. Lengde

**Scope:** point

- Missing → **Pass**.
- Any supplied valid integer → **Sjekk**, regardless of Tema.
- `0` → **Sjekk**.
- Negative / malformed / non-integer → **Feil**.

Reason: the field is rarely legitimately used and should always be brought to the user's attention when present.

## 23. InnvendigUtvendig

**Scope:** point + line by deliberate validator policy.

- Required on both points and lines.
- `ID` → **Pass**.
- `OD` → **Pass**.
- Missing / empty → **Feil**.
- Any other value → **Feil**.

## 24. Tykkelse

**Scope:** point + line

### Lines

- **Settled Batch 3 decision:** required numeric field on all lines.
- Plain numeric syntax is ASCII digits, with an optional `.` or `,` decimal separator and digits on both sides; whitespace, `+`, exponent, grouping, leading separator and trailing separator are not accepted.
- Positive integer or positive value with one or two decimal places → **Pass**.
- Positive plain numeric value with more than two decimal places → **Sjekk**.
- Zero in an otherwise valid plain numeric representation → **Sjekk**.
- Negative numeric value, missing value, malformed or non-numeric value → **Feil**.
- This decimal policy applies only to line Tykkelse. Point Tykkelse remains integer-only.

### Points

Applicable Tema:

`KUM, SAN, SLS, SLU, KUMI, SANI, SLI, SLG, KOTREKUM, MKS, MKV, PMK, PMKAF, PMKOV, PMKSP, PMKVL, RED`

- APPLICABLE + missing → **Feil**.
- APPLICABLE + positive valid integer → **Pass**.
- `0` → **Sjekk**.
- NOT_APPLICABLE + supplied valid → **Sjekk**.
- UNKNOWN + missing → **Pass**.
- UNKNOWN + supplied valid → **Sjekk**.
- Negative / malformed / non-integer → **Feil**.


## 25. Utvendig_høyde

**Scope:** point

- Missing → **Pass**.
- Positive integer supplied → **Sjekk**.
- `0` → **Sjekk**.
- Negative / malformed / non-integer → **Feil**.
- Any valid presence is intentionally highlighted because the field is expected to be rare.

This is the chosen baseline despite conflicting requiredness wording in the source material.

## 26. Avst_BunnInnvUnderUtv

**Scope:** point

Applicable Tema:

`KUM, SAN, SLS, SLU, KUMI, SANI, SLI, SLG, KOTREKUM, MKS, MKV, PMK, PMKAF, PMKOV, PMKSP, PMKVL, RED`

- Decimal support is required; accept integer or decimal values.
- Accept both `.` and `,` as decimal separators.
- APPLICABLE + missing → **Feil**.
- APPLICABLE + positive numeric value → **Pass**.
- `0` → **Sjekk**.
- Negative / malformed / non-numeric → **Feil**.
- NOT_APPLICABLE + supplied valid → **Sjekk**.
- UNKNOWN + missing → **Pass**.
- UNKNOWN + supplied valid → **Sjekk**.

## 27. Byggemetode

**Scope:** point

Approved values:

`B, BU, E, E0, E1, G, K, M, MU, P, S, SU, UK, V, W`

Current APPLICABLE Tema:

`KUM, SAN, SLS, SLU, LOK, KUMI, SANI, SLI, SLG, KOTREKUM, MKS, MKV, PMK, PMKAF, PMKOV, PMKSP, PMKVL, RED`

Current NOT_APPLICABLE Tema:

`STR, KRN`

- APPLICABLE + missing → **Feil**.
- APPLICABLE + valid code except `UK` → **Pass**.
- `UK` → **Sjekk**.
- Invalid / unlisted → **Feil**.
- NOT_APPLICABLE + supplied valid → **Sjekk**.
- UNKNOWN + missing → **Pass**.
- UNKNOWN + supplied valid → **Sjekk**.

## 28. Adkomst

**Scope:** point

Approved values:

`DO, NG, NT, ST, UTENST`

- Exact `Tema = KUM` + missing → **Sjekk**.
- `KUM` + valid value → **Pass**.
- Invalid / unlisted → **Feil**.
- Non-`KUM` + missing → **Pass**.
- Non-`KUM` + valid supplied value → **Sjekk** because it probably should not be present.

## 29. Kjegle

**Scope:** point

Approved values:

`E, R, S, T, U`

APPLICABLE Tema:

`KUM, SAN, SLS, SLU, KUMI, SANI, SLI, SLG, KOTREKUM, MKS, MKV, PMK, PMKAF, PMKOV, PMKSP, PMKVL, RED`

NOT_APPLICABLE Tema:

`LOK, STR, KRN`

- APPLICABLE + missing → **Feil**.
- APPLICABLE + any valid listed code → **Pass**.
- Invalid / unlisted → **Feil**.
- NOT_APPLICABLE + supplied valid → **Sjekk**.
- UNKNOWN + missing → **Pass**.
- UNKNOWN + supplied valid → **Sjekk**.

## 30. AnleggsID

**Scope:** point

Treat similarly to an informational/comment field.

- Missing → **Pass**.
- Any supplied value → **Sjekk**.
- No format validation for now.
- `AnleggsID` itself should not generate **Feil**.
- The UI explanation must state that **Sjekk is informational highlighting**, not an indication that the value is suspected to be wrong.
- Future use may include associating `LOK` / `TOP` objects with a parent installation and simple GMI attribute editing, but that is outside this baseline.

## 31. S_HYPERLINK

**Scope:** point + line field, but current conditional policy is Tema-driven.

Use the Byggemetode APPLICABLE Tema set as the normal set where a hyperlink/attachment is expected, with explicit `LOK`/`TOP` overrides.

### Normal expectation

For Byggemetode-applicable Tema other than the explicit exceptions below:

- Missing hyperlink → **Sjekk**.
- Hyperlink present → **Pass**.

### Explicit Gemini VA exceptions

- `LOK` + hyperlink present → **Feil**.
- `TOP` + hyperlink present → **Feil**.
- `LOK` / `TOP` + no hyperlink → **Pass**.
- Error explanation should state that Gemini VA does not support attachments/vedlegg on kumlokk (`LOK`/`TOP`) and the hyperlink should be removed.

### Other Tema

- Missing → **Pass**.
- Supplied → **Pass** for now.
- No URL/path syntax validation yet.

## 32. NOBB-VAVVS-nr

**Scope:** point + line

- Optional.
- Missing → **Pass**.
- Supplied integer → **Pass**.
- Supplied non-integer / malformed → **Feil**.
- No plausibility, digit-length, or catalogue lookup as part of validation.
- In table/details UI, a supplied number should be rendered as a clickable link to the associated `nobb.no` item page.

## 33. NOBB-VAVVS-nr-ramme

**Scope:** point

Same treatment as `NOBB-VAVVS-nr`:

- Missing → **Pass**.
- Supplied integer → **Pass**.
- Supplied non-integer / malformed → **Feil**.
- No plausibility, digit-length, or catalogue lookup as part of validation.
- In table/details UI, a supplied number should be rendered as a clickable link to the associated `nobb.no` item page.

---

# D. Line-specific fields

## 34. Nett_type

**Scope:** line

Approved values:

`F, H, O, O1, O2, S, S6, S7`

- Missing → **Feil**.
- `F`, `H`, `O`, `S` → **Pass**.
- `O1`, `O2`, `S6`, `S7` → **Sjekk**.
- Invalid / unlisted → **Feil**.
- Sjekk explanation should say the code is valid but uncommon and should be manually confirmed.

## 35. Material

**Scope:** line

- Required.
- Missing → **Feil**.
- Invalid / unlisted → **Feil**.

### Common materials that Pass

`BET, PE, PE100, PERC, PP, PVC, PVC-O, PVC-U, SJK`

### Valid materials that should Sjekk

- `AN` → **Sjekk** specifically because “Annet” is not considered sufficiently specific.
- Every other valid Material code not in the Pass list above → **Sjekk**.

The Sjekk result means “valid but uncommon / insufficiently specific; confirm manually”, not “invalid”.

The complete v3.2 Material list remains authoritative for validity:

`AAS, ABS, AN, ATF, BET, FJE, GRP, GSE, GUP, ICO, KISVEIT, KOMPOS, LER, MCU, MGA, MRS, MSF, MST, PE, PE32, PE50, PE80, PE100, PE100-RC-PP0, PEH, PEH_PEM, PEL, PEM, PERC, PLAST, PP, PVC, PVC-O, PVC-U, RDEL, SJ, SJG, SJK, STA, STF, STG, TEG, TNA, TRE, UK`

## 36. Dimensjon

**Scope:** line

- Required.
- Integer millimetres.
- Missing → **Feil**.
- Negative / decimal / malformed → **Feil**.
- `0–31 mm` → **Sjekk**.
- `>=32 mm` → **Pass**.

The low-dimension threshold is a plausibility warning, not a strict statement that smaller dimensions are impossible.

## 37. VertikalDimensjon

**Scope:** line, dependent on valid `Rørform`.

- `Rørform = S` + missing → **Pass**.
- `Rørform = S` + supplied valid integer → **Sjekk** because VertikalDimensjon normally should not be present for a circular pipe.
- `Rørform != S` + missing → **Feil**.
- `Rørform != S` + integer `1–30` → **Sjekk**.
- `Rørform != S` + integer `>=31` → **Pass**.
- `0`, negative, decimal, or malformed → **Feil**.

If `Rørform` itself is unresolved/invalid, the planner should avoid cascading duplicate dependent findings and define a clear suppression strategy.

## 38. Rørform

**Scope:** line

Approved values:

`A, E, F, R, S, T, X`

- Missing → **Feil**.
- `S` → **Pass**.
- `E`, `F`, `R`, `T` → **Pass**.
- `A` (“Annet”) → **Sjekk**.
- `X` (“Spesiell form”) → **Sjekk**.
- Invalid / unlisted → **Feil**.

## 39. SDR

**Scope:** line, cross-field classification by Tema + Material.

Approved values:

`6.0, 7.4, 7.5, 9.0, 11.0, 13.6, 17.0, 17.6, 21.0, 26.0, 33.0, 34.0, 41.0`

### Confirmed pressure Tema concept

- Water pressure lines: the `VL...` Tema family.
- Pumped wastewater examples: `AFP`, `I2P`, `OVP`, `SPP`.
- Suction examples requiring manual uncertainty handling: `AFS`, `I2S`, `SPS`.

### Confirmed PE/PVC-family material scope for SDR

At minimum, SDR applicability is confirmed for:

`PE, PE32, PE50, PE80, PE100, PE100-RC-PP0, PEH, PEH_PEM, PEL, PEM, PERC, PVC, PVC-O, PVC-U`

Do **not** silently broaden the SDR material classifier beyond this confirmed set during implementation planning. The broader Ringstivhet plastic-family list below was separately confirmed.

### Rule

- Confirmed plastic pressure pipe + missing SDR → **Feil**.
- Confirmed plastic pressure pipe + approved SDR → **Pass**.
- Supplied invalid / unlisted SDR → **Feil**.
- Suction Tema (`AFS`, `I2S`, `SPS`, etc.) → **Sjekk** whether SDR is present or absent; explain that applicability is uncertain and must be manually confirmed.
- SDR supplied on a clearly non-pressure or non-plastic pipe → **Sjekk**, explaining that SDR probably should not be present.
- Clearly non-applicable pipe + no SDR → **Pass**.

Important interpretation: SDR is required for pressure pipes in the instruction, but an SDR value can exist in engineering/product data for some non-pressure plastic pipes. Therefore presence on a non-pressure pipe is **Sjekk**, not automatically Feil.

## 40. Ringstivhet

**Scope:** line, cross-field classification by Tema + Material.

Approved values:

`SN2, SN4, SN5, SN6, SN8, SN10, SN16`

### Confirmed plastic/polymer family for this rule

`ABS, GRP, GSE, GUP, PE, PE32, PE50, PE80, PE100, PE100-RC-PP0, PEH, PEH_PEM, PEL, PEM, PERC, PLAST, PP, PVC, PVC-O, PVC-U`

This deliberately includes `GRP` and `GUP`.

### Classification architecture

Do **not** implement Ringstivhet as a blind binary inverse of the pressure list. Use three Tema buckets:

1. **Pressure** — e.g. `VL...`, `AFP`, `I2P`, `OVP`, `SPP`.
2. **Suction / uncertain pressure** — e.g. `AFS`, `I2S`, `SPS`.
3. **Confidently gravity/self-fall** — explicit Tema confirmed as ordinary self-fall lines.

Special/non-standard Tema that are neither confidently pressure nor confidently gravity should remain uncertain rather than being forced into the gravity bucket.

### Rule

- Plastic-family + confidently gravity/self-fall Tema + missing Ringstivhet → **Feil**.
- Plastic-family + confidently gravity/self-fall Tema + approved SN value → **Pass**.
- Invalid / unlisted Ringstivhet → **Feil**.
- Pressure pipe + Ringstivhet present → **Sjekk**.
- Non-plastic pipe + Ringstivhet present → **Sjekk**.
- Suction / uncertain / special Tema → **Sjekk** where the field relationship needs manual confirmation rather than a hard classification.
- Clearly non-applicable + missing → **Pass**.

The implementation plan should derive and present the proposed explicit gravity/self-fall Tema set for domain confirmation before hard-coding it.

## 41. Trykklasse

**Scope:** line, Tema-driven pressure classification; not limited to plastic material.

Approved values:

`PN1, PN2, PN2.5, PN3.2, PN4, PN5, PN6, PN6.3, PN8, PN10, PN12, PN12.5, PN16, PN20, PN25`

Pressure Tema concept:

- `VL...` water lines.
- Pumped wastewater examples such as `AFP`, `I2P`, `OVP`, `SPP`.

Rule:

- Pressure Tema + missing Trykklasse → **Sjekk** because the field is optional but desirable.
- Pressure Tema + valid Trykklasse → **Pass**.
- Invalid / unlisted Trykklasse → **Feil**.
- Non-pressure Tema + Trykklasse present → **Sjekk**, explaining that it probably should not be present.
- Non-pressure Tema + missing → **Pass**.
- Suction Tema such as `AFS`, `I2S`, `SPS` → **Sjekk** because applicability is uncertain.

---

# E. Settled Batch 4 hydraulic policy

Every approved current line Tema is classified only from Tema: **GRAVITY** is `AF, AFO, DR, I2D, I2I, I2O, OV, OVF, OVI, OVKU, OVO, OVR, OVS, SP, SPGRÅ, SPI, SPO`; **PRESSURE** is `AFP, I2P, OVP, SPP, VL, VLBO, VLI, VLK, VLP, VLSPR, VLT, VLU`; every other approved line Tema is **SPECIAL**. Totals are 17 Gravity, 12 Pressure, 79 Special, 108 total.

SDR values are `6.0, 7.4, 7.5, 9.0, 11.0, 13.6, 17.0, 17.6, 21.0, 26.0, 33.0, 34.0, 41.0`. Its material family is `PE, PE32, PE50, PE80, PE100, PE100-RC-PP0, PEH, PEH_PEM, PEL, PEM, PERC, PVC, PVC-O, PVC-U`. Pressure+family requires SDR (valid Pass); Pressure+non-family and Gravity have missing Pass / supplied valid Sjekk; Special is Sjekk whether missing or valid; invalid is Feil. Plain decimal equivalents are accepted.

Ringstivhet values are `SN2, SN4, SN5, SN6, SN8, SN10, SN16`. Its family is `ABS, GRP, GSE, GUP, PE, PE32, PE50, PE80, PE100, PE100-RC-PP0, PEH, PEH_PEM, PEL, PEM, PERC, PLAST, PP, PVC, PVC-O, PVC-U`. Gravity+family requires it (valid Pass); Gravity+non-family and Pressure have missing Pass / valid Sjekk; Special is Sjekk whether missing or valid; invalid is Feil.

Trykklasse values are `PN1, PN2, PN2.5, PN3.2, PN4, PN5, PN6, PN6.3, PN8, PN10, PN12, PN12.5, PN16, PN20, PN25`. Pressure has valid Pass and missing Sjekk; Gravity has missing Pass and valid Sjekk; Special is Sjekk whether missing or valid; invalid is Feil. It does not depend on Material.

If Tema is unresolved, hydraulic contextual outcomes are suppressed, though invalid supplied hydraulic values remain Feil. If Material is unresolved or invalid, SDR/Ringstivhet applicability is suppressed, again retaining independently invalid supplied values as Feil.

# F. Cross-field classifiers and evaluation order

The changes are now sufficiently interdependent that they should be planned as shared classifiers rather than as 41 isolated one-off rules.

Recommended conceptual evaluation order:

1. Parse and isolate file/layer/geometry safely.
2. Resolve `Tema` identity from `Tema` / `S_FCODE` as an early gate.
3. Validate independent common fields.
4. Build reusable point applicability decisions.
5. Build reusable line classifiers:
   - pressure Tema
   - suction/uncertain Tema
   - confidently gravity/self-fall Tema
   - SDR PE/PVC material family
   - Ringstivhet plastic/polymer family
6. Evaluate Tema-dependent point fields (`Type`, `Kumform`, `Bredde`, `Tykkelse`, `Byggemetode`, `Kjegle`, etc.).
7. Evaluate line relationship fields (`VertikalDimensjon`, `SDR`, `Ringstivhet`, `Trykklasse`).
8. Run dataset-level cross-object plausibility such as `Stedfestingsårsak` ↔ `Anleggsår`.
9. Project findings into the UI using only **Feil / Sjekk / Pass**.

## Cascading / duplicate finding principle

Where a classifier field is unresolved or already owns the underlying problem, dependent rules should avoid generating repeated copies of the same warning. The clearest example is a Tema/S_FCODE conflict: dependent Tema rules should not all repeat that conflict.

---

# F. UI / information-view changes that belong with this baseline

These are not all validation rules, but they were explicitly requested during the review:

- `Innmålt_av`: show unique values + counts.
- `Saksnummer`: show unique values + counts.
- `Merknad`: make supplied comments easy to see.
- `AnleggsID`: supplied value should be visibly highlighted as informational **Sjekk**, with wording that it is not suspected to be wrong.
- `Synbarhet`: keep visible if present, but de-emphasize / move later and explain that it is retired in v3.2.
- `NOBB-VAVVS-nr`: render supplied values as clickable links to the corresponding NOBB item page.
- `NOBB-VAVVS-nr-ramme`: same clickable-link treatment.
- `S_HYPERLINK`: no general URL/path parser yet; preserve/display the value and implement the agreed Tema-based presence rules.

---

# G. Items the planner should explicitly preserve or resolve

These are not reasons to block planning, but they should be visible in the plan:

1. **Tema/S_FCODE architecture changes substantially.** Current direct-Tema-preferred fallback behaviour must be replaced by interchangeable-source resolution with coexistence/conflict handling.
2. **Applicability metadata must become runtime-consumed**, while retaining field-specific differences such as `LOK` being applicable to Byggemetode but not Kumform/Kjegle.
3. **Ringstivhet gravity Tema list is not yet explicitly enumerated.** The planner should derive a conservative candidate list from the authoritative 108 line Tema values and present it for domain review before implementation.
4. **SDR material scope is narrower than the separately confirmed Ringstivhet plastic-family scope.** Do not merge them automatically.
5. **Tykkelse line source-format discrepancy** should be called out rather than silently changing the agreed integer baseline.
6. **Merknad scope:** the canonical field is point + line, but current implementation coverage has historically been point-only. The plan should make the geometry coverage explicit.
7. **Sjekk semantics must remain explanatory.** Many new Sjekk cases mean “valid but unusual / please inspect”, not “probably invalid”.
8. **Current-year and five-year rules are dynamic**, not hard-coded to 2026.
9. **Exact value lists remain exact.** Do not introduce trimming, aliasing, case-folding, punctuation rewriting, or value substitution unless explicitly approved.

---

# H. Suggested next planning step

This specification is now broad enough that the next sensible step is a **planning-only architecture review** before implementation.

Astra should be asked to:

- inspect the current Validator 2.0 branch and tests;
- compare existing runtime behaviour with this specification;
- identify shared classifiers / reusable evaluators instead of duplicating field-specific conditionals;
- identify rules that can be implemented safely in independent batches;
- identify migration risks to result ownership, Field Info, geometry isolation, layer isolation, and current test invariants;
- propose the exact conservative pressure / suction / gravity Tema classification approach;
- call out any decision in this document that is technically ambiguous rather than silently resolving it;
- produce a phased implementation plan only — **no code changes, no commit, no push, no merge, no deployment**.
