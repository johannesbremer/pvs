import { DatabaseSchema } from "@confect/server";

import {
  Appointments,
  Coverages,
  EebInboxItems,
  Encounters,
  InterfaceProfiles,
  KimMailboxes,
  MasterDataPackages,
  Organizations,
  PatientIdentifiers,
  Patients,
  PracticeLocations,
  PractitionerRoles,
  Practitioners,
  Referrals,
  TiIdentities,
  VsdSnapshots,
} from "./tables/core";
import {
  BillingCases,
  BillingLineItems,
  CodingEvaluations,
  Diagnoses,
  IcdCatalogEntries,
} from "./tables/billing";
import {
  DigaCatalogRefs,
  DigaOrders,
  HeilmittelApprovals,
  HeilmittelCatalogRefs,
  HeilmittelOrders,
  HousePharmacyItems,
  MedicationCatalogRefs,
  MedicationOrders,
  MedicationPlanEntries,
  MedicationPlans,
} from "./tables/prescribing";
import {
  ClinicalDocuments,
  DocumentRevisions,
  FormDefinitions,
  FormInstances,
} from "./tables/forms";
import {
  Artifacts,
  DraftWorkspaces,
  IntegrationEvents,
  IntegrationJobs,
} from "./tables/integration";

export default DatabaseSchema.make()
  .addTable(InterfaceProfiles)
  .addTable(MasterDataPackages)
  .addTable(Organizations)
  .addTable(PracticeLocations)
  .addTable(Practitioners)
  .addTable(PractitionerRoles)
  .addTable(TiIdentities)
  .addTable(KimMailboxes)
  .addTable(Patients)
  .addTable(PatientIdentifiers)
  .addTable(Coverages)
  .addTable(VsdSnapshots)
  .addTable(EebInboxItems)
  .addTable(Appointments)
  .addTable(Encounters)
  .addTable(Referrals)
  .addTable(Diagnoses)
  .addTable(IcdCatalogEntries)
  .addTable(CodingEvaluations)
  .addTable(BillingCases)
  .addTable(BillingLineItems)
  .addTable(MedicationCatalogRefs)
  .addTable(HousePharmacyItems)
  .addTable(MedicationOrders)
  .addTable(MedicationPlans)
  .addTable(MedicationPlanEntries)
  .addTable(DigaCatalogRefs)
  .addTable(DigaOrders)
  .addTable(HeilmittelCatalogRefs)
  .addTable(HeilmittelApprovals)
  .addTable(HeilmittelOrders)
  .addTable(FormDefinitions)
  .addTable(FormInstances)
  .addTable(ClinicalDocuments)
  .addTable(DocumentRevisions)
  .addTable(Artifacts)
  .addTable(IntegrationJobs)
  .addTable(IntegrationEvents)
  .addTable(DraftWorkspaces);
