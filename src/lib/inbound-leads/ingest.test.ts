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
};

// Fake scoped a una sola org (como forOrg() scopearía en la realidad):
// create() respeta la unicidad (organizationId, source, externalId) y lanza
// P2002 igual que Postgres lo haría contra el índice único real.
function createFakeOrgDb(organizationId: string, seed: StoredLead[] = []) {
  const rows = [...seed];
  let nextId = rows.length + 1;

  const db = {
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
        return found ? { id: found.id } : null;
      },
    },
  } as unknown as TenantClient;

  return { db, rows };
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
});
