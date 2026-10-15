-- Funnel v5 (Auskunftsermächtigung) and the Partnerportal handoff of 14.10.2026.
--
-- New tables only. No column is added to an existing table, so a build whose Prisma client
-- knows these models still runs against a database where this file has not been run yet;
-- only the new features fail until it is.
--
-- Run by hand (psql / Supabase SQL editor), NOT through `prisma migrate` (the migration
-- history is stale). Idempotent: safe to run more than once. Matches prisma/schema.prisma.

CREATE TABLE IF NOT EXISTS "InquirySignature" (
  "inquiryId"      TEXT PRIMARY KEY,
  "status"         TEXT NOT NULL,
  "method"         TEXT NOT NULL DEFAULT 'upload',
  "fileName"       TEXT,
  "driveItemId"    TEXT,
  "requestedAt"    TIMESTAMP(3),
  "receivedAt"     TIMESTAMP(3),
  "remindersSent"  INTEGER NOT NULL DEFAULT 0,
  "lastReminderAt" TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "InquirySignature_status_requestedAt_idx" ON "InquirySignature"("status", "requestedAt");

CREATE TABLE IF NOT EXISTS "PortalSpecialRequest" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL,
  "contactId" TEXT,
  "accountId" TEXT,
  "type"      TEXT NOT NULL,
  "kunde"     TEXT NOT NULL,
  "amount"    INTEGER,
  "payload"   JSONB NOT NULL,
  "files"     JSONB,
  "sfCaseId"  TEXT,
  "sfError"   TEXT,
  "caseNr"    TEXT,
  "status"    TEXT NOT NULL DEFAULT 'new',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PortalSpecialRequest_userId_createdAt_idx" ON "PortalSpecialRequest"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "PortalSupportTicket" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "caseId"    TEXT,
  "subject"   TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "techInfo"  JSONB,
  "status"    TEXT NOT NULL DEFAULT 'eingegangen',
  "sfId"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PortalSupportTicket_userId_createdAt_idx" ON "PortalSupportTicket"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "PortalChangeRequest" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL,
  "field"     TEXT NOT NULL,
  "oldValue"  TEXT,
  "newValue"  TEXT NOT NULL,
  "note"      TEXT,
  "status"    TEXT NOT NULL DEFAULT 'in_pruefung',
  "sfTaskId"  TEXT,
  "decidedAt" TIMESTAMP(3),
  "decidedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PortalChangeRequest_userId_createdAt_idx" ON "PortalChangeRequest"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "PortalImage" (
  "id"        TEXT PRIMARY KEY,
  "kind"      TEXT NOT NULL,
  "ownerId"   TEXT NOT NULL,
  "mime"      TEXT NOT NULL,
  "data"      BYTEA NOT NULL,
  "onLight"   BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PortalImage_kind_ownerId_key" ON "PortalImage"("kind", "ownerId");

CREATE TABLE IF NOT EXISTS "PortalPartnerDocument" (
  "id"          TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL,
  "accountId"   TEXT,
  "name"        TEXT NOT NULL,
  "fileName"    TEXT NOT NULL,
  "driveItemId" TEXT NOT NULL,
  "webUrl"      TEXT,
  "status"      TEXT NOT NULL DEFAULT 'in_pruefung',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PortalPartnerDocument_accountId_createdAt_idx" ON "PortalPartnerDocument"("accountId", "createdAt");
