import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    // Parse the incoming request body (JSON)
    const data = await req.json();
    console.log('Received data:', data); // Debugging step to ensure proper structure

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
            angeboteListe: data.property.angeboteListe,
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