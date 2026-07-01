import { prisma } from "@/lib/prisma";
import { ActivityCreateForm } from "@/components/shared/activities/activity-create-form";
import { ActivityRow } from "@/components/shared/activities/activity-row";

export async function ActivitiesPanel({
  companyId,
  personId,
  opportunityId,
}: {
  companyId?: string;
  personId?: string;
  opportunityId?: string;
}) {
  const activities = await prisma.activity.findMany({
    where: { companyId, personId, opportunityId },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });

  return (
    <div className="space-y-4">
      <ActivityCreateForm
        companyId={companyId}
        personId={personId}
        opportunityId={opportunityId}
      />
      <div className="space-y-2">
        {activities.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no hay actividades.
          </p>
        ) : (
          activities.map((activity) => (
            <ActivityRow key={activity.id} activity={activity} />
          ))
        )}
      </div>
    </div>
  );
}
