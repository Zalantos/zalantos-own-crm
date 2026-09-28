import { PageHeader } from "@/components/shared/page-header";
import { appUrl } from "@/lib/meeting-intelligence/config";
import { requireOrgAdminContext } from "@/lib/tenant";
import { McpTokenForm } from "./mcp-token-form";
import { McpTokenRow } from "./mcp-token-row";

function formatDate(value: Date): string {
  return value.toLocaleString("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default async function McpSettingsPage() {
  const { user, db } = await requireOrgAdminContext();
  const tokens = await db.mcpAccessToken.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });
  const endpoint = `${appUrl()}/api/mcp`;

  return (
    <div>
      <PageHeader
        title="MCP"
        description="Conectá Cursor u otro cliente MCP al CRM con un token personal."
      />
      <div className="max-w-xl space-y-6">
        <McpTokenForm endpoint={endpoint} />

        <div className="space-y-2 rounded-md border p-4">
          <p className="text-sm font-medium">Tus tokens</p>
          {tokens.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Todavía no creaste tokens MCP.
            </p>
          ) : (
            <ul className="divide-y">
              {tokens.map((token) => (
                <McpTokenRow
                  key={token.id}
                  token={{
                    id: token.id,
                    name: token.name,
                    tokenPrefix: token.tokenPrefix,
                    createdAt: formatDate(token.createdAt),
                    lastUsedAt: token.lastUsedAt
                      ? formatDate(token.lastUsedAt)
                      : null,
                    revokedAt: token.revokedAt
                      ? formatDate(token.revokedAt)
                      : null,
                  }}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 rounded-md border p-4">
          <div>
            <p className="text-sm font-medium">Cómo funciona</p>
            <p className="text-muted-foreground text-sm">
              Las lecturas, notas y tareas se aplican al instante. Los cambios
              de ficha, etapa y las altas quedan como propuesta. Una propuesta
              de un solo cambio se puede confirmar desde el agente; si tiene
              varios cambios, se aprueba en Propuestas del agente.
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Endpoint público</p>
            <code className="bg-muted/30 block rounded border p-2 text-xs break-all select-all">
              {endpoint}
            </code>
          </div>
          <pre className="bg-muted/30 overflow-auto rounded border p-3 text-xs whitespace-pre-wrap">
            {JSON.stringify(
              {
                mcpServers: {
                  "zalantos-crm": {
                    url: endpoint,
                    headers: {
                      Authorization: "Bearer <el token que acabás de crear>",
                    },
                  },
                },
              },
              null,
              2,
            )}
          </pre>
        </div>
      </div>
    </div>
  );
}
