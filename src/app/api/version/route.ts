import { readAppBuildId } from "@/lib/app-build-id";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { buildId: readAppBuildId() },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
