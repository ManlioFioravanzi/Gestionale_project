import { bookingDraftSchema, createPublicBooking } from "@booking/core";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> | { slug: string } },
) {
  try {
    const { slug } = await context.params;
    const body = await request.json();
    const payload = bookingDraftSchema.parse(body);
    const booking = createPublicBooking({ ...payload, slug });
    return NextResponse.json(booking, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossibile creare la prenotazione." },
      { status: 400 },
    );
  }
}
