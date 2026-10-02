-- Answers the funnel now collects because the document rules depend on them
-- (business feedback on the Dokumenten-Regeln, September 2026).
--
-- Run by hand (see prisma/sql/README.md). NOT applied through `prisma migrate`: the
-- migration history in this repo is stale, so a migrate run would try to reconcile far more
-- than these columns against a live production database.
--
-- Every statement is idempotent and every column is nullable, so re-running is harmless and
-- existing rows are untouched.

-- Eigenmittel: Darlehen is recorded but excluded from the Eigenmittel total;
-- Erbvorbezug / Erbschaft counts like a Schenkung.
ALTER TABLE "Financing" ADD COLUMN IF NOT EXISTS "eigenmittel_darlehen" TEXT;
ALTER TABLE "Financing" ADD COLUMN IF NOT EXISTS "eigenmittel_erbschaft" TEXT;
-- "Bestehen Leasingverträge?" — "ja" / "nein".
ALTER TABLE "Financing" ADD COLUMN IF NOT EXISTS "leasingVorhanden" TEXT;

-- "Steht die Liegenschaft im Baurecht?" — "ja" / "nein".
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "baurecht" TEXT;
-- Neubau: "Grundbuchauszug und Gebäudeversicherung sind bereits vorhanden" — "ja" or empty.
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "neubauGrundbuchGvVorhanden" TEXT;
-- Wohnung: "Ist es Stockwerkeigentum?" — "ja" / "nein".
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "stockwerkeigentum" TEXT;
