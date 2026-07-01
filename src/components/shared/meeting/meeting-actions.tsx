"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteMeeting } from "@/app/(dashboard)/meetings/actions";
import { reprocessMeeting } from "@/app/(dashboard)/meetings/evidence-actions";

export function MeetingActions({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex gap-2">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await reprocessMeeting(meetingId);
            toast.success("Reprocesando...");
            router.refresh();
          })
        }
      >
        Reprocesar
      </Button>
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            if (!confirm("¿Eliminar esta reunión y su evidencia?")) return;
            await deleteMeeting(meetingId);
          })
        }
      >
        Eliminar
      </Button>
    </div>
  );
}
