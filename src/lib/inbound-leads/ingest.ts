import { Prisma } from "@prisma/client";
import { normalizeEmail } from "@/lib/crm/person-dedup";
import type { InboundLeadPayload } from "@/lib/zod/inbound-lead";
import type { TenantClient } from "@/lib/tenant";

export type IngestInboundLeadResult = {
  inboundLeadId: string;
  created: boolean;
};

// Lógica pura de ingesta, separada del route handler para poder testearla
// con un TenantClient falso (sin NextRequest/NextResponse ni DB real). El
// create directo + catch de P2002 es idempotente bajo reintentos concurrentes
// de n8n; un findFirst-then-create no lo sería.
export async function ingestInboundLead(
  db: TenantClient,
  organizationId: string,
  data: InboundLeadPayload,
): Promise<IngestInboundLeadResult> {
  try {
    const lead = await db.inboundLead.create({
      data: {
        organizationId,
        source: data.source,
        externalId: data.external_id,
        firstName: data.first_name ?? null,
        lastName: data.last_name ?? null,
        email: normalizeEmail(data.email),
        company: data.company ?? null,
        message: data.message ?? null,
        page: data.page ?? null,
        status: "new",
      },
      select: { id: true },
    });
    return { inboundLeadId: lead.id, created: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await db.inboundLead.findFirst({
        where: { source: data.source, externalId: data.external_id },
        select: { id: true },
      });
      if (existing) {
        return { inboundLeadId: existing.id, created: false };
      }
    }
    throw error;
  }
}
