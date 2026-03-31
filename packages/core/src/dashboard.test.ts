import { endOfDay, parseISO, startOfDay } from "date-fns";
import { describe, expect, it } from "vitest";

import {
  getDashboardSnapshot,
  markBookingDepositPaid,
  resetDemoState,
  updateBookingStatus,
} from "./demo";

describe("dashboard snapshot", () => {
  it("computes revenue and pending deposits from the live payment ledger", () => {
    resetDemoState();

    const snapshot = getDashboardSnapshot("studio-aurora");
    const now = new Date();
    const expectedRevenueTodayCents = snapshot.payments
      .filter(
        (payment) =>
          payment.status === "paid" &&
          parseISO(payment.updatedAt) >= startOfDay(now) &&
          parseISO(payment.updatedAt) <= endOfDay(now),
      )
      .reduce((sum, payment) => sum + payment.amountCents, 0);
    const expectedPendingDepositsCents = snapshot.payments
      .filter((payment) => payment.status === "pending")
      .reduce((sum, payment) => sum + payment.amountCents, 0);

    expect(snapshot.customers).toHaveLength(12);
    expect(snapshot.bookings).toHaveLength(12);
    expect(snapshot.notifications).toHaveLength(snapshot.bookings.length);
    expect(snapshot.metrics.revenueTodayCents).toBe(expectedRevenueTodayCents);
    expect(snapshot.metrics.pendingDepositsCents).toBe(expectedPendingDepositsCents);
  });

  it("updates metrics after collecting a pending deposit and resets correctly", () => {
    resetDemoState();
    const initialSnapshot = getDashboardSnapshot("studio-aurora");

    markBookingDepositPaid("book_002", "manual_book_002");

    const updatedSnapshot = getDashboardSnapshot("studio-aurora");
    expect(updatedSnapshot.metrics.revenueTodayCents).toBe(
      initialSnapshot.metrics.revenueTodayCents + 4600,
    );
    expect(updatedSnapshot.metrics.pendingDepositsCents).toBe(
      initialSnapshot.metrics.pendingDepositsCents - 4600,
    );

    resetDemoState();

    const resetSnapshot = getDashboardSnapshot("studio-aurora");
    expect(resetSnapshot.metrics).toEqual(initialSnapshot.metrics);
  });

  it("adds a notification entry for booking status changes and blocks finance on no_show", () => {
    resetDemoState();
    const before = getDashboardSnapshot("studio-aurora");

    updateBookingStatus("book_002", "no_show");

    const after = getDashboardSnapshot("studio-aurora");
    expect(after.notifications.length).toBe(before.notifications.length + 1);
    expect(after.notifications.at(-1)?.templateKey).toBe("booking-no_show");

    expect(() => markBookingDepositPaid("book_002", "manual_book_002")).toThrow(
      /Azione finanziaria non disponibile/,
    );
  });
});
