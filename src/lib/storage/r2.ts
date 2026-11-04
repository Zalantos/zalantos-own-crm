import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { r2Config } from "@/lib/runtime-config";

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
      // R2 doesn't support the AWS SDK's default flexible-checksum behavior
      // (added in @aws-sdk/client-s3 v3.729+).
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}

// Solo lectura: el CRM ya no sube ni borra objetos. Se conserva para extraer el
// texto de fuentes de contexto históricas que nunca llegaron a procesarse. Los
// archivos existentes permanecen en el bucket.
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
