import { GenericId } from "@confect/core";
import { Schema, Effect } from "effect";
import type { GenericId as Id } from "convex/values";
import { describe, expect, it } from "vitest";

import { refs } from "../confect/refs";
import {
  DatabaseReader,
  DatabaseWriter,
} from "../confect/_generated/services";
import { runWithTestConfect, TestConfect } from "./TestConfect";

const seedStorageId = "seed;_storage" as Id<"_storage">;

const seedClinicalContext = (patientId: Id<"patients">) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const organizationId = yield* writer.table("organizations").insert({
      active: true,
      kind: "practice",
      name: "Praxis Phase 2",
      identifiers: [],
      addresses: [
        {
          line1: "Praxisgasse 10",
          postalCode: "50667",
          city: "Koeln",
        },
      ],
      telecom: [],
      sourceStamp: {
        sourceKind: "manual",
        capturedAt: "2026-03-10T08:00:00.000Z",
      },
    });

    const practitionerId = yield* writer.table("practitioners").insert({
      active: true,
      displayName: "Dr. Test",
      nameSortKey: "Test,Dr.",
      names: [
        {
          family: "Test",
          prefixes: ["Dr."],
          given: ["Tina"],
        },
      ],
      qualifications: [],
      sourceStamp: {
        sourceKind: "manual",
        capturedAt: "2026-03-10T08:00:00.000Z",
      },
    });

    const coverageId = yield* writer.table("coverages").insert({
      patientId,
      kind: "gkv",
      kostentraegerkennung: "109500969",
      kostentraegerName: "AOK Test",
      sourceStamp: {
        sourceKind: "manual",
        capturedAt: "2026-03-10T08:05:00.000Z",
      },
    });

    return {
      organizationId,
      practitionerId,
      coverageId,
    };
  });

const seedDiagnosis = (patientId: Id<"patients">) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const diagnosisId = yield* writer.table("diagnoses").insert({
      patientId,
      icdCode: "M54.5",
      icd10gm: {
        system: "urn:icd10gm",
        code: "M54.5",
        display: "Low back pain",
      },
      category: "acute",
      recordStatus: "active",
    });

    return { diagnosisId };
  });

describe("prescribing, documents, and drafts workflows", () => {
  it("finalizes a medication order into immutable document, artifact, and form state", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;

        const patient = yield* test.mutation(refs.public.patients.createManual, {
          patient: {
            names: [
              {
                family: "Rezept",
                prefixes: [],
                given: ["Rita"],
              },
            ],
            addresses: [],
            telecom: [],
            preferredLanguages: [],
            capturedAt: "2026-03-10T09:00:00.000Z",
          },
        });

        const { organizationId, practitionerId, coverageId } = yield* test.run(
          seedClinicalContext(patient.patientId),
          Schema.Struct({
            organizationId: GenericId.GenericId("organizations"),
            practitionerId: GenericId.GenericId("practitioners"),
            coverageId: GenericId.GenericId("coverages"),
          }),
        );

        const packageResult = yield* test.mutation(
          refs.public.coding.registerMasterDataPackage,
          {
            family: "AMDB",
            version: "2026.1",
            sourcePath: "fixtures/amdb",
            artifact: {
              storageId: seedStorageId,
              contentType: "application/zip",
              byteSize: 1,
              sha256: "amdb",
            },
            importedAt: "2026-03-10T09:01:00.000Z",
            status: "active",
          },
        );

        yield* test.mutation(refs.public.catalog.importMedicationCatalogRefs, {
          sourcePackageId: packageResult.packageId,
          entries: [
            {
              pzn: "01234567",
              displayName: "Testmed 10mg",
              activeIngredientText: "Testwirkstoff",
              strengthText: "10mg",
              regionalArvFlags: [],
            },
          ],
        });

        const medication = yield* test.query(
          refs.public.catalog.lookupMedicationByPzn,
          {
            pzn: "01234567",
          },
        );
        if (!medication.found) {
          throw new Error("expected medication catalog entry");
        }

        const formDefinition = yield* test.mutation(
          refs.public.documents.registerFormDefinition,
          {
            formCode: "M16",
            displayName: "Verordnung Muster",
            theme: "bfb",
            deliveryMode: "blanko-print",
            requiresBarcode: true,
            requiresBfbCertification: true,
            requiresDigitaleMusterCertification: false,
            active: true,
          },
        );

        const order = yield* test.mutation(refs.public.prescriptions.createOrder, {
          patientId: patient.patientId,
          coverageId,
          practitionerId,
          organizationId,
          orderKind: "pzn",
          prescriptionMode: "electronic",
          prescriptionContext: "regular",
          status: "draft",
          authoredOn: "2026-03-10T09:05:00.000Z",
          medicationCatalogRefId: medication.entry._id,
          dosageText: "1-0-1",
          packageCount: 1,
        });

        const finalized = yield* test.mutation(
          refs.public.prescriptions.finalizeOrder,
          {
            medicationOrderId: order.medicationOrderId,
            finalizedAt: "2026-03-10T09:10:00.000Z",
            profileVersion: "1.4.1",
            artifact: {
              attachment: {
                storageId: seedStorageId,
                contentType: "application/fhir+xml",
                byteSize: 128,
                sha256: "erp-xml",
              },
              externalIdentifier: "erp-1",
            },
            patientPrint: {
              attachment: {
                storageId: seedStorageId,
                contentType: "application/pdf",
                byteSize: 64,
                sha256: "erp-print",
              },
            },
            printForm: {
              formDefinitionId: formDefinition.formDefinitionId,
              issueDate: "2026-03-10",
              issuingOrganizationId: organizationId,
              outputAttachment: {
                storageId: seedStorageId,
                contentType: "application/pdf",
                byteSize: 64,
                sha256: "form-output",
              },
            },
          },
        );

        if (finalized.outcome !== "finalized") {
          throw new Error(`expected finalized outcome, got ${finalized.outcome}`);
        }

        const orderView = yield* test.query(refs.public.prescriptions.getOrder, {
          medicationOrderId: order.medicationOrderId,
        });
        const orders = yield* test.query(
          refs.public.prescriptions.listOrdersByPatient,
          {
            patientId: patient.patientId,
            status: "final",
          },
        );
        const documents = yield* test.query(refs.public.documents.listByPatient, {
          patientId: patient.patientId,
        });
        const documentView = yield* test.query(refs.public.documents.getDocument, {
          documentId: finalized.documentId,
        });
        const formDefinitions = yield* test.query(
          refs.public.documents.listFormDefinitions,
          {
            activeOnly: true,
          },
        );
        const formInstances = yield* test.query(
          refs.public.documents.listFormInstancesByPatient,
          {
            patientId: patient.patientId,
            subjectKind: "prescription-print",
          },
        );

        return {
          finalized,
          orderView,
          orders,
          documents,
          documentView,
          formDefinitions,
          formInstances,
        };
      }),
    );

    expect(result.orderView.found).toBe(true);
    if (result.orderView.found) {
      expect(result.orderView.order.status).toBe("final");
      expect(result.orderView.order.artifactDocumentId).toBe(result.finalized.documentId);
    }
    expect(result.orders).toHaveLength(1);
    expect(result.documents).toHaveLength(1);
    expect(result.formDefinitions).toHaveLength(1);
    expect(result.formInstances).toHaveLength(1);
    expect(result.formInstances[0]?.status).toBe("final");
    expect(result.documentView.found).toBe(true);
    if (result.documentView.found) {
      expect(result.documentView.document.kind).toBe("erp");
      expect(result.documentView.revisions).toHaveLength(1);
      expect(result.documentView.artifacts.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("supersedes prior medication plans and promotes drafts out of the editable workspace set", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;

        const patient = yield* test.mutation(refs.public.patients.createManual, {
          patient: {
            names: [
              {
                family: "Plan",
                prefixes: [],
                given: ["Paula"],
              },
            ],
            addresses: [],
            telecom: [],
            preferredLanguages: [],
            capturedAt: "2026-03-10T10:00:00.000Z",
          },
        });

        const firstPlan = yield* test.mutation(
          refs.public.prescriptions.createMedicationPlan,
          {
            patientId: patient.patientId,
            status: "current",
            sourceKind: "structured",
            updatedAt: "2026-03-10T10:05:00.000Z",
          },
        );

        yield* test.mutation(refs.public.prescriptions.addPlanEntry, {
          planId: firstPlan.planId,
          sortOrder: 1,
          entrySource: "own-prescription",
          displayName: "Alpha",
          dosageText: "1-0-0",
          printOnPlan: true,
          hasBoundSupplementLine: false,
          isRecipePreparation: false,
        });

        const draftSaved = yield* test.mutation(refs.public.drafts.saveWorkspace, {
          ownerKind: "medicationOrder",
          ownerId: "draft-order-1",
          workflowKind: "erp-order",
          snapshot: {
            pzn: "01234567",
            dosageText: "1-0-0",
          },
          schemaVersion: 1,
          lastTouchedAt: "2026-03-10T10:06:00.000Z",
          lastTouchedBy: "user:1",
        });

        const draftUpdated = yield* test.mutation(refs.public.drafts.saveWorkspace, {
          ownerKind: "medicationOrder",
          ownerId: "draft-order-1",
          workflowKind: "erp-order",
          snapshot: {
            pzn: "01234567",
            dosageText: "1-0-1",
          },
          schemaVersion: 2,
          lastTouchedAt: "2026-03-10T10:07:00.000Z",
          lastTouchedBy: "user:2",
        });

        const workspaceBeforePromotion = yield* test.query(
          refs.public.drafts.getWorkspace,
          {
            ownerKind: "medicationOrder",
            ownerId: "draft-order-1",
            workflowKind: "erp-order",
          },
        );

        const promoted = yield* test.mutation(refs.public.drafts.promoteWorkspace, {
          draftWorkspaceId: draftSaved.draftWorkspaceId,
          promotedAt: "2026-03-10T10:08:00.000Z",
          promotedBy: "user:2",
        });

        const workspaceAfterPromotion = yield* test.query(
          refs.public.drafts.getWorkspace,
          {
            ownerKind: "medicationOrder",
            ownerId: "draft-order-1",
            workflowKind: "erp-order",
          },
        );

        const secondPlan = yield* test.mutation(
          refs.public.prescriptions.createMedicationPlan,
          {
            patientId: patient.patientId,
            status: "current",
            sourceKind: "structured",
            updatedAt: "2026-03-10T10:10:00.000Z",
          },
        );

        const currentPlan = yield* test.query(
          refs.public.prescriptions.getCurrentPlan,
          {
            patientId: patient.patientId,
          },
        );

        const persistedPlans = yield* test.run(
          Effect.gen(function* () {
            const reader = yield* DatabaseReader;
            const first = yield* reader.table("medicationPlans").get(firstPlan.planId);
            const second = yield* reader.table("medicationPlans").get(secondPlan.planId);
            return {
              firstStatus: first.status,
              secondStatus: second.status,
              secondId: second._id,
            };
          }),
          Schema.Struct({
            firstStatus: Schema.String,
            secondStatus: Schema.String,
            secondId: GenericId.GenericId("medicationPlans"),
          }),
        );

        return {
          draftSaved,
          draftUpdated,
          workspaceBeforePromotion,
          promoted,
          workspaceAfterPromotion,
          currentPlan,
          persistedPlans,
        };
      }),
    );

    expect(result.draftSaved.created).toBe(true);
    expect(result.draftUpdated.created).toBe(false);
    expect(result.workspaceBeforePromotion.found).toBe(true);
    if (result.workspaceBeforePromotion.found) {
      expect(result.workspaceBeforePromotion.draftWorkspace.schemaVersion).toBe(2);
    }
    expect(result.promoted.outcome).toBe("promoted");
    expect(result.workspaceAfterPromotion.found).toBe(false);
    expect(result.currentPlan.found).toBe(true);
    if (result.currentPlan.found) {
      expect(result.currentPlan.plan._id).toBe(result.persistedPlans.secondId);
    }
    expect(result.persistedPlans.firstStatus).toBe("superseded");
    expect(result.persistedPlans.secondStatus).toBe("current");
  });

  it("blocks invalid heilmittel finalization and finalizes valid approved orders into document state", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;

        const patient = yield* test.mutation(refs.public.patients.createManual, {
          patient: {
            names: [
              {
                family: "Heil",
                prefixes: [],
                given: ["Helga"],
              },
            ],
            addresses: [],
            telecom: [],
            preferredLanguages: [],
            capturedAt: "2026-03-10T11:00:00.000Z",
          },
        });

        const { organizationId, practitionerId, coverageId } = yield* test.run(
          seedClinicalContext(patient.patientId),
          Schema.Struct({
            organizationId: GenericId.GenericId("organizations"),
            practitionerId: GenericId.GenericId("practitioners"),
            coverageId: GenericId.GenericId("coverages"),
          }),
        );

        const { diagnosisId } = yield* test.run(
          seedDiagnosis(patient.patientId),
          Schema.Struct({
            diagnosisId: GenericId.GenericId("diagnoses"),
          }),
        );

        const packageResult = yield* test.mutation(
          refs.public.coding.registerMasterDataPackage,
          {
            family: "SDHM",
            version: "2026.1",
            sourcePath: "fixtures/sdhm",
            artifact: {
              storageId: seedStorageId,
              contentType: "application/zip",
              byteSize: 1,
              sha256: "sdhm",
            },
            importedAt: "2026-03-10T11:01:00.000Z",
            status: "active",
          },
        );

        yield* test.mutation(refs.public.catalog.importHeilmittelCatalogRefs, {
          sourcePackageId: packageResult.packageId,
          entries: [
            {
              heilmittelbereich: "PHYSIO",
              diagnosegruppe: "EX1",
              heilmittelCode: "X100",
              displayName: "Therapie X100",
              isVorrangig: true,
              isErgaenzend: false,
              positionsnummern: ["123"],
              blankoEligible: true,
            },
          ],
        });

        const heilmittelCatalog = yield* test.query(
          refs.public.catalog.lookupHeilmittelByKey,
          {
            heilmittelbereich: "PHYSIO",
            heilmittelCode: "X100",
          },
        );
        if (!heilmittelCatalog.found) {
          throw new Error("expected heilmittel catalog entry");
        }

        const formDefinition = yield* test.mutation(
          refs.public.documents.registerFormDefinition,
          {
            formCode: "HM13",
            displayName: "Heilmittel Muster",
            theme: "heilmittel",
            deliveryMode: "mixed",
            requiresBarcode: false,
            requiresBfbCertification: false,
            requiresDigitaleMusterCertification: false,
            active: true,
          },
        );

        const blockedOrder = yield* test.mutation(refs.public.heilmittel.createOrder, {
          patientId: patient.patientId,
          coverageId,
          practitionerId,
          organizationId,
          issueDate: "2026-03-10",
          status: "draft",
          diagnosisIds: [diagnosisId],
          diagnosegruppe: "EX1",
          heilmittelbereich: "PHYSIO",
          vorrangigeHeilmittelCodes: ["X100"],
          ergaenzendeHeilmittelCodes: [],
          specialNeedFlag: true,
        });

        const blockedFinalize = yield* test.mutation(
          refs.public.heilmittel.finalizeOrder,
          {
            heilmittelOrderId: blockedOrder.heilmittelOrderId,
            finalizedAt: "2026-03-10T11:10:00.000Z",
            artifact: {
              attachment: {
                storageId: seedStorageId,
                contentType: "application/pdf",
                byteSize: 32,
                sha256: "hm-blocked",
              },
            },
          },
        );

        const approval = yield* test.mutation(
          refs.public.heilmittel.createApproval,
          {
            patientId: patient.patientId,
            approvalType: "special-need",
            validFrom: "2026-01-01",
            validTo: "2026-12-31",
            icdCodes: ["M54.5"],
            diagnosegruppen: ["EX1"],
            heilmittelCodes: ["X100"],
          },
        );

        const order = yield* test.mutation(refs.public.heilmittel.createOrder, {
          patientId: patient.patientId,
          coverageId,
          practitionerId,
          organizationId,
          issueDate: "2026-03-10",
          status: "draft",
          diagnosisIds: [diagnosisId],
          diagnosegruppe: "EX1",
          heilmittelbereich: "PHYSIO",
          vorrangigeHeilmittelCodes: ["X100"],
          ergaenzendeHeilmittelCodes: [],
          blankoFlag: true,
          specialNeedFlag: true,
          approvalId: approval.approvalId,
        });

        const finalized = yield* test.mutation(
          refs.public.heilmittel.finalizeOrder,
          {
            heilmittelOrderId: order.heilmittelOrderId,
            finalizedAt: "2026-03-10T11:15:00.000Z",
            profileVersion: "1.0",
            artifact: {
              attachment: {
                storageId: seedStorageId,
                contentType: "application/pdf",
                byteSize: 32,
                sha256: "hm-final",
              },
              externalIdentifier: "hm-1",
            },
            printForm: {
              formDefinitionId: formDefinition.formDefinitionId,
              issueDate: "2026-03-10",
              issuingOrganizationId: organizationId,
              outputAttachment: {
                storageId: seedStorageId,
                contentType: "application/pdf",
                byteSize: 32,
                sha256: "hm-form",
              },
            },
          },
        );

        if (finalized.outcome !== "finalized") {
          throw new Error(`expected finalized outcome, got ${finalized.outcome}`);
        }

        const orderView = yield* test.query(refs.public.heilmittel.getOrder, {
          heilmittelOrderId: order.heilmittelOrderId,
        });
        const orders = yield* test.query(
          refs.public.heilmittel.listOrdersByPatient,
          {
            patientId: patient.patientId,
          },
        );
        const documentView = yield* test.query(refs.public.documents.getDocument, {
          documentId: finalized.documentId,
        });
        const formInstances = yield* test.query(
          refs.public.documents.listFormInstancesByPatient,
          {
            patientId: patient.patientId,
            subjectKind: "heilmittel",
          },
        );

        return {
          blockedFinalize,
          orderView,
          orders,
          documentView,
          formInstances,
        };
      }),
    );

    expect(result.blockedFinalize.outcome).toBe("blocked");
    if (result.blockedFinalize.outcome === "blocked") {
      expect(
        result.blockedFinalize.issues.some(
          (issue) => issue.code === "HEILMITTEL_APPROVAL_REQUIRED",
        ),
      ).toBe(true);
    }
    expect(result.orderView.found).toBe(true);
    if (result.orderView.found) {
      expect(result.orderView.order.status).toBe("final");
    }
    expect(result.orders).toHaveLength(2);
    expect(result.formInstances).toHaveLength(1);
    expect(result.documentView.found).toBe(true);
    if (result.documentView.found) {
      expect(result.documentView.document.kind).toBe("heilmittel");
      expect(result.documentView.revisions).toHaveLength(1);
      expect(result.documentView.artifacts.length).toBeGreaterThanOrEqual(2);
    }
  });
});
