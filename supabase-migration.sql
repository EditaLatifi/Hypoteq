-- Supabase Migration Script
-- Generated from Prisma schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create Inquiry table
CREATE TABLE IF NOT EXISTS "Inquiry" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "customerType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create Client table
CREATE TABLE IF NOT EXISTS "Client" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "inquiryId" UUID NOT NULL UNIQUE,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "zip" TEXT,
    "partnerEmail" TEXT,
    CONSTRAINT "Client_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create Project table
CREATE TABLE IF NOT EXISTS "Project" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "inquiryId" UUID NOT NULL UNIQUE,
    "projektArt" TEXT,
    "kreditnehmerTyp" TEXT,
    "liegenschaftZip" TEXT,
    CONSTRAINT "Project_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create Property table
CREATE TABLE IF NOT EXISTS "Property" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "inquiryId" UUID NOT NULL UNIQUE,
    "artLiegenschaft" TEXT,
    "artImmobilie" TEXT,
    "nutzung" TEXT,
    "renovation" TEXT,
    "renovationsBetrag" TEXT,
    "finanzierungsangebote" TEXT,
    "reserviert" TEXT,
    "angeboteListe" TEXT[],
    CONSTRAINT "Property_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create Firma table
CREATE TABLE IF NOT EXISTS "Firma" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "propertyId" UUID NOT NULL,
    "firmenname" TEXT,
    CONSTRAINT "Firma_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create Borrower table
CREATE TABLE IF NOT EXISTS "Borrower" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "inquiryId" UUID NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "birthdate" TEXT,
    "job" TEXT,
    "type" TEXT,
    "civil" TEXT,
    "firmaName" TEXT,
    "firmaUID" TEXT,
    CONSTRAINT "Borrower_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create Financing table
CREATE TABLE IF NOT EXISTS "Financing" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "inquiryId" UUID NOT NULL UNIQUE,
    "kaufpreis" TEXT,
    "eigenmittel_bar" TEXT,
    "eigenmittel_saeule3" TEXT,
    "eigenmittel_pk" TEXT,
    "eigenmittel_schenkung" TEXT,
    "pkVorbezug" TEXT,
    "hypoBetrag" TEXT,
    "modell" TEXT,
    "einkommen" TEXT,
    "steueroptimierung" TEXT,
    "kaufdatum" TEXT,
    "kommentar" TEXT,
    "abloesung_betrag" TEXT,
    "erhoehung" TEXT,
    "erhoehung_betrag" TEXT,
    "abloesedatum" TEXT,
    "brutto" TEXT,
    CONSTRAINT "Financing_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create Kreditnehmer table
CREATE TABLE IF NOT EXISTS "Kreditnehmer" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "propertyId" UUID NOT NULL,
    "name" TEXT,
    "vorname" TEXT,
    "status" TEXT,
    "firmenname" TEXT,
    "geburtsdatum" TEXT,
    CONSTRAINT "Kreditnehmer_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create Document table
CREATE TABLE IF NOT EXISTS "Document" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "inquiryId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "Client_inquiryId_idx" ON "Client"("inquiryId");
CREATE INDEX IF NOT EXISTS "Project_inquiryId_idx" ON "Project"("inquiryId");
CREATE INDEX IF NOT EXISTS "Property_inquiryId_idx" ON "Property"("inquiryId");
CREATE INDEX IF NOT EXISTS "Firma_propertyId_idx" ON "Firma"("propertyId");
CREATE INDEX IF NOT EXISTS "Borrower_inquiryId_idx" ON "Borrower"("inquiryId");
CREATE INDEX IF NOT EXISTS "Financing_inquiryId_idx" ON "Financing"("inquiryId");
CREATE INDEX IF NOT EXISTS "Kreditnehmer_propertyId_idx" ON "Kreditnehmer"("propertyId");
CREATE INDEX IF NOT EXISTS "Document_inquiryId_idx" ON "Document"("inquiryId");
CREATE INDEX IF NOT EXISTS "Inquiry_createdAt_idx" ON "Inquiry"("createdAt");

-- Grant permissions (adjust based on your Supabase setup)
-- These are typically handled by Supabase RLS policies
