"use client";

import "./globals.css";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4 px-4 text-center">
          <h1 className="text-xl font-semibold">Error crítico</h1>
          <p className="text-muted-foreground max-w-sm text-sm">
            La aplicación no pudo cargar correctamente. Intenta recargar la
            página.
          </p>
          <button
            onClick={() => reset()}
            className="border-input hover:bg-muted rounded-md border px-4 py-2 text-sm"
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
