import { authenticateMcpBearer } from "@/lib/mcp/auth";
import { handleMcpRequest } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const maxDuration = 120;

async function handle(request: Request): Promise<Response> {
  const principal = await authenticateMcpBearer(
    request.headers.get("authorization"),
  );
  if (!principal) return new Response(null, { status: 401 });
  return handleMcpRequest(request, principal);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
