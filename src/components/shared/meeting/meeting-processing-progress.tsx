"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlertIcon, Loader2Icon } from "lucide-react";
import type { ProcessingStatus } from "@prisma/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const ACTIVE_STATUSES = ["pending", "extracting", "transcribing", "analyzing"];

const STATUS_LABELS: Record<ProcessingStatus, string> = {
  pending: "Preparando",
  extracting: "Extrayendo texto",
  transcribing: "Transcribiendo",
  analyzing: "Analizando con IA",
  ready: "Listo",
  failed: "Error",
};

function isActiveStatus(status: ProcessingStatus) {
  return ACTIVE_STATUSES.includes(status);
}

function IndeterminateBar() {
  return (
    <div className="bg-muted h-1.5 overflow-hidden rounded-full">
      <div className="bg-primary h-full w-1/3 animate-pulse rounded-full" />
    </div>
  );
}

export function MeetingProcessingProgress({
  meetingId,
  initialStatus,
  initialProcessingError,
}: {
  meetingId: string;
  initialStatus: ProcessingStatus;
  initialProcessingError: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [processingError, setProcessingError] = useState(
    initialProcessingError,
  );

  useEffect(() => {
    if (!isActiveStatus(status)) return;

    const interval = window.setInterval(async () => {
      const response = await fetch(
        `/api/meetings/${meetingId}/processing-status`,
        {
          cache: "no-store",
        },
      );
      if (!response.ok) return;

      const next = (await response.json()) as {
        processingStatus: ProcessingStatus;
        processingError: string | null;
      };

      if (
        next.processingStatus !== status ||
        next.processingError !== processingError
      ) {
        setStatus(next.processingStatus);
        setProcessingError(next.processingError);
        router.refresh();
      }
    }, 2000);

    return () => window.clearInterval(interval);
  }, [meetingId, processingError, router, status]);

  if (status === "ready") return null;

  if (status === "failed") {
    if (!processingError) return null;
    return (
      <Alert variant="destructive" className="mb-4">
        <CircleAlertIcon />
        <AlertDescription>{processingError}</AlertDescription>
      </Alert>
    );
  }

  if (!isActiveStatus(status)) return null;

  return (
    <div className="mb-4 rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Loader2Icon className="size-4 animate-spin" />
          {STATUS_LABELS[status]}
        </span>
        <span className="text-muted-foreground text-xs">Procesando con IA</span>
      </div>
      <IndeterminateBar />
    </div>
  );
}

export function UploadProgressBar({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const boundedValue = Math.max(0, Math.min(100, value));

  return <Progress value={boundedValue} className={cn("gap-0", className)} />;
}
