"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { checkLoginRateLimit } from "@/lib/rate-limit";

export type LoginState = { error?: string } | undefined;

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  const rateLimitKey = email || "unknown";
  const rateLimit = checkLoginRateLimit(rateLimitKey);
  if (!rateLimit.allowed) {
    const minutes = Math.ceil(rateLimit.retryAfterSeconds / 60);
    return {
      error: `Demasiados intentos. Intenta nuevamente en ${minutes} minuto${minutes === 1 ? "" : "s"}.`,
    };
  }

  try {
    // On success, signIn() redirects internally (throws), so no code below
    // this call runs in that case — the rate-limit entry simply expires
    // after the window instead of being reset early.
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/companies",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Email o contraseña incorrectos." };
    }
    throw error;
  }
}
