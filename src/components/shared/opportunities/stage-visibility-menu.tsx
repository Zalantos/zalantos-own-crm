"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { setHiddenOpportunityStages } from "@/app/(dashboard)/opportunities/stage-visibility-actions";

export function StageVisibilityMenu({
  stages,
  hiddenStageIds,
}: {
  stages: { id: string; label: string }[];
  hiddenStageIds: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const hidden = new Set(hiddenStageIds);

  function persist(next: string[]) {
    startTransition(async () => {
      await setHiddenOpportunityStages(next);
      router.refresh();
    });
  }

  function toggle(stageId: string, visible: boolean) {
    const next = new Set(hiddenStageIds);
    if (visible) next.delete(stageId);
    else next.add(stageId);
    persist([...next]);
  }

  const hiddenCount = stages.filter((stage) => hidden.has(stage.id)).length;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="secondary" type="button" disabled={pending}>
            <EyeOffIcon />
            {hiddenCount > 0
              ? `${hiddenCount} ${hiddenCount === 1 ? "oculta" : "ocultas"}`
              : "Etapas"}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72">
        <PopoverHeader>
          <PopoverTitle>Etapas visibles</PopoverTitle>
          <PopoverDescription>
            Las que desmarques desaparecen de la lista y del tablero.
          </PopoverDescription>
        </PopoverHeader>
        <div className="max-h-72 space-y-0.5 overflow-y-auto">
          {stages.map((stage) => (
            <label
              key={stage.id}
              className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5"
            >
              <Checkbox
                checked={!hidden.has(stage.id)}
                disabled={pending}
                onCheckedChange={(checked) => {
                  toggle(stage.id, checked === true);
                }}
              />
              <span className="truncate">{stage.label}</span>
            </label>
          ))}
        </div>
        {hiddenCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={pending}
            onClick={() => persist([])}
          >
            Mostrar todas
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
