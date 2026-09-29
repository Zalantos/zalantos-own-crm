import { getOrgContext } from "@/lib/tenant";
import { isVoiceDictationAvailable } from "@/lib/voice-dictate";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) {
    return Response.json({ error: "No autenticado" }, { status: 401 });
  }

  return Response.json({ available: isVoiceDictationAvailable() });
}
