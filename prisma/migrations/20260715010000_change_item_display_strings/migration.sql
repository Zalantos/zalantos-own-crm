-- Persiste las cadenas legibles (etiqueta + diff textual) de cada CRMChangeItem,
-- calculadas al crear la propuesta, para renderizar el card de revisión desde la
-- DB (página /agent/proposals) con paridad con el chat. Nullable: las propuestas
-- previas quedan en NULL y la UI usa un fallback.

-- AlterTable
ALTER TABLE "crm_change_items" ADD COLUMN "label" TEXT;
ALTER TABLE "crm_change_items" ADD COLUMN "before" TEXT;
ALTER TABLE "crm_change_items" ADD COLUMN "after" TEXT;
