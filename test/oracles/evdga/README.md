eVDGA oracle fixtures live here.

Current coverage comes in two layers:

- workflow tests render the bundle, decode the oracle plan and report with
  Effect Schema, and run the shared local FHIR checks through the integration
  API
- mirror-backed fixture sweeps execute the official eVDGA example archive
  through the real validator and assert the published negative PKV example
  fails
