-- Link uploaded files to the submission they belong to.
--
-- Run by hand (see prisma/sql/README.md). NOT applied through `prisma migrate`: the
-- migration history in this repo is stale, so a migrate run would try to reconcile far more
-- than these columns against a live production database.
--
-- Every statement is idempotent, so re-running is harmless.

ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "docType" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "originalFileName" TEXT;

ALTER TABLE "HoldingDocument" ADD COLUMN IF NOT EXISTS "submissionId" TEXT;
ALTER TABLE "HoldingDocument" ADD COLUMN IF NOT EXISTS "docType" TEXT;
ALTER TABLE "HoldingDocument" ADD COLUMN IF NOT EXISTS "originalFileName" TEXT;

-- Adoption looks rows up by submissionId on every submit.
CREATE INDEX IF NOT EXISTS "HoldingDocument_submissionId_idx"
  ON "HoldingDocument" ("submissionId");
