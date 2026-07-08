import crypto from "node:crypto";

// Cifrado simétrico para secretos por organización (ej. secret del gateway).
// Formato: base64(iv):base64(authTag):base64(ciphertext), AES-256-GCM con
// SETTINGS_ENCRYPTION_KEY (32 bytes en base64 o hex).

function getKey(): Buffer | null {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = raw.length === 64 ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("SETTINGS_ENCRYPTION_KEY debe ser de 32 bytes (base64 o hex).");
  }
  return key;
}

export function isEncryptionConfigured() {
  return getKey() !== null;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  if (!key) {
    throw new Error("SETTINGS_ENCRYPTION_KEY no está configurada.");
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptSecret(encrypted: string): string {
  const key = getKey();
  if (!key) {
    throw new Error("SETTINGS_ENCRYPTION_KEY no está configurada.");
  }
  const [iv, authTag, ciphertext] = encrypted.split(":");
  if (!iv || !authTag || !ciphertext) {
    throw new Error("Secreto cifrado con formato inválido.");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
