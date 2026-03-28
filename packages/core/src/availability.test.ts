import { addDays, formatISO } from "date-fns";
import { describe, expect, it } from "vitest";

import { listAvailability } from "./availability";
import { getDashboardSnapshot, listPublicServices, resetDemoState } from "./demo";

describe("availability engine", () => {
  function getNextOperationalDate() {
    let candidate = addDays(new Date(), 1);

    while (candidate.getDay() === 0) {
      candidate = addDays(candidate, 1);
    }

    return candidate;
  }

  it("filters overlapping bookings using booking buffers", () => {
    resetDemoState();
    const snapshot = getDashboardSnapshot("studio-aurora");
    const service = listPublicServices("studio-aurora")[0];
    const targetBaseDate = getNextOperationalDate();
    const targetDate = formatISO(targetBaseDate, { representation: "date" });

    const slots = listAvailability({
      date: targetDate,
      tenant: snapshot.tenant,
      service,
      staffMembers: snapshot.staffMembers,
      availabilityRules: [
        {
          id: "rule",
          tenantId: snapshot.tenant.id,
          locationId: service.locationId,
          profile: "appointments",
          weekday: targetBaseDate.getDay(),
          startMinutes: 9 * 60,
          endMinutes: 18 * 60,
          staffMemberId: "staff_elena",
        },
      ],
      blackouts: [],
      bookings: snapshot.bookings,
      bookingItems: [
        {
          id: "item",
          bookingId: "book_001",
          serviceId: service.id,
          durationMinutes: service.durationMinutes,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 15,
          unitPriceCents: service.priceCents,
        },
      ],
    });

    expect(slots.some((slot) => slot.startsAt.includes("T10:30:00"))).toBe(false);
  });

  it("removes staff slots inside blackouts", () => {
    resetDemoState();
    const snapshot = getDashboardSnapshot("studio-aurora");
    const service = listPublicServices("studio-aurora")[2];
    const targetBaseDate = getNextOperationalDate();
    const targetDate = formatISO(targetBaseDate, { representation: "date" });

    const slots = listAvailability({
      date: targetDate,
      tenant: snapshot.tenant,
      service,
      staffMembers: snapshot.staffMembers,
      availabilityRules: [
        {
          id: "rule-blackout",
          tenantId: snapshot.tenant.id,
          locationId: service.locationId,
          profile: "appointments",
          weekday: targetBaseDate.getDay(),
          startMinutes: 12 * 60,
          endMinutes: 15 * 60,
          staffMemberId: "staff_marta",
        },
      ],
      blackouts: [
        {
          id: "blackout",
          tenantId: snapshot.tenant.id,
          locationId: service.locationId,
          profile: "appointments",
          date: targetDate,
          startMinutes: 13 * 60,
          endMinutes: 14 * 60,
          staffMemberId: "staff_marta",
          reason: "Training",
        },
      ],
      bookings: [],
      bookingItems: [],
    });

    expect(slots.some((slot) => slot.startsAt.includes("T13:00:00"))).toBe(false);
    expect(slots.some((slot) => slot.startsAt.includes("T14:00:00"))).toBe(true);
  });
});
