import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold">No encontramos lo que buscabas</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        El recurso no existe o fue eliminado.
      </p>
      <Button render={<Link href="/companies" />}>Volver al inicio</Button>
    </div>
  );
}
