import type { Booking, Payment, Service, Tenant } from "./domain";

export function calculateDepositCents(service: Service, tenant: Tenant) {
  if (service.depositType === "fixed") {
    return Math.min(service.depositValue, service.priceCents);
  }

  if (service.depositType === "percentage") {
    return Math.round(service.priceCents * (service.depositValue / 100));
  }

  return Math.round(service.priceCents * (tenant.defaultDepositPercentage / 100));
}

interface CheckoutInput {
  tenant: Tenant;
  service: Service;
  booking: Booking;
  customerEmail: string;
  origin: string;
}

export function buildCheckoutSessionParams({
  tenant,
  service,
  booking,
  customerEmail,
  origin,
}: CheckoutInput) {
  const amountCents = booking.depositRequiredCents;
  const successUrl = `${origin}/${tenant.slug}?checkout=success&bookingId=${booking.id}`;
  const cancelUrl = `${origin}/${tenant.slug}?checkout=cancelled&bookingId=${booking.id}`;

  return {
    mode: "payment" as const,
    client_reference_id: booking.id,
    customer_email: customerEmail,
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: tenant.currency.toLowerCase(),
          product_data: {
            name: `${service.name} deposit`,
            description: `${tenant.businessName} - prenotazione ${service.name}`,
          },
          unit_amount: amountCents,
        },
      },
    ],
    metadata: {
      bookingId: booking.id,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      profile: booking.profile,
    },
    payment_intent_data: {
      metadata: {
        bookingId: booking.id,
        tenantId: tenant.id,
      },
    },
  };
}

export function markPaymentPaid(payment: Payment): Payment {
  return {
    ...payment,
    status: "paid",
    updatedAt: new Date().toISOString(),
  };
}

export function markPaymentRefunded(payment: Payment): Payment {
  return {
    ...payment,
    status: "refunded",
    updatedAt: new Date().toISOString(),
  };
}
