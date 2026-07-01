"use client";

import { format, isPast } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  completeActivity,
  reopenActivity,
  deleteActivity,
} from "@/app/(dashboard)/activities/actions";
import type { Activity } from "@prisma/client";

export function ActivityRow({ activity }: { activity: Activity }) {
  const isCompleted = activity.status === "completed";
  const isOverdue =
    !isCompleted && activity.dueDate && isPast(activity.dueDate);

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border p-3">
      <div className="flex items-center gap-3">
        <Checkbox
          checked={isCompleted}
          onCheckedChange={() => {
            const action = isCompleted ? reopenActivity : completeActivity;
            void action(activity.id);
          }}
        />
        <div>
          <p
            className={
              isCompleted
                ? "text-muted-foreground text-sm line-through"
                : "text-sm font-medium"
            }
          >
            {activity.title}
          </p>
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <span>{activity.type}</span>
            {activity.dueDate && (
              <span className={isOverdue ? "text-destructive" : ""}>
                vence {format(activity.dueDate, "dd/MM/yyyy")}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isOverdue && <Badge variant="destructive">Vencida</Badge>}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void deleteActivity(activity.id)}
        >
          Eliminar
        </Button>
      </div>
    </div>
  );
}
