"use client";

import type { VariantProps } from "class-variance-authority";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ACTIVITY_STATUSES,
  ACTIVITY_STATUS_LABELS,
  type ActivityStatus,
} from "@/lib/activity-status";

const ACTIVITY_STATUS_VARIANT: Record<
  ActivityStatus,
  VariantProps<typeof badgeVariants>["variant"]
> = {
  todo: "outline",
  in_progress: "default",
  blocked: "destructive",
  done: "success",
};

export function TaskStatusSelect({
  status,
  onChange,
}: {
  status: ActivityStatus;
  onChange: (status: ActivityStatus) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Badge
            variant={ACTIVITY_STATUS_VARIANT[status]}
            className="cursor-pointer"
            render={<button type="button" />}
          >
            {ACTIVITY_STATUS_LABELS[status]}
          </Badge>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={status}
          onValueChange={(value) => onChange(value as ActivityStatus)}
        >
          {ACTIVITY_STATUSES.map((s) => (
            <DropdownMenuRadioItem key={s} value={s}>
              {ACTIVITY_STATUS_LABELS[s]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
