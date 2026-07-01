import { timingSafeEqual } from "node:crypto";

// Shared secret for internal worker routes (pipeline + evidence cron). Mirrors
// the check-overdue cron: reject placeholders and short values, timing-safe.
const PLACEHOLDER_SECRETS = new Set([
  "replace-with-a-random-string",
  "changeme",
]);

export function isCronSecretConfigured(
  secret: string | undefined,
): secret is string {
  return (
    !!secret && secret.length >= 16 && !PLACEHOLDER_SECRETS.has(secret)
  );
}

export function isAuthorized(
  authHeader: string | null,
  cronSecret: string,
): boolean {
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const provided = Buffer.from(authHeader ?? "");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}
