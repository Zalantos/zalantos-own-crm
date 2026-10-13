"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireOrgContext, withOrgTransaction } from "@/lib/tenant";
import {
  commercialOfferSchema,
  commercialPartnerSchema,
  companyCommercialPartnerSchema,
  opportunityCommercialPartnerSchema,
} from "@/lib/zod/commercial";
import { addBusinessDays } from "@/lib/commercial/business-days";
import {
  assertEconomicAmounts,
  calculateProfitShares,
  type ProfitShareInput,
} from "@/lib/commercial/economics";

export type CommercialFormState =
  | { error: string; fieldErrors?: Record<string, string[] | undefined> }
  | { success: string }
  | undefined;

function formObject(formData: FormData) {
  return Object.fromEntries(formData);
}

function parseJsonArray(formData: FormData, key: string): unknown[] {
  const value = formData.get(key);
  if (!value) return [];
  const parsed = JSON.parse(String(value));
  if (!Array.isArray(parsed)) throw new Error(`${key} debe ser una lista.`);
  return parsed;
}

export async function createAndAssignCompanyPartner(formData: FormData) {
  const { org, db } = await requireOrgContext();
  const raw = formObject(formData);
  const partnerParsed = commercialPartnerSchema.safeParse(raw);
  const assignmentParsed = companyCommercialPartnerSchema.safeParse(raw);
  if (!partnerParsed.success || !assignmentParsed.success) {
    throw new Error("Revisa los datos del partner comercial.");
  }

  const company = await db.company.findUnique({
    where: { id: assignmentParsed.data.companyId },
    select: { id: true },
  });
  if (!company) throw new Error("La empresa no existe.");
  if (partnerParsed.data.linkedCompanyId) {
    const linked = await db.company.findUnique({
      where: { id: partnerParsed.data.linkedCompanyId },
      select: { id: true },
    });
    if (!linked) throw new Error("La empresa vinculada al partner no existe.");
  }
  if (partnerParsed.data.linkedPersonId) {
    const linked = await db.person.findUnique({
      where: { id: partnerParsed.data.linkedPersonId },
      select: { id: true },
    });
    if (!linked) throw new Error("La persona vinculada al partner no existe.");
  }

  await withOrgTransaction(org.id, async (tx) => {
    const partner = await tx.commercialPartner.create({
      data: { organizationId: org.id, ...partnerParsed.data },
    });
    await tx.companyCommercialPartner.create({
      data: {
        organizationId: org.id,
        ...assignmentParsed.data,
        commercialPartnerId: partner.id,
      },
    });
  });
  revalidatePath(`/companies/${assignmentParsed.data.companyId}`);
}

export async function assignExistingCompanyPartner(formData: FormData) {
  const { org, db } = await requireOrgContext();
  const parsed = companyCommercialPartnerSchema.safeParse(formObject(formData));
  if (!parsed.success)
    throw new Error("Revisa los datos del partner comercial.");
  const [company, partner] = await Promise.all([
    db.company.findUnique({
      where: { id: parsed.data.companyId },
      select: { id: true },
    }),
    db.commercialPartner.findUnique({
      where: { id: parsed.data.commercialPartnerId },
      select: { id: true },
    }),
  ]);
  if (!company || !partner) throw new Error("Empresa o partner inválido.");
  await db.companyCommercialPartner.upsert({
    where: {
      companyId_commercialPartnerId: {
        companyId: parsed.data.companyId,
        commercialPartnerId: parsed.data.commercialPartnerId,
      },
    },
    create: { organizationId: org.id, ...parsed.data },
    update: {
      role: parsed.data.role,
      defaultProfitSharePercentage: parsed.data.defaultProfitSharePercentage,
      notes: parsed.data.notes,
      isActive: true,
    },
  });
  revalidatePath(`/companies/${parsed.data.companyId}`);
}

export async function removeCompanyPartner(assignmentId: string) {
  const { db } = await requireOrgContext();
  const assignment = await db.companyCommercialPartner.findUnique({
    where: { id: assignmentId },
    select: { companyId: true },
  });
  if (!assignment) return;
  await db.companyCommercialPartner.update({
    where: { id: assignmentId },
    data: { isActive: false },
  });
  revalidatePath(`/companies/${assignment.companyId}`);
}

export async function assignOpportunityPartner(formData: FormData) {
  const { org, db } = await requireOrgContext();
  const parsed = opportunityCommercialPartnerSchema.safeParse(
    formObject(formData),
  );
  if (!parsed.success)
    throw new Error("Revisa los datos del partner comercial.");
  const opportunity = await db.opportunity.findUnique({
    where: { id: parsed.data.opportunityId },
    select: { id: true, companyId: true },
  });
  const partner = await db.commercialPartner.findUnique({
    where: { id: parsed.data.commercialPartnerId },
    select: { id: true },
  });
  if (!opportunity || !partner)
    throw new Error("Oportunidad o partner inválido.");

  const companyAssignment = await db.companyCommercialPartner.findUnique({
    where: {
      companyId_commercialPartnerId: {
        companyId: opportunity.companyId,
        commercialPartnerId: partner.id,
      },
    },
  });
  const percentage =
    parsed.data.profitSharePercentage ??
    Number(companyAssignment?.defaultProfitSharePercentage?.toString() ?? 50);

  await db.opportunityCommercialPartner.upsert({
    where: {
      opportunityId_commercialPartnerId: {
        opportunityId: opportunity.id,
        commercialPartnerId: partner.id,
      },
    },
    create: {
      organizationId: org.id,
      ...parsed.data,
      companyCommercialPartnerId: companyAssignment?.id,
      profitSharePercentage: percentage,
    },
    update: {
      role: parsed.data.role,
      notes: parsed.data.notes,
      companyCommercialPartnerId: companyAssignment?.id,
      profitSharePercentage: percentage,
    },
  });
  revalidatePath(`/opportunities/${opportunity.id}`);
}

export async function removeOpportunityPartner(assignmentId: string) {
  const { db } = await requireOrgContext();
  const assignment = await db.opportunityCommercialPartner.findUnique({
    where: { id: assignmentId },
    select: { opportunityId: true },
  });
  if (!assignment) return;
  await db.opportunityCommercialPartner.delete({ where: { id: assignmentId } });
  revalidatePath(`/opportunities/${assignment.opportunityId}`);
}

export async function saveCommercialOffer(
  _previousState: CommercialFormState,
  formData: FormData,
): Promise<CommercialFormState> {
  const { user, org, db } = await requireOrgContext();
  let input;
  try {
    input = {
      ...formObject(formData),
      plusVat: formData.get("plusVat") === "on",
      lineItems: parseJsonArray(formData, "lineItemsJson"),
      documents: parseJsonArray(formData, "documentsJson"),
      profitShares: parseJsonArray(formData, "profitSharesJson"),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Datos inválidos.",
    };
  }
  const parsed = commercialOfferSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisa la oferta comercial.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;
  const opportunity = await db.opportunity.findUnique({
    where: { id: data.opportunityId },
    select: {
      id: true,
      companyId: true,
      commercialPartners: {
        select: { commercialPartnerId: true },
      },
    },
  });
  if (!opportunity) return { error: "La oportunidad no existe." };
  if (data.presenterTeamMemberId) {
    const presenter = await db.teamMember.findUnique({
      where: { id: data.presenterTeamMemberId },
      select: { id: true },
    });
    if (!presenter)
      return { error: "El presentador no pertenece a la organización." };
  }
  const sourceIds = [
    ...new Set(
      data.documents
        .map((document) => document.entityContextSourceId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (sourceIds.length > 0) {
    const sourceCount = await db.entityContextSource.count({
      where: {
        id: { in: sourceIds },
        entityType: "opportunity",
        entityId: opportunity.id,
      },
    });
    if (sourceCount !== sourceIds.length) {
      return { error: "Uno de los documentos no pertenece a la organización." };
    }
  }

  try {
    assertEconomicAmounts(data);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Economía inválida.",
    };
  }

  let validUntil = data.validUntil;
  if (!validUntil && data.sentAt && data.validBusinessDays) {
    const holidays = await db.businessHoliday.findMany({
      where: { date: { gte: data.sentAt } },
      select: { date: true },
    });
    validUntil = addBusinessDays(
      data.sentAt,
      data.validBusinessDays,
      holidays.map((holiday) => holiday.date),
    );
  }

  let calculatedShares: ReturnType<typeof calculateProfitShares> = [];
  if (data.distributableProfitAmount != null) {
    const assignedPartnerIds = new Set(
      opportunity.commercialPartners.map(
        (assignment) => assignment.commercialPartnerId,
      ),
    );
    const partnerIds = [
      ...new Set(
        data.profitShares
          .map((share) => share.commercialPartnerId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const partners = await db.commercialPartner.findMany({
      where: { id: { in: partnerIds } },
      select: { id: true, displayName: true },
    });
    const partnerNames = new Map(
      partners.map((partner) => [partner.id, partner.displayName]),
    );
    const shareInputs = data.profitShares.map((share): ProfitShareInput => ({
      ...share,
      beneficiaryNameSnapshot:
        share.beneficiaryType === "organization"
          ? org.name
          : (partnerNames.get(share.commercialPartnerId ?? "") ??
            share.beneficiaryNameSnapshot),
    }));
    if (
      shareInputs.some(
        (share) =>
          share.beneficiaryType === "partner" &&
          (!share.commercialPartnerId ||
            !assignedPartnerIds.has(share.commercialPartnerId)),
      )
    ) {
      return {
        error: "Todos los beneficiarios deben ser partners de la oportunidad.",
      };
    }
    try {
      calculatedShares = calculateProfitShares(
        data.distributableProfitAmount,
        shareInputs,
      );
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Reparto inválido.",
      };
    }
  } else {
    calculatedShares = calculateProfitShares(0, [
      {
        beneficiaryType: "organization",
        beneficiaryNameSnapshot: org.name,
        percentage: 100,
      },
    ]);
  }

  const {
    id,
    lineItems,
    documents,
    profitShares: _profitShares,
    ...offerData
  } = data;
  void _profitShares;
  let offerId: string;
  try {
    offerId = await withOrgTransaction(org.id, async (tx) => {
      let targetId = id;
      let versionNumber: number;
      if (id) {
        const existing = await tx.commercialOffer.findFirst({
          where: { id, organizationId: org.id, opportunityId: opportunity.id },
        });
        if (!existing) throw new Error("La oferta no existe.");
        if (existing.status !== "draft") {
          throw new Error(
            "Crea una nueva versión para modificar una oferta emitida.",
          );
        }
        versionNumber = existing.versionNumber;
        await tx.commercialOfferLineItem.deleteMany({
          where: { commercialOfferId: id, organizationId: org.id },
        });
        await tx.commercialOfferDocument.deleteMany({
          where: { commercialOfferId: id, organizationId: org.id },
        });
        await tx.commercialOfferProfitShare.deleteMany({
          where: { commercialOfferId: id, organizationId: org.id },
        });
        await tx.commercialOffer.update({
          where: { id, organizationId: org.id },
          data: { ...offerData, validUntil },
        });
      } else {
        const latest = await tx.commercialOffer.findFirst({
          where: { opportunityId: opportunity.id, organizationId: org.id },
          orderBy: { versionNumber: "desc" },
          select: { versionNumber: true },
        });
        versionNumber = (latest?.versionNumber ?? 0) + 1;
        const created = await tx.commercialOffer.create({
          data: {
            ...offerData,
            organizationId: org.id,
            opportunityId: opportunity.id,
            versionNumber,
            validUntil,
            createdById: user.id,
          },
        });
        targetId = created.id;
      }
      if (!targetId) throw new Error("No se pudo resolver la oferta.");

      for (const [index, item] of lineItems.entries()) {
        await tx.commercialOfferLineItem.create({
          data: {
            organizationId: org.id,
            commercialOfferId: targetId,
            ...item,
            sortOrder: index,
          },
        });
      }
      for (const document of documents) {
        await tx.commercialOfferDocument.create({
          data: {
            organizationId: org.id,
            commercialOfferId: targetId,
            ...document,
          },
        });
      }
      for (const share of calculatedShares) {
        await tx.commercialOfferProfitShare.create({
          data: {
            organizationId: org.id,
            commercialOfferId: targetId,
            beneficiaryType: share.beneficiaryType,
            commercialPartnerId: share.commercialPartnerId,
            beneficiaryNameSnapshot: share.beneficiaryNameSnapshot,
            percentage: share.percentage,
            amount: share.amount,
          },
        });
      }
      return targetId;
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo guardar.",
    };
  }

  revalidatePath(`/opportunities/${opportunity.id}`);
  revalidatePath(`/opportunities/${opportunity.id}/offers/${offerId}`);
  redirect(`/opportunities/${opportunity.id}`);
}

export async function cloneCommercialOffer(offerId: string) {
  const { user, org } = await requireOrgContext();
  const cloned = await withOrgTransaction(org.id, async (tx) => {
    const source = await tx.commercialOffer.findFirst({
      where: { id: offerId, organizationId: org.id },
      include: { lineItems: true, documents: true, profitShares: true },
    });
    if (!source) throw new Error("La oferta no existe.");
    const latest = await tx.commercialOffer.findFirst({
      where: { opportunityId: source.opportunityId, organizationId: org.id },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    const {
      id: _id,
      versionNumber: _version,
      status: _status,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      lineItems,
      documents,
      profitShares,
      sourceFingerprint: _fingerprint,
      sourceRefs,
      ...copy
    } = source;
    void _id;
    void _version;
    void _status;
    void _createdAt;
    void _updatedAt;
    void _fingerprint;
    const created = await tx.commercialOffer.create({
      data: {
        ...copy,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        status: "draft",
        sentAt: null,
        validUntil: null,
        sourceFingerprint: null,
        createdVia: "manual",
        createdById: user.id,
        ...(sourceRefs == null
          ? {}
          : { sourceRefs: sourceRefs as Prisma.InputJsonValue }),
      },
    });
    for (const item of lineItems) {
      const { id, commercialOfferId, createdAt, updatedAt, ...data } = item;
      void id;
      void commercialOfferId;
      void createdAt;
      void updatedAt;
      await tx.commercialOfferLineItem.create({
        data: { ...data, commercialOfferId: created.id },
      });
    }
    for (const document of documents) {
      const { id, commercialOfferId, createdAt, updatedAt, ...data } = document;
      void id;
      void commercialOfferId;
      void createdAt;
      void updatedAt;
      await tx.commercialOfferDocument.create({
        data: { ...data, commercialOfferId: created.id },
      });
    }
    for (const share of profitShares) {
      const { id, commercialOfferId, createdAt, updatedAt, ...data } = share;
      void id;
      void commercialOfferId;
      void createdAt;
      void updatedAt;
      await tx.commercialOfferProfitShare.create({
        data: { ...data, commercialOfferId: created.id },
      });
    }
    await tx.commercialOffer.updateMany({
      where: {
        opportunityId: source.opportunityId,
        organizationId: org.id,
        id: { not: created.id },
        status: { in: ["draft", "sent"] },
      },
      data: { status: "superseded" },
    });
    return created;
  });
  revalidatePath(`/opportunities/${cloned.opportunityId}`);
  redirect(`/opportunities/${cloned.opportunityId}/offers/${cloned.id}`);
}
