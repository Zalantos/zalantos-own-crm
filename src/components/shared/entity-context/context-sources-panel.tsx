"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  deleteContextSource,
  reprocessContextSource,
} from "@/app/(dashboard)/entity-context/actions";
import { LinkifiedText } from "@/components/shared/linkified-text";

export type ContextSourceView = {
  id: string;
  filename: string;
  sourceType: string;
  status: string;
  processingError: string | null;
  externalRef: string | null;
  createdAt: string;
  createdAtLabel: string;
};

const STATUS_LABELS: Record<string, string> = {
  uploaded: "En cola",
  extracting: "Extrayendo",
  extracted: "Texto listo",
  analyzing: "Analizando",
  ready: "Listo",
  failed: "Falló",
};

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ready") return "default";
  if (status === "failed") return "destructive";
  if (status === "analyzing" || status === "extracting") return "secondary";
  return "outline";
}

export function ContextSourcesPanel({
  sources,
}: {
  sources: ContextSourceView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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

  if (sources.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Sin documentos de contexto todavía.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {sources.map((source) => (
        <li
          key={source.id}
          className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3 text-sm"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium">{source.filename}</span>
              <Badge variant={statusVariant(source.status)}>
                {STATUS_LABELS[source.status] ?? source.status}
              </Badge>
              <Badge variant="outline">{source.sourceType}</Badge>
            </div>
            <p className="text-muted-foreground text-xs">
              {source.createdAtLabel}
            </p>
            {source.externalRef && (
              <p className="text-muted-foreground truncate text-xs">
                <LinkifiedText text={source.externalRef} />
              </p>
            )}
            {source.processingError && (
              <p className="text-destructive text-xs">
                {source.processingError}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                run(
                  () => reprocessContextSource(source.id),
                  "Reanálisis iniciado",
                )
              }
            >
              {pending && <Loader2Icon className="animate-spin" />}
              Reanalizar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                run(() => deleteContextSource(source.id), "Fuente eliminada")
              }
            >
              Eliminar
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
