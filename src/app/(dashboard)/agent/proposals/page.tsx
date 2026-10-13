import Link from "next/link";
import type { Prisma, ProposalStatus } from "@prisma/client";
import { requireOrgContext } from "@/lib/tenant";
import { PageHeader } from "@/components/shared/page-header";
import { AgentProposalCard } from "@/components/agent/agent-proposal-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TYPE_LABELS: Record<string, string> = {
  update_field: "Actualizar campo",
  stage_change: "Cambiar etapa",
  add_company: "Crear empresa",
  add_opportunity: "Crear oportunidad",
  add_contact: "Agregar contacto",
  link_contact: "Vincular contacto",
  create_task: "Crear tarea",
  add_note: "Crear nota",
  log_activity: "Registrar actividad",
  create_meeting: "Crear reunión",
  update_task: "Actualizar tarea",
  update_note: "Actualizar nota",
  update_activity: "Actualizar actividad",
  update_meeting: "Actualizar reunión",
};

type SearchParams = {
  status?: string;
  channel?: string;
  actorId?: string;
  entity?: string;
  confidence?: string;
  from?: string;
  to?: string;
  page?: string;
};

function fallbackValue(value: Prisma.JsonValue | null): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object" && !Array.isArray(value) && "value" in value) {
    const inner = (value as { value: unknown }).value;
    return inner === null || inner === undefined ? "—" : String(inner);
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function buildQuery(params: SearchParams, overrides: Partial<SearchParams>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...overrides })) {
    if (value) query.set(key, value);
  }
  return `/agent/proposals?${query.toString()}`;
}

export default async function AgentProposalsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const take = 20;
  const { db } = await requireOrgContext();
  const where: Prisma.CRMChangeProposalWhereInput = {
    ...(params.status ? { status: params.status as ProposalStatus } : {}),
    ...(params.channel ? { channel: params.channel } : {}),
    ...(params.actorId ? { initiatedBy: params.actorId } : {}),
    ...(params.entity ? { items: { some: { entity: params.entity } } } : {}),
    ...(params.confidence === "low" ? { confidence: { lt: 0.8 } } : {}),
    ...(params.confidence === "high" ? { confidence: { gte: 0.8 } } : {}),
    ...(params.from || params.to
      ? {
          createdAt: {
            ...(params.from
              ? { gte: new Date(`${params.from}T00:00:00`) }
              : {}),
            ...(params.to ? { lte: new Date(`${params.to}T23:59:59`) } : {}),
          },
        }
      : {}),
  };
  const include = {
    items: {
      orderBy: [{ sequence: "asc" as const }, { id: "asc" as const }],
    },
  } satisfies Prisma.CRMChangeProposalInclude;
  const [proposals, total, users, attention] = await Promise.all([
    db.cRMChangeProposal.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * take,
      take,
      include,
    }),
    db.cRMChangeProposal.count({ where }),
    db.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    page === 1 && Object.keys(where).length === 0
      ? db.cRMChangeProposal.findMany({
          where: {
            OR: [
              { confidence: { lt: 0.8 } },
              {
                status: {
                  in: ["pending", "failed", "partially_applied"],
                },
              },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: 6,
          include,
        })
      : Promise.resolve([]),
  ]);
  const userNames = new Map(
    users.map((user) => [user.id, user.name ?? user.email]),
  );
  const pageCount = Math.max(1, Math.ceil(total / take));

  function card(proposal: (typeof proposals)[number]) {
    return (
      <AgentProposalCard
        key={proposal.id}
        part={{
          type: "tool-proposal",
          toolCallId: proposal.id,
          state: "output-available",
          output: {
            status: proposal.status,
            proposalId: proposal.id,
            channel: proposal.channel,
            createdAt: proposal.createdAt,
            initiatorName: proposal.initiatedBy
              ? userNames.get(proposal.initiatedBy)
              : null,
            items: proposal.items.map((item) => ({
              id: item.id,
              label: item.label ?? TYPE_LABELS[item.type] ?? item.type,
              before: item.before ?? fallbackValue(item.beforeValue),
              after: item.after ?? fallbackValue(item.afterValue),
              explanation: item.explanation,
              evidence: item.evidence,
              confidence: item.confidence,
              approved: item.approved,
              status: item.status,
              undoExpiresAt: item.undoExpiresAt,
              undoExpired: Boolean(
                item.undoExpiresAt && item.undoExpiresAt < new Date(),
              ),
              failureMessage: item.failureMessage,
            })),
          },
        }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Actividad de IA"
        description="Trazabilidad de cambios ejecutados por IA, con 90 días para deshacerlos de forma segura."
      />

      <form className="mb-6 flex flex-wrap items-center gap-2">
        <select
          name="status"
          defaultValue={params.status ?? ""}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="applying">Aplicando</option>
          <option value="applied">Aplicados</option>
          <option value="partially_applied">Parciales</option>
          <option value="pending">Pendientes</option>
          <option value="failed">Fallidos</option>
          <option value="rejected">Rechazados</option>
          <option value="partially_approved">Aprobados parcialmente</option>
          <option value="partially_reverted">Deshechos parcialmente</option>
          <option value="reverted">Deshechos</option>
        </select>
        <select
          name="channel"
          defaultValue={params.channel ?? ""}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">Todos los canales</option>
          {[
            "web",
            "telegram",
            "mcp",
            "meeting",
            "enrichment",
            "workflow",
            "legacy",
          ].map((channel) => (
            <option key={channel} value={channel}>
              {channel}
            </option>
          ))}
        </select>
        <select
          name="actorId"
          defaultValue={params.actorId ?? ""}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">Todos los usuarios</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name ?? user.email}
            </option>
          ))}
        </select>
        <select
          name="entity"
          defaultValue={params.entity ?? ""}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">Todas las entidades</option>
          {[
            "company",
            "person",
            "opportunity",
            "activity",
            "note",
            "meeting",
          ].map((entity) => (
            <option key={entity} value={entity}>
              {entity}
            </option>
          ))}
        </select>
        <select
          name="confidence"
          defaultValue={params.confidence ?? ""}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          <option value="">Toda confianza</option>
          <option value="low">Requiere atención (&lt;80%)</option>
          <option value="high">Confianza alta</option>
        </select>
        <Input
          type="date"
          name="from"
          defaultValue={params.from}
          className="w-36"
        />
        <Input
          type="date"
          name="to"
          defaultValue={params.to}
          className="w-36"
        />
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      {attention.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold">Requiere atención</h2>
          <div className="max-w-3xl space-y-4">{attention.map(card)}</div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold">Historial</h2>
        <div className="max-w-3xl space-y-4">
          {proposals.length ? (
            proposals.map(card)
          ) : (
            <p className="text-muted-foreground text-sm">
              No hay cambios con estos filtros.
            </p>
          )}
        </div>
      </section>

      {pageCount > 1 && (
        <div className="mt-6 flex max-w-3xl items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {total} cambio(s) · página {page} de {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1}
              render={
                <Link href={buildQuery(params, { page: String(page - 1) })} />
              }
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              disabled={page >= pageCount}
              render={
                <Link href={buildQuery(params, { page: String(page + 1) })} />
              }
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
