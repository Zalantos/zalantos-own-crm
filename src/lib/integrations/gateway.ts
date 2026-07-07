import { EntityType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DEFAULT_TIMEOUT_MS = 10_000;

type JsonRecord = Record<string, unknown>;

export type DispatchIntegrationEventInput = {
  type: string;
  channel: string;
  entityType: EntityType;
  entityId: string;
  recipient: JsonRecord;
  dedupeKey: string;
  payload: JsonRecord;
};

export type DispatchIntegrationEventResult =
  | { status: "sent"; deliveryId: string }
  | { status: "failed"; deliveryId: string; error: string }
  | { status: "skipped"; deliveryId: string };

type GatewayResponse = {
  ok?: boolean;
  error?: unknown;
  [key: string]: unknown;
};

async function parseGatewayResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as GatewayResponse;
  } catch {
    return { raw: text };
  }
}

function normalizeError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function upsertPendingDelivery(input: DispatchIntegrationEventInput) {
  const existing = await prisma.integrationDelivery.findUnique({
    where: { dedupeKey: input.dedupeKey },
  });

  if (existing?.status === "sent") {
    return { delivery: existing, skipped: true };
  }

  if (existing) {
    const delivery = await prisma.integrationDelivery.update({
      where: { id: existing.id },
      data: {
        type: input.type,
        channel: input.channel,
        entityType: input.entityType,
        entityId: input.entityId,
        recipientJson: input.recipient as Prisma.InputJsonValue,
        payloadJson: input.payload as Prisma.InputJsonValue,
        status: "pending",
        attempts: { increment: 1 },
        lastError: null,
        providerResponseJson: undefined,
      },
    });
    return { delivery, skipped: false };
  }

  const delivery = await prisma.integrationDelivery.create({
    data: {
      type: input.type,
      channel: input.channel,
      entityType: input.entityType,
      entityId: input.entityId,
      recipientJson: input.recipient as Prisma.InputJsonValue,
      payloadJson: input.payload as Prisma.InputJsonValue,
      dedupeKey: input.dedupeKey,
      status: "pending",
      attempts: 1,
    },
  });
  return { delivery, skipped: false };
}

async function markFailed(
  deliveryId: string,
  error: string,
  providerResponse?: unknown,
) {
  await prisma.integrationDelivery.update({
    where: { id: deliveryId },
    data: {
      status: "failed",
      lastError: error,
      providerResponseJson:
        providerResponse === undefined
          ? undefined
          : (providerResponse as Prisma.InputJsonValue),
    },
  });
}

export async function dispatchIntegrationEvent(
  input: DispatchIntegrationEventInput,
): Promise<DispatchIntegrationEventResult> {
  const { delivery, skipped } = await upsertPendingDelivery(input);
  if (skipped) return { status: "skipped", deliveryId: delivery.id };

  const gatewayUrl = process.env.INTEGRATION_GATEWAY_URL;
  const gatewaySecret = process.env.INTEGRATION_GATEWAY_SECRET;

  if (!gatewayUrl || !gatewaySecret) {
    const error =
      "INTEGRATION_GATEWAY_URL o INTEGRATION_GATEWAY_SECRET no están configurados.";
    await markFailed(delivery.id, error);
    return { status: "failed", deliveryId: delivery.id, error };
  }

  const envelope = {
    eventId: delivery.id,
    event: "send_notification",
    notificationType: input.type,
    channel: input.channel,
    dedupeKey: input.dedupeKey,
    occurredAt: new Date().toISOString(),
    recipient: input.recipient,
    payload: input.payload,
  };
  const rawBody = JSON.stringify(envelope);

  try {
    const response = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-zalantos-event-id": delivery.id,
        "x-webhook-secret": gatewaySecret,
      },
      body: rawBody,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    const providerResponse = await parseGatewayResponse(response);
    if (!response.ok) {
      const error = `Gateway respondió HTTP ${response.status}`;
      await markFailed(delivery.id, error, providerResponse);
      return { status: "failed", deliveryId: delivery.id, error };
    }

    if (providerResponse && providerResponse.ok === false) {
      const error =
        typeof providerResponse.error === "string"
          ? providerResponse.error
          : "Gateway respondió ok=false";
      await markFailed(delivery.id, error, providerResponse);
      return { status: "failed", deliveryId: delivery.id, error };
    }

    await prisma.integrationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "sent",
        lastError: null,
        providerResponseJson:
          providerResponse === null
            ? undefined
            : (providerResponse as Prisma.InputJsonValue),
        sentAt: new Date(),
      },
    });
    return { status: "sent", deliveryId: delivery.id };
  } catch (error) {
    const message = normalizeError(error);
    await markFailed(delivery.id, message);
    return { status: "failed", deliveryId: delivery.id, error: message };
  }
}
