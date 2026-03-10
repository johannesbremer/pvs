import { GenericId } from "@confect/core";
import { Schema } from "effect";

import { unsafeMakeTable } from "./makeTable";
import {
  CodeableConceptValue,
  IsoDate,
  IsoDateTime,
  QuantityValue,
} from "./primitives";

export const MedicationCatalogRefsFields = Schema.Struct({
  sourcePackageId: GenericId.GenericId("masterDataPackages"),
  pzn: Schema.String,
  displayName: Schema.String,
  doseForm: Schema.optional(CodeableConceptValue),
  activeIngredientText: Schema.optional(Schema.String),
  strengthText: Schema.optional(Schema.String),
  packageSizeValue: Schema.optional(Schema.Number),
  packageSizeUnit: Schema.optional(Schema.String),
  normGroesse: Schema.optional(Schema.String),
  articleStatus: Schema.optional(Schema.String),
  isPrescriptionOnly: Schema.optional(Schema.Boolean),
  isApothekenpflichtig: Schema.optional(Schema.Boolean),
  isBtm: Schema.optional(Schema.Boolean),
  isTRezept: Schema.optional(Schema.Boolean),
  manufacturer: Schema.optional(Schema.String),
  atcCode: Schema.optional(Schema.String),
  priceAvp: Schema.optional(Schema.Number),
  regionalArvFlags: Schema.Array(Schema.String),
});

export const MedicationCatalogRefs = unsafeMakeTable(
  "medicationCatalogRefs",
  MedicationCatalogRefsFields,
)
  .index("by_pzn", ["pzn"])
  .index("by_atcCode", ["atcCode"]);

export const HousePharmacyItemsFields = Schema.Struct({
  organizationId: GenericId.GenericId("organizations"),
  pzn: Schema.String,
  rank: Schema.optional(Schema.Number),
  isPreferred: Schema.Boolean,
  note: Schema.optional(Schema.String),
});

export const HousePharmacyItems = unsafeMakeTable(
  "housePharmacyItems",
  HousePharmacyItemsFields,
).index("by_organizationId_and_pzn", ["organizationId", "pzn"]);

export const MedicationOrdersFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  encounterId: Schema.optional(GenericId.GenericId("encounters")),
  billingCaseId: Schema.optional(GenericId.GenericId("billingCases")),
  coverageId: GenericId.GenericId("coverages"),
  practitionerId: GenericId.GenericId("practitioners"),
  preparerPractitionerId: Schema.optional(GenericId.GenericId("practitioners")),
  signerPractitionerId: Schema.optional(GenericId.GenericId("practitioners")),
  organizationId: GenericId.GenericId("organizations"),
  orderKind: Schema.Literal("pzn", "ingredient", "compounding", "freetext"),
  prescriptionMode: Schema.Literal("paper", "electronic", "fallback-paper"),
  prescriptionContext: Schema.Literal(
    "regular",
    "practice-supply",
    "home-visit",
    "care-home",
    "technical-fallback",
  ),
  status: Schema.Literal("draft", "final", "cancelled", "superseded"),
  authoredOn: IsoDateTime,
  medicationCatalogRefId: Schema.optional(GenericId.GenericId("medicationCatalogRefs")),
  freeTextMedication: Schema.optional(Schema.String),
  dosageText: Schema.optional(Schema.String),
  quantity: Schema.optional(QuantityValue),
  packageCount: Schema.optional(Schema.Number),
  packagingText: Schema.optional(Schema.String),
  substitutionAllowed: Schema.optional(Schema.Boolean),
  statusCoPaymentCode: Schema.optional(Schema.String),
  legalBasisCode: Schema.optional(Schema.String),
  serFlag: Schema.optional(Schema.Boolean),
  accidentInfo: Schema.optional(
    Schema.Struct({
      isAccident: Schema.Boolean,
      isWorkAccident: Schema.optional(Schema.Boolean),
      employerName: Schema.optional(Schema.String),
      accidentDate: Schema.optional(IsoDate),
      accidentLocation: Schema.optional(Schema.String),
    }),
  ),
  specialRecipeType: Schema.optional(Schema.Literal("btm", "t-rezept", "none")),
  vaccineFlag: Schema.optional(Schema.Boolean),
  sprechstundenbedarfFlag: Schema.optional(Schema.Boolean),
  emergencyServicesFee: Schema.optional(Schema.Boolean),
  multiplePrescription: Schema.optional(
    Schema.Struct({
      enabled: Schema.Boolean,
      numerator: Schema.optional(Schema.Number),
      denominator: Schema.optional(Schema.Number),
      redeemFrom: Schema.optional(IsoDate),
      redeemUntil: Schema.optional(IsoDate),
      seriesIdentifier: Schema.optional(Schema.String),
    }),
  ),
  artifactDocumentId: Schema.optional(GenericId.GenericId("clinicalDocuments")),
});

export const MedicationOrders = unsafeMakeTable(
  "medicationOrders",
  MedicationOrdersFields,
)
  .index("by_patientId_and_authoredOn", ["patientId", "authoredOn"])
  .index("by_orderKind_and_status", ["orderKind", "status"])
  .index("by_medicationCatalogRefId", ["medicationCatalogRefId"]);

export const MedicationPlansFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  status: Schema.Literal("current", "superseded"),
  sourceKind: Schema.Literal("structured", "bmp-xml", "bmp-barcode", "vos"),
  bmpVersion: Schema.optional(Schema.String),
  documentIdentifier: Schema.optional(Schema.String),
  setIdentifier: Schema.optional(Schema.String),
  issuerPractitionerId: Schema.optional(GenericId.GenericId("practitioners")),
  issuingOrganizationId: Schema.optional(GenericId.GenericId("organizations")),
  barcodePayload: Schema.optional(Schema.String),
  sourceArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  patientPrintArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  updatedAt: IsoDateTime,
});

export const MedicationPlans = unsafeMakeTable(
  "medicationPlans",
  MedicationPlansFields,
).index("by_patientId_and_status", ["patientId", "status"]);

export const MedicationPlanEntriesFields = Schema.Struct({
  planId: GenericId.GenericId("medicationPlans"),
  sortOrder: Schema.Number,
  entrySource: Schema.Literal(
    "own-prescription",
    "external-prescription",
    "self-medication",
    "imported-plan",
  ),
  basedOnMedicationOrderId: Schema.optional(GenericId.GenericId("medicationOrders")),
  productCode: Schema.optional(Schema.String),
  displayName: Schema.String,
  activeIngredientText: Schema.optional(Schema.String),
  strengthText: Schema.optional(Schema.String),
  doseFormText: Schema.optional(Schema.String),
  dosageText: Schema.optional(Schema.String),
  indicationText: Schema.optional(Schema.String),
  printOnPlan: Schema.Boolean,
  hasBoundSupplementLine: Schema.Boolean,
  supplementLineText: Schema.optional(Schema.String),
  isRecipePreparation: Schema.Boolean,
});

export const MedicationPlanEntries = unsafeMakeTable(
  "medicationPlanEntries",
  MedicationPlanEntriesFields,
).index("by_planId_and_sortOrder", ["planId", "sortOrder"]);

export const DigaCatalogRefsFields = Schema.Struct({
  sourcePackageId: GenericId.GenericId("masterDataPackages"),
  pzn: Schema.String,
  verordnungseinheitName: Schema.String,
  digaName: Schema.optional(Schema.String),
  digaModulName: Schema.optional(Schema.String),
  statusImVerzeichnis: Schema.optional(Schema.String),
  indikationen: Schema.Array(CodeableConceptValue),
  kontraindikationen: Schema.Array(CodeableConceptValue),
  notIndicatedGenders: Schema.Array(Schema.String),
  ageGroups: Schema.Array(Schema.String),
  usageDurationText: Schema.optional(Schema.String),
  price: Schema.optional(Schema.Number),
  additionalCoCost: Schema.optional(Schema.Number),
  manufacturerName: Schema.optional(Schema.String),
});

export const DigaCatalogRefs = unsafeMakeTable(
  "digaCatalogRefs",
  DigaCatalogRefsFields,
).index("by_pzn", ["pzn"]);

export const DigaOrdersFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  coverageId: GenericId.GenericId("coverages"),
  practitionerId: GenericId.GenericId("practitioners"),
  organizationId: GenericId.GenericId("organizations"),
  digaCatalogRefId: GenericId.GenericId("digaCatalogRefs"),
  authoredOn: IsoDateTime,
  status: Schema.Literal("draft", "final", "cancelled", "superseded"),
  serFlag: Schema.optional(Schema.Boolean),
  legalBasisCode: Schema.optional(Schema.String),
  artifactDocumentId: Schema.optional(GenericId.GenericId("clinicalDocuments")),
});

export const DigaOrders = unsafeMakeTable("digaOrders", DigaOrdersFields)
  .index("by_patientId_and_authoredOn", ["patientId", "authoredOn"])
  .index("by_digaCatalogRefId", ["digaCatalogRefId"]);

export const HeilmittelCatalogRefsFields = Schema.Struct({
  sourcePackageId: GenericId.GenericId("masterDataPackages"),
  heilmittelbereich: Schema.String,
  diagnosegruppe: Schema.String,
  heilmittelCode: Schema.String,
  displayName: Schema.String,
  isVorrangig: Schema.Boolean,
  isErgaenzend: Schema.Boolean,
  positionsnummern: Schema.Array(Schema.String),
  orientierendeBehandlungsmenge: Schema.optional(Schema.Number),
  blankoEligible: Schema.optional(Schema.Boolean),
  specialNeedText: Schema.optional(Schema.String),
  longTermNeedText: Schema.optional(Schema.String),
});

export const HeilmittelCatalogRefs = unsafeMakeTable(
  "heilmittelCatalogRefs",
  HeilmittelCatalogRefsFields,
)
  .index("by_heilmittelbereich_and_heilmittelCode", [
    "heilmittelbereich",
    "heilmittelCode",
  ])
  .index("by_diagnosegruppe", ["diagnosegruppe"]);

export const HeilmittelApprovalsFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  approvalType: Schema.Literal("long-term", "special-need", "other"),
  validFrom: Schema.optional(IsoDate),
  validTo: Schema.optional(IsoDate),
  icdCodes: Schema.Array(Schema.String),
  diagnosegruppen: Schema.Array(Schema.String),
  heilmittelCodes: Schema.Array(Schema.String),
  issuerDisplay: Schema.optional(Schema.String),
  artifactId: Schema.optional(GenericId.GenericId("artifacts")),
});

export const HeilmittelApprovals = unsafeMakeTable(
  "heilmittelApprovals",
  HeilmittelApprovalsFields,
).index("by_patientId_and_validTo", ["patientId", "validTo"]);

export const HeilmittelOrdersFields = Schema.Struct({
  patientId: GenericId.GenericId("patients"),
  coverageId: GenericId.GenericId("coverages"),
  practitionerId: GenericId.GenericId("practitioners"),
  organizationId: GenericId.GenericId("organizations"),
  issueDate: IsoDate,
  status: Schema.Literal("draft", "final", "cancelled", "superseded"),
  diagnosisIds: Schema.Array(GenericId.GenericId("diagnoses")),
  diagnosegruppe: Schema.String,
  heilmittelbereich: Schema.String,
  vorrangigeHeilmittelCodes: Schema.Array(Schema.String),
  ergaenzendeHeilmittelCodes: Schema.Array(Schema.String),
  standardisierteKombinationCode: Schema.optional(Schema.String),
  verordnungsmenge: Schema.optional(Schema.Number),
  frequenzText: Schema.optional(Schema.String),
  hausbesuch: Schema.optional(Schema.Boolean),
  therapiebericht: Schema.optional(Schema.Boolean),
  specialNeedFlag: Schema.optional(Schema.Boolean),
  longTermNeedFlag: Schema.optional(Schema.Boolean),
  blankoFlag: Schema.optional(Schema.Boolean),
  approvalId: Schema.optional(GenericId.GenericId("heilmittelApprovals")),
  stornoDate: Schema.optional(IsoDate),
  artifactDocumentId: Schema.optional(GenericId.GenericId("clinicalDocuments")),
});

export const HeilmittelOrders = unsafeMakeTable(
  "heilmittelOrders",
  HeilmittelOrdersFields,
)
  .index("by_patientId_and_issueDate", ["patientId", "issueDate"])
  .index("by_diagnosegruppe", ["diagnosegruppe"]);

export const PrescribingTables = [
  MedicationCatalogRefs,
  HousePharmacyItems,
  MedicationOrders,
  MedicationPlans,
  MedicationPlanEntries,
  DigaCatalogRefs,
  DigaOrders,
  HeilmittelCatalogRefs,
  HeilmittelApprovals,
  HeilmittelOrders,
] as const;
