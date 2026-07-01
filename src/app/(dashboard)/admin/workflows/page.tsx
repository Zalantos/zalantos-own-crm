import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkflowForm } from "./workflow-form";
import { WorkflowToggle } from "./workflow-toggle";
import { deleteWorkflow } from "./actions";

export default async function WorkflowsAdminPage() {
  await requireAdmin();

  const workflows = await prisma.workflow.findMany({
    include: { logs: { orderBy: { createdAt: "desc" }, take: 5 } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Workflows"
        description="Reglas simples: si una oportunidad cambia de estado o se vence un próximo paso, se crea una actividad automáticamente"
      />

      <div className="mb-8 max-w-2xl">
        <WorkflowForm />
      </div>

      <div className="space-y-4">
        {workflows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no hay workflows definidos.
          </p>
        ) : (
          workflows.map((workflow) => (
            <div key={workflow.id} className="space-y-2 rounded-md border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{workflow.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {workflow.triggerEntity} · {workflow.triggerEvent}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <WorkflowToggle
                    id={workflow.id}
                    isActive={workflow.isActive}
                  />
                  <form action={deleteWorkflow.bind(null, workflow.id)}>
                    <Button type="submit" variant="ghost" size="sm">
                      Eliminar
                    </Button>
                  </form>
                </div>
              </div>

              {workflow.logs.length > 0 && (
                <div className="space-y-1 border-t pt-2">
                  <p className="text-muted-foreground text-xs font-medium">
                    Últimas ejecuciones
                  </p>
                  {workflow.logs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <Badge
                        variant={
                          log.status === "success" ? "outline" : "destructive"
                        }
                      >
                        {log.status}
                      </Badge>
                      <span className="text-muted-foreground">
                        {log.message} ·{" "}
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
