-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "angeboteListe" TEXT[],
ALTER COLUMN "artLiegenschaft" DROP NOT NULL,
ALTER COLUMN "artImmobilie" DROP NOT NULL,
ALTER COLUMN "nutzung" DROP NOT NULL,
ALTER COLUMN "renovation" DROP NOT NULL,
ALTER COLUMN "finanzierungsangebote" DROP NOT NULL,
ALTER COLUMN "reserviert" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Firma" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "firmenname" TEXT,

    CONSTRAINT "Firma_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Firma" ADD CONSTRAINT "Firma_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
