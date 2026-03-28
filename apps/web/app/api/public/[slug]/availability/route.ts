import { listPublicAvailability } from "@booking/core";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> | { slug: string } },
) {
  const { slug } = await context.params;
  const serviceId = request.nextUrl.searchParams.get("serviceId");
  const date = request.nextUrl.searchParams.get("date");

  if (!serviceId || !date) {
    return NextResponse.json(
      { error: "Parametri serviceId e date sono obbligatori." },
      { status: 400 },
    );
  }

  try {
    const slots = listPublicAvailability(slug, serviceId, date);
    return NextResponse.json({ slots });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Disponibilita' non disponibile." },
      { status: 400 },
    );
  }
}
