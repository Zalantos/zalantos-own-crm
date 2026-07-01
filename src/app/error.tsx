"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold">Ocurrió un error inesperado</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        Intenta nuevamente. Si el problema persiste, contacta al
        administrador.
      </p>
      <Button onClick={() => reset()}>Reintentar</Button>
    </div>
  );
}
