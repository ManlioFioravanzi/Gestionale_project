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

    expect(snapshot.metrics.revenueTodayCents).toBe(1650);
    expect(snapshot.metrics.pendingDepositsCents).toBe(4600);
    expect(snapshot.notifications).toHaveLength(2);
  });

  it("updates metrics after collecting a pending deposit and resets correctly", () => {
    resetDemoState();

    markBookingDepositPaid("book_002", "manual_book_002");

    const updatedSnapshot = getDashboardSnapshot("studio-aurora");
    expect(updatedSnapshot.metrics.revenueTodayCents).toBe(6250);
    expect(updatedSnapshot.metrics.pendingDepositsCents).toBe(0);

    resetDemoState();

    const resetSnapshot = getDashboardSnapshot("studio-aurora");
    expect(resetSnapshot.metrics.revenueTodayCents).toBe(1650);
    expect(resetSnapshot.metrics.pendingDepositsCents).toBe(4600);
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
