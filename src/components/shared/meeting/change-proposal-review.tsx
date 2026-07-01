"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  applyProposalAction,
  rejectProposalAction,
  setAllItemsApproval,
  setItemApproval,
} from "@/app/(dashboard)/meetings/proposal-actions";

export type ReviewItem = {
  id: string;
  type: string;
  entity: string;
  beforeValue: unknown;
  afterValue: unknown;
  confidence: number;
  explanation: string;
  approved: boolean;
  status: string;
};

export type ReviewProposal = {
  id: string;
  status: string;
  confidence: number;
  createdAt: string;
  items: ReviewItem[];
};

const TYPE_LABELS: Record<string, string> = {
  update_field: "Actualizar campo",
  add_contact: "Nuevo contacto",
  create_task: "Crear tarea",
  add_note: "Agregar nota",
  stage_change: "Cambio de etapa",
  update_pain: "Actualizar dolor",
};

function asObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function describeAfter(item: ReviewItem): string {
  const a = asObj(item.afterValue);
  switch (item.type) {
    case "update_field": {
      const before = asObj(item.beforeValue).value;
      return `${String(a.field)}: ${before == null ? "—" : String(before)} → ${String(a.value)}`;
    }
    case "add_contact":
      return `${String(a.firstName ?? "")} ${String(a.lastName ?? "")}`.trim();
    case "create_task":
      return String(a.title ?? "");
    case "add_note":
      return String(a.title ?? a.body ?? "");
    case "stage_change":
      return `→ ${String(a.value)}`;
    case "update_pain":
      return String(a.value ?? "");
    default:
      return JSON.stringify(a);
  }
}

function confidenceVariant(
  c: number,
): "default" | "secondary" | "outline" | "destructive" {
  if (c >= 0.8) return "default";
  if (c >= 0.5) return "secondary";
  return "outline";
}

export function ChangeProposalReview({
  proposal,
  meetingId,
}: {
  proposal: ReviewProposal;
  meetingId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isFinal = proposal.status === "applied" || proposal.status === "rejected";

  function run(fn: () => Promise<void>, message: string) {
    startTransition(async () => {
      await fn();
      toast.success(message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Propuesta de cambios</span>
          <Badge variant={confidenceVariant(proposal.confidence)}>
            {Math.round(proposal.confidence * 100)}% confianza
          </Badge>
          <Badge variant="outline">{proposal.status}</Badge>
        </div>
        {!isFinal && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                run(
                  () => setAllItemsApproval(proposal.id, meetingId, true),
                  "Todos aprobados",
                )
              }
            >
              Aprobar todo
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                run(
                  () => applyProposalAction(proposal.id, meetingId),
                  "Cambios aplicados",
                )
              }
            >
              Aplicar aprobados
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                run(
                  () => rejectProposalAction(proposal.id, meetingId),
                  "Propuesta rechazada",
                )
              }
            >
              Rechazar
            </Button>
          </div>
        )}
      </div>

      {proposal.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          La IA no propuso cambios para esta reunión.
        </p>
      ) : (
        <ul className="space-y-2">
          {proposal.items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 rounded-md border p-3 text-sm"
            >
              <input
                type="checkbox"
                className="mt-1"
                defaultChecked={item.approved}
                disabled={pending || isFinal || item.status === "applied"}
                onChange={(e) =>
                  run(
                    () =>
                      setItemApproval(item.id, meetingId, e.target.checked),
                    "Actualizado",
                  )
                }
              />
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {TYPE_LABELS[item.type] ?? item.type}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {item.entity}
                  </span>
                  <Badge variant={confidenceVariant(item.confidence)}>
                    {Math.round(item.confidence * 100)}%
                  </Badge>
                  {item.status === "applied" && (
                    <Badge variant="default">Aplicado</Badge>
                  )}
                  {item.status === "failed" && (
                    <Badge variant="destructive">Falló</Badge>
                  )}
                </div>
                <p>{describeAfter(item)}</p>
                {item.explanation && (
                  <p className="text-muted-foreground text-xs">
                    {item.explanation}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
