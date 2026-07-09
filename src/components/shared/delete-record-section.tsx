"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DeleteRecordSection({
  title,
  description,
  confirmMessage,
  buttonLabel,
  pendingLabel = "Eliminando...",
  errorMessage = "No se pudo eliminar el registro. Intenta de nuevo.",
  action,
}: {
  title: string;
  description: string;
  confirmMessage: string;
  buttonLabel: string;
  pendingLabel?: string;
  errorMessage?: string;
  action: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="border-destructive/30 space-y-3 rounded-lg border p-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button
        type="button"
        variant="destructive"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            if (!confirm(confirmMessage)) return;
            setError(null);
            try {
              await action();
            } catch (deleteError) {
              unstable_rethrow(deleteError);
              setError(errorMessage);
            }
          })
        }
      >
        {pending && <Loader2Icon className="animate-spin" />}
        {pending ? pendingLabel : buttonLabel}
      </Button>
    </div>
  );
}
