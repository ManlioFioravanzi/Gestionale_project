import { getBookingById, markBookingDepositPaid, paymentCheckoutSchema } from "@booking/core";
import { NextRequest, NextResponse } from "next/server";

import { buildCheckoutSessionParams } from "@booking/core";

import { getStripeClient } from "../../../../../../lib/stripe";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> | { slug: string } },
) {
  const { slug } = await context.params;

  try {
    const body = await request.json();
    const payload = paymentCheckoutSchema.parse(body);
    const bookingContext = getBookingById(payload.bookingId);

    if (!bookingContext || bookingContext.tenant.slug !== slug) {
      return NextResponse.json({ error: "Booking non trovata." }, { status: 404 });
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
    const stripeClient = getStripeClient();

    if (!stripeClient) {
      markBookingDepositPaid(payload.bookingId, `cs_mock_${payload.bookingId}`);
      return NextResponse.json({
        url: `${origin}/${slug}?checkout=success&bookingId=${payload.bookingId}`,
        mock: true,
      });
    }

    const session = await stripeClient.checkout.sessions.create(
      buildCheckoutSessionParams({
        tenant: bookingContext.tenant,
        service: bookingContext.service,
        booking: bookingContext.booking,
        customerEmail: bookingContext.customer.email,
        origin,
      }),
    );

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Checkout non disponibile." },
      { status: 400 },
    );
  }
}
