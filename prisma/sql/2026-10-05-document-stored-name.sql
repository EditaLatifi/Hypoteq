-- The name a Funnel v3 file has in the case folder after the closing (Spezifikation 5.1):
-- {Fallnummer}_{Gruppe}_{Dokumenttyp}_{Person}_{Datum}_{Nr}.{Endung}
--
-- Set by lib/funnel-v3/completion.ts when it renames the file in SharePoint. `fileName` then
-- carries the same value and `originalFileName` keeps what the customer uploaded, so the
-- rename stays auditable. Null for files that were not renamed (older funnels, no case
-- number, a failed rename, files removed as duplicate / not needed).
--
-- Run by hand, NOT through `prisma migrate` (the migration history is stale). Idempotent and
-- nullable. Run it BEFORE deploying a build whose Prisma client knows the column: Prisma
-- selects every scalar column, so a client with storedName fails against a table without it.

ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "storedName" TEXT;
