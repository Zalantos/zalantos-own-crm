import crypto from "node:crypto";

// Tokens de un solo uso para invitaciones y reset de password: se genera un
// valor aleatorio, se muestra/envía UNA vez, y solo su hash sha256 se guarda
// en la BD — así un dump de la tabla no permite suplantar a nadie.

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hora

export function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function invitationExpiry(): Date {
  return new Date(Date.now() + INVITATION_TTL_MS);
}

export function passwordResetExpiry(): Date {
  return new Date(Date.now() + PASSWORD_RESET_TTL_MS);
}
