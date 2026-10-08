import type { Prisma } from "@prisma/client";
import type { TenantClient } from "@/lib/tenant";
import type { AgentToolContext } from "@/lib/agent/executor";
import type { WriteToolDeps } from "./record-lookup";

// Cliente Prisma en memoria para testear las tools sin DB real (mismo
// criterio que apply-lock.test.ts / convert.test.ts). Soporta el subconjunto
// de where/orderBy que usan las tools: igualdad, null, in, lt/lte/gt/gte,
// equals+mode, OR/AND y filtros sobre relaciones ya resueltas. `select` e
// `include` se ignoran: siempre devuelve la fila con sus relaciones.

export type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const OPERATORS = new Set([
  "in",
  "lt",
  "lte",
  "gt",
  "gte",
  "equals",
  "not",
  "mode",
]);

function comparable(value: unknown): unknown {
  return value instanceof Date ? value.getTime() : value;
}

function matchOperators(
  value: unknown,
  cond: Record<string, unknown>,
): boolean {
  const insensitive = cond.mode === "insensitive";
  const norm = (v: unknown) =>
    insensitive && typeof v === "string" ? v.toLowerCase() : comparable(v);
  const current = norm(value);
  if ("equals" in cond && current !== norm(cond.equals)) return false;
  if ("in" in cond && !(cond.in as unknown[]).map(norm).includes(current)) {
    return false;
  }
  if ("not" in cond) {
    if (cond.not === null ? value == null : current === norm(cond.not)) {
      return false;
    }
  }
  const bounds: [string, (a: number, b: number) => boolean][] = [
    ["lt", (a, b) => a < b],
    ["lte", (a, b) => a <= b],
    ["gt", (a, b) => a > b],
    ["gte", (a, b) => a >= b],
  ];
  for (const [op, test] of bounds) {
    if (!(op in cond)) continue;
    if (value == null) return false;
    if (!test(Number(comparable(value)), Number(comparable(cond[op])))) {
      return false;
    }
  }
  return true;
}

function matchValue(value: unknown, cond: unknown): boolean {
  if (cond === undefined) return true;
  if (cond === null) return value == null;
  if (cond instanceof Date) return comparable(value) === cond.getTime();
  if (typeof cond !== "object") return value === cond;
  const record = cond as Record<string, unknown>;
  if (Object.keys(record).some((key) => OPERATORS.has(key))) {
    return matchOperators(value, record);
  }
  if (value == null || typeof value !== "object") return false;
  return matches(value as Row, record);
}

export function matches(row: Row, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Where[]).some((w) => matches(row, w));
    if (key === "AND") return (cond as Where[]).every((w) => matches(row, w));
    return matchValue(row[key], cond);
  });
}

type OrderSpec = Record<
  string,
  "asc" | "desc" | { sort: "asc" | "desc"; nulls?: "first" | "last" }
>;

function sortRows(rows: Row[], orderBy: OrderSpec | OrderSpec[] | undefined) {
  if (!orderBy) return rows;
  const specs = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const spec of specs) {
      const [field, raw] = Object.entries(spec)[0];
      const dir = typeof raw === "string" ? raw : raw.sort;
      const nullsLast = typeof raw === "string" ? true : raw.nulls !== "first";
      const av = comparable(a[field]);
      const bv = comparable(b[field]);
      if (av == null && bv == null) continue;
      if (av == null) return nullsLast ? 1 : -1;
      if (bv == null) return nullsLast ? -1 : 1;
      if (av === bv) continue;
      const cmp = (av as number) < (bv as number) ? -1 : 1;
      return dir === "asc" ? cmp : -cmp;
    }
    return 0;
  });
}

const DEFAULTS: Record<string, () => Row> = {
  activity: () => ({
    status: "todo",
    createdVia: "manual",
    companyId: null,
    opportunityId: null,
    personId: null,
    assigneeId: null,
    completedById: null,
    description: null,
    dueDate: null,
    plannedDate: null,
    completedAt: null,
    statusChangedAt: null,
    blockedReason: null,
    priority: null,
    occurredAt: null,
    durationMinutes: null,
    channel: null,
    outcomes: null,
  }),
  meeting: () => ({
    meetingType: "discovery",
    status: "open",
    sourceType: "manual",
    processingStatus: "pending",
    rawTranscript: null,
    aiSummary: null,
    opportunityId: null,
    participants: [],
  }),
  timelineEvent: () => ({
    opportunityId: null,
    summary: null,
    refType: null,
    refId: null,
    actorId: null,
  }),
};

export function createFakeCrmDb(seed: Record<string, Row[]> = {}) {
  const tables = new Map<string, Row[]>();
  for (const [model, rows] of Object.entries(seed)) {
    tables.set(
      model,
      rows.map((row) => ({ ...row })),
    );
  }
  let nextId = 1;
  const table = (model: string) => {
    if (!tables.has(model)) tables.set(model, []);
    return tables.get(model)!;
  };
  const byId = (model: string, id: unknown) =>
    id == null ? null : (table(model).find((row) => row.id === id) ?? null);

  // Relaciones que leen las tools (where sobre relación o datos de salida).
  function withRelations(model: string, row: Row): Row {
    switch (model) {
      case "activity":
        return {
          ...row,
          company: byId("company", row.companyId),
          opportunity: byId("opportunity", row.opportunityId),
          person: byId("person", row.personId),
          assignee: byId("teamMember", row.assigneeId),
          participants: table("activityPerson").filter(
            (link) => link.activityId === row.id,
          ),
        };
      case "teamMember":
        return { ...row, user: byId("user", row.userId) };
      case "meeting":
        return {
          ...row,
          company: byId("company", row.companyId),
          opportunity: byId("opportunity", row.opportunityId),
          proposals: [],
        };
      default:
        return { ...row };
    }
  }

  function createRow(model: string, data: Row): Row {
    // Creates anidados: activity.participants y cRMChangeProposal.items. En
    // meeting, participants es una columna Json y se guarda tal cual.
    const nested = model === "activity" || model === "cRMChangeProposal";
    const { participants, items, ...rest } = data as Row & {
      participants?: { create: Row[] };
      items?: { create: Row[] };
    };
    const scalars = nested ? rest : data;
    const row: Row = {
      ...(DEFAULTS[model]?.() ?? {}),
      id: `${model}-${nextId++}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...(model === "timelineEvent" ? { occurredAt: new Date() } : {}),
      ...scalars,
    };
    table(model).push(row);
    if (nested && participants) {
      for (const link of participants.create) {
        createRow("activityPerson", { ...link, activityId: row.id });
      }
    }
    if (nested && items) {
      row.items = items.create.map((item) =>
        createRow("cRMChangeItem", { ...item, proposalId: row.id }),
      );
    }
    return row;
  }

  function api(model: string) {
    const find = (where?: Where) =>
      table(model)
        .map((row) => withRelations(model, row))
        .filter((row) => matches(row, where));
    return {
      findUnique: async ({ where }: { where: Where }) => find(where)[0] ?? null,
      findFirst: async ({ where }: { where?: Where } = {}) =>
        find(where)[0] ?? null,
      findMany: async ({
        where,
        orderBy,
        take,
      }: {
        where?: Where;
        orderBy?: OrderSpec | OrderSpec[];
        take?: number;
      } = {}) => sortRows(find(where), orderBy).slice(0, take ?? undefined),
      count: async ({ where }: { where?: Where } = {}) => find(where).length,
      create: async ({ data }: { data: Row }) =>
        withRelations(model, createRow(model, data)),
      update: async ({ where, data }: { where: Where; data: Row }) => {
        const row = table(model).find((r) =>
          matches(withRelations(model, r), where),
        );
        if (!row) throw new Error(`${model} no encontrado (P2025)`);
        if (data.items && typeof data.items === "object") {
          const { items, ...rest } = data as Row & { items: { create: Row[] } };
          Object.assign(row, rest);
          for (const item of items.create) {
            createRow("cRMChangeItem", { ...item, proposalId: row.id });
          }
          row.items = table("cRMChangeItem").filter(
            (i) => i.proposalId === row.id,
          );
        } else {
          Object.assign(row, data, { updatedAt: new Date() });
        }
        return withRelations(model, row);
      },
      updateMany: async ({ where, data }: { where: Where; data: Row }) => {
        const rows = table(model).filter((r) =>
          matches(withRelations(model, r), where),
        );
        for (const row of rows) Object.assign(row, data);
        return { count: rows.length };
      },
      delete: async ({ where }: { where: Where }) => {
        const rows = table(model);
        const index = rows.findIndex((r) => matches(r, where));
        if (index === -1) throw new Error(`${model} no encontrado (P2025)`);
        const [removed] = rows.splice(index, 1);
        if (model === "activity") {
          tables.set(
            "activityPerson",
            table("activityPerson").filter((l) => l.activityId !== removed.id),
          );
        }
        return removed;
      },
      deleteMany: async ({ where }: { where?: Where } = {}) => {
        const rows = table(model);
        const keep = rows.filter((r) => !matches(r, where));
        tables.set(model, keep);
        return { count: rows.length - keep.length };
      },
    };
  }

  const models = new Map<string, ReturnType<typeof api>>();
  const db = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (!models.has(prop)) models.set(prop, api(prop));
        return models.get(prop);
      },
    },
  );

  return {
    db: db as unknown as TenantClient,
    tx: db as unknown as Prisma.TransactionClient,
    rows: (model: string) => table(model),
  };
}

export type WorkflowCall = Parameters<WriteToolDeps["evaluateWorkflows"]>[2];

export function createTestContext(seed: Record<string, Row[]> = {}) {
  const fake = createFakeCrmDb(seed);
  const workflowCalls: WorkflowCall[] = [];
  const ctx: AgentToolContext = {
    organizationId: "org-1",
    db: fake.db,
    userId: "user-1",
    threadId: "thread-1",
    proposalModel: "mcp",
    pageContext: null,
    turnState: { changeCount: 0, pendingInstant: null, proposalId: null },
  };
  const deps: WriteToolDeps = {
    transaction: async (_orgId, fn) => fn(fake.tx),
    evaluateWorkflows: async (_db, _orgId, event) => {
      workflowCalls.push(event);
    },
  };
  return { ...fake, ctx, deps, workflowCalls };
}

// Datos base: dos empresas, una oportunidad por empresa, contactos y equipo.
export function baseSeed(): Record<string, Row[]> {
  return {
    company: [
      {
        id: "co-1",
        organizationId: "org-1",
        name: "Acme",
        lastContactAt: null,
      },
      {
        id: "co-2",
        organizationId: "org-1",
        name: "Globex",
        lastContactAt: new Date("2026-10-05T12:00:00Z"),
      },
    ],
    opportunity: [
      {
        id: "op-1",
        organizationId: "org-1",
        companyId: "co-1",
        name: "Acme CRM",
        stage: { key: "discovery", label: "Discovery" },
      },
      {
        id: "op-2",
        organizationId: "org-1",
        companyId: "co-2",
        name: "Globex BI",
        stage: { key: "proposal", label: "Propuesta" },
      },
    ],
    person: [
      {
        id: "pe-1",
        organizationId: "org-1",
        companyId: "co-1",
        firstName: "Ana",
        lastName: "Pérez",
      },
      {
        id: "pe-2",
        organizationId: "org-1",
        companyId: "co-1",
        firstName: "Luis",
        lastName: "Gómez",
      },
    ],
    user: [
      {
        id: "user-1",
        organizationId: "org-1",
        name: "Tomás",
        email: "tomas@zalantos.com",
      },
      {
        id: "user-2",
        organizationId: "org-1",
        name: "Carla",
        email: "carla@zalantos.com",
      },
    ],
    teamMember: [
      {
        id: "tm-1",
        organizationId: "org-1",
        name: "Tomás",
        email: null,
        userId: "user-1",
        isActive: true,
      },
      {
        id: "tm-2",
        organizationId: "org-1",
        name: "Carla",
        email: "carla@zalantos.com",
        userId: "user-2",
        isActive: true,
      },
      {
        id: "tm-3",
        organizationId: "org-1",
        name: "Ex miembro",
        email: "ex@zalantos.com",
        userId: null,
        isActive: false,
      },
    ],
  };
}
