import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { personCreateSchema } from "@/lib/zod/person";
import { normalizeEmail, normalizePersonName } from "./person-dedup";

describe("person normalization", () => {
  it("normalizes email casing and surrounding spaces", () => {
    assert.equal(
      normalizeEmail("  Persona@Example.COM  "),
      "persona@example.com",
    );
  });

  it("turns empty emails into null", () => {
    assert.equal(normalizeEmail("   "), null);
    assert.equal(normalizeEmail(null), null);
    assert.equal(normalizeEmail(undefined), null);
  });

  it("persists canonical identity through the person form schema", () => {
    const parsed = personCreateSchema.parse({
      firstName: "  Ana ",
      lastName: " Pérez  ",
      email: " ANA@EXAMPLE.COM ",
    });
    assert.equal(parsed.firstName, "Ana");
    assert.equal(parsed.lastName, "Pérez");
    assert.equal(parsed.email, "ana@example.com");
  });

  it("trims names without changing accents or casing", () => {
    assert.equal(normalizePersonName("  Ángela  "), "Ángela");
    assert.equal(normalizePersonName("  MUÑOZ "), "MUÑOZ");
  });

  it("migrates canonical emails before adding tenant uniqueness", async () => {
    const migration = await readFile(
      new URL(
        "../../../prisma/migrations/20260928130000_person_dedup_and_proposal_apply_lock/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    assert.match(migration, /NULLIF\(lower\(trim\("email"\)\), ''\)/);
    assert.match(
      migration,
      /UNIQUE INDEX "people_organizationId_email_key"[\s\S]*\("organizationId", "email"\)/,
    );
  });
});
