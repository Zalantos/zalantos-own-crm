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

const currencyFormatter = new Intl.NumberFormat("es-CL", {
  currency: "CLP",
  maximumFractionDigits: 0,
  style: "currency",
});

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
      className={`group/card min-w-0 cursor-grab space-y-3 rounded-md border bg-background p-3 text-sm shadow-sm transition-shadow active:cursor-grabbing ${
        isDragging ? "opacity-50 shadow-md" : "hover:shadow-md"
      }`}
    >
      <div className="min-w-0 space-y-1">
        <Link
          href={`/opportunities/${opportunity.id}`}
          className="line-clamp-2 font-medium leading-snug hover:underline"
          onClick={(event) => {
            if (isDragging) event.preventDefault();
          }}
        >
          {opportunity.name}
        </Link>
        <p className="text-muted-foreground truncate text-xs">
          {opportunity.company.name}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {opportunity.estimatedValue !== null && (
          <Badge variant="outline" className="max-w-full truncate">
            {currencyFormatter.format(opportunity.estimatedValue)}
          </Badge>
        )}
        {isOverdue && <Badge variant="destructive">Próximo paso vencido</Badge>}
      </div>

      {opportunity.nextStep && (
        <div className="rounded-md bg-muted/40 px-2 py-1.5">
          <p className="text-muted-foreground line-clamp-2 text-xs">
            <span className="font-medium text-foreground">Próximo:</span>{" "}
            {opportunity.nextStep}
          </p>
        </div>
      )}
    </div>
  );
}
