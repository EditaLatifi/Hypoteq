-- Re-Upload requests (HYPOTEQ 23.10.2026, Spezifikation Datenabgleich Kap. 5; answers 8 and 9 of
-- 26.10.2026): Salesforce asks for a document again, the funnel mails the link and reminds
-- after 2 and 5 days until the new document is there.
--
-- A new table only; no existing table changes. A build that knows the model still runs where
-- this file has not been run yet — only the re-upload endpoint answers 503 until it is.
--
-- Run by hand (psql / Supabase SQL editor), NOT through `prisma migrate` (the migration
-- history is stale). Idempotent: safe to run more than once. Matches prisma/schema.prisma.

CREATE TABLE IF NOT EXISTS "InquiryReupload" (
  "id"                  TEXT PRIMARY KEY,
  "inquiryId"           TEXT NOT NULL,
  -- The requirement instance (Dokumenten_Check_State__c requirements[].id), e.g. lohnausweise#<borrower>.
  "requirement"         TEXT NOT NULL,
  "reason"              TEXT NOT NULL,
  -- The mail text as HYPOTEQ edited it in Salesforce; null = the funnel's own text (Kap. 10.1).
  "mailText"            TEXT,
  -- kunde | partner (answer 9: whoever submitted).
  "recipient"           TEXT NOT NULL,
  "recipientEmail"      TEXT,
  "lang"                TEXT NOT NULL DEFAULT 'de',
  -- The Salesforce Task the funnel closes when the new document arrives (optional).
  "taskId"              TEXT,
  -- open | resolved
  "status"              TEXT NOT NULL DEFAULT 'open',
  "requestedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "remindersSent"       INTEGER NOT NULL DEFAULT 0,
  "lastReminderAt"      TIMESTAMP(3),
  "resolvedAt"          TIMESTAMP(3),
  -- The documents moved to «Weitere Dateien» by this request (never deleted).
  "previousDocumentIds" JSONB,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "InquiryReupload_status_requestedAt_idx" ON "InquiryReupload"("status", "requestedAt");
CREATE INDEX IF NOT EXISTS "InquiryReupload_inquiryId_idx" ON "InquiryReupload"("inquiryId");
