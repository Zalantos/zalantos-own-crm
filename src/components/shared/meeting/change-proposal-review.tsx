"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  applyProposalAction,
  rejectProposalAction,
  revertItemAction,
  setAllItemsApproval,
  setItemApproval,
} from "@/app/(dashboard)/meetings/proposal-actions";
import { ProposalItemEditor } from "@/components/shared/meeting/proposal-item-editor";
import type { StageOption } from "@/lib/pipeline/stages";

export type ReviewItem = {
  id: string;
  type: string;
  entity: string;
  beforeValue: unknown;
  afterValue: unknown;
  confidence: number;
  explanation: string;
  evidence?: string | null;
  duplicateOfId?: string | null;
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
  link_contact: "Vincular contacto existente",
  create_task: "Crear tarea",
  add_note: "Agregar nota",
  stage_change: "Cambio de etapa",
  update_pain: "Actualizar dolor",
  update_next_step: "Próximo paso",
};

// Item types the editor supports; the rest only allow approve/reject.
const EDITABLE_TYPES = new Set(Object.keys(TYPE_LABELS));

function asObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stageLabel(stages: StageOption[], value: unknown): string {
  if (value == null) return "—";
  const key = String(value);
  return stages.find((stage) => stage.key === key)?.label ?? key;
}

function describeAfter(item: ReviewItem, stages: StageOption[]): string {
  const a = asObj(item.afterValue);
  switch (item.type) {
    case "update_field": {
      const before = asObj(item.beforeValue).value;
      if (String(a.field) === "stage") {
        return `Etapa: ${stageLabel(stages, before)} → ${stageLabel(stages, a.value)}`;
      }
      return `${String(a.field)}: ${before == null ? "—" : String(before)} → ${String(a.value)}`;
    }
    case "add_contact":
    case "link_contact": {
      const name = `${String(a.firstName ?? "")} ${String(a.lastName ?? "")}`.trim();
      const extras = [a.roleTitle, a.email, a.phone].filter(Boolean).map(String);
      return extras.length ? `${name} (${extras.join(" · ")})` : name;
    }
    case "create_task":
      return String(a.title ?? "");
    case "add_note":
      return String(a.title ?? a.body ?? "");
    case "stage_change": {
      const before = asObj(item.beforeValue).value;
      return `${stageLabel(stages, before)} → ${stageLabel(stages, a.value)}`;
    }
    case "update_pain":
      return String(a.value ?? "");
    case "update_next_step": {
      const due = a.nextStepDueDate
        ? ` (vence ${String(a.nextStepDueDate).slice(0, 10)})`
        : "";
      return `${String(a.nextStep ?? "")}${due}`;
    }
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
  stages,
}: {
  proposal: ReviewProposal;
  meetingId: string;
  stages: StageOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const isFinal = proposal.status === "applied" || proposal.status === "rejected";

  function run(fn: () => Promise<void>, message: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(message);
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "No se pudo completar.",
        );
      }
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
          {[...proposal.items]
            .sort((a, b) => a.confidence - b.confidence)
            .map((item) => {
            const canEdit =
              !isFinal &&
              item.status !== "applied" &&
              EDITABLE_TYPES.has(item.type);
            return (
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
                    {(item.type === "link_contact" || item.duplicateOfId) && (
                      <Badge variant="outline">Posible duplicado</Badge>
                    )}
                    {item.status === "applied" && (
                      <Badge variant="default">Aplicado</Badge>
                    )}
                    {item.status === "reverted" && (
                      <Badge variant="outline">Deshecho</Badge>
                    )}
                    {item.status === "failed" && (
                      <Badge variant="destructive">Falló</Badge>
                    )}
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto h-6 px-2 text-xs"
                        disabled={pending}
                        onClick={() =>
                          setEditingId(editingId === item.id ? null : item.id)
                        }
                      >
                        {editingId === item.id ? "Cerrar" : "Editar"}
                      </Button>
                    )}
                    {item.status === "applied" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto h-6 px-2 text-xs"
                        disabled={pending}
                        onClick={() =>
                          run(async () => {
                            const res = await revertItemAction(item.id, meetingId);
                            if (res.error) throw new Error(res.error);
                          }, "Cambio deshecho")
                        }
                      >
                        Deshacer
                      </Button>
                    )}
                  </div>
                  {editingId === item.id ? (
                    <ProposalItemEditor
                      item={item}
                      meetingId={meetingId}
                      stages={stages}
                      onDone={() => setEditingId(null)}
                    />
                  ) : (
                    <p>{describeAfter(item, stages)}</p>
                  )}
                  {item.explanation && (
                    <p className="text-muted-foreground text-xs">
                      {item.explanation}
                    </p>
                  )}
                  {item.evidence && (
                    <p className="text-muted-foreground border-l-2 pl-2 text-xs italic">
                      “{item.evidence}”
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
