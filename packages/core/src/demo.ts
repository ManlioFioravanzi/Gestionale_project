import { addDays, addMinutes, endOfDay, formatISO, parseISO, set, startOfDay } from "date-fns";

import { hasSlotAvailable, listAvailability } from "./availability";
import type {
  AdminBookingDraft,
  AuditEvent,
  AvailabilityRule,
  Blackout,
  Booking,
  BookingConfirmation,
  BookingDraft,
  BookingItem,
  Customer,
  Location,
  NotificationLog,
  Payment,
  PublicSettings,
  Service,
  StaffMember,
  Tenant,
} from "./domain";
import { calculateDepositCents } from "./payments";

export interface DashboardSnapshot {
  tenant: Tenant;
  locations: Location[];
  staffMembers: StaffMember[];
  services: Service[];
  customers: Customer[];
  bookings: Array<
    Booking & {
      customerName: string;
      staffName: string;
      serviceName: string;
      serviceId: string;
      durationMinutes: number;
    }
  >;
  availabilityRules: AvailabilityRule[];
  blackouts: Blackout[];
  bookingItems: BookingItem[];
  payments: Payment[];
  notifications: NotificationLog[];
  metrics: {
    upcomingBookings: number;
    revenueTodayCents: number;
    pendingDepositsCents: number;
    customerCount: number;
  };
}

interface DemoState {
  tenant: Tenant;
  locations: Location[];
  staffMembers: StaffMember[];
  services: Service[];
  customers: Customer[];
  availabilityRules: AvailabilityRule[];
  blackouts: Blackout[];
  bookings: Booking[];
  bookingItems: BookingItem[];
  payments: Payment[];
  notifications: NotificationLog[];
  auditEvents: AuditEvent[];
}

function isoAt(date: Date, hours: number, minutes = 0) {
  return formatISO(set(date, { hours, minutes, seconds: 0, milliseconds: 0 }));
}

function getNextOperationalDate() {
  let candidate = addDays(new Date(), 1);

  while (candidate.getDay() === 0) {
    candidate = addDays(candidate, 1);
  }

  return candidate;
}

function createInitialState(): DemoState {
  const seededNow = new Date().toISOString();
  const tenant: Tenant = {
    id: "tenant_studio_aurora",
    businessName: "Studio Aurora",
    slug: "studio-aurora",
    timezone: "Europe/Rome",
    currency: "EUR",
    locale: "it-IT",
    primaryProfile: "appointments",
    enabledProfiles: ["appointments"],
    supportEmail: "hello@studioaurora.example",
    bookingLeadHours: 2,
    bookingIntervalMinutes: 30,
    defaultDepositPercentage: 30,
  };

  const locations: Location[] = [
    {
      id: "loc_main",
      tenantId: tenant.id,
      name: "Milano Centro",
      address: "Via Larga 24, Milano",
      profile: "appointments",
    },
  ];

  const staffMembers: StaffMember[] = [
    {
      id: "staff_elena",
      tenantId: tenant.id,
      fullName: "Elena Rossi",
      role: "manager",
      profile: "appointments",
      locationIds: [locations[0].id],
      accentColor: "#d45f39",
      active: true,
    },
    {
      id: "staff_marta",
      tenantId: tenant.id,
      fullName: "Marta Bianchi",
      role: "operator",
      profile: "appointments",
      locationIds: [locations[0].id],
      accentColor: "#0f6c5c",
      active: true,
    },
  ];

  const services: Service[] = [
    {
      id: "svc_signature_cut",
      tenantId: tenant.id,
      profile: "appointments",
      locationId: locations[0].id,
      name: "Signature Cut",
      description: "Taglio, consulenza e styling finale.",
      durationMinutes: 60,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 15,
      priceCents: 5500,
      depositType: "percentage",
      depositValue: 30,
      onlineEnabled: true,
    },
    {
      id: "svc_color_ritual",
      tenantId: tenant.id,
      profile: "appointments",
      locationId: locations[0].id,
      name: "Color Ritual",
      description: "Colore completo con trattamento e piega.",
      durationMinutes: 120,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 15,
      priceCents: 11500,
      depositType: "percentage",
      depositValue: 40,
      onlineEnabled: true,
    },
    {
      id: "svc_quick_consultation",
      tenantId: tenant.id,
      profile: "appointments",
      locationId: locations[0].id,
      name: "Quick Consultation",
      description: "Consulenza viso, stile e percorso trattamento.",
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      priceCents: 2500,
      depositType: "fixed",
      depositValue: 1000,
      onlineEnabled: true,
    },
  ];

  const customers: Customer[] = [
    {
      id: "cus_chiara",
      tenantId: tenant.id,
      fullName: "Chiara Greco",
      email: "chiara@example.com",
      phone: "+39 333 000 1111",
    },
    {
      id: "cus_luca",
      tenantId: tenant.id,
      fullName: "Luca Serra",
      email: "luca@example.com",
      phone: "+39 333 222 3333",
    },
  ];

  const availabilityRules: AvailabilityRule[] = [];
  for (const weekday of [1, 2, 3, 4, 5, 6]) {
    for (const staff of staffMembers) {
      availabilityRules.push({
        id: `rule_${staff.id}_${weekday}`,
        tenantId: tenant.id,
        locationId: locations[0].id,
        profile: "appointments",
        weekday,
        startMinutes: 9 * 60,
        endMinutes: 18 * 60,
        staffMemberId: staff.id,
      });
    }
  }

  const baseDate = getNextOperationalDate();
  const baseDateValue = formatISO(baseDate, { representation: "date" });
  const blackouts: Blackout[] = [
    {
      id: "blackout_training",
      tenantId: tenant.id,
      locationId: locations[0].id,
      profile: "appointments",
      date: baseDateValue,
      startMinutes: 13 * 60,
      endMinutes: 14 * 60,
      staffMemberId: "staff_marta",
      reason: "Formazione interna",
    },
  ];

  const bookingOneStart = isoAt(baseDate, 10);
  const bookingOneEnd = isoAt(baseDate, 11);
  const bookingTwoStart = isoAt(baseDate, 15);
  const bookingTwoEnd = isoAt(baseDate, 17);

  const bookings: Booking[] = [
    {
      id: "book_001",
      tenantId: tenant.id,
      locationId: locations[0].id,
      customerId: customers[0].id,
      staffMemberId: staffMembers[0].id,
      profile: "appointments",
      status: "confirmed",
      paymentStatus: "paid",
      channel: "web",
      startsAt: bookingOneStart,
      endsAt: bookingOneEnd,
      notes: "Preferisce prodotti senza profumazione intensa.",
      depositRequiredCents: 1650,
      depositCollectedCents: 1650,
      createdAt: bookingOneStart,
      updatedAt: bookingOneStart,
    },
    {
      id: "book_002",
      tenantId: tenant.id,
      locationId: locations[0].id,
      customerId: customers[1].id,
      staffMemberId: staffMembers[1].id,
      profile: "appointments",
      status: "confirmed",
      paymentStatus: "pending",
      channel: "admin",
      startsAt: bookingTwoStart,
      endsAt: bookingTwoEnd,
      notes: "Ritoccare tonalità ramata.",
      depositRequiredCents: 4600,
      depositCollectedCents: 0,
      createdAt: bookingTwoStart,
      updatedAt: bookingTwoStart,
    },
  ];

  const bookingItems: BookingItem[] = [
    {
      id: "item_001",
      bookingId: bookings[0].id,
      serviceId: services[0].id,
      durationMinutes: services[0].durationMinutes,
      bufferBeforeMinutes: services[0].bufferBeforeMinutes,
      bufferAfterMinutes: services[0].bufferAfterMinutes,
      unitPriceCents: services[0].priceCents,
    },
    {
      id: "item_002",
      bookingId: bookings[1].id,
      serviceId: services[1].id,
      durationMinutes: services[1].durationMinutes,
      bufferBeforeMinutes: services[1].bufferBeforeMinutes,
      bufferAfterMinutes: services[1].bufferAfterMinutes,
      unitPriceCents: services[1].priceCents,
    },
  ];

  const payments: Payment[] = [
    {
      id: "pay_001",
      tenantId: tenant.id,
      bookingId: bookings[0].id,
      provider: "stripe",
      status: "paid",
      amountCents: 1650,
      paymentIntentId: "pi_demo_001",
      createdAt: seededNow,
      updatedAt: seededNow,
    },
    {
      id: "pay_002",
      tenantId: tenant.id,
      bookingId: bookings[1].id,
      provider: "manual",
      status: "pending",
      amountCents: 4600,
      createdAt: bookingTwoStart,
      updatedAt: bookingTwoStart,
    },
  ];

  const notifications: NotificationLog[] = [
    {
      id: "notif_001",
      tenantId: tenant.id,
      bookingId: bookings[0].id,
      channel: "email",
      recipient: customers[0].email,
      status: "sent",
      templateKey: "booking-confirmed",
      sentAt: seededNow,
    },
    {
      id: "notif_002",
      tenantId: tenant.id,
      bookingId: bookings[1].id,
      channel: "email",
      recipient: customers[1].email,
      status: "queued",
      templateKey: "booking-confirmed",
    },
  ];

  const auditEvents: AuditEvent[] = [
    {
      id: "audit_001",
      tenantId: tenant.id,
      actorLabel: "System seed",
      entityType: "tenant",
      entityId: tenant.id,
      action: "tenant.created",
      createdAt: bookingOneStart,
      payload: { profile: tenant.primaryProfile },
    },
  ];

  return {
    tenant,
    locations,
    staffMembers,
    services,
    customers,
    availabilityRules,
    blackouts,
    bookings,
    bookingItems,
    payments,
    notifications,
    auditEvents,
  };
}

let state = createInitialState();

function getCustomerById(customerId: string) {
  return state.customers.find((entry) => entry.id === customerId);
}

function pushNotification({
  tenantId,
  bookingId,
  recipient,
  templateKey,
  status = "queued",
  sentAt,
}: {
  tenantId: string;
  bookingId: string;
  recipient: string;
  templateKey: string;
  status?: NotificationLog["status"];
  sentAt?: string;
}) {
  state.notifications.push({
    id: crypto.randomUUID(),
    tenantId,
    bookingId,
    channel: "email",
    recipient,
    status,
    templateKey,
    sentAt,
  });
}

function pushBookingNotification(
  booking: Booking,
  templateKey: string,
  status: NotificationLog["status"] = "queued",
  sentAt?: string,
) {
  const customer = getCustomerById(booking.customerId);

  if (!customer) {
    return;
  }

  pushNotification({
    tenantId: booking.tenantId,
    bookingId: booking.id,
    recipient: customer.email,
    templateKey,
    status,
    sentAt,
  });
}

function getBookingItem(bookingId: string) {
  return state.bookingItems.find((entry) => entry.bookingId === bookingId);
}

function getServiceByBookingId(bookingId: string) {
  const item = getBookingItem(bookingId);
  return item ? state.services.find((entry) => entry.id === item.serviceId) : undefined;
}

function getOrCreateCustomer({
  tenantId,
  customerName,
  customerEmail,
  customerPhone,
}: {
  tenantId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}) {
  const existing = state.customers.find((item) => item.email === customerEmail);

  if (existing) {
    existing.fullName = customerName;
    existing.phone = customerPhone;
    return existing;
  }

  const customer: Customer = {
    id: crypto.randomUUID(),
    tenantId,
    fullName: customerName,
    email: customerEmail,
    phone: customerPhone,
  };
  state.customers.push(customer);
  return customer;
}

function buildBookingBundle({
  tenant,
  service,
  customer,
  staffMemberId,
  channel,
  startsAt,
  notes,
}: {
  tenant: Tenant;
  service: Service;
  customer: Customer;
  staffMemberId: string;
  channel: Booking["channel"];
  startsAt: string;
  notes?: string;
}) {
  const start = parseISO(startsAt);
  const end = addMinutes(start, service.durationMinutes);
  const createdAt = new Date().toISOString();

  const booking: Booking = {
    id: crypto.randomUUID(),
    tenantId: tenant.id,
    locationId: service.locationId,
    customerId: customer.id,
    staffMemberId,
    profile: service.profile,
    status: "confirmed",
    paymentStatus: "pending",
    channel,
    startsAt: formatISO(start),
    endsAt: formatISO(end),
    notes,
    depositRequiredCents: calculateDepositCents(service, tenant),
    depositCollectedCents: 0,
    createdAt,
    updatedAt: createdAt,
  };

  const item: BookingItem = {
    id: crypto.randomUUID(),
    bookingId: booking.id,
    serviceId: service.id,
    durationMinutes: service.durationMinutes,
    bufferBeforeMinutes: service.bufferBeforeMinutes,
    bufferAfterMinutes: service.bufferAfterMinutes,
    unitPriceCents: service.priceCents,
  };

  const payment: Payment = {
    id: crypto.randomUUID(),
    tenantId: tenant.id,
    bookingId: booking.id,
    provider: channel === "web" ? "stripe" : "manual",
    status: "pending",
    amountCents: booking.depositRequiredCents,
    createdAt,
    updatedAt: createdAt,
  };

  return { booking, item, payment };
}

function ensureTenant(slug: string) {
  if (state.tenant.slug !== slug) {
    throw new Error(`Tenant ${slug} not found`);
  }

  return state.tenant;
}

export function resetDemoState() {
  state = createInitialState();
}

export function getPublicSettings(slug: string): PublicSettings {
  const tenant = ensureTenant(slug);
  return {
    businessName: tenant.businessName,
    slug: tenant.slug,
    timezone: tenant.timezone,
    currency: tenant.currency,
    locale: tenant.locale,
    leadHours: tenant.bookingLeadHours,
    depositPercentage: tenant.defaultDepositPercentage,
    locations: state.locations.map(({ id, name, address }) => ({ id, name, address })),
  };
}

export function listPublicServices(slug: string) {
  ensureTenant(slug);
  return structuredClone(state.services.filter((service) => service.onlineEnabled));
}

export function listPublicStaff(slug: string) {
  ensureTenant(slug);
  return structuredClone(state.staffMembers.filter((staff) => staff.active));
}

export function listPublicAvailability(slug: string, serviceId: string, date: string) {
  const tenant = ensureTenant(slug);
  const service = state.services.find((item) => item.id === serviceId);

  if (!service) {
    throw new Error(`Service ${serviceId} not found`);
  }

  return listAvailability({
    date,
    tenant,
    service,
    staffMembers: state.staffMembers,
    availabilityRules: state.availabilityRules,
    blackouts: state.blackouts,
    bookings: state.bookings,
    bookingItems: state.bookingItems,
  });
}

export function createPublicBooking(input: BookingDraft): BookingConfirmation {
  const tenant = ensureTenant(input.slug);
  const service = state.services.find((item) => item.id === input.serviceId);

  if (!service) {
    throw new Error(`Service ${input.serviceId} not found`);
  }

  const startsAt = parseISO(input.startsAt);
  const endsAt = addMinutes(startsAt, service.durationMinutes);
  const slots = listPublicAvailability(input.slug, input.serviceId, input.date);

  if (!hasSlotAvailable(slots, input.startsAt, input.staffMemberId)) {
    throw new Error("Requested slot is no longer available");
  }

  const chosenSlot = slots.find(
    (slot) =>
      slot.startsAt === input.startsAt &&
      (!input.staffMemberId || slot.staffMemberId === input.staffMemberId),
  );

  if (!chosenSlot) {
    throw new Error("No valid staff member available for this slot");
  }

  const customer = getOrCreateCustomer({
    tenantId: tenant.id,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
  });

  const { booking, item, payment } = buildBookingBundle({
    tenant,
    service,
    customer,
    staffMemberId: chosenSlot.staffMemberId,
    channel: "web",
    startsAt: input.startsAt,
    notes: input.notes,
  });

  state.bookings.push(booking);
  state.bookingItems.push(item);
  state.payments.push(payment);
  pushNotification({
    tenantId: tenant.id,
    bookingId: booking.id,
    recipient: customer.email,
    status: "queued",
    templateKey: "booking-confirmed",
  });
  state.auditEvents.push({
    id: crypto.randomUUID(),
    tenantId: tenant.id,
    actorLabel: "Public booking page",
    entityType: "booking",
    entityId: booking.id,
    action: "booking.created",
    createdAt: booking.createdAt,
    payload: {
      channel: booking.channel,
      status: booking.status,
      depositRequiredCents: booking.depositRequiredCents,
    },
  });

  return {
    booking,
    items: [item],
    customer,
    payment,
  };
}

export function createAdminBooking(input: AdminBookingDraft): BookingConfirmation {
  const tenant = ensureTenant(input.slug);
  const service = state.services.find((item) => item.id === input.serviceId);

  if (!service) {
    throw new Error(`Service ${input.serviceId} not found`);
  }

  const date = input.startsAt.slice(0, 10);
  const slots = listAvailability({
    date,
    tenant,
    service,
    staffMembers: state.staffMembers,
    availabilityRules: state.availabilityRules,
    blackouts: state.blackouts,
    bookings: state.bookings,
    bookingItems: state.bookingItems,
  });

  if (!hasSlotAvailable(slots, input.startsAt, input.staffMemberId)) {
    throw new Error("Questo buco non è più disponibile.");
  }

  const customer = getOrCreateCustomer({
    tenantId: tenant.id,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
  });

  const { booking, item, payment } = buildBookingBundle({
    tenant,
    service,
    customer,
    staffMemberId: input.staffMemberId,
    channel: "admin",
    startsAt: input.startsAt,
    notes: input.notes,
  });

  state.bookings.push(booking);
  state.bookingItems.push(item);
  state.payments.push(payment);
  pushBookingNotification(booking, "booking-confirmed");
  state.auditEvents.push({
    id: crypto.randomUUID(),
    tenantId: tenant.id,
    actorLabel: "Desktop planning",
    entityType: "booking",
    entityId: booking.id,
    action: "booking.created_admin",
    createdAt: booking.createdAt,
    payload: {
      channel: booking.channel,
      staffMemberId: booking.staffMemberId,
      startsAt: booking.startsAt,
    },
  });

  return {
    booking,
    items: [item],
    customer,
    payment,
  };
}

export function getBookingById(bookingId: string) {
  const booking = state.bookings.find((item) => item.id === bookingId);

  if (!booking) {
    return null;
  }

  const item = state.bookingItems.find((entry) => entry.bookingId === booking.id);
  const customer = state.customers.find((entry) => entry.id === booking.customerId);
  const payment = state.payments.find((entry) => entry.bookingId === booking.id);
  const service = item
    ? state.services.find((entry) => entry.id === item.serviceId)
    : undefined;

  if (!item || !customer || !payment || !service) {
    return null;
  }

  return {
    booking,
    item,
    customer,
    payment,
    service,
    tenant: state.tenant,
  };
}

export function markBookingDepositPaid(bookingId: string, checkoutSessionId?: string) {
  const payment = state.payments.find((entry) => entry.bookingId === bookingId);
  const booking = state.bookings.find((entry) => entry.id === bookingId);

  if (!payment || !booking) {
    return;
  }

  if (booking.status !== "confirmed" && booking.status !== "completed") {
    throw new Error(`Azione finanziaria non disponibile per prenotazioni in stato ${booking.status}.`);
  }

  if (payment.status === "paid") {
    return;
  }

  payment.status = "paid";
  payment.checkoutSessionId = checkoutSessionId;
  payment.updatedAt = new Date().toISOString();
  booking.paymentStatus = "paid";
  booking.depositCollectedCents = booking.depositRequiredCents;
  booking.updatedAt = payment.updatedAt;
}

export function markBookingRefunded(bookingId: string) {
  const payment = state.payments.find((entry) => entry.bookingId === bookingId);
  const booking = state.bookings.find((entry) => entry.id === bookingId);

  if (!payment || !booking) {
    return;
  }

  if (booking.status !== "confirmed" && booking.status !== "completed") {
    throw new Error(`Azione finanziaria non disponibile per prenotazioni in stato ${booking.status}.`);
  }

  if (payment.status !== "paid") {
    return;
  }

  payment.status = "refunded";
  payment.updatedAt = new Date().toISOString();
  booking.paymentStatus = "refunded";
  booking.depositCollectedCents = 0;
  booking.updatedAt = payment.updatedAt;
}

export function updateBookingStatus(
  bookingId: string,
  status: Booking["status"],
  actorLabel = "Desktop admin",
) {
  const booking = state.bookings.find((entry) => entry.id === bookingId);
  if (!booking) {
    throw new Error(`Booking ${bookingId} not found`);
  }

  if (booking.status === status) {
    return;
  }

  booking.status = status;
  booking.updatedAt = new Date().toISOString();
  pushBookingNotification(booking, `booking-${status}`);
  state.auditEvents.push({
    id: crypto.randomUUID(),
    tenantId: booking.tenantId,
    actorLabel,
    entityType: "booking",
    entityId: booking.id,
    action: `booking.${status}`,
    createdAt: booking.updatedAt,
    payload: { status },
  });
}

export function rescheduleBooking(
  bookingId: string,
  startsAt: string,
  staffMemberId: string,
  actorLabel = "Desktop planning",
) {
  const booking = state.bookings.find((entry) => entry.id === bookingId);
  const item = getBookingItem(bookingId);
  const service = getServiceByBookingId(bookingId);

  if (!booking || !item || !service) {
    throw new Error(`Booking ${bookingId} not found`);
  }

  const date = startsAt.slice(0, 10);
  const availableSlots = listAvailability({
    date,
    tenant: state.tenant,
    service,
    staffMembers: state.staffMembers,
    availabilityRules: state.availabilityRules,
    blackouts: state.blackouts,
    bookings: state.bookings.filter((entry) => entry.id !== bookingId),
    bookingItems: state.bookingItems.filter((entry) => entry.bookingId !== bookingId),
  });

  if (!hasSlotAvailable(availableSlots, startsAt, staffMemberId)) {
    throw new Error("Lo slot scelto non è disponibile per lo spostamento.");
  }

  booking.staffMemberId = staffMemberId;
  booking.startsAt = startsAt;
  booking.endsAt = formatISO(addMinutes(parseISO(startsAt), item.durationMinutes));
  booking.updatedAt = new Date().toISOString();
  booking.status = "confirmed";
  pushBookingNotification(booking, "booking-rescheduled");

  state.auditEvents.push({
    id: crypto.randomUUID(),
    tenantId: booking.tenantId,
    actorLabel,
    entityType: "booking",
    entityId: booking.id,
    action: "booking.rescheduled",
    createdAt: booking.updatedAt,
    payload: {
      startsAt: booking.startsAt,
      staffMemberId: booking.staffMemberId,
    },
  });

  return structuredClone(booking);
}

export function getDashboardSnapshot(slug: string): DashboardSnapshot {
  ensureTenant(slug);

  const bookings = state.bookings
    .map((booking) => {
      const customer = state.customers.find((item) => item.id === booking.customerId)!;
      const staff = state.staffMembers.find((item) => item.id === booking.staffMemberId)!;
      const item = state.bookingItems.find((entry) => entry.bookingId === booking.id)!;
      const service = state.services.find((entry) => entry.id === item.serviceId)!;

      return {
        ...booking,
        customerName: customer.fullName,
        staffName: staff.fullName,
        serviceName: service.name,
        serviceId: service.id,
        durationMinutes: item.durationMinutes,
      };
    })
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));

  const now = new Date();
  const revenueTodayCents = state.payments
    .filter(
      (payment) =>
        payment.status === "paid" &&
        parseISO(payment.updatedAt) >= startOfDay(now) &&
        parseISO(payment.updatedAt) <= endOfDay(now),
    )
    .reduce((sum, payment) => sum + payment.amountCents, 0);

  const pendingDepositsCents = state.payments
    .filter((payment) => payment.status === "pending")
    .reduce((sum, payment) => sum + payment.amountCents, 0);

  return {
    tenant: structuredClone(state.tenant),
    locations: structuredClone(state.locations),
    staffMembers: structuredClone(state.staffMembers),
    services: structuredClone(state.services),
    customers: structuredClone(state.customers),
    bookings: structuredClone(bookings),
    availabilityRules: structuredClone(state.availabilityRules),
    blackouts: structuredClone(state.blackouts),
    bookingItems: structuredClone(state.bookingItems),
    payments: structuredClone(state.payments),
    notifications: structuredClone(state.notifications),
    metrics: {
      upcomingBookings: bookings.filter(
        (booking) =>
          parseISO(booking.startsAt) >= now &&
          booking.status !== "completed" &&
          booking.status !== "cancelled" &&
          booking.status !== "no_show",
      ).length,
      revenueTodayCents,
      pendingDepositsCents,
      customerCount: state.customers.length,
    },
  };
}
