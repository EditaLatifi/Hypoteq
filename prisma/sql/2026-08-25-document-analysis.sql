-- Store what the AI made of each uploaded document (spec sections 27 and 36).
--
-- Run by hand. NOT applied through `prisma migrate` — the migration history here is stale
-- and a migrate run would try to reconcile far more than these columns against production.
-- Every statement is idempotent.

-- The analysis lands on HoldingDocument first, because a file is analysed at upload time,
-- before the Inquiry it belongs to exists. Adoption carries these across.
ALTER TABLE "HoldingDocument" ADD COLUMN IF NOT EXISTS "aiStatus" TEXT;
ALTER TABLE "HoldingDocument" ADD COLUMN IF NOT EXISTS "aiDocType" TEXT;
ALTER TABLE "HoldingDocument" ADD COLUMN IF NOT EXISTS "aiConfidence" DOUBLE PRECISION;
ALTER TABLE "HoldingDocument" ADD COLUMN IF NOT EXISTS "aiAnalysis" JSONB;

ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "aiStatus" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "aiDocType" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "aiConfidence" DOUBLE PRECISION;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "aiAnalysis" JSONB;

-- Staff filter on "what still needs a human" far more often than on anything else here.
CREATE INDEX IF NOT EXISTS "Document_aiStatus_idx" ON "Document" ("aiStatus");
