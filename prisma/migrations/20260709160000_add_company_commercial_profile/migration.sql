-- Company commercial profile fields for manual entry and AI enrichment.
ALTER TABLE "companies" ADD COLUMN "source" TEXT;
ALTER TABLE "companies" ADD COLUMN "priority" TEXT;
ALTER TABLE "companies" ADD COLUMN "mainPain" TEXT;
ALTER TABLE "companies" ADD COLUMN "productInterest" TEXT;
ALTER TABLE "companies" ADD COLUMN "potentialValue" DECIMAL(14,2);
ALTER TABLE "companies" ADD COLUMN "buyingTiming" TEXT;
ALTER TABLE "companies" ADD COLUMN "urgency" TEXT;
ALTER TABLE "companies" ADD COLUMN "competitor" TEXT;
ALTER TABLE "companies" ADD COLUMN "currentProvider" TEXT;
ALTER TABLE "companies" ADD COLUMN "nextStep" TEXT;
ALTER TABLE "companies" ADD COLUMN "nextStepDueDate" TIMESTAMP(3);
ALTER TABLE "companies" ADD COLUMN "lastContactAt" TIMESTAMP(3);
