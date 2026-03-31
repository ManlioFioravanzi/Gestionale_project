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
import { translateRoleLabel, type AppLanguage } from "./i18n";
import type { DesktopTheme } from "./theme";

const GRID_START_MINUTES = 8 * 60;
const GRID_END_MINUTES = 20 * 60;
const GRID_STEP_MINUTES = 30;
const TOTAL_GRID_MINUTES = GRID_END_MINUTES - GRID_START_MINUTES;
const PIXELS_PER_MINUTE = 1.35;
const DRAG_START_DISTANCE = 8;
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

function formatMoney(snapshot: DashboardSnapshot, cents: number, locale: string) {
  return new Intl.NumberFormat(locale, {
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

function getTone(seed: string, tones: string[]) {
  const total = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return tones[total % tones.length];
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
  language: AppLanguage;
  locale: string;
  theme: DesktopTheme;
}

export function PlanningBoard({
  snapshot,
  searchQuery,
  onRefresh,
  onNotify,
  language,
  locale,
  theme,
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
  const bookingTones = theme.bookingTones;
  const weekDates = getWeekDates(planningDate);
  const monthDates = getMonthDates(planningDate);
  const monthGridDates = getMonthGridDates(planningDate);
  const copy =
    language === "en"
      ? {
          viewAriaLabel: "Planning view",
          operationalPlanning: "Operational planning",
          day: "Day",
          week: "Week",
          month: "Month",
          dayHint: "Operational view with creation and rescheduling.",
          weekHint: "Weekly overview: click a day to open day view.",
          monthHint: "Monthly calendar: click a date to work in detail.",
          previousDay: "Previous day",
          previousWeek: "Previous week",
          previousMonth: "Previous month",
          nextDay: "Next day",
          nextWeek: "Next week",
          nextMonth: "Next month",
          daySubtitle: (date: string) =>
            `${formatPlanningWeekday(date, locale)} · vertical staff agenda with free windows and existing bookings.`,
          weekSubtitle: `${formatWeekRange(planningDate, locale)} · weekly overview to spot full days, open slots, and jump into day view.`,
          monthSubtitle: `${formatMonthTitle(planningDate, locale)} · monthly calendar with volume, compatible slots, and days to inspect in detail.`,
          weekTitle: () => `Week of ${formatPlanningTitle(weekDates[0], locale)}`,
          service: "Service",
          availableSlots: (count: number) => `${count} available slots`,
          visibleBookings: (count: number) => `${count} visible bookings`,
          openDeposits: (amount: string, filtered: boolean) => `${amount} open deposits${filtered ? " (filtered)" : ""}`,
          activeDays: (count: number) => `${count} active days`,
          activeDaysLabel: "Active days",
          filterActive: (count: number) => `Filter active · ${count} matches`,
          rescheduleActive: (customerName: string) => `Rescheduling active · ${customerName}`,
          dragHint: "Drag the booking onto a compatible free slot and release to confirm the move.",
          missingFields: {
            slot: "free slot",
            customerName: "customer name",
            customerPhone: "phone",
            customerEmail: "email",
          },
          missingFieldsText: (fields: string[]) => `Missing required fields: ${fields.join(", ")}.`,
          unableMove: "Unable to move the booking.",
          movedWithDrag: "Booking moved with drag and drop.",
          dropOnCompatibleSlot: "Drop on a compatible free slot to move the booking.",
          noCompatibleWindow: "No compatible free window for this service in the selected column.",
          invalidSlotInWindow: "The selected window does not contain a valid start time for the active service.",
          activeServiceChanged: (serviceName: string, durationMinutes: number) =>
            `Active service changed to: ${serviceName} · ${durationMinutes} min.`,
          rescheduleCancelled: "Rescheduling cancelled.",
          selectSlotAndFields: "Select a free slot in the vertical timeline and complete the required fields first.",
          bookingInserted: "Booking added successfully to the planning board.",
          bookingCreated: "Booking created in planning.",
          unableCreate: "Unable to create the booking.",
          selectBookingThenSlot: "Select a booking and then a new free slot.",
          bookingRescheduled: "Booking rescheduled into the new slot.",
          timeAxis: "Time",
          now: "Now",
          compatibleSlotsCount: (count: number) => `${count} compatible slots`,
          selectedSlot: "Selected slot",
          activeServiceLabel: "Active service",
          dropHere: "Drop here",
          openDay: "Open day",
          compatibleSlots: (count: number) => `${count} compatible slots`,
          noVisibleBookingForDay: "No visible booking for this day.",
          noVisibleBooking: "No visible booking.",
          overviewWeekKicker: "Week view",
          overviewMonthKicker: "Month view",
          overviewWeekTitle: "Weekly overview",
          overviewMonthTitle: "Operational monthly calendar",
          overviewWeekBody: "Use week view to compare workload, slots, and which days to open in detail.",
          overviewMonthBody: "Use month view to read total volume and jump to the correct operational day.",
          focusedDate: "Focused date",
          howToUse: "How to use it",
          overviewHowToUse: "Click a day in the grid to open day view and work immediately on windows, reschedules, and confirmations.",
          noService: "No service",
          workspaceReady: "Workspace ready",
          selectSlotOrBooking: "Select a slot or a booking",
          idleBody: "Click a free window to create a booking or an existing card to enter rescheduling mode.",
          gettingStarted: "How to start",
          gettingStartedBody: "1. Choose the active service above. 2. Click a free slot in planning. 3. Complete customer details in the side panel.",
          newBooking: "New booking",
          fillFreeWindow: "Fill a free window",
          createBody: "Complete the required details to confirm the new booking in the selected slot.",
          chooseSlotFirst: "Choose a free slot in the timeline first.",
          customerName: "Customer name",
          customerNamePlaceholder: "e.g. Maria Rossi",
          phone: "Phone",
          phonePlaceholder: "333...",
          email: "Email",
          emailPlaceholder: "maria@example.com",
          requiredField: "Required field.",
          operationalNotes: "Operational notes",
          operationalNotesPlaceholder: "Optional notes...",
          standardPrice: "Standard price",
          deposit: "Deposit",
          initial: "Initial",
          confirmBooking: "Confirm booking",
          moveBooking: "Move booking",
          rescheduleBody: "Select a new slot in the timeline to reschedule the appointment without losing previous context.",
          noSelectedSlot: "No slot selected. Click inside the vertical planning board to choose the new start.",
          editingBooking: "Booking being edited",
          selectValidSlotFirst: "Select a valid slot first.",
          moveToNewSlot: "Move to new slot",
          cancelRescheduleAction: "Cancel reschedule",
          daySummary: "Day summary",
          weekSummary: "Week summary",
          monthSummary: "Month summary",
          bookingsInView: (count: number, filtered: boolean) => `${count} bookings in view${filtered ? " · active filter" : ""}`,
          activeStaff: "Active staff",
          onShiftNow: "On shift now",
          inSelectedPeriod: "In selected period",
          freeWindows: "Free windows",
          freeSlots: "Free slots",
          availableCapacity: "Available capacity",
          bookingsToday: "Bookings today",
          operationalVolume: "Operational volume",
          openDepositsLabel: "Open deposits",
          pendingAmounts: "Pending amounts",
          searchFilter: "Search filter",
          matchedResults: "Matched results",
          filterOff: "OFF",
          results: (count: number) => `${count} RESULTS`,
        }
      : {
          viewAriaLabel: "Vista planning",
          operationalPlanning: "Planning operativo",
          day: "Giorno",
          week: "Settimana",
          month: "Mese",
          dayHint: "Vista operativa con creazione e riprogrammazione.",
          weekHint: "Panoramica settimanale: clicca un giorno per aprire la day view.",
          monthHint: "Calendario mensile: clicca una data per lavorare nel dettaglio.",
          previousDay: "Giorno precedente",
          previousWeek: "Settimana precedente",
          previousMonth: "Mese precedente",
          nextDay: "Giorno successivo",
          nextWeek: "Settimana successiva",
          nextMonth: "Mese successivo",
          daySubtitle: (date: string) =>
            `${formatPlanningWeekday(date, locale)} · agenda verticale per staff con fasce libere e prenotazioni già incastrate.`,
          weekSubtitle: `${formatWeekRange(planningDate, locale)} · overview settimanale per individuare giorni saturi, slot aperti e passare subito alla day view.`,
          monthSubtitle: `${formatMonthTitle(planningDate, locale)} · calendario mensile con volumi, slot compatibili e giorni da aprire nel dettaglio.`,
          weekTitle: () => `Settimana del ${formatPlanningTitle(weekDates[0], locale)}`,
          service: "Servizio",
          availableSlots: (count: number) => `${count} slot disponibili`,
          visibleBookings: (count: number) => `${count} booking visibili`,
          openDeposits: (amount: string, filtered: boolean) => `${amount} depositi aperti${filtered ? " (filtrato)" : ""}`,
          activeDays: (count: number) => `${count} giorni con attività`,
          activeDaysLabel: "Giorni attivi",
          filterActive: (count: number) => `Filtro attivo · ${count} match`,
          rescheduleActive: (customerName: string) => `Riprogrammazione attiva · ${customerName}`,
          dragHint: "Trascina la prenotazione su una fascia libera compatibile e rilascia per confermare lo spostamento.",
          missingFields: {
            slot: "fascia libera",
            customerName: "nome cliente",
            customerPhone: "telefono",
            customerEmail: "email",
          },
          missingFieldsText: (fields: string[]) => `Campi richiesti mancanti: ${fields.join(", ")}.`,
          unableMove: "Non riesco a spostare la prenotazione.",
          movedWithDrag: "Prenotazione spostata con drag and drop.",
          dropOnCompatibleSlot: "Rilascia su una fascia libera compatibile per spostare la prenotazione.",
          noCompatibleWindow: "Nessuna buca compatibile per questo servizio nella colonna selezionata.",
          invalidSlotInWindow: "La fascia selezionata non contiene uno start valido per il servizio attivo.",
          activeServiceChanged: (serviceName: string, durationMinutes: number) =>
            `Servizio attivo cambiato in: ${serviceName} · ${durationMinutes} min.`,
          rescheduleCancelled: "Riprogrammazione annullata.",
          selectSlotAndFields: "Seleziona prima una fascia libera nella timeline verticale e completa i campi richiesti.",
          bookingInserted: "Prenotazione inserita correttamente nel planning.",
          bookingCreated: "Prenotazione creata nel planning.",
          unableCreate: "Non riesco a creare la prenotazione.",
          selectBookingThenSlot: "Seleziona una prenotazione e poi una nuova fascia libera.",
          bookingRescheduled: "Prenotazione riprogrammata nel nuovo slot.",
          timeAxis: "Ora",
          now: "Ora",
          compatibleSlotsCount: (count: number) => `${count} slot compatibili`,
          selectedSlot: "Slot scelto",
          activeServiceLabel: "Servizio attivo",
          dropHere: "Rilascia qui",
          openDay: "Apri day",
          compatibleSlots: (count: number) => `${count} slot compatibili`,
          noVisibleBookingForDay: "Nessun booking visibile per questo giorno.",
          noVisibleBooking: "Nessun booking visibile.",
          overviewWeekKicker: "Vista week",
          overviewMonthKicker: "Vista month",
          overviewWeekTitle: "Panoramica settimanale",
          overviewMonthTitle: "Calendario mensile operativo",
          overviewWeekBody: "Usa la week view per confrontare carico, slot e giornate da aprire in dettaglio.",
          overviewMonthBody: "Usa la month view per leggere il volume complessivo e saltare al giorno operativo corretto.",
          focusedDate: "Data in focus",
          howToUse: "Come usarla",
          overviewHowToUse: "Clicca un giorno nella griglia per aprire la day view e lavorare subito su buche, riprogrammazioni e conferme operative.",
          noService: "Nessun servizio",
          workspaceReady: "Workspace pronto",
          selectSlotOrBooking: "Seleziona una fascia o una prenotazione",
          idleBody: "Clicca una finestra libera per creare una prenotazione oppure una card esistente per entrare in modalità riprogrammazione.",
          gettingStarted: "Come iniziare",
          gettingStartedBody: "1. Scegli il servizio attivo in alto. 2. Clicca uno slot libero nel planning. 3. Completa i dati cliente nel pannello laterale.",
          newBooking: "Nuova prenotazione",
          fillFreeWindow: "Riempi una fascia libera",
          createBody: "Compila i dati richiesti per confermare la nuova prenotazione nello slot selezionato.",
          chooseSlotFirst: "Seleziona prima una fascia libera nella timeline.",
          customerName: "Nome cliente",
          customerNamePlaceholder: "Es. Maria Rossi",
          phone: "Telefono",
          phonePlaceholder: "333...",
          email: "Email",
          emailPlaceholder: "maria@esempio.it",
          requiredField: "Campo obbligatorio.",
          operationalNotes: "Note operative",
          operationalNotesPlaceholder: "Note eventuali...",
          standardPrice: "Prezzo standard",
          deposit: "Caparra",
          initial: "Iniziale",
          confirmBooking: "Conferma prenotazione",
          moveBooking: "Sposta prenotazione",
          rescheduleBody: "Seleziona una nuova fascia nella timeline per riprogrammare l'appuntamento senza perdere il contesto precedente.",
          noSelectedSlot: "Nessuna fascia selezionata. Clicca nel planning verticale per scegliere lo start.",
          editingBooking: "Prenotazione in modifica",
          selectValidSlotFirst: "Seleziona prima uno slot valido.",
          moveToNewSlot: "Sposta nel nuovo slot",
          cancelRescheduleAction: "Annulla riprogrammazione",
          daySummary: "Sintesi giornata",
          weekSummary: "Sintesi settimana",
          monthSummary: "Sintesi mese",
          bookingsInView: (count: number, filtered: boolean) => `${count} prenotazioni in vista${filtered ? " · filtro attivo" : ""}`,
          activeStaff: "Staff attivo",
          onShiftNow: "In servizio ora",
          inSelectedPeriod: "Nel periodo scelto",
          freeWindows: "Fasce libere",
          freeSlots: "Slot liberi",
          availableCapacity: "Capacità disponibile",
          bookingsToday: "Booking oggi",
          operationalVolume: "Volume operativo",
          openDepositsLabel: "Caparre aperte",
          pendingAmounts: "Importi pendenti",
          searchFilter: "Filtro ricerca",
          matchedResults: "Risultati match",
          filterOff: "OFF",
          results: (count: number) => `${count} RISULTATI`,
        };
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
    !selectedSlot ? copy.missingFields.slot : null,
    formErrors.customerName ? copy.missingFields.customerName : null,
    formErrors.customerPhone ? copy.missingFields.customerPhone : null,
    formErrors.customerEmail ? copy.missingFields.customerEmail : null,
  ].filter(Boolean) as string[];
  const createActionDisabled =
    panelMode !== "create" ||
    !selectedSlot ||
    !activeService ||
    missingFields.length > 0;
  const createValidationText =
    panelMode === "create" && createActionDisabled
      ? copy.missingFieldsText(missingFields)
      : null;
  const previousLabel =
    planningView === "day"
      ? copy.previousDay
      : planningView === "week"
        ? copy.previousWeek
        : copy.previousMonth;
  const nextLabel =
    planningView === "day"
      ? copy.nextDay
      : planningView === "week"
        ? copy.nextWeek
        : copy.nextMonth;
  const planningTitle =
    planningView === "day"
      ? formatPlanningTitle(planningDate, locale)
      : planningView === "week"
        ? copy.weekTitle()
        : formatMonthTitle(planningDate, locale);
  const planningSubtitle =
    planningView === "day"
      ? copy.daySubtitle(planningDate)
      : planningView === "week"
        ? copy.weekSubtitle
        : copy.monthSubtitle;
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
        text: error instanceof Error ? error.message : copy.unableMove,
      });
      onNotify("error", error instanceof Error ? error.message : copy.unableMove);
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
          copy.movedWithDrag,
        );
        return;
      }

      if (!previewSlot) {
        onNotify("warning", copy.dropOnCompatibleSlot);
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
        text: copy.noCompatibleWindow,
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
        text: copy.invalidSlotInWindow,
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
      onNotify("info", copy.activeServiceChanged(booking.serviceName, booking.durationMinutes));
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
    onNotify("info", copy.rescheduleCancelled);
  }

  async function handleCreateBooking() {
    if (!activeService || !selectedSlot || createActionDisabled) {
      setMessage({
        tone: "error",
        text:
          createValidationText ??
          copy.selectSlotAndFields,
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
          text: copy.bookingInserted,
        });
        onNotify("success", copy.bookingCreated);
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : copy.unableCreate,
      });
    }
  }

  async function handleRescheduleBooking() {
    if (!selectedPlanningBooking || !selectedSlot) {
      setMessage({
        tone: "error",
        text: copy.selectBookingThenSlot,
      });
      return;
    }

    commitBookingMove(
      selectedPlanningBooking,
      selectedSlot,
      copy.bookingRescheduled,
    );
  }

  return (
    <section className="flex min-h-0 flex-col gap-6 pb-8 lg:h-full lg:flex-row">
      <div className="flex h-[800px] min-h-0 min-w-0 flex-1 flex-col lg:h-full">
        <article className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/5">
          <div className="px-5 py-5 border-b border-slate-200 flex flex-col md:flex-row md:items-start md:justify-between gap-4 bg-slate-50/50">
            <div>
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-1 shadow-sm opacity-90 inline-block">
                {copy.operationalPlanning}
              </p>
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">{planningTitle}</h3>
              <span className="text-sm font-medium text-slate-500 mt-0.5 block">{planningSubtitle}</span>
            </div>

            <div className="flex flex-col items-end gap-3 shrink-0">
              <div className="flex flex-col items-end gap-1.5">
                <div className="inline-flex items-center p-1 bg-slate-100/80 rounded-lg border border-slate-200 shadow-inner" aria-label={copy.viewAriaLabel}>
                  <button
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${planningView === "day" ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/50" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"}`}
                    type="button"
                    onClick={() => handleViewChange("day")}
                  >
                    {copy.day}
                  </button>
                  <button
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${planningView === "week" ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/50" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"}`}
                    type="button"
                    onClick={() => handleViewChange("week")}
                  >
                    {copy.week}
                  </button>
                  <button
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${planningView === "month" ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/50" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"}`}
                    type="button"
                    onClick={() => handleViewChange("month")}
                  >
                    {copy.month}
                  </button>
                </div>
                <small className="text-[11px] text-slate-400 font-medium">
                  {planningView === "day"
                    ? copy.dayHint
                    : planningView === "week"
                      ? copy.weekHint
                      : copy.monthHint}
                </small>
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="h-9 px-3 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
                  type="button"
                  onClick={() =>
                    handleDateChange(shiftPlanningDateByView(planningDate, planningView, -1))
                  }
                >
                  {previousLabel}
                </button>
                <input
                  className="h-9 px-3 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  type="date"
                  value={planningDate}
                  onChange={(event) => handleDateChange(event.target.value)}
                />
                <button
                  className="h-9 px-3 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
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

          <div className="px-5 py-3 border-b border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <label
              className={`
                flex items-center gap-3 text-sm font-medium
                ${serviceFlash ? "text-blue-600 bg-blue-50/50 p-2 -my-2 -ml-2 rounded-lg service-flash" : "text-slate-700"}
              `}
            >
              <span className="shrink-0 text-slate-500 text-xs uppercase tracking-wider font-semibold">{copy.service}</span>
              <select
                className="h-9 pl-3 pr-8 w-64 bg-slate-50 border border-slate-200 rounded-lg shadow-sm hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
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

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 font-semibold">{copy.availableSlots(summarySlotsCount)}</span>
              <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-600">{copy.visibleBookings(visibleBookings.length)}</span>
              <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-600">
                {copy.openDeposits(formatMoney(snapshot, summaryOpenDepositCents, locale), Boolean(deferredQuery))}
              </span>
              {planningView !== "day" ? (
                <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-600">{copy.activeDays(activeDaysCount)}</span>
              ) : null}
              {deferredQuery ? (
                <span className="px-2.5 py-1 rounded bg-blue-50 border border-blue-100 text-blue-700 font-medium shadow-sm">
                  {copy.filterActive(visibleBookings.length)}
                </span>
              ) : null}
              {planningView === "day" && selectedPlanningBooking ? (
                <span className="px-2.5 py-1 rounded bg-amber-50 border border-amber-200 text-amber-800 font-medium shadow-sm">
                  {copy.rescheduleActive(selectedPlanningBooking.customerName)}
                </span>
              ) : null}
            </div>
          </div>

          {dragState?.phase === "dragging" ? (
            <div className="bg-blue-50 border-y border-blue-200 text-blue-800 px-5 py-3 text-sm font-medium flex items-center justify-center">
              {copy.dragHint}
            </div>
          ) : null}

          {message ? (
            <div className={`px-5 py-3 text-sm font-medium border-y flex items-center justify-center ${
              message.tone === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' : 
              message.tone === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
              message.tone === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
              'bg-blue-50 border-blue-200 text-blue-800'
            }`}>
              {message.text}
            </div>
          ) : null}

          {planningView === "day" ? (
            <div className="planning-surface">
              <div className="planning-columns-head" style={{ gridTemplateColumns: columnTemplate }}>
                <div className="planning-axis-label">{copy.timeAxis}</div>
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
                        {translateRoleLabel(staff.role, language)} ·{" "}
                        {language === "en" ? `${staffBookings.length} bookings` : `${staffBookings.length} booking`} ·{" "}
                        {copy.compatibleSlotsCount(staffSlots.length)}
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
                            <span>{copy.now}</span>
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
                                <small>{copy.compatibleSlotsCount(window.slotStartsAt.length)}</small>
                              </div>
                            </button>
                          );
                        })}

                        {selectedSlot && selectedSlot.staffMemberId === staff.id && selectedSlotEndsAt ? (
                          <div
                            className="planning-selection"
                            style={getVerticalMetrics(selectedSlot.startsAt, selectedSlotEndsAt)}
                          >
                            <span className="planning-selection-kicker">{copy.selectedSlot}</span>
                            <strong>{formatTime(selectedSlot.startsAt)}</strong>
                            <small>{activeService?.name ?? copy.activeServiceLabel}</small>
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
                            <span className="planning-selection-kicker">{copy.dropHere}</span>
                            <strong>{formatTime(dragState.previewSlot.startsAt)}</strong>
                            <small>{draggedPlanningBooking.customerName}</small>
                          </div>
                        ) : null}

                        {staffBookings.map((booking) => {
                          const metrics = getVerticalMetrics(booking.startsAt, booking.endsAt);
                          const tone = getTone(booking.serviceId, bookingTones);
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
                        backgroundColor: getTone(draggedPlanningBooking.serviceId, bookingTones),
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
                              {formatWeekdayShort(date, locale)}
                            </span>
                            <strong>{formatPlanningTitle(date, locale)}</strong>
                          </div>
                          <span className="planning-overview-open">{copy.openDay}</span>
                        </div>

                        <div className="planning-overview-pills">
                          <span className="planning-overview-pill">
                            {language === "en" ? `${summaryBookingsForDate.length} bookings` : `${summaryBookingsForDate.length} booking`}
                          </span>
                          <span className="planning-overview-pill">
                            {copy.compatibleSlots(slotCount)}
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
                              {copy.noVisibleBookingForDay}
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
                  <span key={date}>{formatWeekdayNarrow(date, locale)}</span>
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
                          <span>{formatWeekdayShort(date, locale)}</span>
                          <strong>{formatDayNumber(date, locale)}</strong>
                        </div>

                        <div className="planning-overview-pills compact">
                          <span className="planning-overview-pill">
                            {language === "en" ? `${summaryBookingsForDate.length} bookings` : `${summaryBookingsForDate.length} booking`}
                          </span>
                          <span className="planning-overview-pill">{language === "en" ? `${slotCount} slots` : `${slotCount} slot`}</span>
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
                              {copy.noVisibleBooking}
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

      <aside className="planning-sidebar flex w-full shrink-0 flex-col gap-6 pr-1 lg:w-80 lg:min-h-0 lg:overflow-y-auto">
        <article className="shrink-0 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {planningView !== "day" ? (
            <div className="flex flex-col gap-5">
              <div className="mb-2">
                <p className="text-[10px] font-bold tracking-wider text-blue-600 uppercase mb-1">
                  {planningView === "week" ? copy.overviewWeekKicker : copy.overviewMonthKicker}
                </p>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight leading-snug">
                  {planningView === "week"
                    ? copy.overviewWeekTitle
                    : copy.overviewMonthTitle}
                </h3>
                <span className="text-sm text-slate-500 mt-1 block leading-relaxed">
                  {planningView === "week"
                    ? copy.overviewWeekBody
                    : copy.overviewMonthBody}
                </span>
              </div>

              <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3 text-sm">
                <strong className="block text-blue-900 font-semibold mb-0.5">{copy.focusedDate}</strong>
                <p className="text-blue-800">
                  {planningView === "week"
                    ? `${copy.week} ${formatWeekRange(planningDate, locale)}`
                    : formatMonthTitle(planningDate, locale)}
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-sm">
                <strong className="block text-slate-700 font-semibold mb-0.5">{copy.activeServiceLabel}</strong>
                <p className="text-slate-600">
                  {activeService?.name ?? copy.noService} · {activeService?.durationMinutes ?? 0} min
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-sm">
                <strong className="block text-slate-700 font-semibold mb-0.5">{copy.howToUse}</strong>
                <p className="text-slate-600 leading-relaxed">{copy.overviewHowToUse}</p>
              </div>
            </div>
          ) : null}

          {planningView === "day" && panelMode === "idle" ? (
            <div className="flex flex-col gap-5">
              <div className="mb-2">
                <p className="text-[10px] font-bold tracking-wider text-emerald-600 uppercase mb-1">{copy.workspaceReady}</p>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight leading-snug">{copy.selectSlotOrBooking}</h3>
                <span className="text-sm text-slate-500 mt-1 block leading-relaxed">{copy.idleBody}</span>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-sm">
                <strong className="block text-slate-700 font-semibold mb-1">{copy.gettingStarted}</strong>
                <p className="text-slate-600 leading-relaxed">{copy.gettingStartedBody}</p>
              </div>
            </div>
          ) : null}

          {planningView === "day" && panelMode === "create" ? (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-[10px] font-bold tracking-wider text-blue-600 uppercase mb-1">{copy.newBooking}</p>
                <h3 className="text-xl font-bold text-slate-900 tracking-tight leading-tight">{copy.fillFreeWindow}</h3>
                <span className="text-sm text-slate-500 mt-1.5 block leading-relaxed">{copy.createBody}</span>
              </div>

              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 shadow-sm transition-all hover:bg-slate-100/50">
                <strong className="block text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-1.5">{copy.selectedSlot}</strong>
                {selectedSlot ? (
                  <p className="text-slate-900 font-semibold text-sm">
                    {formatSlotDateTime(selectedSlot.startsAt, locale)} ·{" "}
                    <span className="text-blue-600">{selectedStaff?.fullName}</span>
                  </p>
                ) : (
                  <p className="text-slate-400 italic text-sm">{copy.chooseSlotFirst}</p>
                )}
              </div>

              {createValidationText ? (
                <div className="bg-rose-50 border border-rose-100 text-rose-700 rounded-xl p-3.5 text-xs font-semibold shadow-sm flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
                  <span className="shrink-0 mt-0.5">⚠️</span>
                  <span>{createValidationText}</span>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3.5">
                <label className="flex flex-col gap-1.5">
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${formErrors.customerName ? "text-rose-600" : "text-slate-500"}`}>{copy.customerName}</span>
                  <input
                    className={`h-10 px-3 bg-white border rounded-lg text-sm shadow-sm transition-all focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 ${formErrors.customerName ? "border-rose-400 ring-4 ring-rose-500/10" : "border-slate-200 hover:border-slate-300"}`}
                    placeholder={copy.customerNamePlaceholder}
                    value={form.customerName}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, customerName: event.target.value }))
                    }
                  />
                  {formErrors.customerName ? <small className="text-[10px] text-rose-500 font-bold ml-1">{copy.requiredField}</small> : null}
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${formErrors.customerPhone ? "text-rose-600" : "text-slate-500"}`}>{copy.phone}</span>
                  <input
                    className={`h-10 px-3 bg-white border rounded-lg text-sm shadow-sm transition-all focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 ${formErrors.customerPhone ? "border-rose-400 ring-4 ring-rose-500/10" : "border-slate-200 hover:border-slate-300"}`}
                    placeholder={copy.phonePlaceholder}
                    value={form.customerPhone}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, customerPhone: event.target.value }))
                    }
                  />
                  {formErrors.customerPhone ? <small className="text-[10px] text-rose-500 font-bold ml-1">{copy.requiredField}</small> : null}
                </label>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className={`text-[11px] font-bold uppercase tracking-wider ${formErrors.customerEmail ? "text-rose-600" : "text-slate-500"}`}>{copy.email}</span>
                <input
                  type="email"
                  className={`h-10 px-3 bg-white border rounded-lg text-sm shadow-sm transition-all focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 ${formErrors.customerEmail ? "border-rose-400 ring-4 ring-rose-500/10" : "border-slate-200 hover:border-slate-300"}`}
                  placeholder={copy.emailPlaceholder}
                  value={form.customerEmail}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, customerEmail: event.target.value }))
                  }
                />
                {formErrors.customerEmail ? <small className="text-[10px] text-rose-500 font-bold ml-1">{copy.requiredField}</small> : null}
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{copy.operationalNotes}</span>
                <input
                  className="h-10 px-3 bg-white border border-slate-200 rounded-lg text-sm shadow-sm transition-all hover:border-slate-300 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500"
                  placeholder={copy.operationalNotesPlaceholder}
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>

              <div className="mt-1 divide-y divide-slate-100 bg-slate-50/50 rounded-xl border border-slate-100 overflow-hidden">
                <div className="flex justify-between items-center px-4 py-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-700">{copy.activeServiceLabel}</p>
                    <small className="text-[10px] text-slate-500 uppercase font-medium">{copy.standardPrice}</small>
                  </div>
                  <strong className="text-sm font-bold text-slate-900">
                    {activeService?.durationMinutes ?? 0}m ·{" "}
                    {activeService ? formatMoney(snapshot, activeService.priceCents, locale) : "-"}
                  </strong>
                </div>
                <div className="flex justify-between items-center px-4 py-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-700">{copy.deposit}</p>
                    <small className="text-[10px] text-slate-500 uppercase font-medium">{copy.initial}</small>
                  </div>
                  <strong className="text-sm font-bold text-blue-600 text-right">
                    {activeService ? formatMoney(snapshot, getDepositAmountCents(activeService), locale) : "-"}
                  </strong>
                </div>
              </div>

              <div className="mt-2">
                <button
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-blue-500/20 active:scale-[0.98]"
                  disabled={createActionDisabled}
                  type="button"
                  onClick={handleCreateBooking}
                >
                  {copy.confirmBooking}
                </button>
              </div>
            </div>
          ) : null}

          {planningView === "day" && panelMode === "reschedule" ? (
            <div className="flex flex-col gap-5">
              <div className="mb-2">
                <p className="text-[10px] font-bold tracking-wider text-amber-600 uppercase mb-1">{copy.moveBooking}</p>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight leading-snug truncate">{selectedPlanningBooking?.customerName}</h3>
                <span className="text-sm text-slate-500 mt-1 block leading-relaxed">{copy.rescheduleBody}</span>
              </div>

              <div className={`border rounded-lg p-3 text-sm ${selectedSlot ? "bg-slate-50 border-slate-100" : "bg-rose-50 border-rose-200 text-rose-900"}`}>
                <strong className={`block font-semibold mb-0.5 ${selectedSlot ? "text-slate-700" : "text-rose-900"}`}>{copy.selectedSlot}</strong>
                {selectedSlot ? (
                  <p className="text-slate-600">
                    {formatSlotDateTime(selectedSlot.startsAt, locale)} ·{" "}
                    {selectedStaff?.fullName}
                  </p>
                ) : (
                  <p className="italic">{copy.noSelectedSlot}</p>
                )}
              </div>

              {selectedPlanningBooking ? (
                <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-3 text-sm">
                  <strong className="block text-amber-900 font-semibold mb-0.5">{copy.editingBooking}</strong>
                  <p className="text-amber-800">
                    {selectedPlanningBooking.serviceName} ·{" "}
                    {formatTimeRange(selectedPlanningBooking.startsAt, selectedPlanningBooking.endsAt)}
                  </p>
                </div>
              ) : null}

              <div className="mt-2 pt-4 border-t border-slate-100 flex flex-col gap-3">
                <button
                  className="w-full h-10 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                  disabled={!selectedSlot}
                  title={!selectedSlot ? copy.selectValidSlotFirst : undefined}
                  type="button"
                  onClick={handleRescheduleBooking}
                >
                  {copy.moveToNewSlot}
                </button>
                <button className="w-full h-10 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 text-sm font-medium rounded-lg transition-colors shadow-sm" type="button" onClick={cancelReschedule}>
                  {copy.cancelRescheduleAction}
                </button>
              </div>
            </div>
          ) : null}
        </article>

        <article className="shrink-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h3 className="text-lg font-bold text-slate-900 tracking-tight leading-snug">
              {planningView === "day"
                ? copy.daySummary
                : planningView === "week"
                  ? copy.weekSummary
                  : copy.monthSummary}
            </h3>
            <span className="text-xs font-semibold text-slate-400 mt-1 block uppercase tracking-wider">
              {copy.bookingsInView(visibleBookings.length, Boolean(deferredQuery))}
            </span>
          </div>

          <div className="divide-y divide-slate-100/80">
            <div className="flex justify-between items-center py-3.5">
              <div className="flex flex-col">
                <p className="text-sm font-bold text-slate-800">{copy.activeStaff}</p>
                <small className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">
                  {planningView === "day"
                    ? copy.onShiftNow
                    : copy.inSelectedPeriod}
                </small>
              </div>
              <strong className="text-lg font-black text-slate-900 tabular-nums">{snapshot.staffMembers.length}</strong>
            </div>
            <div className="flex justify-between items-center py-3.5">
              <div className="flex flex-col">
                <p className="text-sm font-bold text-slate-800">{planningView === "day" ? copy.freeWindows : copy.freeSlots}</p>
                <small className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">
                  {copy.availableCapacity}
                </small>
              </div>
              <strong className="text-lg font-black text-slate-900 tabular-nums">{summarySlotsCount}</strong>
            </div>
            <div className="flex justify-between items-center py-3.5">
              <div className="flex flex-col">
                <p className="text-sm font-bold text-slate-800">{planningView === "day" ? copy.bookingsToday : copy.activeDaysLabel}</p>
                <small className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">
                  {copy.operationalVolume}
                </small>
              </div>
              <strong className="text-lg font-black text-slate-900 tabular-nums">{planningView === "day" ? visibleBookings.length : activeDaysCount}</strong>
            </div>
            <div className="flex justify-between items-center py-3.5">
              <div className="flex flex-col">
                <p className="text-sm font-bold text-slate-800">{copy.openDepositsLabel}</p>
                <small className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">{copy.pendingAmounts}</small>
              </div>
                  <strong className="text-base font-black text-blue-600 tabular-nums">
                    {formatMoney(snapshot, summaryOpenDepositCents, locale)}
                  </strong>
            </div>
            <div className="flex justify-between items-center py-3.5">
              <div className="flex flex-col">
                <p className="text-sm font-bold text-slate-800">{copy.searchFilter}</p>
                <small className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">{copy.matchedResults}</small>
              </div>
              <strong className={`text-xs font-bold px-2 py-1 rounded-md ${deferredQuery ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100" : "bg-slate-50 text-slate-400"}`}>
                {deferredQuery ? copy.results(visibleBookings.length) : copy.filterOff}
              </strong>
            </div>
          </div>
        </article>
      </aside>
    </section>
  );
}
