-- AlterTable
-- Additive change: existing users remain able to log in.
ALTER TABLE "users" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
