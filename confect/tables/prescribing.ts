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
  activeIngredientText: Schema.optional(Schema.String),
  articleStatus: Schema.optional(Schema.String),
  atcCode: Schema.optional(Schema.String),
  displayName: Schema.String,
  doseForm: Schema.optional(CodeableConceptValue),
  isApothekenpflichtig: Schema.optional(Schema.Boolean),
  isBtm: Schema.optional(Schema.Boolean),
  isPrescriptionOnly: Schema.optional(Schema.Boolean),
  isTRezept: Schema.optional(Schema.Boolean),
  manufacturer: Schema.optional(Schema.String),
  normGroesse: Schema.optional(Schema.String),
  packageSizeUnit: Schema.optional(Schema.String),
  packageSizeValue: Schema.optional(Schema.Number),
  priceAvp: Schema.optional(Schema.Number),
  pzn: Schema.String,
  regionalArvFlags: Schema.Array(Schema.String),
  sourcePackageId: GenericId.GenericId("masterDataPackages"),
  strengthText: Schema.optional(Schema.String),
});

export const MedicationCatalogRefs = unsafeMakeTable(
  "medicationCatalogRefs",
  MedicationCatalogRefsFields,
)
  .index("by_pzn", ["pzn"])
  .index("by_atcCode", ["atcCode"]);

export const HousePharmacyItemsFields = Schema.Struct({
  isPreferred: Schema.Boolean,
  note: Schema.optional(Schema.String),
  organizationId: GenericId.GenericId("organizations"),
  pzn: Schema.String,
  rank: Schema.optional(Schema.Number),
});

export const HousePharmacyItems = unsafeMakeTable(
  "housePharmacyItems",
  HousePharmacyItemsFields,
).index("by_organizationId_and_pzn", ["organizationId", "pzn"]);

export const MedicationOrdersFields = Schema.Struct({
  accidentInfo: Schema.optional(
    Schema.Struct({
      accidentDate: Schema.optional(IsoDate),
      accidentLocation: Schema.optional(Schema.String),
      employerName: Schema.optional(Schema.String),
      isAccident: Schema.Boolean,
      isWorkAccident: Schema.optional(Schema.Boolean),
    }),
  ),
  artifactDocumentId: Schema.optional(GenericId.GenericId("clinicalDocuments")),
  authoredOn: IsoDateTime,
  billingCaseId: Schema.optional(GenericId.GenericId("billingCases")),
  coverageId: GenericId.GenericId("coverages"),
  dosageText: Schema.optional(Schema.String),
  emergencyServicesFee: Schema.optional(Schema.Boolean),
  encounterId: Schema.optional(GenericId.GenericId("encounters")),
  freeTextMedication: Schema.optional(Schema.String),
  legalBasisCode: Schema.optional(Schema.String),
  medicationCatalogRefId: Schema.optional(
    GenericId.GenericId("medicationCatalogRefs"),
  ),
  multiplePrescription: Schema.optional(
    Schema.Struct({
      denominator: Schema.optional(Schema.Number),
      enabled: Schema.Boolean,
      numerator: Schema.optional(Schema.Number),
      redeemFrom: Schema.optional(IsoDate),
      redeemUntil: Schema.optional(IsoDate),
      seriesIdentifier: Schema.optional(Schema.String),
    }),
  ),
  orderKind: Schema.Literal("pzn", "ingredient", "compounding", "freetext"),
  organizationId: GenericId.GenericId("organizations"),
  packageCount: Schema.optional(Schema.Number),
  packagingText: Schema.optional(Schema.String),
  patientId: GenericId.GenericId("patients"),
  practitionerId: GenericId.GenericId("practitioners"),
  preparerPractitionerId: Schema.optional(GenericId.GenericId("practitioners")),
  prescriptionContext: Schema.Literal(
    "regular",
    "practice-supply",
    "home-visit",
    "care-home",
    "technical-fallback",
  ),
  prescriptionMode: Schema.Literal("paper", "electronic", "fallback-paper"),
  quantity: Schema.optional(QuantityValue),
  serFlag: Schema.optional(Schema.Boolean),
  signerPractitionerId: Schema.optional(GenericId.GenericId("practitioners")),
  specialRecipeType: Schema.optional(Schema.Literal("btm", "t-rezept", "none")),
  sprechstundenbedarfFlag: Schema.optional(Schema.Boolean),
  status: Schema.Literal("draft", "final", "cancelled", "superseded"),
  statusCoPaymentCode: Schema.optional(Schema.String),
  substitutionAllowed: Schema.optional(Schema.Boolean),
  vaccineFlag: Schema.optional(Schema.Boolean),
});

export const MedicationOrders = unsafeMakeTable(
  "medicationOrders",
  MedicationOrdersFields,
)
  .index("by_patientId_and_authoredOn", ["patientId", "authoredOn"])
  .index("by_orderKind_and_status", ["orderKind", "status"])
  .index("by_medicationCatalogRefId", ["medicationCatalogRefId"]);

export const MedicationPlansFields = Schema.Struct({
  barcodePayload: Schema.optional(Schema.String),
  bmpVersion: Schema.optional(Schema.String),
  documentIdentifier: Schema.optional(Schema.String),
  issuerPractitionerId: Schema.optional(GenericId.GenericId("practitioners")),
  issuingOrganizationId: Schema.optional(GenericId.GenericId("organizations")),
  patientId: GenericId.GenericId("patients"),
  patientPrintArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  setIdentifier: Schema.optional(Schema.String),
  sourceArtifactId: Schema.optional(GenericId.GenericId("artifacts")),
  sourceKind: Schema.Literal("structured", "bmp-xml", "bmp-barcode", "vos"),
  status: Schema.Literal("current", "superseded"),
  updatedAt: IsoDateTime,
});

export const MedicationPlans = unsafeMakeTable(
  "medicationPlans",
  MedicationPlansFields,
).index("by_patientId_and_status", ["patientId", "status"]);

export const MedicationPlanEntriesFields = Schema.Struct({
  activeIngredientText: Schema.optional(Schema.String),
  basedOnMedicationOrderId: Schema.optional(
    GenericId.GenericId("medicationOrders"),
  ),
  displayName: Schema.String,
  dosageText: Schema.optional(Schema.String),
  doseFormText: Schema.optional(Schema.String),
  entrySource: Schema.Literal(
    "own-prescription",
    "external-prescription",
    "self-medication",
    "imported-plan",
  ),
  hasBoundSupplementLine: Schema.Boolean,
  indicationText: Schema.optional(Schema.String),
  isRecipePreparation: Schema.Boolean,
  planId: GenericId.GenericId("medicationPlans"),
  printOnPlan: Schema.Boolean,
  productCode: Schema.optional(Schema.String),
  sortOrder: Schema.Number,
  strengthText: Schema.optional(Schema.String),
  supplementLineText: Schema.optional(Schema.String),
});

export const MedicationPlanEntries = unsafeMakeTable(
  "medicationPlanEntries",
  MedicationPlanEntriesFields,
).index("by_planId_and_sortOrder", ["planId", "sortOrder"]);

export const DigaCatalogRefsFields = Schema.Struct({
  additionalCoCost: Schema.optional(Schema.Number),
  ageGroups: Schema.Array(Schema.String),
  digaModulName: Schema.optional(Schema.String),
  digaName: Schema.optional(Schema.String),
  indikationen: Schema.Array(CodeableConceptValue),
  kontraindikationen: Schema.Array(CodeableConceptValue),
  manufacturerName: Schema.optional(Schema.String),
  notIndicatedGenders: Schema.Array(Schema.String),
  price: Schema.optional(Schema.Number),
  pzn: Schema.String,
  sourcePackageId: GenericId.GenericId("masterDataPackages"),
  statusImVerzeichnis: Schema.optional(Schema.String),
  usageDurationText: Schema.optional(Schema.String),
  verordnungseinheitName: Schema.String,
});

export const DigaCatalogRefs = unsafeMakeTable(
  "digaCatalogRefs",
  DigaCatalogRefsFields,
).index("by_pzn", ["pzn"]);

export const DigaOrdersFields = Schema.Struct({
  artifactDocumentId: Schema.optional(GenericId.GenericId("clinicalDocuments")),
  authoredOn: IsoDateTime,
  coverageId: GenericId.GenericId("coverages"),
  digaCatalogRefId: GenericId.GenericId("digaCatalogRefs"),
  legalBasisCode: Schema.optional(Schema.String),
  organizationId: GenericId.GenericId("organizations"),
  patientId: GenericId.GenericId("patients"),
  practitionerId: GenericId.GenericId("practitioners"),
  serFlag: Schema.optional(Schema.Boolean),
  status: Schema.Literal("draft", "final", "cancelled", "superseded"),
});

export const DigaOrders = unsafeMakeTable("digaOrders", DigaOrdersFields)
  .index("by_patientId_and_authoredOn", ["patientId", "authoredOn"])
  .index("by_digaCatalogRefId", ["digaCatalogRefId"]);

export const HeilmittelCatalogRefsFields = Schema.Struct({
  blankoEligible: Schema.optional(Schema.Boolean),
  diagnosegruppe: Schema.String,
  displayName: Schema.String,
  heilmittelbereich: Schema.String,
  heilmittelCode: Schema.String,
  isErgaenzend: Schema.Boolean,
  isVorrangig: Schema.Boolean,
  longTermNeedText: Schema.optional(Schema.String),
  orientierendeBehandlungsmenge: Schema.optional(Schema.Number),
  positionsnummern: Schema.Array(Schema.String),
  sourcePackageId: GenericId.GenericId("masterDataPackages"),
  specialNeedText: Schema.optional(Schema.String),
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
  approvalType: Schema.Literal("long-term", "special-need", "other"),
  artifactId: Schema.optional(GenericId.GenericId("artifacts")),
  diagnosegruppen: Schema.Array(Schema.String),
  heilmittelCodes: Schema.Array(Schema.String),
  icdCodes: Schema.Array(Schema.String),
  issuerDisplay: Schema.optional(Schema.String),
  patientId: GenericId.GenericId("patients"),
  validFrom: Schema.optional(IsoDate),
  validTo: Schema.optional(IsoDate),
});

export const HeilmittelApprovals = unsafeMakeTable(
  "heilmittelApprovals",
  HeilmittelApprovalsFields,
).index("by_patientId_and_validTo", ["patientId", "validTo"]);

export const HeilmittelOrdersFields = Schema.Struct({
  approvalId: Schema.optional(GenericId.GenericId("heilmittelApprovals")),
  artifactDocumentId: Schema.optional(GenericId.GenericId("clinicalDocuments")),
  blankoFlag: Schema.optional(Schema.Boolean),
  coverageId: GenericId.GenericId("coverages"),
  diagnosegruppe: Schema.String,
  diagnosisIds: Schema.Array(GenericId.GenericId("diagnoses")),
  ergaenzendeHeilmittelCodes: Schema.Array(Schema.String),
  frequenzText: Schema.optional(Schema.String),
  hausbesuch: Schema.optional(Schema.Boolean),
  heilmittelbereich: Schema.String,
  issueDate: IsoDate,
  longTermNeedFlag: Schema.optional(Schema.Boolean),
  organizationId: GenericId.GenericId("organizations"),
  patientId: GenericId.GenericId("patients"),
  practitionerId: GenericId.GenericId("practitioners"),
  specialNeedFlag: Schema.optional(Schema.Boolean),
  standardisierteKombinationCode: Schema.optional(Schema.String),
  status: Schema.Literal("draft", "final", "cancelled", "superseded"),
  stornoDate: Schema.optional(IsoDate),
  therapiebericht: Schema.optional(Schema.Boolean),
  verordnungsmenge: Schema.optional(Schema.Number),
  vorrangigeHeilmittelCodes: Schema.Array(Schema.String),
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
