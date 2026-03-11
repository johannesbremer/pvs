import type { GenericId as Id } from "convex/values";

import { GenericId } from "@confect/core";
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { DatabaseReader, DatabaseWriter } from "../confect/_generated/services";
import { refs } from "../confect/refs";
import { runWithTestConfect, TestConfect } from "./TestConfect";

const seedStorageId = "seed;_storage" as Id<"_storage">;

const seedClinicalContext = (patientId: Id<"patients">) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const organizationId = yield* writer.table("organizations").insert({
      active: true,
      addresses: [
        {
          city: "Koeln",
          line1: "Praxisgasse 10",
          postalCode: "50667",
        },
      ],
      identifiers: [],
      kind: "practice",
      name: "Praxis Phase 2",
      sourceStamp: {
        capturedAt: "2026-03-10T08:00:00.000Z",
        sourceKind: "manual",
      },
      telecom: [],
    });

    const practitionerId = yield* writer.table("practitioners").insert({
      active: true,
      displayName: "Dr. Test",
      names: [
        {
          family: "Test",
          given: ["Tina"],
          prefixes: ["Dr."],
        },
      ],
      nameSortKey: "Test,Dr.",
      qualifications: [],
      sourceStamp: {
        capturedAt: "2026-03-10T08:00:00.000Z",
        sourceKind: "manual",
      },
    });

    const coverageId = yield* writer.table("coverages").insert({
      kind: "gkv",
      kostentraegerkennung: "109500969",
      kostentraegerName: "AOK Test",
      patientId,
      sourceStamp: {
        capturedAt: "2026-03-10T08:05:00.000Z",
        sourceKind: "manual",
      },
    });

    return {
      coverageId,
      organizationId,
      practitionerId,
    };
  });

const seedDiagnosis = (patientId: Id<"patients">) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const diagnosisId = yield* writer.table("diagnoses").insert({
      category: "acute",
      icd10gm: {
        code: "M54.5",
        display: "Low back pain",
        system: "urn:icd10gm",
      },
      icdCode: "M54.5",
      patientId,
      recordStatus: "active",
    });

    return { diagnosisId };
  });

describe("prescribing, documents, and drafts workflows", () => {
  it("finalizes a medication order into immutable document, artifact, and form state", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;

        const patient = yield* test.mutation(
          refs.public.patients.createManual,
          {
            patient: {
              addresses: [],
              capturedAt: "2026-03-10T09:00:00.000Z",
              names: [
                {
                  family: "Rezept",
                  given: ["Rita"],
                  prefixes: [],
                },
              ],
              preferredLanguages: [],
              telecom: [],
            },
          },
        );

        const { coverageId, organizationId, practitionerId } = yield* test.run(
          seedClinicalContext(patient.patientId),
          Schema.Struct({
            coverageId: GenericId.GenericId("coverages"),
            organizationId: GenericId.GenericId("organizations"),
            practitionerId: GenericId.GenericId("practitioners"),
          }),
        );

        const packageResult = yield* test.mutation(
          refs.public.coding.registerMasterDataPackage,
          {
            artifact: {
              byteSize: 1,
              contentType: "application/zip",
              sha256: "amdb",
              storageId: seedStorageId,
            },
            family: "AMDB",
            importedAt: "2026-03-10T09:01:00.000Z",
            sourcePath: "fixtures/amdb",
            status: "active",
            version: "2026.1",
          },
        );

        yield* test.mutation(refs.public.catalog.importMedicationCatalogRefs, {
          entries: [
            {
              activeIngredientText: "Testwirkstoff",
              displayName: "Testmed 10mg",
              pzn: "01234567",
              regionalArvFlags: [],
              strengthText: "10mg",
            },
          ],
          sourcePackageId: packageResult.packageId,
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
            active: true,
            deliveryMode: "blanko-print",
            displayName: "Verordnung Muster",
            formCode: "M16",
            requiresBarcode: true,
            requiresBfbCertification: true,
            requiresDigitaleMusterCertification: false,
            theme: "bfb",
          },
        );

        const order = yield* test.mutation(
          refs.public.prescriptions.createOrder,
          {
            authoredOn: "2026-03-10T09:05:00.000Z",
            coverageId,
            dosageText: "1-0-1",
            medicationCatalogRefId: medication.entry._id,
            orderKind: "pzn",
            organizationId,
            packageCount: 1,
            patientId: patient.patientId,
            practitionerId,
            prescriptionContext: "regular",
            prescriptionMode: "electronic",
            status: "draft",
          },
        );

        const finalized = yield* test.mutation(
          refs.public.prescriptions.finalizeOrder,
          {
            artifact: {
              attachment: {
                byteSize: 128,
                contentType: "application/fhir+xml",
                sha256: "erp-xml",
                storageId: seedStorageId,
              },
              externalIdentifier: "erp-1",
            },
            finalizedAt: "2026-03-10T09:10:00.000Z",
            medicationOrderId: order.medicationOrderId,
            patientPrint: {
              attachment: {
                byteSize: 64,
                contentType: "application/pdf",
                sha256: "erp-print",
                storageId: seedStorageId,
              },
            },
            printForm: {
              formDefinitionId: formDefinition.formDefinitionId,
              issueDate: "2026-03-10",
              issuingOrganizationId: organizationId,
              outputAttachment: {
                byteSize: 64,
                contentType: "application/pdf",
                sha256: "form-output",
                storageId: seedStorageId,
              },
            },
            profileVersion: "1.4.1",
          },
        );

        if (finalized.outcome !== "finalized") {
          throw new Error(
            `expected finalized outcome, got ${finalized.outcome}`,
          );
        }

        const orderView = yield* test.query(
          refs.public.prescriptions.getOrder,
          {
            medicationOrderId: order.medicationOrderId,
          },
        );
        const orders = yield* test.query(
          refs.public.prescriptions.listOrdersByPatient,
          {
            patientId: patient.patientId,
            status: "final",
          },
        );
        const documents = yield* test.query(
          refs.public.documents.listByPatient,
          {
            patientId: patient.patientId,
          },
        );
        const documentView = yield* test.query(
          refs.public.documents.getDocument,
          {
            documentId: finalized.documentId,
          },
        );
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
          documents,
          documentView,
          finalized,
          formDefinitions,
          formInstances,
          orders,
          orderView,
        };
      }),
    );

    expect(result.orderView.found).toBe(true);
    if (!result.orderView.found) {
      throw new Error("expected ERP order view");
    }
    expect(result.orderView.order.status).toBe("final");
    expect(result.orderView.order.artifactDocumentId).toBe(
      result.finalized.documentId,
    );
    expect(result.orders).toHaveLength(1);
    expect(result.documents).toHaveLength(1);
    expect(result.formDefinitions).toHaveLength(1);
    expect(result.formInstances).toHaveLength(1);
    expect(result.formInstances[0]?.status).toBe("final");
    expect(result.documentView.found).toBe(true);
    if (!result.documentView.found) {
      throw new Error("expected ERP document view");
    }
    expect(result.documentView.document.kind).toBe("erp");
    expect(result.documentView.revisions).toHaveLength(1);
    expect(result.documentView.artifacts.length).toBeGreaterThanOrEqual(3);
  });

  it("supersedes prior medication plans and promotes drafts out of the editable workspace set", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;

        const patient = yield* test.mutation(
          refs.public.patients.createManual,
          {
            patient: {
              addresses: [],
              capturedAt: "2026-03-10T10:00:00.000Z",
              names: [
                {
                  family: "Plan",
                  given: ["Paula"],
                  prefixes: [],
                },
              ],
              preferredLanguages: [],
              telecom: [],
            },
          },
        );

        const firstPlan = yield* test.mutation(
          refs.public.prescriptions.createMedicationPlan,
          {
            patientId: patient.patientId,
            sourceKind: "structured",
            status: "current",
            updatedAt: "2026-03-10T10:05:00.000Z",
          },
        );

        yield* test.mutation(refs.public.prescriptions.addPlanEntry, {
          displayName: "Alpha",
          dosageText: "1-0-0",
          entrySource: "own-prescription",
          hasBoundSupplementLine: false,
          isRecipePreparation: false,
          planId: firstPlan.planId,
          printOnPlan: true,
          sortOrder: 1,
        });

        const draftSaved = yield* test.mutation(
          refs.public.drafts.saveWorkspace,
          {
            lastTouchedAt: "2026-03-10T10:06:00.000Z",
            lastTouchedBy: "user:1",
            ownerId: "draft-order-1",
            ownerKind: "medicationOrder",
            schemaVersion: 1,
            snapshot: {
              dosageText: "1-0-0",
              pzn: "01234567",
            },
            workflowKind: "erp-order",
          },
        );

        const draftUpdated = yield* test.mutation(
          refs.public.drafts.saveWorkspace,
          {
            lastTouchedAt: "2026-03-10T10:07:00.000Z",
            lastTouchedBy: "user:2",
            ownerId: "draft-order-1",
            ownerKind: "medicationOrder",
            schemaVersion: 2,
            snapshot: {
              dosageText: "1-0-1",
              pzn: "01234567",
            },
            workflowKind: "erp-order",
          },
        );

        const workspaceBeforePromotion = yield* test.query(
          refs.public.drafts.getWorkspace,
          {
            ownerId: "draft-order-1",
            ownerKind: "medicationOrder",
            workflowKind: "erp-order",
          },
        );

        const promoted = yield* test.mutation(
          refs.public.drafts.promoteWorkspace,
          {
            draftWorkspaceId: draftSaved.draftWorkspaceId,
            promotedAt: "2026-03-10T10:08:00.000Z",
            promotedBy: "user:2",
          },
        );

        const workspaceAfterPromotion = yield* test.query(
          refs.public.drafts.getWorkspace,
          {
            ownerId: "draft-order-1",
            ownerKind: "medicationOrder",
            workflowKind: "erp-order",
          },
        );

        const secondPlan = yield* test.mutation(
          refs.public.prescriptions.createMedicationPlan,
          {
            patientId: patient.patientId,
            sourceKind: "structured",
            status: "current",
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
            const first = yield* reader
              .table("medicationPlans")
              .get(firstPlan.planId);
            const second = yield* reader
              .table("medicationPlans")
              .get(secondPlan.planId);
            return {
              firstStatus: first.status,
              secondId: second._id,
              secondStatus: second.status,
            };
          }),
          Schema.Struct({
            firstStatus: Schema.String,
            secondId: GenericId.GenericId("medicationPlans"),
            secondStatus: Schema.String,
          }),
        );

        return {
          currentPlan,
          draftSaved,
          draftUpdated,
          persistedPlans,
          promoted,
          workspaceAfterPromotion,
          workspaceBeforePromotion,
        };
      }),
    );

    expect(result.draftSaved.created).toBe(true);
    expect(result.draftUpdated.created).toBe(false);
    expect(result.workspaceBeforePromotion.found).toBe(true);
    if (!result.workspaceBeforePromotion.found) {
      throw new Error("expected editable draft workspace before promotion");
    }
    expect(result.workspaceBeforePromotion.draftWorkspace.schemaVersion).toBe(
      2,
    );
    expect(result.promoted.outcome).toBe("promoted");
    expect(result.workspaceAfterPromotion.found).toBe(false);
    expect(result.currentPlan.found).toBe(true);
    if (!result.currentPlan.found) {
      throw new Error("expected current medication plan");
    }
    expect(result.currentPlan.plan._id).toBe(result.persistedPlans.secondId);
    expect(result.persistedPlans.firstStatus).toBe("superseded");
    expect(result.persistedPlans.secondStatus).toBe("current");
  });

  it("publishes VoS bundles with a bounded kID window and imports storage bundles into canonical plan state", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;

        const patient = yield* test.mutation(
          refs.public.patients.createManual,
          {
            patient: {
              addresses: [],
              capturedAt: "2026-03-10T10:30:00.000Z",
              names: [
                {
                  family: "VoS",
                  given: ["Vera"],
                  prefixes: [],
                },
              ],
              preferredLanguages: [],
              telecom: [],
            },
          },
        );

        const { coverageId, organizationId, practitionerId } = yield* test.run(
          seedClinicalContext(patient.patientId),
          Schema.Struct({
            coverageId: GenericId.GenericId("coverages"),
            organizationId: GenericId.GenericId("organizations"),
            practitionerId: GenericId.GenericId("practitioners"),
          }),
        );

        const packageResult = yield* test.mutation(
          refs.public.coding.registerMasterDataPackage,
          {
            artifact: {
              byteSize: 1,
              contentType: "application/zip",
              sha256: "vos-amdb",
              storageId: seedStorageId,
            },
            family: "AMDB",
            importedAt: "2026-03-10T10:31:00.000Z",
            sourcePath: "fixtures/vos-amdb",
            status: "active",
            version: "2026.1",
          },
        );

        yield* test.mutation(refs.public.catalog.importMedicationCatalogRefs, {
          entries: [
            {
              activeIngredientText: "Voswirkstoff",
              displayName: "VoSmed 20mg",
              pzn: "76543210",
              regionalArvFlags: [],
              strengthText: "20mg",
            },
          ],
          sourcePackageId: packageResult.packageId,
        });

        const medication = yield* test.query(
          refs.public.catalog.lookupMedicationByPzn,
          {
            pzn: "76543210",
          },
        );
        if (!medication.found) {
          throw new Error("expected medication catalog entry for VoS");
        }

        const existingPlan = yield* test.mutation(
          refs.public.prescriptions.createMedicationPlan,
          {
            patientId: patient.patientId,
            sourceKind: "structured",
            status: "current",
            updatedAt: "2026-03-10T10:32:00.000Z",
          },
        );

        yield* test.mutation(refs.public.prescriptions.addPlanEntry, {
          displayName: "Legacy Plan Entry",
          entrySource: "own-prescription",
          hasBoundSupplementLine: false,
          isRecipePreparation: false,
          planId: existingPlan.planId,
          printOnPlan: true,
          sortOrder: 1,
        });

        const order = yield* test.mutation(
          refs.public.prescriptions.createOrder,
          {
            authoredOn: "2026-03-10T10:35:00.000Z",
            coverageId,
            dosageText: "1-1-0",
            medicationCatalogRefId: medication.entry._id,
            orderKind: "pzn",
            organizationId,
            patientId: patient.patientId,
            practitionerId,
            prescriptionContext: "regular",
            prescriptionMode: "electronic",
            status: "draft",
            substitutionAllowed: true,
          },
        );

        const rendered = yield* test.query(
          refs.public.prescriptions.renderVosBundle,
          {
            kId: "kid-001",
            medicationOrderId: order.medicationOrderId,
          },
        );

        const published = yield* test.mutation(
          refs.public.prescriptions.publishVosBundle,
          {
            artifact: {
              attachment: {
                byteSize: 128,
                contentType: "application/fhir+json",
                sha256: "vos-aufruf",
                storageId: seedStorageId,
              },
              externalIdentifier: "kid-001",
            },
            expiresAt: "2026-03-10T12:00:00.000Z",
            issuedAt: "2026-03-10T11:00:00.000Z",
            kId: "kid-001",
            medicationOrderId: order.medicationOrderId,
          },
        );

        const bundleDuringWindow = yield* test.query(
          refs.public.prescriptions.readVosBundle,
          {
            kId: "kid-001",
            requestedAt: "2026-03-10T11:30:00.000Z",
          },
        );
        const patientRead = yield* test.query(
          refs.public.prescriptions.readVosResource,
          {
            kId: "kid-001",
            requestedAt: "2026-03-10T11:30:00.000Z",
            resourceId: String(patient.patientId),
            resourceType: "Patient",
          },
        );
        const medRequestSearch = yield* test.query(
          refs.public.prescriptions.searchVosResources,
          {
            kId: "kid-001",
            requestedAt: "2026-03-10T11:30:00.000Z",
            resourceType: "MedicationRequest",
          },
        );
        const bundleAfterWindow = yield* test.query(
          refs.public.prescriptions.readVosBundle,
          {
            kId: "kid-001",
            requestedAt: "2026-03-10T12:30:00.000Z",
          },
        );

        const imported = yield* test.mutation(
          refs.public.prescriptions.importVosBundle,
          {
            artifact: {
              attachment: {
                byteSize: 256,
                contentType: "application/fhir+json",
                sha256: "vos-speicher",
                storageId: seedStorageId,
              },
            },
            coverageId,
            importedAt: "2026-03-10T11:40:00.000Z",
            kId: "kid-001",
            medicationOrders: [
              {
                authoredOn: "2026-03-10T11:20:00.000Z",
                dosageText: "0-1-0",
                medicationCatalogRefId: medication.entry._id,
                orderKind: "pzn",
                prescriptionContext: "regular",
                prescriptionMode: "paper",
                status: "final",
                substitutionAllowed: false,
              },
            ],
            medicationPlan: {
              documentIdentifier: "vos-plan-1",
              entries: [
                {
                  displayName: "VoS imported entry",
                  dosageText: "0-1-0",
                  isRecipePreparation: false,
                  printOnPlan: true,
                  sortOrder: 1,
                },
              ],
              setIdentifier: "vos-set-1",
              updatedAt: "2026-03-10T11:25:00.000Z",
            },
            organizationId,
            patientId: patient.patientId,
            practitionerId,
          },
        );

        const currentPlan = yield* test.query(
          refs.public.prescriptions.getCurrentPlan,
          {
            patientId: patient.patientId,
          },
        );
        const documents = yield* test.query(
          refs.public.documents.listByPatient,
          {
            kind: "vos",
            patientId: patient.patientId,
          },
        );

        const persisted = yield* test.run(
          Effect.gen(function* () {
            const reader = yield* DatabaseReader;
            const priorPlan = yield* reader
              .table("medicationPlans")
              .get(existingPlan.planId);
            return {
              priorPlanStatus: priorPlan.status,
            };
          }),
          Schema.Struct({
            priorPlanStatus: Schema.String,
          }),
        );

        return {
          bundleAfterWindow,
          bundleDuringWindow,
          currentPlan,
          documents,
          imported,
          medRequestSearch,
          patientRead,
          persisted,
          published,
          rendered,
        };
      }),
    );

    expect(result.rendered.found).toBe(true);
    expect(result.published.outcome).toBe("published");
    if (result.published.outcome !== "published") {
      throw new Error("expected published VoS bundle");
    }
    expect(result.bundleDuringWindow.found).toBe(true);
    if (!result.bundleDuringWindow.found) {
      throw new Error("expected readable VoS bundle during active window");
    }
    expect(result.bundleDuringWindow.kId).toBe("kid-001");
    expect(result.patientRead.found).toBe(true);
    expect(result.medRequestSearch.found).toBe(true);
    if (!result.medRequestSearch.found) {
      throw new Error("expected searchable VoS resources");
    }
    expect(result.medRequestSearch.resources).toHaveLength(1);
    expect(result.bundleAfterWindow).toEqual({
      found: false,
      reason: "expired",
    });
    expect(result.imported.outcome).toBe("imported");
    if (result.imported.outcome !== "imported") {
      throw new Error("expected imported VoS storage bundle");
    }
    expect(result.imported.importedMedicationOrderIds).toHaveLength(1);
    expect(result.documents).toHaveLength(2);
    expect(result.currentPlan.found).toBe(true);
    if (!result.currentPlan.found) {
      throw new Error("expected current VoS medication plan");
    }
    expect(result.currentPlan.plan.sourceKind).toBe("vos");
    expect(result.currentPlan.entries).toHaveLength(1);
    expect(result.currentPlan.entries[0]?.entrySource).toBe("imported-plan");
    expect(result.persisted.priorPlanStatus).toBe("superseded");
  });

  it("blocks invalid heilmittel finalization and finalizes valid approved orders into document state", async () => {
    const result = await runWithTestConfect(
      Effect.gen(function* () {
        const test = yield* TestConfect;

        const patient = yield* test.mutation(
          refs.public.patients.createManual,
          {
            patient: {
              addresses: [],
              capturedAt: "2026-03-10T11:00:00.000Z",
              names: [
                {
                  family: "Heil",
                  given: ["Helga"],
                  prefixes: [],
                },
              ],
              preferredLanguages: [],
              telecom: [],
            },
          },
        );

        const { coverageId, organizationId, practitionerId } = yield* test.run(
          seedClinicalContext(patient.patientId),
          Schema.Struct({
            coverageId: GenericId.GenericId("coverages"),
            organizationId: GenericId.GenericId("organizations"),
            practitionerId: GenericId.GenericId("practitioners"),
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
            artifact: {
              byteSize: 1,
              contentType: "application/zip",
              sha256: "sdhm",
              storageId: seedStorageId,
            },
            family: "SDHM",
            importedAt: "2026-03-10T11:01:00.000Z",
            sourcePath: "fixtures/sdhm",
            status: "active",
            version: "2026.1",
          },
        );

        yield* test.mutation(refs.public.catalog.importHeilmittelCatalogRefs, {
          entries: [
            {
              blankoEligible: true,
              diagnosegruppe: "EX1",
              displayName: "Therapie X100",
              heilmittelbereich: "PHYSIO",
              heilmittelCode: "X100",
              isErgaenzend: false,
              isVorrangig: true,
              positionsnummern: ["123"],
            },
          ],
          sourcePackageId: packageResult.packageId,
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
            active: true,
            deliveryMode: "mixed",
            displayName: "Heilmittel Muster",
            formCode: "HM13",
            requiresBarcode: false,
            requiresBfbCertification: false,
            requiresDigitaleMusterCertification: false,
            theme: "heilmittel",
          },
        );

        const blockedOrder = yield* test.mutation(
          refs.public.heilmittel.createOrder,
          {
            coverageId,
            diagnosegruppe: "EX1",
            diagnosisIds: [diagnosisId],
            ergaenzendeHeilmittelCodes: [],
            heilmittelbereich: "PHYSIO",
            issueDate: "2026-03-10",
            organizationId,
            patientId: patient.patientId,
            practitionerId,
            specialNeedFlag: true,
            status: "draft",
            vorrangigeHeilmittelCodes: ["X100"],
          },
        );

        const blockedFinalize = yield* test.mutation(
          refs.public.heilmittel.finalizeOrder,
          {
            artifact: {
              attachment: {
                byteSize: 32,
                contentType: "application/pdf",
                sha256: "hm-blocked",
                storageId: seedStorageId,
              },
            },
            finalizedAt: "2026-03-10T11:10:00.000Z",
            heilmittelOrderId: blockedOrder.heilmittelOrderId,
          },
        );

        const approval = yield* test.mutation(
          refs.public.heilmittel.createApproval,
          {
            approvalType: "special-need",
            diagnosegruppen: ["EX1"],
            heilmittelCodes: ["X100"],
            icdCodes: ["M54.5"],
            patientId: patient.patientId,
            validFrom: "2026-01-01",
            validTo: "2026-12-31",
          },
        );

        const order = yield* test.mutation(refs.public.heilmittel.createOrder, {
          approvalId: approval.approvalId,
          blankoFlag: true,
          coverageId,
          diagnosegruppe: "EX1",
          diagnosisIds: [diagnosisId],
          ergaenzendeHeilmittelCodes: [],
          heilmittelbereich: "PHYSIO",
          issueDate: "2026-03-10",
          organizationId,
          patientId: patient.patientId,
          practitionerId,
          specialNeedFlag: true,
          status: "draft",
          vorrangigeHeilmittelCodes: ["X100"],
        });

        const finalized = yield* test.mutation(
          refs.public.heilmittel.finalizeOrder,
          {
            artifact: {
              attachment: {
                byteSize: 32,
                contentType: "application/pdf",
                sha256: "hm-final",
                storageId: seedStorageId,
              },
              externalIdentifier: "hm-1",
            },
            finalizedAt: "2026-03-10T11:15:00.000Z",
            heilmittelOrderId: order.heilmittelOrderId,
            printForm: {
              formDefinitionId: formDefinition.formDefinitionId,
              issueDate: "2026-03-10",
              issuingOrganizationId: organizationId,
              outputAttachment: {
                byteSize: 32,
                contentType: "application/pdf",
                sha256: "hm-form",
                storageId: seedStorageId,
              },
            },
            profileVersion: "1.0",
          },
        );

        if (finalized.outcome !== "finalized") {
          throw new Error(
            `expected finalized outcome, got ${finalized.outcome}`,
          );
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
        const documentView = yield* test.query(
          refs.public.documents.getDocument,
          {
            documentId: finalized.documentId,
          },
        );
        const formInstances = yield* test.query(
          refs.public.documents.listFormInstancesByPatient,
          {
            patientId: patient.patientId,
            subjectKind: "heilmittel",
          },
        );

        return {
          blockedFinalize,
          documentView,
          formInstances,
          orders,
          orderView,
        };
      }),
    );

    expect(result.blockedFinalize.outcome).toBe("blocked");
    if (result.blockedFinalize.outcome !== "blocked") {
      throw new Error("expected blocked Heilmittel finalize result");
    }
    expect(
      result.blockedFinalize.issues.some(
        (issue) => issue.code === "HEILMITTEL_APPROVAL_REQUIRED",
      ),
    ).toBe(true);
    expect(result.orderView.found).toBe(true);
    if (!result.orderView.found) {
      throw new Error("expected Heilmittel order view");
    }
    expect(result.orderView.order.status).toBe("final");
    expect(result.orders).toHaveLength(2);
    expect(result.formInstances).toHaveLength(1);
    expect(result.documentView.found).toBe(true);
    if (!result.documentView.found) {
      throw new Error("expected Heilmittel document view");
    }
    expect(result.documentView.document.kind).toBe("heilmittel");
    expect(result.documentView.revisions).toHaveLength(1);
    expect(result.documentView.artifacts.length).toBeGreaterThanOrEqual(2);
  });
});
