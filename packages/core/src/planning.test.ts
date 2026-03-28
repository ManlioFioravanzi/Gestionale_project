import { addMinutes, formatISO, parseISO } from "date-fns";
import { describe, expect, it } from "vitest";

import {
  createAdminBooking,
  getDashboardSnapshot,
  listPublicAvailability,
  rescheduleBooking,
  resetDemoState,
} from "./demo";

describe("planning actions", () => {
  it("creates an admin booking in a free slot", () => {
    resetDemoState();
    const before = getDashboardSnapshot("studio-aurora");
    const service = before.services[0];
    const slot = listPublicAvailability(
      "studio-aurora",
      service.id,
      before.bookings[0].startsAt.slice(0, 10),
    ).find((entry) => entry.staffMemberId === "staff_elena");

    expect(slot).toBeTruthy();

    const result = createAdminBooking({
      slug: "studio-aurora",
      serviceId: service.id,
      staffMemberId: slot!.staffMemberId,
      startsAt: slot!.startsAt,
      customerName: "Giulia Test",
      customerEmail: "giulia.test@example.com",
      customerPhone: "+39 333 111 2222",
      notes: "Slot riempito dal planning.",
    });

    expect(result.booking.channel).toBe("admin");
    expect(result.booking.staffMemberId).toBe(slot!.staffMemberId);
    expect(getDashboardSnapshot("studio-aurora").bookings.length).toBe(before.bookings.length + 1);
  });

  it("reschedules a booking into a new available hole", () => {
    resetDemoState();
    const before = getDashboardSnapshot("studio-aurora");
    const targetBooking = before.bookings.find((booking) => booking.id === "book_001");

    expect(targetBooking).toBeTruthy();

    const shiftedStart = formatISO(addMinutes(parseISO(targetBooking!.startsAt), 90));
    const updated = rescheduleBooking("book_001", shiftedStart, "staff_elena");

    expect(updated.startsAt).toBe(shiftedStart);
    expect(updated.staffMemberId).toBe("staff_elena");
  });
});
