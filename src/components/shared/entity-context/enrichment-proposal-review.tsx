"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  applyEnrichmentProposalAction,
  rejectEnrichmentProposalAction,
  revertEnrichmentItemAction,
  setAllEnrichmentItemsApproval,
  setEnrichmentItemApproval,
} from "@/app/(dashboard)/entity-context/proposal-actions";
import type { ContextEntityType } from "@/lib/entity-context/types";
import type {
  ReviewItem,
  ReviewProposal,
} from "@/components/shared/meeting/change-proposal-review";

const TYPE_LABELS: Record<string, string> = {
  update_field: "Actualizar campo",
  add_contact: "Nuevo contacto",
  link_contact: "Vincular contacto existente",
};

function asObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function describeAfter(item: ReviewItem): string {
  const after = asObj(item.afterValue);
  switch (item.type) {
    case "update_field": {
      const before = asObj(item.beforeValue).value;
      return `${String(after.field)}: ${before == null ? "—" : String(before)} → ${String(after.value)}`;
    }
    case "add_contact":
    case "link_contact": {
      const name =
        `${String(after.firstName ?? "")} ${String(after.lastName ?? "")}`.trim();
      const extras = [after.roleTitle, after.email, after.phone]
        .filter(Boolean)
        .map(String);
      return extras.length ? `${name} (${extras.join(" · ")})` : name;
    }
    default:
      return JSON.stringify(item.afterValue);
  }
}

function confidenceVariant(
  confidence: number,
): "default" | "secondary" | "destructive" | "outline" {
  if (confidence >= 0.8) return "default";
  if (confidence >= 0.5) return "secondary";
  return "outline";
}

export function EnrichmentProposalReview({
  proposal,
  entityType,
  entityId,
}: {
  proposal: ReviewProposal;
  entityType: ContextEntityType;
  entityId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isFinal = ["applied", "rejected"].includes(proposal.status);

  function run(action: () => Promise<void>, success: string) {
    startTransition(async () => {
      try {
        await action();
        toast.success(success);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Error");
      }
    });
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Propuesta de enriquecimiento</h3>
          <Badge variant="outline">{proposal.status}</Badge>
          <Badge variant={confidenceVariant(proposal.confidence)}>
            {Math.round(proposal.confidence * 100)}%
          </Badge>
        </div>
        {!isFinal && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    setAllEnrichmentItemsApproval(
                      proposal.id,
                      entityType,
                      entityId,
                      true,
                    ),
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
                  () =>
                    applyEnrichmentProposalAction(
                      proposal.id,
                      entityType,
                      entityId,
                    ),
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
                  () =>
                    rejectEnrichmentProposalAction(
                      proposal.id,
                      entityType,
                      entityId,
                    ),
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
          La IA no propuso cambios de campos.
        </p>
      ) : (
        <ul className="space-y-2">
          {[...proposal.items]
            .sort((a, b) => a.confidence - b.confidence)
            .map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-3 rounded-md border p-3 text-sm"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  defaultChecked={item.approved}
                  disabled={pending || isFinal || item.status === "applied"}
                  onChange={(event) =>
                    run(
                      () =>
                        setEnrichmentItemApproval(
                          item.id,
                          entityType,
                          entityId,
                          event.target.checked,
                        ),
                      "Actualizado",
                    )
                  }
                />
                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
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
                    {item.status === "applied" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto h-6 px-2 text-xs"
                        disabled={pending}
                        onClick={() =>
                          run(async () => {
                            const result = await revertEnrichmentItemAction(
                              item.id,
                              entityType,
                              entityId,
                            );
                            if (result.error) throw new Error(result.error);
                          }, "Cambio deshecho")
                        }
                      >
                        Deshacer
                      </Button>
                    )}
                  </div>
                  <p>{describeAfter(item)}</p>
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
            ))}
        </ul>
      )}
    </div>
  );
}
