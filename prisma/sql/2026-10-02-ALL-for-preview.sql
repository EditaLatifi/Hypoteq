-- HYPOTEQ ai-document-intelligence: all columns this branch needs. Idempotent; only adds nullable columns.
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "docType" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "originalFileName" TEXT;
ALTER TABLE "HoldingDocument" ADD COLUMN IF NOT EXISTS "submissionId" TEXT;
ALTER TABLE "HoldingDocument" ADD COLUMN IF NOT EXISTS "docType" TEXT;
ALTER TABLE "HoldingDocument" ADD COLUMN IF NOT EXISTS "originalFileName" TEXT;
CREATE INDEX IF NOT EXISTS "HoldingDocument_submissionId_idx"
  ON "HoldingDocument" ("submissionId");
ALTER TABLE "HoldingDocument" ADD COLUMN IF NOT EXISTS "aiStatus" TEXT;
ALTER TABLE "HoldingDocument" ADD COLUMN IF NOT EXISTS "aiDocType" TEXT;
ALTER TABLE "HoldingDocument" ADD COLUMN IF NOT EXISTS "aiConfidence" DOUBLE PRECISION;
ALTER TABLE "HoldingDocument" ADD COLUMN IF NOT EXISTS "aiAnalysis" JSONB;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "aiStatus" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "aiDocType" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "aiConfidence" DOUBLE PRECISION;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "aiAnalysis" JSONB;
CREATE INDEX IF NOT EXISTS "Document_aiStatus_idx" ON "Document" ("aiStatus");
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "driveItemId" TEXT;
ALTER TABLE "HoldingDocument" ADD COLUMN IF NOT EXISTS "driveItemId" TEXT;
ALTER TABLE "Financing" ADD COLUMN IF NOT EXISTS "eigenmittel_darlehen" TEXT;
ALTER TABLE "Financing" ADD COLUMN IF NOT EXISTS "eigenmittel_erbschaft" TEXT;
ALTER TABLE "Financing" ADD COLUMN IF NOT EXISTS "leasingVorhanden" TEXT;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "baurecht" TEXT;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "neubauGrundbuchGvVorhanden" TEXT;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "stockwerkeigentum" TEXT;
ALTER TABLE "Inquiry" ADD COLUMN IF NOT EXISTS "caseNumber" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Inquiry_caseNumber_key" ON "Inquiry"("caseNumber");
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "storedName" TEXT;
