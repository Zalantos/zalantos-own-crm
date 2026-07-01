-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MEMBER');

-- AlterTable
-- Additive change: existing rows get the safe default 'MEMBER'.
-- IMPORTANT: any pre-existing admin user in production keeps 'MEMBER'
-- after this migration and must be promoted manually (see rollout notes).
ALTER TABLE "users" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'MEMBER';
