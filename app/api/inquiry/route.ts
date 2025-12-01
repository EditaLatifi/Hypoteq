import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    // Parse the incoming request body (JSON)
    const data = await req.json();
    console.log('Received data:', data); // Debugging step to ensure proper structure

    // Convert angebote array to string array for database
    const angeboteListe = data.property?.angebote?.map((offer: any) => 
      `${offer.bank || ''} | ${offer.zins || ''}% | ${offer.laufzeit || ''}`
    ) || [];

const saved = await prisma.inquiry.create({
  data: {
    customerType: data.customerType || null,
    client: data.client ? { create: data.client } : undefined,
    project: data.project ? { create: data.project } : undefined,
    property: data.property
      ? {
          create: {
            artImmobilie: data.property.artImmobilie,
            artLiegenschaft: data.property.artLiegenschaft,
            nutzung: data.property.nutzung,
            renovation: data.property.renovation,
            renovationsBetrag: data.property.renovationsBetrag,
            reserviert: data.property.reserviert,
            finanzierungsangebote: data.property.finanzierungsangebote,
            angeboteListe: angeboteListe,
            kreditnehmer: data.property.kreditnehmer?.length > 0
              ? { createMany: { data: data.property.kreditnehmer } }
              : undefined,
            firmen: data.property.firmen?.length > 0 && data.property.firmen[0]?.firmenname
              ? { createMany: { data: data.property.firmen } }
              : undefined,
          },
        }
      : undefined,
    financing: data.financing ? { create: data.financing } : undefined,
    borrowers: data.borrowers
      ? { createMany: { data: data.borrowers } }
      : undefined,
  },
});

    return NextResponse.json({ success: true, inquiry: saved });
  } catch (err: unknown) {
    // Type assertion to ensure 'err' is treated as an Error
    if (err instanceof Error) {
      console.error("❌ Failed to save inquiry:", err);
      return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
    // In case it's not an instance of Error (fallback case)
    console.error("❌ Unknown error:", err);
    return NextResponse.json({ success: false, error: "An unknown error occurred." }, { status: 500 });
  }
}