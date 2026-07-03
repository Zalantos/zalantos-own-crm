import { Input } from "@/components/ui/input";
import { LogoutButton } from "@/components/layout/logout-button";
import { AgentPanel } from "@/components/agent/agent-panel";

export function Topbar({ userName }: { userName: string | null | undefined }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4">
      <form action="/search" className="max-w-sm flex-1">
        <Input
          type="search"
          name="q"
          placeholder="Buscar empresas, personas, oportunidades..."
          className="h-9"
        />
      </form>
      <div className="flex items-center gap-3">
        <AgentPanel />
        {userName && (
          <span className="text-muted-foreground text-sm">{userName}</span>
        )}
        <LogoutButton />
      </div>
    </header>
  );
}
