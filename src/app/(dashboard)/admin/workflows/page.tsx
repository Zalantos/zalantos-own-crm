import { requireOrgAdminContext } from "@/lib/tenant";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WorkflowForm } from "./workflow-form";
import { WorkflowToggle } from "./workflow-toggle";
import { deleteWorkflow } from "./actions";

export default async function WorkflowsAdminPage() {
  const { db } = await requireOrgAdminContext();

  const workflows = await db.workflow.findMany({
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
            <Card key={workflow.id} size="sm">
              <CardContent className="space-y-2">
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
                            log.status === "success" ? "success" : "destructive"
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
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
