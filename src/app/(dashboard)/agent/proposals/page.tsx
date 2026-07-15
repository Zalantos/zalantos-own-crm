import type { Prisma } from "@prisma/client";
import { requireOrgContext } from "@/lib/tenant";
import { PageHeader } from "@/components/shared/page-header";
import { AgentProposalCard } from "@/components/agent/agent-proposal-card";

// Etiquetas de fallback para propuestas creadas antes de persistir `label`.
const TYPE_LABELS: Record<string, string> = {
  update_field: "Actualizar campo",
  stage_change: "Cambiar etapa",
  add_company: "Crear empresa",
  add_opportunity: "Crear oportunidad",
  add_contact: "Agregar contacto",
  link_contact: "Vincular contacto",
  create_task: "Crear tarea",
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

type ItemRow = {
  id: string;
  type: string;
  beforeValue: Prisma.JsonValue | null;
  afterValue: Prisma.JsonValue | null;
  label: string | null;
  before: string | null;
  after: string | null;
  explanation: string;
  evidence: string | null;
  confidence: number;
  approved: boolean;
};

function toCardItem(item: ItemRow) {
  return {
    id: item.id,
    label: item.label ?? TYPE_LABELS[item.type] ?? item.type,
    before: item.before ?? fallbackValue(item.beforeValue),
    after: item.after ?? fallbackValue(item.afterValue),
    explanation: item.explanation,
    evidence: item.evidence,
    confidence: item.confidence,
    approved: item.approved,
  };
}

export default async function AgentProposalsPage() {
  const { user, db } = await requireOrgContext();

  const threads = await db.agentChatThread.findMany({
    where: { userId: user.id },
    select: { id: true },
  });
  const threadIds = threads.map((thread) => thread.id);

  const proposals = threadIds.length
    ? await db.cRMChangeProposal.findMany({
        where: {
          source: "agent",
          status: "pending",
          chatThreadId: { in: threadIds },
        },
        orderBy: { createdAt: "desc" },
        include: {
          items: {
            orderBy: { id: "asc" },
            select: {
              id: true,
              type: true,
              beforeValue: true,
              afterValue: true,
              label: true,
              before: true,
              after: true,
              explanation: true,
              evidence: true,
              confidence: true,
              approved: true,
            },
          },
        },
      })
    : [];

  return (
    <div>
      <PageHeader
        title="Propuestas del agente"
        description="Cambios que el copiloto propuso y están esperando tu aprobación."
      />
      <div className="max-w-2xl space-y-4">
        {proposals.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No tenés cambios pendientes de aprobación.
          </p>
        ) : (
          proposals.map((proposal) => (
            <AgentProposalCard
              key={proposal.id}
              part={{
                type: "tool-proposal",
                toolCallId: proposal.id,
                state: "output-available",
                output: {
                  status: "proposal_created",
                  proposalId: proposal.id,
                  items: proposal.items.map(toCardItem),
                },
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
