import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Config } from "@/lib/meeting-intelligence/config";

// Reused across invocations in the same server process.
let client: S3Client | undefined;

function r2(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: r2Config.endpoint,
      credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
      },
    });
  }
  return client;
}

// Deterministic object key. Keeping the meeting id as a prefix makes cleanup
// (delete all evidence for a meeting) and debugging straightforward.
export function buildEvidenceKey(meetingId: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `meetings/${meetingId}/${Date.now()}-${safe}`;
}

// Presigned PUT URL so the browser uploads large audio/video straight to R2,
// never through the Next.js request body.
export async function createPresignedUploadUrl(params: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: r2Config.bucket,
    Key: params.key,
    ContentType: params.contentType,
  });
  return getSignedUrl(r2(), command, {
    expiresIn: params.expiresInSeconds ?? 600,
  });
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const result = await r2().send(
    new GetObjectCommand({ Bucket: r2Config.bucket, Key: key }),
  );
  if (!result.Body) {
    throw new Error(`Objeto R2 vacío o inexistente: ${key}`);
  }
  const bytes = await result.Body.transformToByteArray();
  return Buffer.from(bytes);
}

export async function deleteObject(key: string): Promise<void> {
  await r2().send(
    new DeleteObjectCommand({ Bucket: r2Config.bucket, Key: key }),
  );
}
