// In-memory rate limiter for v0.1.
//
// Limitation: this state lives in the process memory of a single server
// instance. It resets on redeploy/restart and does NOT share state across
// multiple Railway replicas — under horizontal scaling this only limits
// attempts hitting the same instance. Good enough to slow down casual
// brute-forcing for now; replace with a shared store (Redis/Upstash) before
// running more than one instance or if this becomes a real target.
const attempts = new Map<string, { count: number; resetAt: number }>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export function checkLoginRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count += 1;
  return { allowed: true };
}
