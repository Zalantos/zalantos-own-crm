import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Prisma } from "@prisma/client";
import { convertLeadTx, type ConvertibleLead } from "./convert";

type FakeCompany = { id: string; name: string };
type FakePerson = {
  id: string;
  companyId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  roleTitle: string | null;
};
type FakeOpportunity = Record<string, unknown> & { id: string };

// Fake de las piezas de Prisma.TransactionClient que convertLeadTx toca.
// Mismo estilo que apply-lock.test.ts: estado en memoria, sin DB real.
function createFakeTx(seed?: { companies?: FakeCompany[]; people?: FakePerson[] }) {
  const companies: FakeCompany[] = seed?.companies ? [...seed.companies] : [];
  const people: FakePerson[] = seed?.people ? [...seed.people] : [];
  const opportunities: FakeOpportunity[] = [];
  const notes: Record<string, unknown>[] = [];
  const timelineEvents: Record<string, unknown>[] = [];
  const leadUpdates: Record<string, unknown>[] = [];
  let nextId = 1;
  const genId = (prefix: string) => `${prefix}-${nextId++}`;

  const tx = {
    company: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        companies.find((c) => c.id === where.id) ?? null,
      create: async ({ data }: { data: { name: string } }) => {
        const row: FakeCompany = { id: genId("company"), name: data.name };
        companies.push(row);
        return row;
      },
    },
    person: {
      findFirst: async ({
        where,
      }: {
        where: {
          companyId?: string;
          email?: { equals: string };
          firstName?: { equals: string };
          lastName?: { equals: string };
        };
      }) => {
        let match: FakePerson | undefined;
        if (where.email) {
          const target = where.email.equals.toLowerCase();
          match = people.find((p) => p.email?.toLowerCase() === target);
        } else if (where.firstName) {
          const first = where.firstName.equals.toLowerCase();
          const last = (where.lastName?.equals ?? "").toLowerCase();
          match = people.find(
            (p) =>
              p.companyId === where.companyId &&
              p.firstName.toLowerCase() === first &&
              p.lastName.toLowerCase() === last,
          );
        }
        if (!match) return null;
        const company = companies.find((c) => c.id === match!.companyId);
        return { ...match, company: company ? { name: company.name } : null };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakePerson>;
      }) => {
        const person = people.find((p) => p.id === where.id);
        if (!person) throw new Error("person not found");
        Object.assign(person, data);
        return person;
      },
      create: async ({
        data,
      }: {
        data: {
          companyId: string;
          firstName: string;
          lastName: string;
          email: string | null;
        };
      }) => {
        const row: FakePerson = {
          id: genId("person"),
          companyId: data.companyId,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: null,
          roleTitle: null,
        };
        people.push(row);
        return row;
      },
    },
    pipelineStage: {
      findFirst: async () => ({ id: "stage-1", label: "Lead identificado" }),
    },
    opportunity: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: FakeOpportunity = { id: genId("opportunity"), ...data };
        opportunities.push(row);
        return row;
      },
    },
    note: {
      create: async ({ data }: { data: { body: string } }) => {
        const row = { id: genId("note"), ...data };
        notes.push(row);
        return row;
      },
    },
    timelineEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        timelineEvents.push(data);
        return data;
      },
    },
    inboundLead: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        leadUpdates.push(data);
        return data;
      },
    },
  } as unknown as Prisma.TransactionClient;

  return { tx, companies, people, opportunities, notes, timelineEvents, leadUpdates };
}

function makeLead(overrides: Partial<ConvertibleLead> = {}): ConvertibleLead {
  return {
    id: "lead-1",
    source: "website_contact",
    firstName: "Juan",
    lastName: "Pérez",
    email: "juan@acme.cl",
    company: "Acme Mining",
    message: "Queremos automatizar nuestro proceso.",
    reviewedAt: null,
    reviewedById: null,
    ...overrides,
  };
}

const ctx = { organizationId: "org-1", actorId: "user-1" };

describe("convertLeadTx", () => {
  it("crea Company, Person y Opportunity nuevas", async () => {
    const { tx, companies, people, opportunities } = createFakeTx();
    const lead = makeLead();

    const result = await convertLeadTx(tx, ctx, lead, {
      companyName: lead.company ?? undefined,
      opportunityName: "Acme · Inbound",
    });

    assert.equal(companies.length, 1);
    assert.equal(people.length, 1);
    assert.equal(opportunities.length, 1);
    assert.equal(result.companyId, companies[0]!.id);
    assert.equal(result.personId, people[0]!.id);
    assert.equal(opportunities[0]!.decisionMakerId, result.personId);
  });

  it("reutiliza una Person existente por email en vez de crear otra", async () => {
    const existingCompany: FakeCompany = { id: "company-1", name: "Acme Mining" };
    const existingPerson: FakePerson = {
      id: "person-1",
      companyId: "company-1",
      firstName: "Juan",
      lastName: "Pérez",
      email: "juan@acme.cl",
      phone: null,
      roleTitle: null,
    };
    const { tx, people } = createFakeTx({
      companies: [existingCompany],
      people: [existingPerson],
    });
    const lead = makeLead({ email: "JUAN@ACME.cl" });

    const result = await convertLeadTx(tx, ctx, lead, {
      companyId: "company-1",
      opportunityName: "Acme · Inbound",
    });

    assert.equal(result.personId, "person-1");
    assert.equal(people.length, 1, "no debe crear una segunda Person");
  });

  it("no crea una segunda Person duplicada al convertir dos leads de la misma empresa", async () => {
    const existingCompany: FakeCompany = { id: "company-1", name: "Acme Mining" };
    const { tx, people } = createFakeTx({ companies: [existingCompany] });

    const leadA = makeLead({ id: "lead-a" });
    const leadB = makeLead({ id: "lead-b" });

    const first = await convertLeadTx(tx, ctx, leadA, {
      companyId: "company-1",
      opportunityName: "Acme · Inbound A",
    });
    const second = await convertLeadTx(tx, ctx, leadB, {
      companyId: "company-1",
      opportunityName: "Acme · Inbound B",
    });

    assert.equal(people.length, 1);
    assert.equal(first.personId, second.personId);
  });

  it("marca el InboundLead como convertido con las referencias creadas", async () => {
    const { tx, leadUpdates } = createFakeTx();
    const lead = makeLead();

    const result = await convertLeadTx(tx, ctx, lead, {
      companyName: lead.company ?? undefined,
      opportunityName: "Acme · Inbound",
    });

    assert.equal(leadUpdates.length, 1);
    const update = leadUpdates[0]!;
    assert.equal(update.status, "converted");
    assert.ok(update.convertedAt instanceof Date);
    assert.equal(update.convertedCompanyId, result.companyId);
    assert.equal(update.convertedPersonId, result.personId);
    assert.equal(update.convertedOpportunityId, result.opportunityId);
    assert.equal(update.reviewedById, ctx.actorId);
  });
});
