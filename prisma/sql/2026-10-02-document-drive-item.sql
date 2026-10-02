-- Remember which SharePoint item each uploaded file is.
--
-- Files now upload the moment they are picked, and the AI analysis reads them back from
-- SharePoint on the server instead of receiving a second copy from the browser. Both that
-- and deleting a file the customer removes before submitting need the driveItem id, which
-- was previously thrown away after the upload.
--
-- Run by hand, NOT through `prisma migrate` (the migration history is stale). Idempotent,
-- and only adds nullable columns, so the production deployment (which does not know them)
-- is unaffected.

ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "driveItemId" TEXT;
ALTER TABLE "HoldingDocument" ADD COLUMN IF NOT EXISTS "driveItemId" TEXT;
