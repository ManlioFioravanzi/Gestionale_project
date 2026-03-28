import { describe, expect, it } from "vitest";

import { getBookingById, listPublicServices, resetDemoState } from "./demo";
import { buildCheckoutSessionParams, calculateDepositCents } from "./payments";

describe("payments", () => {
  it("calculates percentage deposits for services", () => {
    resetDemoState();
    const service = listPublicServices("studio-aurora")[1];
    const bookingContext = getBookingById("book_002");

    expect(bookingContext).not.toBeNull();
    expect(calculateDepositCents(service, bookingContext!.tenant)).toBe(4600);
  });

  it("builds checkout params with booking metadata", () => {
    resetDemoState();
    const bookingContext = getBookingById("book_001");

    expect(bookingContext).not.toBeNull();

    const params = buildCheckoutSessionParams({
      tenant: bookingContext!.tenant,
      service: bookingContext!.service,
      booking: bookingContext!.booking,
      customerEmail: bookingContext!.customer.email,
      origin: "http://127.0.0.1:3000",
    });

    expect(params.mode).toBe("payment");
    expect(params.metadata.bookingId).toBe("book_001");
    expect(params.line_items[0].price_data.unit_amount).toBe(1650);
  });
});
