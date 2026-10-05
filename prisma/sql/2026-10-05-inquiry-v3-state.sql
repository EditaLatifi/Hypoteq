-- Funnel v3 answers on the Inquiry, for the Nachreichung (app/api/nachreichen/[token]).
--
-- A v3 inquiry stores its missing documents as requirement instance ids (`lohnausweise#b1`).
-- Which documents those are, whose they are and which ones a later upload fulfils can only be
-- worked out again from the answers the requirement list was computed from, so the submitted
-- `v3` block (role, ans, txt, fin, borrowers, plus the funnel language) and the «Habe ich
-- nicht» marks are kept with the inquiry. Null for legacy inquiries.
--
-- Run by hand, NOT through `prisma migrate` (the migration history is stale). Idempotent and
-- nullable. Run it BEFORE deploying a build whose Prisma client knows the columns: Prisma
-- selects every scalar column, so a client with them fails against a table without them.

ALTER TABLE "Inquiry" ADD COLUMN IF NOT EXISTS "v3State" JSONB;
ALTER TABLE "Inquiry" ADD COLUMN IF NOT EXISTS "v3Skipped" JSONB;
