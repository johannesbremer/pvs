# Validation Coverage

Status as of 2026-03-11.

This file is intentionally blunt. "Implemented" means there is code. "Validated" means we actually execute an oracle or fixture sweep that proves something beyond type safety.

## Coverage Matrix

| Area                                   | Canonical model | Runtime workflow | Oracle status           | Test status | Current note                                                                                                                                                                                                                                                                                           |
| -------------------------------------- | --------------- | ---------------- | ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| VSD / eGK / eEB adoption               | Yes             | Yes              | None                    | Yes         | Patient, identifier, coverage, and VSD snapshot workflows are covered by unit-style integration tests.                                                                                                                                                                                                 |
| ICD / coding                           | Yes             | Yes              | Fixture-backed local    | Yes         | Diagnosis lifecycle and persisted coding evaluations exist, and SDICD/SDKH/SDKRW fixtures now cover rule outcomes plus package integrity, provenance metadata, byte-level sha256 verification, and signature or trust metadata through a shared local oracle. No executable package oracle exists yet. |
| KVDT billing seam                      | Yes             | Partial          | Executable XPM + XKM    | Yes         | Official `.con` fixtures from the XPM package are covered in automated cold-start and warm-cache tests, including both positive and negative validator cases.                                                                                                                                          |
| Arzneimittel / eRezept canonical order | Yes             | Yes              | Executable FHIR         | Yes         | The full official Q3_2026 ERP XML archive now runs through the real validator and completes without error findings in the automated suite.                                                                                                                                                             |
| eAU canonical documents                | Yes             | Yes              | Executable FHIR         | Yes         | Official eAU examples validate via the executable FHIR path from an empty cache.                                                                                                                                                                                                                       |
| BMP                                    | Yes             | Partial          | Executable XSD          | Yes         | Official BMP example XMLs are covered through the downloaded KBV XSD package and example archive.                                                                                                                                                                                                      |
| Heilmittel canonical orders            | Yes             | Yes              | Official fixture-backed | Yes         | Local oracle checks now run official KBV Heilmittel Prüfpaket-derived fixtures for blanko handling, approvals, and quantity limits.                                                                                                                                                                    |
| BFB / form rendering                   | Schema only     | Partial          | Fixture-backed local    | Yes         | Local BFB oracle fixtures now validate deterministic golden template snapshots for field layout, required values, and barcode payload or placement semantics, anchored to the published KBV Blankoformulare assets on `update.kbv.de`. No full certified PDF renderer exists yet.                      |
| Documents / revisions / artifacts      | Yes             | Yes              | Indirect                | Yes         | Immutability and issuance flows are tested through medication/eAU/heilmittel flows.                                                                                                                                                                                                                    |
| Ti / KIM / mailboxes                   | Yes             | Minimal          | None                    | No          | Schema is present; production workflows are largely unimplemented.                                                                                                                                                                                                                                     |
| eVDGA                                  | Yes             | Yes              | None                    | Yes         | DiGA catalog import, canonical order finalization, immutable document issuance, and DeviceRequest-based eVDGA bundle rendering are covered by workflow tests. No dedicated eVDGA oracle is implemented yet.                                                                                            |
| VoS                                    | Yes             | Yes              | None                    | Yes         | Outbound VoS Aufruf-Bundle publication, kID-bounded read/search projection, immutable artifact issuance, and inbound Speicher-Bundle import into medication orders and medication plans are covered by workflow tests.                                                                                 |
| TSS                                    | Yes             | Partial          | Fixture-backed local    | Yes         | Public workflows now cover simulated TSS slot import, listing/filtering/selection, booking, referral consumption, and automatic billing-case plus encounter mapping, with local fixture-backed oracle checks for selection behavior.                                                                   |
| AW-SST                                 | Yes             | Minimal          | None                    | No          | Historical import/export architecture is modeled, but no validator/import implementation exists.                                                                                                                                                                                                       |
| LDT / eArztbrief / 1-Click KIM         | Minimal         | No               | None                    | No          | Out of current implementation scope.                                                                                                                                                                                                                                                                   |

## What Green Tests Mean

- TypeScript compiles.
- Confect public workflows used in the repo tests behave consistently.
- KBV/HL7 assets are downloaded automatically into `.cache/`.
- Core downloaded KBV assets used in the executable suite, including the registered BFB source assets, are hash-pinned and are re-fetched automatically if cached bytes do not match the pinned digest.
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
- `ICD / coding`
  - local fixture-backed coverage exercises the shared SDICD / SDKH / SDKRW evaluator for:
    - billable imported codes
    - unknown codes
    - gender mismatch handling
    - age-bound warnings
    - chronic-diagnosis certainty warnings
    - missing primary diagnosis warnings
  - local fixture-backed package-integrity checks cover:
    - package family/version/source metadata
    - empty package rejection
    - duplicate code rejection
    - invalid effective date ranges
    - invalid age/gender metadata modes
    - artifact content-type, byte-size, and sha256 provenance checks
    - decoded package-byte sha256 and byte-size verification when fixture bytes are present
    - signature status, detached-signature path, expected signer, trust anchor, and certificate digest checks
    - sourcePath alignment with package family and version
- `BFB`
  - local fixture-backed coverage exercises deterministic golden template checks for:
    - template id and version parity
    - required positioned fields and exact layout boxes
    - page-count parity
    - barcode placement and payload-prefix expectations
- `TSS`
  - local fixture-backed coverage exercises:
    - TSS appointment filtering by vermittlungscode, service type, and time range
    - selectable-slot determination for proposed TSS appointments
    - booking semantics through the public appointments/referrals seam

## Highest-Value Remaining Gaps

1. Add executable package authenticity or signature validation for SDICD/SDKH/SDKRW coding master-data imports.
2. Move BFB from golden template parity to actual renderer or artifact comparison against certified output.
3. Move TSS from local fixture-backed selection semantics to a real transport adapter and Prüfpaket-backed exchange flow.
4. Add a dedicated eVDGA oracle or executable validation path once pinned official validator assets are available.

## Machine-Readable Inventory

- checked-in JSON inventory: [tools/oracles/coverage-inventory.json](/Users/johannes/Code/pvs/tools/oracles/coverage-inventory.json)
- stdout helper for CI: `pnpm oracle:coverage-inventory`
