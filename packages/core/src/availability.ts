import { addMinutes, formatISO, parseISO } from "date-fns";

import type {
  AvailabilityRule,
  AvailabilitySlot,
  Blackout,
  Booking,
  BookingItem,
  Service,
  StaffMember,
  Tenant,
} from "./domain";

interface AvailabilityInput {
  date: string;
  tenant: Tenant;
  service: Service;
  staffMembers: StaffMember[];
  availabilityRules: AvailabilityRule[];
  blackouts: Blackout[];
  bookings: Booking[];
  bookingItems: BookingItem[];
}

const MINUTES_IN_HOUR = 60;

function toDateTime(date: string, minutes: number) {
  const hours = Math.floor(minutes / MINUTES_IN_HOUR)
    .toString()
    .padStart(2, "0");
  const mins = (minutes % MINUTES_IN_HOUR).toString().padStart(2, "0");
  return parseISO(`${date}T${hours}:${mins}:00`);
}

function overlaps(
  candidateStart: Date,
  candidateEnd: Date,
  existingStart: Date,
  existingEnd: Date,
) {
  return candidateStart < existingEnd && candidateEnd > existingStart;
}

function getBookingConflictRange(booking: Booking, item?: BookingItem) {
  const start = parseISO(booking.startsAt);
  const end = parseISO(booking.endsAt);

  if (!item) {
    return { start, end };
  }

  return {
    start: addMinutes(start, -item.bufferBeforeMinutes),
    end: addMinutes(end, item.bufferAfterMinutes),
  };
}

export function listAvailability({
  date,
  tenant,
  service,
  staffMembers,
  availabilityRules,
  blackouts,
  bookings,
  bookingItems,
}: AvailabilityInput): AvailabilitySlot[] {
  const weekday = parseISO(`${date}T00:00:00`).getDay();
  const stepMinutes = tenant.bookingIntervalMinutes;
  const serviceSpan = service.durationMinutes;
  const activeStaff = staffMembers.filter(
    (staff) =>
      staff.active &&
      staff.profile === service.profile &&
      staff.locationIds.includes(service.locationId),
  );

  const slots: AvailabilitySlot[] = [];

  for (const staff of activeStaff) {
    const rulesForStaff = availabilityRules.filter(
      (rule) =>
        rule.profile === service.profile &&
        rule.locationId === service.locationId &&
        rule.weekday === weekday &&
        (!rule.staffMemberId || rule.staffMemberId === staff.id),
    );

    const staffBookings = bookings.filter(
      (booking) =>
        booking.staffMemberId === staff.id &&
        booking.status !== "cancelled" &&
        booking.status !== "no_show" &&
        booking.startsAt.startsWith(date),
    );

    const staffBlackouts = blackouts.filter(
      (blackout) =>
        blackout.date === date &&
        blackout.locationId === service.locationId &&
        (!blackout.staffMemberId || blackout.staffMemberId === staff.id),
    );

    for (const rule of rulesForStaff) {
      for (
        let minute = rule.startMinutes;
        minute + serviceSpan <= rule.endMinutes;
        minute += stepMinutes
      ) {
        const start = toDateTime(date, minute);
        const end = addMinutes(start, serviceSpan);

        const blockedByBlackout = staffBlackouts.some((blackout) =>
          overlaps(
            start,
            end,
            toDateTime(date, blackout.startMinutes),
            toDateTime(date, blackout.endMinutes),
          ),
        );

        if (blockedByBlackout) {
          continue;
        }

        const blockedByBooking = staffBookings.some((booking) => {
          const item = bookingItems.find((entry) => entry.bookingId === booking.id);
          const range = getBookingConflictRange(booking, item);
          return overlaps(start, end, range.start, range.end);
        });

        if (blockedByBooking) {
          continue;
        }

        slots.push({
          startsAt: formatISO(start),
          endsAt: formatISO(end),
          staffMemberId: staff.id,
          staffName: staff.fullName,
        });
      }
    }
  }

  return slots.sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

export function hasSlotAvailable(
  slots: AvailabilitySlot[],
  startsAt: string,
  staffMemberId?: string,
) {
  return slots.some(
    (slot) =>
      slot.startsAt === startsAt &&
      (!staffMemberId || slot.staffMemberId === staffMemberId),
  );
}
