"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createSavedView,
  deleteSavedView,
} from "@/app/(dashboard)/saved-views/actions";
import type { EntityType, SavedView } from "@prisma/client";

export function SavedViewSelector({
  entityType,
  basePath,
  savedViews,
}: {
  entityType: EntityType;
  basePath: string;
  savedViews: SavedView[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [name, setName] = useState("");
  const [selectedViewId, setSelectedViewId] = useState("");

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedViewId}
        onChange={(event) => {
          const viewId = event.target.value;
          setSelectedViewId(viewId);
          const view = savedViews.find((v) => v.id === viewId);
          if (!view) return;
          const params = new URLSearchParams(
            (view.filtersJson as Record<string, string>) ?? {},
          );
          router.push(`${basePath}?${params.toString()}`);
        }}
        className="bg-background h-9 rounded-md border px-3 text-sm"
      >
        <option value="">Vistas guardadas...</option>
        {savedViews.map((view) => (
          <option key={view.id} value={view.id}>
            {view.name}
          </option>
        ))}
      </select>

      {selectedViewId && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={async () => {
            await deleteSavedView(selectedViewId, basePath);
            setSelectedViewId("");
          }}
        >
          Eliminar vista
        </Button>
      )}

      {showSaveInput ? (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            placeholder="Nombre de la vista"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-9 w-40"
          />
          <Button
            type="button"
            size="sm"
            onClick={async () => {
              await createSavedView(
                entityType,
                name,
                Object.fromEntries(searchParams.entries()),
                basePath,
              );
              setName("");
              setShowSaveInput(false);
            }}
          >
            Guardar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowSaveInput(false)}
          >
            Cancelar
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setShowSaveInput(true)}
        >
          Guardar vista actual
        </Button>
      )}
    </div>
  );
}
