-- Partner Fast Lead (HYPOTEQ request 23.11.2026, DECISIONS P39, P40): a partner invites a customer
-- from the portal with the contact details only. The Salesforce Case is created at once; the
-- customer completes the funnel through a personal link and the submit updates that Case.
--
-- A new table only; no existing table changes. A build that knows the model still runs where
-- this file has not been run yet — «Kunde einladen» answers with an error until it is.
--
-- Run by hand (psql / Supabase SQL editor), NOT through `prisma migrate` (the migration
-- history is stale). Idempotent: safe to run more than once. Matches prisma/schema.prisma.

CREATE TABLE IF NOT EXISTS "PortalLead" (
  "id"               TEXT PRIMARY KEY,
  "partnerUserId"    TEXT NOT NULL,
  "partnerEmail"     TEXT NOT NULL,
  "partnerName"      TEXT,
  "partnerCompany"   TEXT,
  "partnerPhone"     TEXT,
  "sfContactId"      TEXT NOT NULL,
  "sfAccountId"      TEXT,
  -- Herr | Frau | null
  "anrede"           TEXT,
  "firstName"        TEXT NOT NULL,
  "lastName"         TEXT NOT NULL,
  "email"            TEXT NOT NULL,
  "phone"            TEXT,
  -- de | en | fr | it
  "locale"           TEXT NOT NULL DEFAULT 'de',
  -- The partner confirmed the customer agreed to be contacted by HYPOTEQ.
  "consentAt"        TIMESTAMP(3) NOT NULL,
  -- The link's credential (like Inquiry."nachreichToken").
  "token"            TEXT NOT NULL,
  "expiresAt"        TIMESTAMP(3) NOT NULL,
  -- invited | opened | submitted
  "status"           TEXT NOT NULL DEFAULT 'invited',
  "openedAt"         TIMESTAMP(3),
  "mailsSent"        INTEGER NOT NULL DEFAULT 1,
  "lastMailAt"       TIMESTAMP(3),
  -- Reminders to the customer after 3 and 7 days (portal cron).
  "remindersSent"    INTEGER NOT NULL DEFAULT 0,
  "lastReminderAt"   TIMESTAMP(3),
  -- Created by a test deployment (the Preview); production leaves it alone.
  "testDeployment"   BOOLEAN NOT NULL DEFAULT false,
  "submittedAt"      TIMESTAMP(3),
  "inquiryId"        TEXT,
  "caseNumber"       TEXT,
  -- The Case created with the invitation; the customer's submit updates it.
  "salesforceCaseId" TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PortalLead_token_key" ON "PortalLead"("token");
CREATE INDEX IF NOT EXISTS "PortalLead_sfContactId_createdAt_idx" ON "PortalLead"("sfContactId", "createdAt");
CREATE INDEX IF NOT EXISTS "PortalLead_partnerUserId_createdAt_idx" ON "PortalLead"("partnerUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "PortalLead_email_idx" ON "PortalLead"("email");
CREATE INDEX IF NOT EXISTS "PortalLead_status_createdAt_idx" ON "PortalLead"("status", "createdAt");
