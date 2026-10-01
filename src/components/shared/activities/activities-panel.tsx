import { requireOrgContext } from "@/lib/tenant";
import { getActiveTeamMembers } from "@/lib/team";
import { ActivitiesList } from "@/components/shared/activities/activities-list";
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
    <ActivitiesList
      activities={activities}
      teamMembers={teamMembers}
      companyId={companyId}
      personId={personId}
      opportunityId={opportunityId}
    />
  );
}
