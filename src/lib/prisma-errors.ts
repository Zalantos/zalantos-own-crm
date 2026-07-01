import { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";

// Turns known Prisma failures into a graceful Next.js response instead of a
// raw stack trace. Anything unexpected is rethrown so it reaches error.tsx.
export function handleMutationError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      notFound();
    }
  }
  throw error;
}
