import { requireOrgContext } from "@/lib/tenant";
import { getActiveTeamMembers } from "@/lib/team";
import { ActivityCreateForm } from "@/components/shared/activities/activity-create-form";
import { ActivityRow } from "@/components/shared/activities/activity-row";
import { ACTIVITY_STATUS_RANK, isActivityStatus } from "@/lib/activity-status";

export async function ActivitiesPanel({
  companyId,
  personId,
  opportunityId,
}: {
  companyId?: string;
  personId?: string;
  opportunityId?: string;
}) {
  const { db } = await requireOrgContext();

  const [activitiesUnsorted, teamMembers] = await Promise.all([
    db.activity.findMany({
      where: { companyId, personId, opportunityId },
      include: {
        assignee: { select: { id: true, name: true } },
        createdBy: { select: { name: true, email: true } },
      },
      orderBy: { dueDate: "asc" },
    }),
    getActiveTeamMembers(db),
  ]);

  // El orden alfabético de "status" ya no refleja el flujo del tablero
  // (blocked < done < in_progress < todo), así que se ordena en memoria por
  // la posición real de cada estado en el Kanban.
  const activities = [...activitiesUnsorted].sort((a, b) => {
    const rankA = isActivityStatus(a.status)
      ? ACTIVITY_STATUS_RANK[a.status]
      : 0;
    const rankB = isActivityStatus(b.status)
      ? ACTIVITY_STATUS_RANK[b.status]
      : 0;
    return rankA - rankB;
  });

  return (
    <div className="space-y-4">
      <ActivityCreateForm
        companyId={companyId}
        personId={personId}
        opportunityId={opportunityId}
        teamMembers={teamMembers}
      />
      <div className="space-y-2">
        {activities.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no hay actividades.
          </p>
        ) : (
          activities.map((activity) => (
            <ActivityRow
              key={activity.id}
              activity={activity}
              teamMembers={teamMembers}
            />
          ))
        )}
      </div>
    </div>
  );
}
