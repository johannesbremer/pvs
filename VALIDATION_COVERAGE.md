# Validation Coverage

Status as of 2026-03-10.

This file is intentionally blunt. "Implemented" means there is code. "Validated" means we actually execute an oracle or fixture sweep that proves something beyond type safety.

## Coverage Matrix

| Area | Canonical model | Runtime workflow | Oracle status | Test status | Current note |
| --- | --- | --- | --- | --- | --- |
| VSD / eGK / eEB adoption | Yes | Yes | None | Yes | Patient, identifier, coverage, and VSD snapshot workflows are covered by unit-style integration tests. |
| ICD / coding | Yes | Yes | Local only | Yes | Diagnosis lifecycle and persisted coding evaluations exist; no SDICD/SDKH/SDKRW executable oracle yet. |
| KVDT billing seam | Yes | Partial | Executable XPM + XKM | Yes | Official `.con` fixtures from the XPM package are covered in automated cold-start and warm-cache tests, including both positive and negative validator cases. |
| Arzneimittel / eRezept canonical order | Yes | Yes | Executable FHIR | Yes | The full official Q3_2026 ERP XML archive now runs through the real validator and completes without error findings in the automated suite. |
| eAU canonical documents | Yes | Yes | Executable FHIR | Yes | Official eAU examples validate via the executable FHIR path from an empty cache. |
| BMP | Yes | Partial | Executable XSD | Yes | Official BMP example XMLs are covered through the downloaded KBV XSD package and example archive. |
| Heilmittel canonical orders | Yes | Yes | Official fixture-backed | Yes | Local oracle checks now run official KBV Heilmittel Prüfpaket-derived fixtures for blanko handling, approvals, and quantity limits. |
| BFB / form rendering | Schema only | Partial | Fixture-backed local | Minimal | Registry and form instances exist, but there is no real BFB renderer/barcode oracle yet. |
| Documents / revisions / artifacts | Yes | Yes | Indirect | Yes | Immutability and issuance flows are tested through medication/eAU/heilmittel flows. |
| Ti / KIM / mailboxes | Yes | Minimal | None | No | Schema is present; production workflows are largely unimplemented. |
| eVDGA | Yes | Minimal | None | No | Schema is present; emitter/oracle work is not implemented. |
| VoS | Yes | Minimal | None | No | Schema is present; transport/runtime behavior is not implemented. |
| TSS | Yes | Minimal | None | No | Appointments and billing seam exist, but no TSS adapter/oracle implementation yet. |
| AW-SST | Yes | Minimal | None | No | Historical import/export architecture is modeled, but no validator/import implementation exists. |
| LDT / eArztbrief / 1-Click KIM | Minimal | No | None | No | Out of current implementation scope. |

## What Green Tests Mean

- TypeScript compiles.
- Confect public workflows used in the repo tests behave consistently.
- KBV/HL7 assets are downloaded automatically into `.cache/`.
- Official executable-backed FHIR validation runs from a cold cache.
- A good chunk of official KBV XML examples is validated end to end.

## What Green Tests Do Not Mean

- Full KBV certification readiness.
- Complete coverage of every interface family in `spec.md`.
- Exhaustive quarter/version compatibility.
- Full fidelity of all emitters against every official example set.
- Production-hard handling of all validator warnings, terminology servers, or profile-package combinations.

## Current Executable Fixture Coverage

- `eAU`
  - official `eAU_Beispiele_V1.2.zip`
  - all non-error XML examples are validated through the real `validator_cli`
- `eRezept`
  - official `Q3_2026/eRP_Beispiele_V1.4.zip`
  - the full archive of 62 XML examples is executed through the real `validator_cli`
  - the archive now validates without error findings in the automated suite
  - the previous offline `GeneratedDosageInstructionsMeta.language` / `de-DE` limitation is covered by an injected offline `ValueSet` plus `CodeSystem` support payload
- `KVDT`
  - official `.con` fixtures shipped inside `xpm-kvdt-praxis-2026.2.1.zip`
  - cold-start executable validation downloads XPM/XKM/public keys and validates/packages the official positive example `Z30123456699_27.04.2026_12.00.con`
  - warm-cache sweep covers all shipped `.con` examples and distinguishes positive from negative validator cases
- `BMP`
  - official `BMP_Beispieldateien_V2.8.zip`
  - cold-start executable validation downloads the BMP XSD package and example archive and validates one official XML example with the local Java XSD helper
  - warm-cache sweep validates all official BMP XML examples from the archive against the downloaded XSD
- `Heilmittel`
  - official `KBV_ITA_AHEX_Pruefpaket_Heilmittel.pdf` provides the source cases
  - local oracle fixtures encode named official Prüffälle for:
    - regular physiotherapy orders
    - standard combinations
    - patient-specific long-term approval handling
    - blanko orders
    - quantity-limit failures
    - nutrition therapy

## Highest-Value Remaining Gaps

1. Replace the BFB placeholder with real renderer/barcode oracle checks.
2. Replace the BFB placeholder with real renderer/barcode oracle checks.
3. Add executable or official-fixture coverage for SDICD/SDKH/SDKRW coding master-data validation.

## Machine-Readable Inventory

- checked-in JSON inventory: [tools/oracles/coverage-inventory.json](/Users/johannes/Code/pvs/tools/oracles/coverage-inventory.json)
- stdout helper for CI: `pnpm oracle:coverage-inventory`
