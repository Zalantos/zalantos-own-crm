"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import type { Opportunity, Company } from "@prisma/client";

export type KanbanOpportunity = Omit<Opportunity, "estimatedValue"> & {
  estimatedValue: number | null;
  company: Company;
};

export function KanbanCard({
  opportunity,
}: {
  opportunity: KanbanOpportunity;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: opportunity.id });

  const isOverdue =
    opportunity.nextStepDueDate && opportunity.nextStepDueDate < new Date();

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      className={`bg-background space-y-1.5 rounded-md border p-3 text-sm shadow-sm ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <Link
        href={`/opportunities/${opportunity.id}`}
        className="font-medium hover:underline"
        onClick={(event) => {
          if (isDragging) event.preventDefault();
        }}
      >
        {opportunity.name}
      </Link>
      <p className="text-muted-foreground text-xs">
        {opportunity.company.name}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {opportunity.estimatedValue && (
          <Badge variant="outline">
            ${opportunity.estimatedValue.toString()}
          </Badge>
        )}
        {isOverdue && <Badge variant="destructive">Próximo paso vencido</Badge>}
      </div>
      {opportunity.nextStep && (
        <p className="text-muted-foreground truncate text-xs">
          Próximo: {opportunity.nextStep}
        </p>
      )}
    </div>
  );
}
