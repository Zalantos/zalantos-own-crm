import { readFileSync } from "node:fs";
import path from "node:path";
import { DEVELOPMENT_BUILD_ID } from "@/lib/app-version";

// Cada `next build` escribe un id nuevo. La página lo embebe al renderizarse;
// un deploy posterior responde otro id en `/api/version`.
export function readAppBuildId(): string {
  if (process.env.NODE_ENV !== "production") {
    return DEVELOPMENT_BUILD_ID;
  }

  try {
    const buildId = readFileSync(
      path.join(process.cwd(), ".next", "BUILD_ID"),
      "utf8",
    ).trim();
    if (buildId) return buildId;
  } catch {
    // Sin artefacto de build: caer al id que inyecta la plataforma.
  }

  return (
    process.env.RAILWAY_DEPLOYMENT_ID?.trim() ||
    process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ||
    "unknown"
  );
}
