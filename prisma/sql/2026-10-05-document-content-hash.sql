-- SHA-256 of each uploaded file (hex), for duplicate detection in Funnel v3 (spec 4.3
-- «Duplikat: wird nicht doppelt gespeichert»).
--
-- Written by /api/upload-doc/finalize (streamed from SharePoint right after the upload) and,
-- for rows that have none, by the analyse route from the bytes it reads anyway. Carried from
-- HoldingDocument to Document on adoption.
--
-- Run by hand, NOT through `prisma migrate` (the migration history is stale). Idempotent, and
-- only adds nullable columns, so a deployment that does not know them is unaffected. Run it
-- BEFORE deploying a Prisma client generated from the schema that declares the column.

ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "contentHash" TEXT;
ALTER TABLE "HoldingDocument" ADD COLUMN IF NOT EXISTS "contentHash" TEXT;
