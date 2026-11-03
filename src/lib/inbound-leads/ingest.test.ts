import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import type { TenantClient } from "@/lib/tenant";
import { ingestInboundLead } from "./ingest";
import type { InboundLeadPayload } from "@/lib/zod/inbound-lead";

type StoredLead = {
  id: string;
  organizationId: string;
  source: string;
  externalId: string;
  attributionId?: string | null;
};

type StoredAttribution = Record<string, unknown> & { id: string };

// Fake scoped a una sola org (como forOrg() scopearía en la realidad):
// create() respeta la unicidad (organizationId, source, externalId) y lanza
// P2002 igual que Postgres lo haría contra el índice único real.
function createFakeOrgDb(organizationId: string, seed: StoredLead[] = []) {
  const rows = [...seed];
  const attributions: StoredAttribution[] = [];
  const campaigns: { id: string; key: string; name: string }[] = [];
  let nextId = rows.length + 1;

  const db = {
    commercialAttribution: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `attr-${attributions.length + 1}`, ...data };
        attributions.push(row);
        return { id: row.id };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const index = attributions.findIndex((row) => row.id === where.id);
        if (index >= 0) attributions.splice(index, 1);
      },
    },
    campaign: {
      upsert: async ({
        where,
        create,
      }: {
        where: { organizationId_key: { key: string } };
        create: { key: string; name: string };
      }) => {
        const key = where.organizationId_key.key;
        const existing = campaigns.find((campaign) => campaign.key === key);
        if (existing) return { id: existing.id };
        const row = { id: `camp-${campaigns.length + 1}`, key, name: create.name };
        campaigns.push(row);
        return { id: row.id };
      },
    },
    inboundLead: {
      create: async ({
        data,
      }: {
        data: { organizationId: string; source: string; externalId: string };
      }) => {
        const clash = rows.find(
          (row) =>
            row.organizationId === organizationId &&
            row.source === data.source &&
            row.externalId === data.externalId,
        );
        if (clash) {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "test",
          });
        }
        const row: StoredLead = {
          id: `lead-${nextId++}`,
          organizationId,
          source: data.source,
          externalId: data.externalId,
        };
        rows.push(row);
        return { id: row.id };
      },
      findFirst: async ({
        where,
      }: {
        where: { source: string; externalId: string };
      }) => {
        const found = rows.find(
          (row) =>
            row.organizationId === organizationId &&
            row.source === where.source &&
            row.externalId === where.externalId,
        );
        return found ? { id: found.id, attributionId: found.attributionId ?? null } : null;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; attributionId: null };
        data: { attributionId: string };
      }) => {
        const row = rows.find((candidate) => candidate.id === where.id && !candidate.attributionId);
        if (!row) return { count: 0 };
        row.attributionId = data.attributionId;
        return { count: 1 };
      },
    },
  } as unknown as TenantClient;

  return { db, rows, attributions, campaigns };
}

const basePayload: InboundLeadPayload = {
  source: "website_contact",
  external_id: "ext-1",
  first_name: "Tomás",
  last_name: "Rodríguez",
  email: "Tomas@Empresa.cl",
  company: "Empresa SpA",
  message: "Queremos automatizar...",
  page: "/contacto",
};

describe("ingestInboundLead", () => {
  it("crea un InboundLead nuevo", async () => {
    const { db, rows } = createFakeOrgDb("org-1");
    const result = await ingestInboundLead(db, "org-1", basePayload);
    assert.equal(result.created, true);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.externalId, "ext-1");
  });

  it("es idempotente: el mismo external_id no crea un segundo registro", async () => {
    const { db, rows } = createFakeOrgDb("org-1");
    const first = await ingestInboundLead(db, "org-1", basePayload);
    const retry = await ingestInboundLead(db, "org-1", basePayload);

    assert.equal(first.created, true);
    assert.equal(retry.created, false);
    assert.equal(retry.inboundLeadId, first.inboundLeadId);
    assert.equal(rows.length, 1);
  });

  it("no cruza organizaciones: el mismo external_id en otra org no choca", async () => {
    const orgA = createFakeOrgDb("org-a");
    const orgB = createFakeOrgDb("org-b");

    const resultA = await ingestInboundLead(orgA.db, "org-a", basePayload);
    const resultB = await ingestInboundLead(orgB.db, "org-b", basePayload);

    // Cada org tiene su propio store (como forOrg() scopearía en Postgres):
    // ambas crean su propio registro en vez de que la segunda org se tope
    // con el unique de la primera.
    assert.equal(resultA.created, true);
    assert.equal(resultB.created, true);
    assert.equal(orgA.rows.length, 1);
    assert.equal(orgB.rows.length, 1);
  });

  it("registra atribución con UTM y vincula la campaña recibida (sin inventarla)", async () => {
    const { db, attributions, campaigns } = createFakeOrgDb("org-1");
    await ingestInboundLead(db, "org-1", {
      ...basePayload,
      external_id: "ext-utm",
      utm_source: "linkedin",
      utm_medium: "paid",
      utm_campaign: "Webinar Octubre",
      landing_page: "/webinar",
    });
    assert.equal(attributions.length, 1);
    assert.equal(attributions[0]!.sourceChannel, "campaign");
    assert.equal(attributions[0]!.utmCampaign, "Webinar Octubre");
    assert.equal(attributions[0]!.campaignId, "camp-1");
    assert.equal(campaigns[0]!.key, "webinar-octubre");
  });

  it("los reintentos no duplican la atribución", async () => {
    const { db, attributions } = createFakeOrgDb("org-1");
    await ingestInboundLead(db, "org-1", basePayload);
    await ingestInboundLead(db, "org-1", basePayload);
    assert.equal(attributions.length, 1);
    assert.equal(attributions[0]!.sourceChannel, "web");
    assert.equal(attributions[0]!.campaignId, null);
  });
});
