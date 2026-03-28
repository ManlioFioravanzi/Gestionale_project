import {
  createAdminBooking,
  listAvailability,
  rescheduleBooking,
  type DashboardSnapshot,
} from "@booking/core";
import {
  addMinutes,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  formatISO,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";

const GRID_START_MINUTES = 8 * 60;
const GRID_END_MINUTES = 20 * 60;
const GRID_STEP_MINUTES = 30;
const TOTAL_GRID_MINUTES = GRID_END_MINUTES - GRID_START_MINUTES;
const PIXELS_PER_MINUTE = 1.35;
const DRAG_START_DISTANCE = 8;
const BOOKING_TONES = ["#2563eb", "#0f766e", "#c2410c", "#7c3aed", "#b91c1c", "#0369a1"];
const EMPTY_FORM = {
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  notes: "",
};

type PlanningToastTone = "success" | "info" | "warning" | "error";
type PlanningPanelMode = "idle" | "create" | "reschedule";
type PlanningView = "day" | "week" | "month";

interface PlanningWindow {
  staffMemberId: string;
  startsAt: string;
  endsAt: string;
  slotStartsAt: string[];
}

interface PlanningSelection {
  startsAt: string;
  staffMemberId: string;
}

interface PlanningFormState {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes: string;
}

interface RescheduleOrigin {
  selectedServiceId: string;
  selectedSlot: PlanningSelection | null;
  form: PlanningFormState;
  message: {
    tone: "success" | "error";
    text: string;
  } | null;
}

interface BookingDragState {
  bookingId: string;
  phase: "pending" | "dragging";
  startClientX: number;
  startClientY: number;
  currentClientX: number;
  currentClientY: number;
  originLeft: number;
  originTop: number;
  width: number;
  height: number;
  previewSlot: PlanningSelection | null;
}

const WEEK_STARTS_ON = { weekStartsOn: 1 as const };

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNextOperationalDateValue() {
  const candidate = new Date();
  candidate.setDate(candidate.getDate() + 1);

  while (candidate.getDay() === 0) {
    candidate.setDate(candidate.getDate() + 1);
  }

  return formatDateInputValue(candidate);
}

function shiftOperationalDate(date: string, direction: number) {
  const candidate = parseISO(`${date}T12:00:00`);
  candidate.setDate(candidate.getDate() + direction);

  while (candidate.getDay() === 0) {
    candidate.setDate(candidate.getDate() + direction);
  }

  return formatDateInputValue(candidate);
}

function toPlanningDate(date: string) {
  return parseISO(`${date}T12:00:00`);
}

function shiftPlanningDateByView(date: string, view: PlanningView, direction: number) {
  if (view === "day") {
    return shiftOperationalDate(date, direction);
  }

  const anchor = toPlanningDate(date);

  return formatDateInputValue(
    view === "week" ? addWeeks(anchor, direction) : addMonths(anchor, direction),
  );
}

function getWeekDates(date: string) {
  const anchor = toPlanningDate(date);

  return eachDayOfInterval({
    start: startOfWeek(anchor, WEEK_STARTS_ON),
    end: endOfWeek(anchor, WEEK_STARTS_ON),
  }).map(formatDateInputValue);
}

function getMonthDates(date: string) {
  const anchor = toPlanningDate(date);

  return eachDayOfInterval({
    start: startOfMonth(anchor),
    end: endOfMonth(anchor),
  }).map(formatDateInputValue);
}

function getMonthGridDates(date: string) {
  const anchor = toPlanningDate(date);

  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(anchor), WEEK_STARTS_ON),
    end: endOfWeek(endOfMonth(anchor), WEEK_STARTS_ON),
  }).map(formatDateInputValue);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatMoney(snapshot: DashboardSnapshot, cents: number) {
  return new Intl.NumberFormat(snapshot.tenant.locale, {
    style: "currency",
    currency: snapshot.tenant.currency,
  }).format(cents / 100);
}

function getDepositAmountCents(service: DashboardSnapshot["services"][number]) {
  if (service.depositType === "none") {
    return 0;
  }

  if (service.depositType === "fixed") {
    return service.depositValue;
  }

  return Math.round(service.priceCents * (service.depositValue / 100));
}

function formatPlanningTitle(date: string, locale: string) {
  return capitalize(
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(parseISO(`${date}T12:00:00`)),
  );
}

function formatPlanningWeekday(date: string, locale: string) {
  return capitalize(
    new Intl.DateTimeFormat(locale, {
      weekday: "long",
    }).format(parseISO(`${date}T12:00:00`)),
  );
}

function formatSlotDateTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parseISO(value));
}

function formatTime(value: string) {
  return value.slice(11, 16);
}

function formatTimeRange(startIso: string, endIso: string) {
  return `${formatTime(startIso)} - ${formatTime(endIso)}`;
}

function formatWeekdayShort(date: string, locale: string) {
  return capitalize(
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
    }).format(toPlanningDate(date)),
  );
}

function formatWeekdayNarrow(date: string, locale: string) {
  return capitalize(
    new Intl.DateTimeFormat(locale, {
      weekday: "narrow",
    }).format(toPlanningDate(date)),
  );
}

function formatMonthTitle(date: string, locale: string) {
  return capitalize(
    new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
    }).format(toPlanningDate(date)),
  );
}

function formatWeekRange(date: string, locale: string) {
  const [weekStart, , , , , , weekEnd] = getWeekDates(date);

  return `${new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  }).format(toPlanningDate(weekStart))} - ${new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(toPlanningDate(weekEnd))}`;
}

function formatDayNumber(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
  }).format(toPlanningDate(date));
}

function getMinuteOffset(isoValue: string) {
  const date = parseISO(isoValue);
  return date.getHours() * 60 + date.getMinutes();
}

function toDateTimeIso(date: string, minutes: number) {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const mins = (minutes % 60).toString().padStart(2, "0");
  return formatISO(parseISO(`${date}T${hours}:${mins}:00`));
}

function getVerticalMetrics(startIso: string, endIso: string) {
  const startMinutes = getMinuteOffset(startIso);
  const endMinutes = getMinuteOffset(endIso);

  return {
    top: Math.max(0, (startMinutes - GRID_START_MINUTES) * PIXELS_PER_MINUTE),
    height: Math.max((endMinutes - startMinutes) * PIXELS_PER_MINUTE, 34),
  };
}

function getTone(seed: string) {
  const total = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return BOOKING_TONES[total % BOOKING_TONES.length];
}

function buildHourMarkers() {
  const markers: Array<{ label: string; top: number }> = [];

  for (let minutes = GRID_START_MINUTES; minutes <= GRID_END_MINUTES; minutes += 60) {
    const hours = Math.floor(minutes / 60)
      .toString()
      .padStart(2, "0");

    markers.push({
      label: `${hours}:00`,
      top: (minutes - GRID_START_MINUTES) * PIXELS_PER_MINUTE,
    });
  }

  return markers;
}

function buildGridMarkers() {
  const markers: Array<{ top: number; major: boolean }> = [];

  for (let minutes = GRID_START_MINUTES; minutes <= GRID_END_MINUTES; minutes += GRID_STEP_MINUTES) {
    markers.push({
      top: (minutes - GRID_START_MINUTES) * PIXELS_PER_MINUTE,
      major: minutes % 60 === 0,
    });
  }

  return markers;
}

function buildAvailabilityWindows(
  slots: Array<{ startsAt: string; endsAt: string; staffMemberId: string }>,
  stepMinutes: number,
) {
  const windows: PlanningWindow[] = [];

  for (const slot of slots) {
    const current = windows[windows.length - 1];

    if (!current || current.staffMemberId !== slot.staffMemberId) {
      windows.push({
        staffMemberId: slot.staffMemberId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        slotStartsAt: [slot.startsAt],
      });
      continue;
    }

    const lastStartAt = current.slotStartsAt[current.slotStartsAt.length - 1];
    const minuteGap = getMinuteOffset(slot.startsAt) - getMinuteOffset(lastStartAt);

    if (minuteGap > stepMinutes) {
      windows.push({
        staffMemberId: slot.staffMemberId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        slotStartsAt: [slot.startsAt],
      });
      continue;
    }

    current.endsAt = slot.endsAt;
    current.slotStartsAt.push(slot.startsAt);
  }

  return windows;
}

function findNearestSlot(
  slots: Array<{ startsAt: string; staffMemberId: string }>,
  date: string,
  rawMinutes: number,
  intervalMinutes: number,
) {
  if (!slots.length) {
    return null;
  }

  const clampedMinutes = Math.min(Math.max(rawMinutes, GRID_START_MINUTES), GRID_END_MINUTES);
  const snappedMinutes =
    GRID_START_MINUTES +
    Math.round((clampedMinutes - GRID_START_MINUTES) / intervalMinutes) * intervalMinutes;
  const candidateIso = toDateTimeIso(date, snappedMinutes);
  const exactSlot = slots.find((slot) => slot.startsAt === candidateIso);

  if (exactSlot) {
    return exactSlot;
  }

  let nearestSlot = slots[0];
  let smallestGap = Number.POSITIVE_INFINITY;

  for (const slot of slots) {
    const gap = Math.abs(getMinuteOffset(slot.startsAt) - snappedMinutes);
    if (gap < smallestGap) {
      smallestGap = gap;
      nearestSlot = slot;
    }
  }

  return smallestGap <= intervalMinutes ? nearestSlot : null;
}

function findNearestWindowSlotStart(slotStartsAt: string[], rawMinutes: number) {
  if (!slotStartsAt.length) {
    return null;
  }

  let nearestSlotStart = slotStartsAt[0];
  let smallestGap = Number.POSITIVE_INFINITY;

  for (const slotStart of slotStartsAt) {
    const gap = Math.abs(getMinuteOffset(slotStart) - rawMinutes);

    if (gap < smallestGap) {
      smallestGap = gap;
      nearestSlotStart = slotStart;
    }
  }

  return nearestSlotStart;
}

function getCurrentTimeLineOffset(planningDate: string) {
  const now = new Date();

  if (formatDateInputValue(now) !== planningDate) {
    return null;
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (currentMinutes < GRID_START_MINUTES || currentMinutes > GRID_END_MINUTES) {
    return null;
  }

  return (currentMinutes - GRID_START_MINUTES) * PIXELS_PER_MINUTE;
}

interface PlanningBoardProps {
  snapshot: DashboardSnapshot;
  searchQuery: string;
  onRefresh: () => void;
  onNotify: (tone: PlanningToastTone, text: string) => void;
}

export function PlanningBoard({
  snapshot,
  searchQuery,
  onRefresh,
  onNotify,
}: PlanningBoardProps) {
  const [planningDate, setPlanningDate] = useState(getNextOperationalDateValue);
  const [planningView, setPlanningView] = useState<PlanningView>("day");
  const [selectedServiceId, setSelectedServiceId] = useState(snapshot.services[0]?.id ?? "");
  const [selectedSlot, setSelectedSlot] = useState<PlanningSelection | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [form, setForm] = useState<PlanningFormState>(EMPTY_FORM);
  const [rescheduleOrigin, setRescheduleOrigin] = useState<RescheduleOrigin | null>(null);
  const [serviceFlash, setServiceFlash] = useState(false);
  const [dragState, setDragState] = useState<BookingDragState | null>(null);
  const planningScrollRef = useRef<HTMLDivElement | null>(null);
  const planningBoardRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<BookingDragState | null>(null);
  const suppressBookingClickRef = useRef<string | null>(null);

  const deferredQuery = useDeferredValue(searchQuery.trim().toLowerCase());
  const selectedPlanningBooking =
    snapshot.bookings.find((booking) => booking.id === selectedBookingId) ?? null;
  const activeServiceId = selectedPlanningBooking?.serviceId ?? selectedServiceId;
  const activeService =
    snapshot.services.find((service) => service.id === activeServiceId) ?? snapshot.services[0];
  const weekDates = getWeekDates(planningDate);
  const monthDates = getMonthDates(planningDate);
  const monthGridDates = getMonthGridDates(planningDate);
  const summaryRangeDates =
    planningView === "day" ? [planningDate] : planningView === "week" ? weekDates : monthDates;
  const overviewDates =
    planningView === "day" ? [planningDate] : planningView === "week" ? weekDates : monthGridDates;
  const summaryDateSet = new Set(summaryRangeDates);
  const monthDateSet = new Set(monthDates);
  const todayValue = formatDateInputValue(new Date());

  const bookings = snapshot.bookings
    .map((booking) => {
      const haystack = `${booking.customerName} ${booking.serviceName} ${booking.staffName}`.toLowerCase();
      return {
        ...booking,
        matchesSearch: !deferredQuery || haystack.includes(deferredQuery),
      };
    });
  const draggedPlanningBooking = dragState
    ? bookings.find((booking) => booking.id === dragState.bookingId) ?? null
    : null;
  const draggedService = draggedPlanningBooking
    ? snapshot.services.find((service) => service.id === draggedPlanningBooking.serviceId) ?? null
    : null;
  const dayBookings = bookings.filter((booking) => booking.startsAt.slice(0, 10) === planningDate);
  const periodBookings = bookings.filter((booking) => summaryDateSet.has(booking.startsAt.slice(0, 10)));
  const visibleDayBookings = dayBookings.filter((booking) => booking.matchesSearch);
  const visiblePeriodBookings = periodBookings.filter((booking) => booking.matchesSearch);
  const summaryBookings = deferredQuery ? visiblePeriodBookings : periodBookings;
  const visibleBookings = planningView === "day" ? visibleDayBookings : visiblePeriodBookings;

  const slotCountByDate = new Map<string, number>();

  if (activeService) {
    for (const date of overviewDates) {
      if (slotCountByDate.has(date)) {
        continue;
      }

      const count = listAvailability({
        date,
        tenant: snapshot.tenant,
        service: activeService,
        staffMembers: snapshot.staffMembers,
        availabilityRules: snapshot.availabilityRules,
        blackouts: snapshot.blackouts,
        bookings: selectedPlanningBooking
          ? snapshot.bookings.filter((booking) => booking.id !== selectedPlanningBooking.id)
          : snapshot.bookings,
        bookingItems: selectedPlanningBooking
          ? snapshot.bookingItems.filter((item) => item.bookingId !== selectedPlanningBooking.id)
          : snapshot.bookingItems,
      }).length;

      slotCountByDate.set(date, count);
    }
  }

  const planningSlots = activeService
    ? listAvailability({
        date: planningDate,
        tenant: snapshot.tenant,
        service: activeService,
        staffMembers: snapshot.staffMembers,
        availabilityRules: snapshot.availabilityRules,
        blackouts: snapshot.blackouts,
        bookings: selectedPlanningBooking
          ? snapshot.bookings.filter((booking) => booking.id !== selectedPlanningBooking.id)
          : snapshot.bookings,
        bookingItems: selectedPlanningBooking
          ? snapshot.bookingItems.filter((item) => item.bookingId !== selectedPlanningBooking.id)
          : snapshot.bookingItems,
      })
    : [];
  const dragPlanningSlots =
    draggedService && planningView === "day"
      ? listAvailability({
          date: planningDate,
          tenant: snapshot.tenant,
          service: draggedService,
          staffMembers: snapshot.staffMembers,
          availabilityRules: snapshot.availabilityRules,
          blackouts: snapshot.blackouts,
          bookings: snapshot.bookings.filter((booking) => booking.id !== draggedPlanningBooking?.id),
          bookingItems: snapshot.bookingItems.filter(
            (item) => item.bookingId !== draggedPlanningBooking?.id,
          ),
        })
      : [];

  const slotsByStaff = new Map<string, Array<(typeof planningSlots)[number]>>();
  const dragSlotsByStaff = new Map<string, Array<(typeof dragPlanningSlots)[number]>>();
  const bookingsByStaff = new Map<string, Array<(typeof dayBookings)[number]>>();

  for (const staff of snapshot.staffMembers) {
    slotsByStaff.set(staff.id, []);
    dragSlotsByStaff.set(staff.id, []);
    bookingsByStaff.set(staff.id, []);
  }

  for (const slot of planningSlots) {
    slotsByStaff.get(slot.staffMemberId)?.push(slot);
  }

  for (const slot of dragPlanningSlots) {
    dragSlotsByStaff.get(slot.staffMemberId)?.push(slot);
  }

  for (const booking of dayBookings) {
    bookingsByStaff.get(booking.staffMemberId)?.push(booking);
  }

  const windowsByStaff = new Map<string, PlanningWindow[]>();
  for (const staff of snapshot.staffMembers) {
    const staffSlots = slotsByStaff.get(staff.id) ?? [];
    windowsByStaff.set(
      staff.id,
      buildAvailabilityWindows(staffSlots, snapshot.tenant.bookingIntervalMinutes),
    );
  }

  const panelMode: PlanningPanelMode = selectedPlanningBooking
    ? "reschedule"
    : selectedSlot || Object.values(form).some((value) => value.trim().length > 0)
      ? "create"
      : "idle";
  const selectedStaff = selectedSlot
    ? snapshot.staffMembers.find((staff) => staff.id === selectedSlot.staffMemberId) ?? null
    : null;
  const selectedSlotEndsAt =
    selectedSlot && activeService
      ? formatISO(addMinutes(parseISO(selectedSlot.startsAt), activeService.durationMinutes))
      : null;
  const dragPreviewEndsAt =
    dragState?.previewSlot && draggedPlanningBooking
      ? formatISO(
          addMinutes(
            parseISO(dragState.previewSlot.startsAt),
            draggedPlanningBooking.durationMinutes,
          ),
        )
      : null;
  const summaryOpenDepositCents = summaryBookings.reduce((sum, booking) => {
    return sum + Math.max(booking.depositRequiredCents - booking.depositCollectedCents, 0);
  }, 0);
  const summarySlotsCount =
    planningView === "day"
      ? planningSlots.length
      : summaryRangeDates.reduce((sum, date) => sum + (slotCountByDate.get(date) ?? 0), 0);
  const activeDaysCount = summaryRangeDates.filter((date) =>
    summaryBookings.some((booking) => booking.startsAt.slice(0, 10) === date),
  ).length;
  const firstVisibleBookingStart =
    (planningView === "day" ? summaryBookings[0]?.startsAt : null) ?? dayBookings[0]?.startsAt ?? null;
  const formErrors = {
    customerName: !form.customerName.trim(),
    customerPhone: !form.customerPhone.trim(),
    customerEmail: !form.customerEmail.trim(),
  };
  const missingFields = [
    !selectedSlot ? "fascia libera" : null,
    formErrors.customerName ? "nome cliente" : null,
    formErrors.customerPhone ? "telefono" : null,
    formErrors.customerEmail ? "email" : null,
  ].filter(Boolean) as string[];
  const createActionDisabled =
    panelMode !== "create" ||
    !selectedSlot ||
    !activeService ||
    missingFields.length > 0;
  const createValidationText =
    panelMode === "create" && createActionDisabled
      ? `Campi richiesti mancanti: ${missingFields.join(", ")}.`
      : null;
  const previousLabel =
    planningView === "day"
      ? "Giorno precedente"
      : planningView === "week"
        ? "Settimana precedente"
        : "Mese precedente";
  const nextLabel =
    planningView === "day"
      ? "Giorno successivo"
      : planningView === "week"
        ? "Settimana successiva"
        : "Mese successivo";
  const planningTitle =
    planningView === "day"
      ? formatPlanningTitle(planningDate, snapshot.tenant.locale)
      : planningView === "week"
        ? `Settimana del ${formatPlanningTitle(weekDates[0], snapshot.tenant.locale)}`
        : formatMonthTitle(planningDate, snapshot.tenant.locale);
  const planningSubtitle =
    planningView === "day"
      ? `${formatPlanningWeekday(planningDate, snapshot.tenant.locale)} · agenda verticale per staff con fasce libere e prenotazioni già incastrate.`
      : planningView === "week"
        ? `${formatWeekRange(planningDate, snapshot.tenant.locale)} · overview settimanale per individuare giorni saturi, slot aperti e passare subito alla day view.`
        : `${formatMonthTitle(planningDate, snapshot.tenant.locale)} · calendario mensile con volumi, slot compatibili e giorni da aprire nel dettaglio.`;
  const timelineHeight = TOTAL_GRID_MINUTES * PIXELS_PER_MINUTE;
  const columnTemplate = `92px repeat(${snapshot.staffMembers.length}, minmax(240px, 1fr))`;
  const hourMarkers = buildHourMarkers();
  const gridMarkers = buildGridMarkers();
  const nowLineOffset = getCurrentTimeLineOffset(planningDate);
  const dragActive = dragState !== null;
  const dragGhostStyle =
    dragState?.phase === "dragging"
      ? {
          left: dragState.originLeft + (dragState.currentClientX - dragState.startClientX),
          top: dragState.originTop + (dragState.currentClientY - dragState.startClientY),
          width: dragState.width,
          height: dragState.height,
        }
      : null;

  useEffect(() => {
    if (planningView !== "day") {
      return;
    }

    const container = planningScrollRef.current;
    if (!container) {
      return;
    }

    const fallbackTop = firstVisibleBookingStart
      ? Math.max(0, getVerticalMetrics(firstVisibleBookingStart, firstVisibleBookingStart).top - 96)
      : 0;
    const targetTop = nowLineOffset !== null ? Math.max(0, nowLineOffset - 140) : fallbackTop;

    container.scrollTo({
      top: targetTop,
      behavior: "smooth",
    });
  }, [firstVisibleBookingStart, nowLineOffset, planningDate, planningView]);

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    if (!dragActive) {
      return;
    }

    function handleWindowMouseMove(event: globalThis.MouseEvent) {
      updateDragFromCoordinates(event.clientX, event.clientY);
    }

    function handleWindowMouseUp(event: globalThis.MouseEvent) {
      finishDragAtCoordinates(event.clientX, event.clientY);
    }

    function handleWindowBlur() {
      dragStateRef.current = null;
      setDragState(null);
    }

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [dragActive, onNotify, planningDate, snapshot.tenant.bookingIntervalMinutes]);

  function flashServiceField() {
    setServiceFlash(true);
    window.setTimeout(() => {
      setServiceFlash(false);
    }, 1200);
  }

  function resetSelectionState() {
    setSelectedBookingId(null);
    setSelectedSlot(null);
    setMessage(null);
    setRescheduleOrigin(null);
    setForm(EMPTY_FORM);
    setDragState(null);
  }

  function handleDateChange(nextDate: string) {
    setPlanningDate(nextDate);
    resetSelectionState();
  }

  function handleViewChange(nextView: PlanningView) {
    if (nextView === planningView) {
      return;
    }

    setPlanningView(nextView);
    resetSelectionState();
  }

  function openDayView(date: string) {
    setPlanningView("day");
    setPlanningDate(date);
    resetSelectionState();
  }

  function resolveDragPreviewSlot(clientX: number, clientY: number) {
    const target = document.elementFromPoint(clientX, clientY);
    const column =
      target instanceof Element
        ? target.closest<HTMLElement>("[data-planning-staff-id]")
        : null;

    if (!column) {
      return null;
    }

    const staffMemberId = column.dataset.planningStaffId;
    if (!staffMemberId) {
      return null;
    }

    const staffSlots = dragSlotsByStaff.get(staffMemberId) ?? [];
    if (!staffSlots.length) {
      return null;
    }

    const bounds = column.getBoundingClientRect();
    const ratio = Math.min(Math.max(clientY - bounds.top, 0), bounds.height);
    const rawMinutes = GRID_START_MINUTES + ratio / PIXELS_PER_MINUTE;
    const slot = findNearestSlot(
      staffSlots,
      planningDate,
      rawMinutes,
      snapshot.tenant.bookingIntervalMinutes,
    );

    return slot
      ? {
          startsAt: slot.startsAt,
          staffMemberId: slot.staffMemberId,
        }
      : null;
  }

  function updateDragFromCoordinates(clientX: number, clientY: number) {
    const currentDragState = dragStateRef.current;
    if (!currentDragState) {
      return;
    }

    const deltaX = clientX - currentDragState.startClientX;
    const deltaY = clientY - currentDragState.startClientY;
    const travelled = Math.hypot(deltaX, deltaY);
    const nextPhase =
      currentDragState.phase === "dragging" || travelled >= DRAG_START_DISTANCE
        ? "dragging"
        : "pending";

    if (nextPhase === "dragging" && currentDragState.phase !== "dragging") {
      setSelectedBookingId(null);
      setSelectedSlot(null);
      setMessage(null);
      setRescheduleOrigin(null);
    }

    const nextDragState = {
      ...currentDragState,
      phase: nextPhase,
      currentClientX: clientX,
      currentClientY: clientY,
      previewSlot: nextPhase === "dragging" ? resolveDragPreviewSlot(clientX, clientY) : null,
    } satisfies BookingDragState;

    dragStateRef.current = nextDragState;
    setDragState(nextDragState);
  }

  function commitBookingMove(
    booking: DashboardSnapshot["bookings"][number],
    slot: PlanningSelection,
    successText: string,
  ) {
    try {
      rescheduleBooking(booking.id, slot.startsAt, slot.staffMemberId);

      startTransition(() => {
        onRefresh();
        setSelectedBookingId(null);
        setSelectedSlot(null);
        setRescheduleOrigin(null);
        setMessage({
          tone: "success",
          text: successText,
        });
        onNotify("success", successText);
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Non riesco a spostare la prenotazione.",
      });
      onNotify(
        "error",
        error instanceof Error ? error.message : "Non riesco a spostare la prenotazione.",
      );
    }
  }

  function finishDragAtCoordinates(clientX: number, clientY: number) {
    const currentDragState = dragStateRef.current;
    if (!currentDragState) {
      return;
    }

    if (currentDragState.phase === "dragging") {
      suppressBookingClickRef.current = currentDragState.bookingId;

      const previewSlot =
        currentDragState.previewSlot ?? resolveDragPreviewSlot(clientX, clientY);
      const draggedBooking =
        bookings.find((booking) => booking.id === currentDragState.bookingId) ?? null;

      dragStateRef.current = null;
      setDragState(null);

      if (
        previewSlot &&
        draggedBooking &&
        (previewSlot.startsAt !== draggedBooking.startsAt ||
          previewSlot.staffMemberId !== draggedBooking.staffMemberId)
      ) {
        commitBookingMove(
          draggedBooking,
          previewSlot,
          "Prenotazione spostata con drag and drop.",
        );
        return;
      }

      if (!previewSlot) {
        onNotify("warning", "Rilascia su una fascia libera compatibile per spostare la prenotazione.");
      }

      return;
    }

    dragStateRef.current = null;
    setDragState(null);
  }

  function handleBookingMouseDown(
    event: MouseEvent<HTMLButtonElement>,
    booking: DashboardSnapshot["bookings"][number],
  ) {
    if (planningView !== "day" || event.button !== 0) {
      return;
    }

    const board = planningBoardRef.current;
    if (!board) {
      return;
    }

    event.preventDefault();

    const boardRect = board.getBoundingClientRect();
    const cardRect = event.currentTarget.getBoundingClientRect();
    const scrollContainer = planningScrollRef.current;

    const nextDragState = {
      bookingId: booking.id,
      phase: "pending",
      startClientX: event.clientX,
      startClientY: event.clientY,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      originLeft: cardRect.left - boardRect.left + (scrollContainer?.scrollLeft ?? 0),
      originTop: cardRect.top - boardRect.top + (scrollContainer?.scrollTop ?? 0),
      width: cardRect.width,
      height: cardRect.height,
      previewSlot: null,
    } satisfies BookingDragState;

    dragStateRef.current = nextDragState;
    setDragState(nextDragState);
  }

  function handleColumnSelect(event: MouseEvent<HTMLDivElement>, staffMemberId: string) {
    if (!activeService) {
      return;
    }

    const staffSlots = slotsByStaff.get(staffMemberId) ?? [];
    if (!staffSlots.length) {
      setMessage({
        tone: "error",
        text: "Nessuna buca compatibile per questo servizio nella colonna selezionata.",
      });
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max(event.clientY - bounds.top, 0), bounds.height);
    const rawMinutes = GRID_START_MINUTES + ratio / PIXELS_PER_MINUTE;
    const slot = findNearestSlot(
      staffSlots,
      planningDate,
      rawMinutes,
      snapshot.tenant.bookingIntervalMinutes,
    );

    if (!slot) {
      setMessage({
        tone: "error",
        text: "La fascia selezionata non contiene uno start valido per il servizio attivo.",
      });
      return;
    }

    setSelectedSlot({
      startsAt: slot.startsAt,
      staffMemberId: slot.staffMemberId,
    });
    setMessage(null);
  }

  function handleBookingSelect(bookingId: string) {
    const booking = snapshot.bookings.find((entry) => entry.id === bookingId);

    if (!booking) {
      return;
    }

    if (!selectedPlanningBooking) {
      setRescheduleOrigin({
        selectedServiceId,
        selectedSlot,
        form,
        message,
      });
    }

    if (booking.serviceId !== activeService?.id) {
      onNotify(
        "info",
        `Servizio attivo cambiato in: ${booking.serviceName} · ${booking.durationMinutes} min.`,
      );
      flashServiceField();
    }

    setSelectedBookingId(booking.id);
    setSelectedSlot(null);
    setSelectedServiceId(booking.serviceId);
    setMessage(null);
  }

  function cancelReschedule() {
    const previousState = rescheduleOrigin;

    setSelectedBookingId(null);
    setSelectedSlot(previousState?.selectedSlot ?? null);
    setSelectedServiceId(previousState?.selectedServiceId ?? snapshot.services[0]?.id ?? "");
    setForm(previousState?.form ?? EMPTY_FORM);
    setMessage(previousState?.message ?? null);
    setRescheduleOrigin(null);
    onNotify("info", "Riprogrammazione annullata.");
  }

  async function handleCreateBooking() {
    if (!activeService || !selectedSlot || createActionDisabled) {
      setMessage({
        tone: "error",
        text:
          createValidationText ??
          "Seleziona prima una fascia libera nella timeline verticale e completa i campi richiesti.",
      });
      return;
    }

    try {
      createAdminBooking({
        slug: snapshot.tenant.slug,
        serviceId: activeService.id,
        staffMemberId: selectedSlot.staffMemberId,
        startsAt: selectedSlot.startsAt,
        customerName: form.customerName.trim(),
        customerEmail: form.customerEmail.trim(),
        customerPhone: form.customerPhone.trim(),
        notes: form.notes.trim() || undefined,
      });

      startTransition(() => {
        onRefresh();
        setSelectedSlot(null);
        setForm(EMPTY_FORM);
        setMessage({
          tone: "success",
          text: "Prenotazione inserita correttamente nel planning.",
        });
        onNotify("success", "Prenotazione creata nel planning.");
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Non riesco a creare la prenotazione.",
      });
    }
  }

  async function handleRescheduleBooking() {
    if (!selectedPlanningBooking || !selectedSlot) {
      setMessage({
        tone: "error",
        text: "Seleziona una prenotazione e poi una nuova fascia libera.",
      });
      return;
    }

    commitBookingMove(
      selectedPlanningBooking,
      selectedSlot,
      "Prenotazione riprogrammata nel nuovo slot.",
    );
  }

  return (
    <section className="planning-layout">
      <div className="planning-stage">
        <article className="panel-card planning-shell">
          <div className="planning-shell-head">
            <div className="planning-shell-title">
              <p className="eyebrow">Planning operativo</p>
              <h3>{planningTitle}</h3>
              <span>{planningSubtitle}</span>
            </div>

            <div className="planning-shell-actions">
              <div className="planning-view-stack">
                <div className="planning-view-switch" aria-label="Vista planning">
                  <button
                    className={planningView === "day" ? "active" : undefined}
                    type="button"
                    onClick={() => handleViewChange("day")}
                  >
                    Day
                  </button>
                  <button
                    className={planningView === "week" ? "active" : undefined}
                    type="button"
                    onClick={() => handleViewChange("week")}
                  >
                    Week
                  </button>
                  <button
                    className={planningView === "month" ? "active" : undefined}
                    type="button"
                    onClick={() => handleViewChange("month")}
                  >
                    Month
                  </button>
                </div>
                <small className="planning-view-note">
                  {planningView === "day"
                    ? "Vista operativa con creazione e riprogrammazione."
                    : planningView === "week"
                      ? "Panoramica settimanale: clicca un giorno per aprire la day view."
                      : "Calendario mensile: clicca una data per lavorare nel dettaglio."}
                </small>
              </div>

              <div className="planning-date-controls">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() =>
                    handleDateChange(shiftPlanningDateByView(planningDate, planningView, -1))
                  }
                >
                  {previousLabel}
                </button>
                <input
                  className="search-input compact"
                  type="date"
                  value={planningDate}
                  onChange={(event) => handleDateChange(event.target.value)}
                />
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() =>
                    handleDateChange(shiftPlanningDateByView(planningDate, planningView, 1))
                  }
                >
                  {nextLabel}
                </button>
              </div>
            </div>
          </div>

          <div className="planning-filter-row">
            <label
              className={[
                "field",
                "slim",
                serviceFlash ? "highlight" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span>Servizio attivo</span>
              <select
                disabled={planningView === "day" && panelMode === "reschedule"}
                value={activeService?.id ?? ""}
                onChange={(event) => {
                  setSelectedServiceId(event.target.value);
                  setSelectedSlot(null);
                  setMessage(null);
                }}
              >
                {snapshot.services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} · {service.durationMinutes} min
                  </option>
                ))}
              </select>
            </label>

            <div className="planning-meta-row">
              <span className="planning-info-pill strong">{summarySlotsCount} slot disponibili</span>
              <span className="planning-info-pill">{visibleBookings.length} booking visibili</span>
              <span className="planning-info-pill">
                {formatMoney(snapshot, summaryOpenDepositCents)} depositi aperti
                {deferredQuery ? " (filtrato)" : ""}
              </span>
              {planningView !== "day" ? (
                <span className="planning-info-pill">{activeDaysCount} giorni con attività</span>
              ) : null}
              {deferredQuery ? (
                <span className="planning-info-pill accent">
                  Filtro attivo · {visibleBookings.length} match
                </span>
              ) : null}
              {planningView === "day" && selectedPlanningBooking ? (
                <span className="planning-info-pill accent">
                  Riprogrammazione attiva · {selectedPlanningBooking.customerName}
                </span>
              ) : null}
            </div>
          </div>

          {dragState?.phase === "dragging" ? (
            <div className="status-banner info prominent">
              Trascina la prenotazione su una fascia libera compatibile e rilascia per confermare
              lo spostamento.
            </div>
          ) : null}

          {message ? (
            <div className={`status-banner ${message.tone} prominent`}>{message.text}</div>
          ) : null}

          {planningView === "day" ? (
            <div className="planning-surface">
              <div className="planning-columns-head" style={{ gridTemplateColumns: columnTemplate }}>
                <div className="planning-axis-label">Ora</div>
                {snapshot.staffMembers.map((staff) => {
                  const staffBookings = bookingsByStaff.get(staff.id) ?? [];
                  const staffSlots = slotsByStaff.get(staff.id) ?? [];

                  return (
                    <div key={staff.id} className="planning-staff-head">
                      <div className="planning-staff-headline">
                        <span className="staff-dot" style={{ backgroundColor: staff.accentColor }} />
                        <strong>{staff.fullName}</strong>
                      </div>
                      <small>
                        {staff.role} · {staffBookings.length} booking · {staffSlots.length} slot
                      </small>
                    </div>
                  );
                })}
              </div>

              <div ref={planningScrollRef} className="planning-scroll">
                <div
                  ref={planningBoardRef}
                  className="planning-vertical-board"
                  style={{ gridTemplateColumns: columnTemplate }}
                  onMouseMove={(event) => updateDragFromCoordinates(event.clientX, event.clientY)}
                  onMouseUp={(event) => finishDragAtCoordinates(event.clientX, event.clientY)}
                >
                  <div className="planning-time-axis" style={{ height: timelineHeight }}>
                    {hourMarkers.map((marker) => (
                      <div key={marker.label} className="planning-hour-label" style={{ top: marker.top }}>
                        {marker.label}
                      </div>
                    ))}
                  </div>

                  {snapshot.staffMembers.map((staff) => {
                    const staffBookings = bookingsByStaff.get(staff.id) ?? [];
                    const staffWindows = windowsByStaff.get(staff.id) ?? [];
                    const selectedInColumn = selectedSlot?.staffMemberId === staff.id;

                    return (
                      <div
                        key={staff.id}
                        className={selectedInColumn ? "planning-day-column selected" : "planning-day-column"}
                        data-planning-staff-id={staff.id}
                        style={{ height: timelineHeight }}
                        onClick={(event) => handleColumnSelect(event, staff.id)}
                      >
                        {gridMarkers.map((marker) => (
                          <div
                            key={`${staff.id}-${marker.top}`}
                            className={marker.major ? "planning-grid-line major" : "planning-grid-line"}
                            style={{ top: marker.top }}
                          />
                        ))}

                        {nowLineOffset !== null ? (
                          <div className="planning-now-line" style={{ top: nowLineOffset }}>
                            <span>Ora</span>
                          </div>
                        ) : null}

                        {staffWindows.map((window) => {
                          const windowMetrics = getVerticalMetrics(window.startsAt, window.endsAt);
                          const windowContainsSelectedSlot =
                            selectedSlot?.staffMemberId === staff.id &&
                            window.slotStartsAt.includes(selectedSlot.startsAt);

                          return (
                            <button
                              key={`${staff.id}-${window.startsAt}`}
                              aria-pressed={windowContainsSelectedSlot}
                              className={
                                windowContainsSelectedSlot
                                  ? "planning-window active"
                                  : "planning-window"
                              }
                              style={{
                                top: windowMetrics.top,
                                height: windowMetrics.height,
                              }}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                const bounds = event.currentTarget.getBoundingClientRect();
                                const relativeY = Math.min(
                                  Math.max(event.clientY - bounds.top, 0),
                                  bounds.height,
                                );
                                const rawMinutes =
                                  getMinuteOffset(window.startsAt) + relativeY / PIXELS_PER_MINUTE;
                                const slotStart =
                                  findNearestWindowSlotStart(window.slotStartsAt, rawMinutes) ??
                                  window.slotStartsAt[0];

                                setSelectedSlot({
                                  startsAt: slotStart,
                                  staffMemberId: staff.id,
                                });
                                setMessage(null);
                              }}
                            >
                              <div className="planning-window-label">
                                <strong>{formatTimeRange(window.startsAt, window.endsAt)}</strong>
                                <small>{window.slotStartsAt.length} slot compatibili</small>
                              </div>
                            </button>
                          );
                        })}

                        {selectedSlot && selectedSlot.staffMemberId === staff.id && selectedSlotEndsAt ? (
                          <div
                            className="planning-selection"
                            style={getVerticalMetrics(selectedSlot.startsAt, selectedSlotEndsAt)}
                          >
                            <span className="planning-selection-kicker">Slot scelto</span>
                            <strong>{formatTime(selectedSlot.startsAt)}</strong>
                            <small>{activeService?.name ?? "Servizio attivo"}</small>
                          </div>
                        ) : null}

                        {dragState?.phase === "dragging" &&
                        dragState.previewSlot?.staffMemberId === staff.id &&
                        dragPreviewEndsAt &&
                        draggedPlanningBooking ? (
                          <div
                            className="planning-drop-preview"
                            style={getVerticalMetrics(
                              dragState.previewSlot.startsAt,
                              dragPreviewEndsAt,
                            )}
                          >
                            <span className="planning-selection-kicker">Rilascia qui</span>
                            <strong>{formatTime(dragState.previewSlot.startsAt)}</strong>
                            <small>{draggedPlanningBooking.customerName}</small>
                          </div>
                        ) : null}

                        {staffBookings.map((booking) => {
                          const metrics = getVerticalMetrics(booking.startsAt, booking.endsAt);
                          const tone = getTone(booking.serviceId);
                          const isSelected = selectedPlanningBooking?.id === booking.id;
                          const isDragging =
                            dragState?.bookingId === booking.id && dragState.phase === "dragging";

                          return (
                            <button
                              key={booking.id}
                              className={[
                                "planning-booking",
                                isSelected ? "selected" : "",
                                isDragging ? "dragging" : "",
                                booking.matchesSearch ? "" : "muted",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              style={{
                                top: metrics.top,
                                height: metrics.height,
                                backgroundColor: tone,
                              }}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();

                                if (suppressBookingClickRef.current === booking.id) {
                                  suppressBookingClickRef.current = null;
                                  return;
                                }

                                handleBookingSelect(booking.id);
                              }}
                              onMouseDown={(event) => handleBookingMouseDown(event, booking)}
                            >
                              <strong>{booking.customerName}</strong>
                              <span>{booking.serviceName}</span>
                              <small>{formatTimeRange(booking.startsAt, booking.endsAt)}</small>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}

                  {dragState?.phase === "dragging" && draggedPlanningBooking && dragGhostStyle ? (
                    <div
                      className="planning-drag-ghost"
                      style={{
                        ...dragGhostStyle,
                        backgroundColor: getTone(draggedPlanningBooking.serviceId),
                      }}
                    >
                      <strong>{draggedPlanningBooking.customerName}</strong>
                      <span>{draggedPlanningBooking.serviceName}</span>
                      <small>
                        {formatTimeRange(
                          draggedPlanningBooking.startsAt,
                          draggedPlanningBooking.endsAt,
                        )}
                      </small>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {planningView === "week" ? (
            <div className="planning-overview-surface">
              <div className="planning-overview-scroll">
                <div className="planning-week-board">
                  {weekDates.map((date) => {
                    const bookingsForDate = bookings.filter(
                      (booking) => booking.startsAt.slice(0, 10) === date,
                    );
                    const visibleBookingsForDate = bookingsForDate.filter((booking) => booking.matchesSearch);
                    const summaryBookingsForDate = deferredQuery
                      ? visibleBookingsForDate
                      : bookingsForDate;
                    const slotCount = slotCountByDate.get(date) ?? 0;

                    return (
                      <button
                        key={date}
                        className={date === planningDate ? "planning-week-card active" : "planning-week-card"}
                        type="button"
                        onClick={() => openDayView(date)}
                      >
                        <div className="planning-overview-card-head">
                          <div>
                            <span className="planning-overview-kicker">
                              {formatWeekdayShort(date, snapshot.tenant.locale)}
                            </span>
                            <strong>{formatPlanningTitle(date, snapshot.tenant.locale)}</strong>
                          </div>
                          <span className="planning-overview-open">Apri day</span>
                        </div>

                        <div className="planning-overview-pills">
                          <span className="planning-overview-pill">
                            {summaryBookingsForDate.length} booking
                          </span>
                          <span className="planning-overview-pill">
                            {slotCount} slot compatibili
                          </span>
                        </div>

                        <div className="planning-overview-list">
                          {summaryBookingsForDate.length ? (
                            summaryBookingsForDate.slice(0, 4).map((booking) => (
                              <div key={booking.id} className="planning-overview-booking">
                                <strong>{formatTime(booking.startsAt)}</strong>
                                <span>{booking.customerName}</span>
                                <small>{booking.serviceName}</small>
                              </div>
                            ))
                          ) : (
                            <div className="planning-overview-empty">
                              Nessun booking visibile per questo giorno.
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {planningView === "month" ? (
            <div className="planning-overview-surface">
              <div className="planning-month-weekdays">
                {weekDates.map((date) => (
                  <span key={date}>{formatWeekdayNarrow(date, snapshot.tenant.locale)}</span>
                ))}
              </div>

              <div className="planning-overview-scroll">
                <div className="planning-month-board">
                  {monthGridDates.map((date) => {
                    const bookingsForDate = bookings.filter(
                      (booking) => booking.startsAt.slice(0, 10) === date,
                    );
                    const visibleBookingsForDate = bookingsForDate.filter((booking) => booking.matchesSearch);
                    const summaryBookingsForDate = deferredQuery
                      ? visibleBookingsForDate
                      : bookingsForDate;
                    const slotCount = slotCountByDate.get(date) ?? 0;
                    const inCurrentMonth = monthDateSet.has(date);
                    const isTodayDate = date === todayValue;

                    return (
                      <button
                        key={date}
                        className={[
                          "planning-month-cell",
                          inCurrentMonth ? "" : "muted",
                          date === planningDate ? "active" : "",
                          isTodayDate ? "today" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        type="button"
                        onClick={() => openDayView(date)}
                      >
                        <div className="planning-month-head">
                          <span>{formatWeekdayShort(date, snapshot.tenant.locale)}</span>
                          <strong>{formatDayNumber(date, snapshot.tenant.locale)}</strong>
                        </div>

                        <div className="planning-overview-pills compact">
                          <span className="planning-overview-pill">
                            {summaryBookingsForDate.length} booking
                          </span>
                          <span className="planning-overview-pill">{slotCount} slot</span>
                        </div>

                        <div className="planning-month-list">
                          {summaryBookingsForDate.length ? (
                            summaryBookingsForDate.slice(0, 3).map((booking) => (
                              <div key={booking.id} className="planning-month-booking">
                                <strong>{formatTime(booking.startsAt)}</strong>
                                <span>{booking.customerName}</span>
                              </div>
                            ))
                          ) : (
                            <div className="planning-overview-empty small">
                              Nessun booking visibile.
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </article>
      </div>

      <aside className="planning-panel">
        <article className="panel-card planning-form-card">
          {planningView !== "day" ? (
            <div className="planning-idle-state">
              <div className="section-head">
                <p className="eyebrow">{planningView === "week" ? "Vista week" : "Vista month"}</p>
                <h3>
                  {planningView === "week"
                    ? "Panoramica settimanale"
                    : "Calendario mensile operativo"}
                </h3>
                <span>
                  {planningView === "week"
                    ? "Usa la week view per confrontare carico, slot e giornate da aprire in dettaglio."
                    : "Usa la month view per leggere il volume complessivo e saltare al giorno operativo corretto."}
                </span>
              </div>

              <div className="planning-selection-box accent">
                <strong>Data in focus</strong>
                <p>
                  {planningView === "week"
                    ? `Settimana ${formatWeekRange(planningDate, snapshot.tenant.locale)}`
                    : formatMonthTitle(planningDate, snapshot.tenant.locale)}
                </p>
              </div>

              <div className="planning-selection-box">
                <strong>Servizio attivo</strong>
                <p>
                  {activeService?.name ?? "Nessun servizio"} · {activeService?.durationMinutes ?? 0} min
                </p>
              </div>

              <div className="planning-selection-box">
                <strong>Come usarla</strong>
                <p>
                  Clicca un giorno nella griglia per aprire la day view e lavorare subito su buche,
                  riprogrammazioni e conferme operative.
                </p>
              </div>
            </div>
          ) : null}

          {planningView === "day" && panelMode === "idle" ? (
            <div className="planning-idle-state">
              <div className="section-head">
                <p className="eyebrow">Workspace pronto</p>
                <h3>Seleziona una fascia o una prenotazione</h3>
                <span>
                  Clicca una finestra libera per creare una prenotazione oppure una card esistente
                  per entrare in modalità riprogrammazione.
                </span>
              </div>

              <div className="planning-selection-box">
                <strong>Come iniziare</strong>
                <p>
                  1. Scegli il servizio attivo in alto. 2. Clicca uno slot libero nel planning. 3.
                  Completa i dati cliente nel pannello laterale.
                </p>
              </div>
            </div>
          ) : null}

          {planningView === "day" && panelMode === "create" ? (
            <>
              <div className="section-head">
                <p className="eyebrow">Nuova prenotazione</p>
                <h3>Riempi una fascia libera</h3>
                <span>
                  Compila i dati richiesti per confermare la nuova prenotazione nello slot selezionato.
                </span>
              </div>

              <div className="planning-selection-box">
                <strong>Slot selezionato</strong>
                {selectedSlot ? (
                  <p>
                    {formatSlotDateTime(selectedSlot.startsAt, snapshot.tenant.locale)} ·{" "}
                    {selectedStaff?.fullName}
                  </p>
                ) : (
                  <p>
                    Seleziona prima una fascia libera nella timeline verticale per scegliere lo start.
                  </p>
                )}
              </div>

              {createValidationText ? (
                <div className="status-banner error prominent">{createValidationText}</div>
              ) : null}

              <div className="field-grid">
                <label className={formErrors.customerName ? "field invalid" : "field"}>
                  <span>Nome cliente</span>
                  <input
                    aria-invalid={formErrors.customerName}
                    value={form.customerName}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, customerName: event.target.value }))
                    }
                  />
                  {formErrors.customerName ? <small className="field-error">Campo obbligatorio.</small> : null}
                </label>

                <label className={formErrors.customerPhone ? "field invalid" : "field"}>
                  <span>Telefono</span>
                  <input
                    aria-invalid={formErrors.customerPhone}
                    value={form.customerPhone}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, customerPhone: event.target.value }))
                    }
                  />
                  {formErrors.customerPhone ? <small className="field-error">Campo obbligatorio.</small> : null}
                </label>
              </div>

              <label className={formErrors.customerEmail ? "field invalid" : "field"}>
                <span>Email</span>
                <input
                  aria-invalid={formErrors.customerEmail}
                  type="email"
                  value={form.customerEmail}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, customerEmail: event.target.value }))
                  }
                />
                {formErrors.customerEmail ? <small className="field-error">Campo obbligatorio.</small> : null}
              </label>

              <label className="field">
                <span>Note operative</span>
                <input
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>

              <div className="stack-list compact-list">
                <div className="stack-row">
                  <div>
                    <p>Servizio attivo</p>
                    <small>Durata e prezzo da applicare</small>
                  </div>
                  <strong>
                    {activeService?.durationMinutes ?? 0} min ·{" "}
                    {activeService ? formatMoney(snapshot, activeService.priceCents) : "-"}
                  </strong>
                </div>
                <div className="stack-row">
                  <div>
                    <p>Caparra standard</p>
                    <small>Valore richiesto al cliente finale</small>
                  </div>
                  <strong>
                    {activeService ? formatMoney(snapshot, getDepositAmountCents(activeService)) : "-"}
                  </strong>
                </div>
              </div>

              <div className="planning-panel-actions">
                <button
                  className="primary-button full"
                  disabled={createActionDisabled}
                  title={
                    createActionDisabled
                      ? "Completa i campi obbligatori e seleziona una fascia valida."
                      : undefined
                  }
                  type="button"
                  onClick={handleCreateBooking}
                >
                  Crea prenotazione nella fascia selezionata
                </button>
              </div>
            </>
          ) : null}

          {planningView === "day" && panelMode === "reschedule" ? (
            <>
              <div className="section-head">
                <p className="eyebrow">Sposta prenotazione</p>
                <h3>{selectedPlanningBooking?.customerName}</h3>
                <span>
                  Seleziona una nuova fascia nella timeline per riprogrammare l'appuntamento senza perdere il contesto precedente.
                </span>
              </div>

              <div className={selectedSlot ? "planning-selection-box" : "planning-selection-box error"}>
                <strong>Slot selezionato</strong>
                {selectedSlot ? (
                  <p>
                    {formatSlotDateTime(selectedSlot.startsAt, snapshot.tenant.locale)} ·{" "}
                    {selectedStaff?.fullName}
                  </p>
                ) : (
                  <p>Nessuna fascia selezionata. Clicca nel planning verticale per scegliere lo start.</p>
                )}
              </div>

              {selectedPlanningBooking ? (
                <div className="planning-selection-box accent">
                  <strong>Prenotazione in modifica</strong>
                  <p>
                    {selectedPlanningBooking.serviceName} ·{" "}
                    {formatTimeRange(selectedPlanningBooking.startsAt, selectedPlanningBooking.endsAt)}
                  </p>
                </div>
              ) : null}

              <div className="planning-panel-actions">
                <button
                  className="primary-button full"
                  disabled={!selectedSlot}
                  title={!selectedSlot ? "Seleziona prima uno slot valido." : undefined}
                  type="button"
                  onClick={handleRescheduleBooking}
                >
                  Sposta nel nuovo slot
                </button>
                <button className="ghost-button full" type="button" onClick={cancelReschedule}>
                  Annulla riprogrammazione
                </button>
              </div>
            </>
          ) : null}
        </article>

        <article className="panel-card planning-form-card">
          <div className="panel-head">
            <h3>
              {planningView === "day"
                ? "Sintesi giornata"
                : planningView === "week"
                  ? "Sintesi settimana"
                  : "Sintesi mese"}
            </h3>
            <span>
              {visibleBookings.length} booking in vista
              {deferredQuery ? " · filtro attivo" : ""}
            </span>
          </div>

          <div className="stack-list compact-list">
            <div className="stack-row">
              <div>
                <p>Staff attivo</p>
                <small>
                  {planningView === "day"
                    ? "Operatori mostrati nella day view"
                    : "Operatori inclusi nella panoramica corrente"}
                </small>
              </div>
              <strong>{snapshot.staffMembers.length}</strong>
            </div>
            <div className="stack-row">
              <div>
                <p>{planningView === "day" ? "Fasce libere" : "Slot compatibili"}</p>
                <small>
                  {planningView === "day"
                    ? "Start compatibili con il servizio attivo"
                    : "Capacità aggregata nel periodo selezionato"}
                </small>
              </div>
              <strong>{summarySlotsCount}</strong>
            </div>
            <div className="stack-row">
              <div>
                <p>{planningView === "day" ? "Giorno carico" : "Giorni con attività"}</p>
                <small>
                  {planningView === "day"
                    ? "Booking visibili concentrati sul giorno corrente"
                    : "Date del periodo con almeno una prenotazione visibile"}
                </small>
              </div>
              <strong>{planningView === "day" ? visibleBookings.length : activeDaysCount}</strong>
            </div>
            <div className="stack-row">
              <div>
                <p>{deferredQuery ? "Caparre aperte (filtrato)" : "Caparre aperte"}</p>
                <small>Importi ancora da chiudere sulle prenotazioni visibili</small>
              </div>
              <strong>{formatMoney(snapshot, summaryOpenDepositCents)}</strong>
            </div>
            <div className="stack-row">
              <div>
                <p>Filtro ricerca</p>
                <small>Stato del search globale in alto</small>
              </div>
              <strong>{deferredQuery ? `${visibleBookings.length} match` : "Nessun filtro"}</strong>
            </div>
          </div>
        </article>
      </aside>
    </section>
  );
}
