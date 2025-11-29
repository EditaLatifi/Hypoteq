/*
  Warnings:

  - You are about to drop the column `abloesedatum` on the `Financing` table. All the data in the column will be lost.
  - You are about to drop the column `abloesung_betrag` on the `Financing` table. All the data in the column will be lost.
  - You are about to drop the column `brutto` on the `Financing` table. All the data in the column will be lost.
  - You are about to drop the column `erhoehung` on the `Financing` table. All the data in the column will be lost.
  - You are about to drop the column `erhoehung_betrag` on the `Financing` table. All the data in the column will be lost.
  - You are about to drop the `Firma` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `artLiegenschaft` on table `Property` required. This step will fail if there are existing NULL values in that column.
  - Made the column `artImmobilie` on table `Property` required. This step will fail if there are existing NULL values in that column.
  - Made the column `nutzung` on table `Property` required. This step will fail if there are existing NULL values in that column.
  - Made the column `renovation` on table `Property` required. This step will fail if there are existing NULL values in that column.
  - Made the column `finanzierungsangebote` on table `Property` required. This step will fail if there are existing NULL values in that column.
  - Made the column `reserviert` on table `Property` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Firma" DROP CONSTRAINT "Firma_propertyId_fkey";

-- AlterTable
ALTER TABLE "Financing" DROP COLUMN "abloesedatum",
DROP COLUMN "abloesung_betrag",
DROP COLUMN "brutto",
DROP COLUMN "erhoehung",
DROP COLUMN "erhoehung_betrag";

-- AlterTable
ALTER TABLE "Property" ALTER COLUMN "artLiegenschaft" SET NOT NULL,
ALTER COLUMN "artImmobilie" SET NOT NULL,
ALTER COLUMN "nutzung" SET NOT NULL,
ALTER COLUMN "renovation" SET NOT NULL,
ALTER COLUMN "finanzierungsangebote" SET NOT NULL,
ALTER COLUMN "reserviert" SET NOT NULL;

-- DropTable
DROP TABLE "Firma";
