"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toggleOrgActive } from "../actions";

export function ToggleOrgActiveForm({
  orgId,
  isActive,
}: {
  orgId: string;
  isActive: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant={isActive ? "destructive" : "outline"}
      disabled={isPending}
      onClick={() => startTransition(() => toggleOrgActive(orgId, !isActive))}
    >
      {isActive ? "Desactivar organización" : "Activar organización"}
    </Button>
  );
}
