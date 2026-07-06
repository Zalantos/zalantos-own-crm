import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/layout/logout-button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { AgentPanel } from "@/components/agent/agent-panel";

export function Topbar({ userName }: { userName: string | null | undefined }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 md:gap-4">
      <form action="/search" className="relative hidden max-w-sm flex-1 md:block">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          type="search"
          name="q"
          placeholder="Buscar empresas, personas, oportunidades..."
          className="h-9 pl-8"
        />
      </form>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        render={<Link href="/search" />}
      >
        <SearchIcon />
        <span className="sr-only">Buscar</span>
      </Button>
      <div className="flex shrink-0 items-center gap-3">
        <AgentPanel />
        <ThemeToggle />
        {userName && (
          <span className="text-muted-foreground hidden text-sm sm:inline">
            {userName}
          </span>
        )}
        <LogoutButton />
      </div>
    </header>
  );
}
