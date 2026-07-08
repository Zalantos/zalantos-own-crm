"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import type { PipelineStage } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/shared/submit-button";
import {
  deactivateStage,
  deleteStage,
  moveStage,
  reactivateStage,
  updateStage,
  type StageFormState,
} from "./actions";

export function StageRow({
  stage,
  opportunityCount,
  canMoveUp,
  canMoveDown,
}: {
  stage: PipelineStage;
  opportunityCount: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [state, formAction] = useActionState<StageFormState, FormData>(
    async (prevState, formData) => {
      const result = await updateStage(stage.id, prevState, formData);
      if (!result?.error) setEditing(false);
      return result;
    },
    undefined,
  );

  const outcome = stage.isWon ? "won" : stage.isLost ? "lost" : "none";

  if (editing) {
    return (
      <form
        action={formAction}
        className="flex flex-wrap items-end gap-3 rounded-md border p-3"
      >
        <div className="min-w-40 flex-1 space-y-1.5">
          <Label htmlFor={`label-${stage.id}`}>Nombre</Label>
          <Input
            id={`label-${stage.id}`}
            name="label"
            defaultValue={stage.label}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`color-${stage.id}`}>Color</Label>
          <Input
            id={`color-${stage.id}`}
            name="color"
            type="color"
            defaultValue={stage.color ?? "#64748b"}
            className="h-9 w-14 p-1"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`outcome-${stage.id}`}>Resultado</Label>
          <select
            id={`outcome-${stage.id}`}
            name="outcome"
            defaultValue={outcome}
            className="bg-background h-9 rounded-md border px-3 text-sm"
          >
            <option value="none">Normal</option>
            <option value="won">Ganada</option>
            <option value="lost">Perdida</option>
          </select>
        </div>
        <SubmitButton>Guardar</SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
          Cancelar
        </Button>
        {state?.error && (
          <p className="text-destructive w-full text-sm">{state.error}</p>
        )}
      </form>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
      <span
        className="size-3 shrink-0 rounded-full"
        style={{ background: stage.color ?? "#64748b" }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{stage.label}</p>
        <p className="text-muted-foreground text-xs">
          {opportunityCount} oportunidad{opportunityCount === 1 ? "" : "es"}
        </p>
      </div>
      {stage.isWon && <Badge variant="success">Ganada</Badge>}
      {stage.isLost && <Badge variant="destructive">Perdida</Badge>}
      {!stage.isActive && <Badge variant="outline">Desactivada</Badge>}

      <div className="flex items-center gap-1">
        {stage.isActive && (
          <>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={!canMoveUp || isPending}
              onClick={() => startTransition(() => moveStage(stage.id, "up"))}
              aria-label="Subir"
            >
              ↑
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={!canMoveDown || isPending}
              onClick={() => startTransition(() => moveStage(stage.id, "down"))}
              aria-label="Bajar"
            >
              ↓
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
            >
              Editar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => startTransition(() => deactivateStage(stage.id))}
            >
              Desactivar
            </Button>
          </>
        )}
        {!stage.isActive && (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => startTransition(() => reactivateStage(stage.id))}
            >
              Reactivar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteStage(stage.id);
                  if (result?.error) toast.error(result.error);
                })
              }
            >
              Borrar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
