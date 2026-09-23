-- Partnerportal tables. Idempotent: safe to run more than once.
-- Run against the database by hand (psql / Supabase SQL editor); do NOT use `prisma migrate`.
-- Matches the PortalUser / PortalToken / PortalSession / PortalAuditLog models in schema.prisma.

CREATE TABLE IF NOT EXISTS "PortalUser" (
  "id"              TEXT PRIMARY KEY,
  "email"           TEXT NOT NULL,
  "role"            TEXT NOT NULL DEFAULT 'partner',
  "status"          TEXT NOT NULL DEFAULT 'invited',
  "name"            TEXT,
  "company"         TEXT,
  "phone"           TEXT,
  "sfContactId"     TEXT,
  "sfAccountId"     TEXT,
  "passwordHash"    TEXT,
  "termsAcceptedAt" TIMESTAMP(3),
  "invitedAt"       TIMESTAMP(3),
  "invitedBy"       TEXT,
  "activatedAt"     TIMESTAMP(3),
  "lastLoginAt"     TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PortalUser_email_key" ON "PortalUser"("email");
ALTER TABLE "PortalUser" ADD COLUMN IF NOT EXISTS "profileConfirmedAt" TIMESTAMP(3);
ALTER TABLE "PortalUser" ADD COLUMN IF NOT EXISTS "notifyPrefs" JSONB;
ALTER TABLE "PortalUser" ADD COLUMN IF NOT EXISTS "locale" TEXT;

CREATE TABLE IF NOT EXISTS "PortalToken" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL REFERENCES "PortalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "purpose"   TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PortalToken_tokenHash_key" ON "PortalToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "PortalToken_userId_purpose_idx" ON "PortalToken"("userId", "purpose");

CREATE TABLE IF NOT EXISTS "PortalSession" (
  "id"         TEXT PRIMARY KEY,
  "userId"     TEXT NOT NULL REFERENCES "PortalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "tokenHash"  TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "ip"         TEXT,
  "userAgent"  TEXT
);
ALTER TABLE "PortalSession" ADD COLUMN IF NOT EXISTS "viewAsContactId" TEXT;
ALTER TABLE "PortalSession" ADD COLUMN IF NOT EXISTS "viewAsName" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "PortalSession_tokenHash_key" ON "PortalSession"("tokenHash");
CREATE INDEX IF NOT EXISTS "PortalSession_userId_idx" ON "PortalSession"("userId");

CREATE TABLE IF NOT EXISTS "PortalCaseState" (
  "caseId"       TEXT PRIMARY KEY,
  "contactId"    TEXT NOT NULL,
  "status"       TEXT NOT NULL,
  "missingCount" INTEGER NOT NULL DEFAULT 0,
  "folderId"     TEXT,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PortalCaseState_contactId_idx" ON "PortalCaseState"("contactId");

CREATE TABLE IF NOT EXISTS "PortalNotification" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL REFERENCES "PortalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "caseId"    TEXT NOT NULL,
  "caseNr"    TEXT NOT NULL,
  "kunde"     TEXT NOT NULL,
  "kind"      TEXT NOT NULL,
  "variant"   TEXT NOT NULL,
  "status"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt"    TIMESTAMP(3),
  "emailedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "PortalNotification_userId_createdAt_idx" ON "PortalNotification"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "PortalNotification_caseId_idx" ON "PortalNotification"("caseId");

CREATE TABLE IF NOT EXISTS "PortalMessage" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL,
  "caseId"    TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PortalMessage_caseId_createdAt_idx" ON "PortalMessage"("caseId", "createdAt");

CREATE TABLE IF NOT EXISTS "PortalUpload" (
  "id"          TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL,
  "caseId"      TEXT NOT NULL,
  "docKey"      TEXT,
  "docLabel"    TEXT NOT NULL,
  "fileName"    TEXT NOT NULL,
  "driveItemId" TEXT NOT NULL,
  "webUrl"      TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PortalUpload_caseId_createdAt_idx" ON "PortalUpload"("caseId", "createdAt");
CREATE INDEX IF NOT EXISTS "PortalUpload_userId_createdAt_idx" ON "PortalUpload"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "PortalAuditLog" (
  "id"         TEXT PRIMARY KEY,
  "at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorId"    TEXT,
  "actorEmail" TEXT,
  "action"     TEXT NOT NULL,
  "target"     TEXT,
  "ip"         TEXT
);
CREATE INDEX IF NOT EXISTS "PortalAuditLog_at_idx" ON "PortalAuditLog"("at");
CREATE INDEX IF NOT EXISTS "PortalAuditLog_actorEmail_action_at_idx" ON "PortalAuditLog"("actorEmail", "action", "at");
