"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteMeeting } from "@/app/(dashboard)/meetings/actions";
import { reprocessMeeting } from "@/app/(dashboard)/meetings/evidence-actions";

export function MeetingActions({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<
    "reprocess" | "delete" | null
  >(null);

  return (
    <div className="flex gap-2">
      <Button
        variant="secondary"
        disabled={pending || pendingAction !== null}
        onClick={() =>
          startTransition(async () => {
            setPendingAction("reprocess");
            try {
              await reprocessMeeting(meetingId);
              toast.success("Reprocesando...");
              router.refresh();
            } finally {
              setPendingAction(null);
            }
          })
        }
      >
        {pendingAction === "reprocess" && (
          <Loader2Icon className="animate-spin" />
        )}
        {pendingAction === "reprocess" ? "Reprocesando..." : "Reprocesar"}
      </Button>
      <Button
        variant="ghost"
        disabled={pending || pendingAction !== null}
        onClick={() =>
          startTransition(async () => {
            if (!confirm("¿Eliminar esta reunión y su evidencia?")) return;
            setPendingAction("delete");
            try {
              await deleteMeeting(meetingId);
            } finally {
              setPendingAction(null);
            }
          })
        }
      >
        {pendingAction === "delete" && <Loader2Icon className="animate-spin" />}
        {pendingAction === "delete" ? "Eliminando..." : "Eliminar"}
      </Button>
    </div>
  );
}
