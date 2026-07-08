import { requireOrgAdminContext } from "@/lib/tenant";
import { PageHeader } from "@/components/shared/page-header";
import { StageCreateForm } from "./stage-create-form";
import { StageRow } from "./stage-row";

export default async function PipelineStagesPage() {
  const { db } = await requireOrgAdminContext();

  const stages = await db.pipelineStage.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }],
    include: { _count: { select: { opportunities: true } } },
  });

  const active = stages.filter((s) => s.isActive);
  const inactive = stages.filter((s) => !s.isActive);

  return (
    <div>
      <PageHeader
        title="Etapas del pipeline"
        description="Definí las etapas por las que pasan tus oportunidades"
      />

      <div className="mb-8 max-w-2xl">
        <StageCreateForm />
      </div>

      <div className="max-w-2xl space-y-2">
        {active.map((stage, index) => (
          <StageRow
            key={stage.id}
            stage={stage}
            opportunityCount={stage._count.opportunities}
            canMoveUp={index > 0}
            canMoveDown={index < active.length - 1}
          />
        ))}
      </div>

      {inactive.length > 0 && (
        <div className="mt-8 max-w-2xl">
          <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
            Desactivadas
          </p>
          <div className="space-y-2">
            {inactive.map((stage) => (
              <StageRow
                key={stage.id}
                stage={stage}
                opportunityCount={stage._count.opportunities}
                canMoveUp={false}
                canMoveDown={false}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
