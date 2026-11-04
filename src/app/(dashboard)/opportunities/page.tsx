import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireOrgContext } from "@/lib/tenant";
import { boardStages, getOrgStages } from "@/lib/pipeline/stages";
import { getActiveOrgUsers } from "@/lib/team";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KanbanBoard } from "@/components/shared/kanban/kanban-board";
import { listActorFilterOptions } from "@/lib/commercial/actor-service";
import {
  actorChipLabels,
  actorLinkSummarySelect,
  actorOpportunityWhere,
  parseActorKey,
} from "@/lib/commercial/actors";

type SearchParams = { ownerId?: string; q?: string; actor?: string };

// Tablero operativo: solo oportunidades abiertas en las etapas activas no
// terminales. Pausadas, ganadas y perdidas se consultan en la lista.
export default async function OpportunitiesKanbanPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { ownerId, q, actor } = await searchParams;
  const { org, db, user } = await requireOrgContext();
  const [stages, users, actorOptions] = await Promise.all([
    getOrgStages(db),
    getActiveOrgUsers(db),
    listActorFilterOptions(db),
  ]);
  const actorRef = parseActorKey(actor);
  const columns = boardStages(stages);
  const search = q?.trim();

  const where: Prisma.OpportunityWhereInput = {
    status: "open",
    stageId: { in: columns.map((stage) => stage.id) },
    ...(ownerId === "me" ? { ownerId: user.id } : ownerId ? { ownerId } : {}),
    AND: [
      ...(actorRef ? [actorOpportunityWhere(actorRef)] : []),
      ...(search
        ? [
            {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { company: { name: { contains: search, mode: "insensitive" as const } } },
              ],
            },
          ]
        : []),
    ],
  };

  const [rows, pausedCount, reviewCount] = await Promise.all([
    db.opportunity.findMany({
      where,
      select: {
        id: true,
        name: true,
        stageId: true,
        estimatedValue: true,
        probability: true,
        nextStep: true,
        nextStepDueDate: true,
        company: { select: { name: true } },
        owner: { select: { name: true, email: true } },
        actorLinks: { select: actorLinkSummarySelect },
        alerts: { where: { status: "open" }, select: { severity: true, title: true } },
      },
      orderBy: [{ nextStepDueDate: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    }),
    db.opportunity.count({ where: { status: "paused" } }),
    // Mismo criterio que /opportunities/list?review=1 (todo salvo archivadas).
    db.opportunity.count({
      where: { status: { not: "archived" }, migrationReview: { not: null } },
    }),
  ]);

  const opportunities = rows.map(({ actorLinks, ...row }) => ({
    ...row,
    estimatedValue: row.estimatedValue ? row.estimatedValue.toNumber() : null,
    actorLabels: actorChipLabels(actorLinks),
  }));

  return (
    <div className="min-w-0">
      <PageHeader
        title="Oportunidades"
        description="Pipeline operativo: arrastra para avanzar o retroceder de etapa"
        actions={
          <>
            <Button variant="secondary" render={<Link href="/opportunities/list" />}>
              Ver como lista
            </Button>
            <Button render={<Link href="/opportunities/new" />}>Nueva oportunidad</Button>
          </>
        }
      />

      <form className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          name="q"
          defaultValue={search ?? ""}
          placeholder="Buscar negocio o empresa"
          className="w-full sm:w-64"
        />
        <select
          name="ownerId"
          defaultValue={ownerId ?? ""}
          className="bg-background h-9 rounded-md border px-2 text-sm"
        >
          <option value="">Todo responsable</option>
          <option value="me">Mis oportunidades</option>
          {users.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name ?? member.email}
            </option>
          ))}
        </select>
        <select
          name="actor"
          defaultValue={actor ?? ""}
          className="bg-background h-9 rounded-md border px-2 text-sm"
        >
          <option value="">Todo actor o partner</option>
          {actorOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
        <div className="text-muted-foreground flex flex-wrap gap-3 text-xs sm:ml-auto">
          {pausedCount > 0 && (
            <Link href="/opportunities/list?status=paused" className="hover:underline">
              {pausedCount} pausada{pausedCount === 1 ? "" : "s"}
            </Link>
          )}
          <Link href="/opportunities/list?status=won" className="hover:underline">
            Ganadas
          </Link>
          <Link href="/opportunities/list?status=lost" className="hover:underline">
            Perdidas
          </Link>
          {reviewCount > 0 && (
            <Link
              href="/opportunities/list?review=1"
              className="text-amber-600 hover:underline dark:text-amber-400"
            >
              {reviewCount} requieren revisión post-migración
            </Link>
          )}
        </div>
      </form>

      <KanbanBoard
        key={`${ownerId ?? ""}|${search ?? ""}|${actor ?? ""}`}
        opportunities={opportunities}
        stages={columns}
        currency={org.currency}
        locale={org.locale}
      />
    </div>
  );
}
