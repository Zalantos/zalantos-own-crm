"use client";

import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { ActorIndicator, AlertIndicator } from "@/components/shared/commercial/record-indicators";
import { formatCurrencyValue } from "@/lib/format";

// Datos mínimos de la tarjeta: el detalle completo vive en la ficha.
export type KanbanOpportunity = {
  id: string;
  name: string;
  stageId: string;
  estimatedValue: number | null;
  probability: number | null;
  nextStep: string | null;
  nextStepDueDate: Date | null;
  company: { name: string };
  owner?: { name: string | null; email: string } | null;
  // Etiquetas de actores y alertas abiertas: solo indicadores compactos.
  actorLabels?: string[];
  alerts?: { severity: string; title: string }[];
};

function shortDate(date: Date) {
  return new Date(date).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
  });
}

export function KanbanCard({
  opportunity,
  currency,
  locale,
}: {
  opportunity: KanbanOpportunity;
  currency: string;
  locale: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: opportunity.id });

  const due = opportunity.nextStepDueDate
    ? new Date(opportunity.nextStepDueDate)
    : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isOverdue = Boolean(due && due < today);
  const missingNext = !opportunity.nextStep || !due;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      className={`ring-foreground/10 bg-card min-w-0 cursor-grab space-y-1.5 rounded-lg p-2.5 text-sm shadow-sm ring-1 transition-shadow active:cursor-grabbing ${
        isDragging ? "opacity-50 shadow-md" : "hover:shadow-md"
      }`}
    >
      <Link
        href={`/opportunities/${opportunity.id}`}
        className="line-clamp-2 leading-snug font-medium hover:underline"
        onClick={(event) => {
          if (isDragging) event.preventDefault();
        }}
      >
        {opportunity.name}
      </Link>
      <p className="text-muted-foreground truncate text-xs">
        {opportunity.company.name}
        {opportunity.owner
          ? ` · ${opportunity.owner.name ?? opportunity.owner.email}`
          : ""}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {opportunity.estimatedValue !== null && (
          <Badge variant="outline" className="max-w-full truncate">
            {formatCurrencyValue(opportunity.estimatedValue, currency, locale)}
          </Badge>
        )}
        {opportunity.probability !== null && (
          <Badge variant="outline">{opportunity.probability}%</Badge>
        )}
        <ActorIndicator labels={opportunity.actorLabels ?? []} />
        <AlertIndicator alerts={opportunity.alerts ?? []} />
      </div>
      {missingNext ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Sin próxima acción fechada
        </p>
      ) : (
        <p
          className={`line-clamp-2 text-xs ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}
        >
          <span className="font-medium">{shortDate(due as Date)}</span> ·{" "}
          {opportunity.nextStep}
        </p>
      )}
    </div>
  );
}
