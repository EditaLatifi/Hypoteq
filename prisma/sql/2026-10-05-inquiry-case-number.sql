-- HYPOTEQ case number on the Inquiry (Funnel v3, DECISIONS D1): HQ-JJ-MM-NNNNNN.
--
-- Minted at submit and independent of Salesforce, because the sync is allowed to fail while
-- file names and the dossier still need the number. Unique: the allocation draws again on a
-- collision (components/caseNumber.ts).
--
-- Run by hand, NOT through `prisma migrate` (the migration history is stale). Idempotent and
-- nullable. Run it BEFORE deploying a build whose Prisma client knows the column: Prisma
-- selects every scalar column, so a client with caseNumber fails against a table without it.
-- Postgres allows any number of NULLs under a unique index, so existing rows are unaffected.

ALTER TABLE "Inquiry" ADD COLUMN IF NOT EXISTS "caseNumber" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Inquiry_caseNumber_key" ON "Inquiry"("caseNumber");
