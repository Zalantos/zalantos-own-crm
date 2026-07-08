"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deletePerson } from "./actions";

export function PersonDeleteButton({
  personId,
  personName,
}: {
  personId: string;
  personName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="border-destructive/30 space-y-3 rounded-lg border p-4">
      <div>
        <p className="text-sm font-medium">Eliminar contacto</p>
        <p className="text-muted-foreground text-sm">
          Esta acción es irreversible. {personName} se desvinculará de sus
          oportunidades, actividades y notas.
        </p>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button
        type="button"
        variant="destructive"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            if (
              !confirm(
                `¿Eliminar a ${personName}? Se desvinculará de oportunidades, actividades y notas.`,
              )
            )
              return;
            setError(null);
            try {
              await deletePerson(personId);
            } catch (deleteError) {
              unstable_rethrow(deleteError);
              setError("No se pudo eliminar el contacto. Intenta de nuevo.");
            }
          })
        }
      >
        {pending && <Loader2Icon className="animate-spin" />}
        {pending ? "Eliminando..." : "Eliminar contacto"}
      </Button>
    </div>
  );
}
