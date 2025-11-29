/*
  Warnings:

  - You are about to drop the column `borrowers` on the `Inquiry` table. All the data in the column will be lost.
  - You are about to drop the column `client` on the `Inquiry` table. All the data in the column will be lost.
  - You are about to drop the column `financing` on the `Inquiry` table. All the data in the column will be lost.
  - You are about to drop the column `project` on the `Inquiry` table. All the data in the column will be lost.
  - You are about to drop the column `property` on the `Inquiry` table. All the data in the column will be lost.
  - Made the column `customerType` on table `Inquiry` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Inquiry" DROP COLUMN "borrowers",
DROP COLUMN "client",
DROP COLUMN "financing",
DROP COLUMN "project",
DROP COLUMN "property",
ALTER COLUMN "customerType" SET NOT NULL;

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "zip" TEXT,
    "partnerEmail" TEXT,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "projektArt" TEXT,
    "kreditnehmerTyp" TEXT,
    "liegenschaftZip" TEXT,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Firma" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "firmenname" TEXT,

    CONSTRAINT "Firma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kreditnehmer" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT,
    "vorname" TEXT,
    "status" TEXT,
    "firmenname" TEXT,
    "geburtsdatum" TEXT,

    CONSTRAINT "Kreditnehmer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Borrower" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "birthdate" TEXT,
    "job" TEXT,
    "type" TEXT,
    "civil" TEXT,
    "firmaName" TEXT,
    "firmaUID" TEXT,

    CONSTRAINT "Borrower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Financing" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "brutto" TEXT,
    "modell" TEXT,
    "einkommen" TEXT,
    "erhoehung" TEXT,
    "kaufdatum" TEXT,
    "kaufpreis" TEXT,
    "kommentar" TEXT,
    "hypoBetrag" TEXT,
    "pkVorbezug" TEXT,
    "abloesedatum" TEXT,
    "eigenmittel_pk" TEXT,
    "eigenmittel_bar" TEXT,
    "eigenmittel_saeule3" TEXT,
    "eigenmittel_schenkung" TEXT,
    "abloesung_betrag" TEXT,
    "erhoehung_betrag" TEXT,
    "steueroptimierung" TEXT,

    CONSTRAINT "Financing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "artLiegenschaft" TEXT,
    "artImmobilie" TEXT,
    "nutzung" TEXT,
    "renovation" TEXT,
    "renovationsBetrag" TEXT,
    "finanzierungsangebote" TEXT,
    "reserviert" TEXT,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_inquiryId_key" ON "Client"("inquiryId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_inquiryId_key" ON "Project"("inquiryId");

-- CreateIndex
CREATE UNIQUE INDEX "Financing_inquiryId_key" ON "Financing"("inquiryId");

-- CreateIndex
CREATE UNIQUE INDEX "Property_inquiryId_key" ON "Property"("inquiryId");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Firma" ADD CONSTRAINT "Firma_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kreditnehmer" ADD CONSTRAINT "Kreditnehmer_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Borrower" ADD CONSTRAINT "Borrower_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Financing" ADD CONSTRAINT "Financing_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
