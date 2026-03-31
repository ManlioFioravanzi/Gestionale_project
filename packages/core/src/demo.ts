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

export interface CreateStaffMemberInput {
  slug: string;
  fullName: string;
  role: StaffMember["role"];
  locationIds: string[];
  accentColor?: string;
  profile?: StaffMember["profile"];
  active?: boolean;
}

export interface UpdateStaffMemberInput {
  fullName?: string;
  role?: StaffMember["role"];
  locationIds?: string[];
  accentColor?: string;
  active?: boolean;
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

function shiftOperationalDays(date: Date, offset: number) {
  let candidate = new Date(date);
  const step = offset >= 0 ? 1 : -1;
  let remaining = Math.abs(offset);

  while (remaining > 0) {
    candidate = addDays(candidate, step);

    if (candidate.getDay() !== 0) {
      remaining -= 1;
    }
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
    {
      id: "staff_sofia",
      tenantId: tenant.id,
      fullName: "Sofia Conti",
      role: "operator",
      profile: "appointments",
      locationIds: [locations[0].id],
      accentColor: "#5b6ee1",
      active: true,
    },
    {
      id: "staff_davide",
      tenantId: tenant.id,
      fullName: "Davide Ferri",
      role: "operator",
      profile: "appointments",
      locationIds: [locations[0].id],
      accentColor: "#8b5cf6",
      active: false,
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
    {
      id: "svc_balayage_premium",
      tenantId: tenant.id,
      profile: "appointments",
      locationId: locations[0].id,
      name: "Balayage Premium",
      description: "Schiariture personalizzate, tonalizzazione e styling glow.",
      durationMinutes: 150,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 20,
      priceCents: 16500,
      depositType: "percentage",
      depositValue: 40,
      onlineEnabled: true,
    },
    {
      id: "svc_keratin_recovery",
      tenantId: tenant.id,
      profile: "appointments",
      locationId: locations[0].id,
      name: "Keratin Recovery",
      description: "Trattamento ricostruttivo anti-crespo con finish setoso.",
      durationMinutes: 90,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 10,
      priceCents: 8500,
      depositType: "percentage",
      depositValue: 35,
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
      notes: "Preferisce prodotti senza profumazione intensa.",
    },
    {
      id: "cus_luca",
      tenantId: tenant.id,
      fullName: "Luca Serra",
      email: "luca@example.com",
      phone: "+39 333 222 3333",
    },
    {
      id: "cus_alessia",
      tenantId: tenant.id,
      fullName: "Alessia Ferraro",
      email: "alessia@example.com",
      phone: "+39 333 401 1100",
      notes: "Prima visita dal sito, interessata a un percorso colore stagionale.",
    },
    {
      id: "cus_tommaso",
      tenantId: tenant.id,
      fullName: "Tommaso Rinaldi",
      email: "tommaso@example.com",
      phone: "+39 333 401 2200",
    },
    {
      id: "cus_martina",
      tenantId: tenant.id,
      fullName: "Martina Villa",
      email: "martina@example.com",
      phone: "+39 333 401 3300",
      notes: "Cliente premium, richiede sempre foto prima/dopo.",
    },
    {
      id: "cus_federico",
      tenantId: tenant.id,
      fullName: "Federico Neri",
      email: "federico@example.com",
      phone: "+39 333 401 4400",
    },
    {
      id: "cus_beatrice",
      tenantId: tenant.id,
      fullName: "Beatrice Lombardi",
      email: "beatrice@example.com",
      phone: "+39 333 401 5500",
    },
    {
      id: "cus_valentina",
      tenantId: tenant.id,
      fullName: "Valentina Gallo",
      email: "valentina@example.com",
      phone: "+39 333 401 6600",
    },
    {
      id: "cus_andrea",
      tenantId: tenant.id,
      fullName: "Andrea Fontana",
      email: "andrea@example.com",
      phone: "+39 333 401 7700",
      notes: "Prenota spesso in pausa pranzo, preferisce promemoria email.",
    },
    {
      id: "cus_elisa",
      tenantId: tenant.id,
      fullName: "Elisa Moretti",
      email: "elisa@example.com",
      phone: "+39 333 401 8800",
    },
    {
      id: "cus_riccardo",
      tenantId: tenant.id,
      fullName: "Riccardo Esposito",
      email: "riccardo@example.com",
      phone: "+39 333 401 9900",
    },
    {
      id: "cus_camilla",
      tenantId: tenant.id,
      fullName: "Camilla De Luca",
      email: "camilla@example.com",
      phone: "+39 333 402 0001",
      notes: "Segue piano home-care e acquista spesso trattamenti retail.",
    },
  ];

  const staffScheduleById: Record<string, { startMinutes: number; endMinutes: number }> = {
    staff_elena: { startMinutes: 9 * 60, endMinutes: 18 * 60 },
    staff_marta: { startMinutes: 10 * 60, endMinutes: 19 * 60 },
    staff_sofia: { startMinutes: 11 * 60, endMinutes: 19 * 60 },
  };

  const availabilityRules: AvailabilityRule[] = [];
  for (const weekday of [1, 2, 3, 4, 5, 6]) {
    for (const staff of staffMembers.filter((entry) => entry.active)) {
      const schedule = staffScheduleById[staff.id] ?? {
        startMinutes: 9 * 60,
        endMinutes: 18 * 60,
      };

      availabilityRules.push({
        id: `rule_${staff.id}_${weekday}`,
        tenantId: tenant.id,
        locationId: locations[0].id,
        profile: "appointments",
        weekday,
        startMinutes: schedule.startMinutes,
        endMinutes: schedule.endMinutes,
        staffMemberId: staff.id,
      });
    }
  }

  const baseDate = getNextOperationalDate();
  const currentOperationalDate = shiftOperationalDays(baseDate, -1);
  const recentOperationalDate = shiftOperationalDays(baseDate, -2);
  const historicOperationalDate = shiftOperationalDays(baseDate, -3);
  const archivedOperationalDate = shiftOperationalDays(baseDate, -4);
  const showcaseOperationalDate = shiftOperationalDays(baseDate, 1);
  const premiumOperationalDate = shiftOperationalDays(baseDate, 2);
  const blackouts: Blackout[] = [
    {
      id: "blackout_training",
      tenantId: tenant.id,
      locationId: locations[0].id,
      profile: "appointments",
      date: formatISO(baseDate, { representation: "date" }),
      startMinutes: 13 * 60,
      endMinutes: 14 * 60,
      staffMemberId: "staff_marta",
      reason: "Formazione interna",
    },
    {
      id: "blackout_shooting",
      tenantId: tenant.id,
      locationId: locations[0].id,
      profile: "appointments",
      date: formatISO(showcaseOperationalDate, { representation: "date" }),
      startMinutes: 16 * 60,
      endMinutes: 17 * 60,
      staffMemberId: "staff_elena",
      reason: "Shooting contenuti social",
    },
    {
      id: "blackout_maintenance",
      tenantId: tenant.id,
      locationId: locations[0].id,
      profile: "appointments",
      date: formatISO(premiumOperationalDate, { representation: "date" }),
      startMinutes: 12 * 60,
      endMinutes: 13 * 60,
      reason: "Sanificazione area colore",
    },
  ];

  const servicesById = new Map(services.map((service) => [service.id, service]));
  const customersById = new Map(customers.map((customer) => [customer.id, customer]));

  const seededAppointments: Array<{
    id: string;
    customerId: string;
    staffMemberId: string;
    serviceId: string;
    date: Date;
    startHours: number;
    startMinutes?: number;
    status: Booking["status"];
    paymentStatus: Payment["status"];
    channel: Booking["channel"];
    provider: Payment["provider"];
    notes?: string;
    paymentIntentId?: string;
    checkoutSessionId?: string;
    paymentUpdatedAt?: string;
    notificationStatus?: NotificationLog["status"];
    notificationTemplateKey?: string;
    notificationSentAt?: string;
  }> = [
    {
      id: "book_001",
      customerId: "cus_chiara",
      staffMemberId: "staff_elena",
      serviceId: "svc_signature_cut",
      date: baseDate,
      startHours: 10,
      status: "confirmed",
      paymentStatus: "paid",
      channel: "web",
      provider: "stripe",
      notes: "Preferisce prodotti senza profumazione intensa.",
      paymentIntentId: "pi_demo_001",
      paymentUpdatedAt: seededNow,
      notificationStatus: "sent",
      notificationTemplateKey: "booking-confirmed",
      notificationSentAt: seededNow,
    },
    {
      id: "book_002",
      customerId: "cus_luca",
      staffMemberId: "staff_marta",
      serviceId: "svc_color_ritual",
      date: baseDate,
      startHours: 15,
      status: "confirmed",
      paymentStatus: "pending",
      channel: "admin",
      provider: "manual",
      notes: "Ritoccare tonalità ramata.",
      notificationStatus: "queued",
      notificationTemplateKey: "booking-confirmed",
    },
    {
      id: "book_003",
      customerId: "cus_alessia",
      staffMemberId: "staff_sofia",
      serviceId: "svc_quick_consultation",
      date: baseDate,
      startHours: 11,
      startMinutes: 30,
      status: "confirmed",
      paymentStatus: "paid",
      channel: "web",
      provider: "stripe",
      notes: "Prima visita, valutare percorso trattamenti primavera.",
      paymentIntentId: "pi_demo_003",
      paymentUpdatedAt: seededNow,
      notificationStatus: "sent",
      notificationTemplateKey: "booking-confirmed",
      notificationSentAt: seededNow,
    },
    {
      id: "book_004",
      customerId: "cus_martina",
      staffMemberId: "staff_elena",
      serviceId: "svc_balayage_premium",
      date: showcaseOperationalDate,
      startHours: 9,
      startMinutes: 30,
      status: "confirmed",
      paymentStatus: "pending",
      channel: "web",
      provider: "stripe",
      notes: "Balayage soft con focus luminosità frontale.",
      notificationStatus: "queued",
      notificationTemplateKey: "booking-confirmed",
    },
    {
      id: "book_005",
      customerId: "cus_tommaso",
      staffMemberId: "staff_sofia",
      serviceId: "svc_keratin_recovery",
      date: showcaseOperationalDate,
      startHours: 13,
      startMinutes: 30,
      status: "confirmed",
      paymentStatus: "pending",
      channel: "admin",
      provider: "manual",
      notes: "Capelli sensibilizzati, usare formula delicata.",
      notificationStatus: "queued",
      notificationTemplateKey: "booking-confirmed",
    },
    {
      id: "book_006",
      customerId: "cus_federico",
      staffMemberId: "staff_marta",
      serviceId: "svc_signature_cut",
      date: showcaseOperationalDate,
      startHours: 17,
      status: "confirmed",
      paymentStatus: "pending",
      channel: "admin",
      provider: "manual",
      notes: "Cliente business, preferisce uscire entro le 18:15.",
      notificationStatus: "queued",
      notificationTemplateKey: "booking-confirmed",
    },
    {
      id: "book_007",
      customerId: "cus_beatrice",
      staffMemberId: "staff_elena",
      serviceId: "svc_color_ritual",
      date: premiumOperationalDate,
      startHours: 14,
      status: "confirmed",
      paymentStatus: "pending",
      channel: "web",
      provider: "stripe",
      notes: "Richiesta foto finale per piano contenuti social.",
      notificationStatus: "queued",
      notificationTemplateKey: "booking-confirmed",
    },
    {
      id: "book_008",
      customerId: "cus_valentina",
      staffMemberId: "staff_elena",
      serviceId: "svc_signature_cut",
      date: recentOperationalDate,
      startHours: 9,
      status: "completed",
      paymentStatus: "paid",
      channel: "admin",
      provider: "manual",
      notes: "Rientro post viaggio, styling naturale.",
      paymentUpdatedAt: isoAt(recentOperationalDate, 10, 20),
      notificationStatus: "sent",
      notificationTemplateKey: "booking-completed",
      notificationSentAt: isoAt(recentOperationalDate, 10, 25),
    },
    {
      id: "book_009",
      customerId: "cus_andrea",
      staffMemberId: "staff_marta",
      serviceId: "svc_color_ritual",
      date: currentOperationalDate,
      startHours: 11,
      startMinutes: 30,
      status: "completed",
      paymentStatus: "paid",
      channel: "web",
      provider: "stripe",
      notes: "Aggiunta piega extra volume in check-out.",
      paymentIntentId: "pi_demo_009",
      paymentUpdatedAt: isoAt(currentOperationalDate, 13, 45),
      notificationStatus: "sent",
      notificationTemplateKey: "booking-completed",
      notificationSentAt: isoAt(currentOperationalDate, 13, 50),
    },
    {
      id: "book_010",
      customerId: "cus_elisa",
      staffMemberId: "staff_sofia",
      serviceId: "svc_quick_consultation",
      date: historicOperationalDate,
      startHours: 16,
      status: "no_show",
      paymentStatus: "pending",
      channel: "admin",
      provider: "manual",
      notes: "Non ha risposto al reminder del giorno precedente.",
      notificationStatus: "failed",
      notificationTemplateKey: "booking-reminder",
    },
    {
      id: "book_011",
      customerId: "cus_riccardo",
      staffMemberId: "staff_elena",
      serviceId: "svc_keratin_recovery",
      date: archivedOperationalDate,
      startHours: 14,
      status: "cancelled",
      paymentStatus: "refunded",
      channel: "web",
      provider: "stripe",
      notes: "Annullata per sensibilità cutanea, caparra restituita.",
      paymentIntentId: "pi_demo_011",
      paymentUpdatedAt: isoAt(archivedOperationalDate, 12, 15),
      notificationStatus: "sent",
      notificationTemplateKey: "booking-cancelled",
      notificationSentAt: isoAt(archivedOperationalDate, 12, 20),
    },
    {
      id: "book_012",
      customerId: "cus_camilla",
      staffMemberId: "staff_marta",
      serviceId: "svc_balayage_premium",
      date: shiftOperationalDays(baseDate, -6),
      startHours: 10,
      status: "completed",
      paymentStatus: "paid",
      channel: "web",
      provider: "stripe",
      notes: "Prima seduta premium, upsell maschera ricostruzione.",
      paymentIntentId: "pi_demo_012",
      paymentUpdatedAt: isoAt(shiftOperationalDays(baseDate, -6), 13, 15),
      notificationStatus: "sent",
      notificationTemplateKey: "booking-completed",
      notificationSentAt: isoAt(shiftOperationalDays(baseDate, -6), 13, 20),
    },
  ];

  const bookings: Booking[] = [];
  const bookingItems: BookingItem[] = [];
  const payments: Payment[] = [];
  const notifications: NotificationLog[] = [];

  for (const appointment of seededAppointments) {
    const service = servicesById.get(appointment.serviceId);
    const customer = customersById.get(appointment.customerId);

    if (!service || !customer) {
      throw new Error(`Invalid seeded appointment ${appointment.id}`);
    }

    const startsAt = isoAt(appointment.date, appointment.startHours, appointment.startMinutes ?? 0);
    const endsAt = formatISO(addMinutes(parseISO(startsAt), service.durationMinutes));
    const isFutureBooking = parseISO(startsAt) > new Date();
    const createdAt = isFutureBooking ? seededNow : startsAt;
    const updatedAt = appointment.paymentUpdatedAt ?? createdAt;
    const depositRequiredCents = calculateDepositCents(service, tenant);
    const notificationStatus =
      appointment.notificationStatus ??
      (appointment.paymentStatus === "pending" ? "queued" : "sent");

    bookings.push({
      id: appointment.id,
      tenantId: tenant.id,
      locationId: service.locationId,
      customerId: customer.id,
      staffMemberId: appointment.staffMemberId,
      profile: service.profile,
      status: appointment.status,
      paymentStatus: appointment.paymentStatus,
      channel: appointment.channel,
      startsAt,
      endsAt,
      notes: appointment.notes,
      depositRequiredCents,
      depositCollectedCents: appointment.paymentStatus === "paid" ? depositRequiredCents : 0,
      createdAt,
      updatedAt,
    });

    bookingItems.push({
      id: `item_${appointment.id}`,
      bookingId: appointment.id,
      serviceId: service.id,
      durationMinutes: service.durationMinutes,
      bufferBeforeMinutes: service.bufferBeforeMinutes,
      bufferAfterMinutes: service.bufferAfterMinutes,
      unitPriceCents: service.priceCents,
    });

    payments.push({
      id: `pay_${appointment.id}`,
      tenantId: tenant.id,
      bookingId: appointment.id,
      provider: appointment.provider,
      status: appointment.paymentStatus,
      amountCents: depositRequiredCents,
      checkoutSessionId: appointment.checkoutSessionId,
      paymentIntentId: appointment.paymentIntentId,
      createdAt,
      updatedAt,
    });

    notifications.push({
      id: `notif_${appointment.id}`,
      tenantId: tenant.id,
      bookingId: appointment.id,
      channel: "email",
      recipient: customer.email,
      status: notificationStatus,
      templateKey:
        appointment.notificationTemplateKey ??
        (appointment.status === "confirmed" ? "booking-confirmed" : `booking-${appointment.status}`),
      sentAt:
        notificationStatus === "queued"
          ? undefined
          : (appointment.notificationSentAt ?? updatedAt),
    });
  }

  const auditEvents: AuditEvent[] = [
    {
      id: "audit_001",
      tenantId: tenant.id,
      actorLabel: "System seed",
      entityType: "tenant",
      entityId: tenant.id,
      action: "tenant.created",
      createdAt: isoAt(archivedOperationalDate, 8, 30),
      payload: { profile: tenant.primaryProfile },
    },
    {
      id: "audit_002",
      tenantId: tenant.id,
      actorLabel: "System seed",
      entityType: "tenant",
      entityId: tenant.id,
      action: "seed.crm_imported",
      createdAt: isoAt(historicOperationalDate, 18, 10),
      payload: {
        customers: customers.length,
        services: services.length,
        staffMembers: staffMembers.length,
      },
    },
    {
      id: "audit_003",
      tenantId: tenant.id,
      actorLabel: "System seed",
      entityType: "booking",
      entityId: "book_001",
      action: "booking.seeded",
      createdAt: seededNow,
      payload: {
        channel: "web",
        status: "confirmed",
        depositRequiredCents: 1650,
      },
    },
    {
      id: "audit_004",
      tenantId: tenant.id,
      actorLabel: "System seed",
      entityType: "payment",
      entityId: "pay_book_009",
      action: "payment.reconciled",
      createdAt: isoAt(currentOperationalDate, 18, 20),
      payload: {
        provider: "stripe",
        status: "paid",
        amountCents: 4600,
      },
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

function assertValidStaffName(fullName: string) {
  if (!fullName.trim()) {
    throw new Error("Nome staff obbligatorio.");
  }
}

function assertValidLocationIds(locationIds: string[]) {
  if (locationIds.length === 0) {
    throw new Error("Seleziona almeno una location.");
  }

  for (const locationId of locationIds) {
    const exists = state.locations.some((location) => location.id === locationId);
    if (!exists) {
      throw new Error(`Location ${locationId} non trovata.`);
    }
  }
}

export function createStaffMember(input: CreateStaffMemberInput) {
  const tenant = ensureTenant(input.slug);
  const normalizedName = input.fullName.trim();
  const normalizedLocationIds = [...new Set(input.locationIds.map((entry) => entry.trim()).filter(Boolean))];

  assertValidStaffName(normalizedName);
  assertValidLocationIds(normalizedLocationIds);

  const nextStaff: StaffMember = {
    id: `staff_${crypto.randomUUID().slice(0, 8)}`,
    tenantId: tenant.id,
    fullName: normalizedName,
    role: input.role,
    profile: input.profile ?? tenant.primaryProfile,
    locationIds: normalizedLocationIds,
    accentColor: input.accentColor?.trim() || "#1d4ed8",
    active: input.active ?? true,
  };

  state.staffMembers.push(nextStaff);
  return structuredClone(nextStaff);
}

export function updateStaffMember(staffId: string, input: UpdateStaffMemberInput) {
  const staffMember = state.staffMembers.find((entry) => entry.id === staffId);

  if (!staffMember) {
    throw new Error(`Staff ${staffId} non trovato.`);
  }

  if (input.fullName !== undefined) {
    assertValidStaffName(input.fullName);
    staffMember.fullName = input.fullName.trim();
  }

  if (input.locationIds !== undefined) {
    const normalizedLocationIds = [...new Set(input.locationIds.map((entry) => entry.trim()).filter(Boolean))];
    assertValidLocationIds(normalizedLocationIds);
    staffMember.locationIds = normalizedLocationIds;
  }

  if (input.role !== undefined) {
    staffMember.role = input.role;
  }

  if (input.accentColor !== undefined) {
    staffMember.accentColor = input.accentColor.trim() || staffMember.accentColor;
  }

  if (input.active !== undefined) {
    staffMember.active = input.active;
  }

  return structuredClone(staffMember);
}

export function deleteStaffMember(staffId: string) {
  const staffIndex = state.staffMembers.findIndex((entry) => entry.id === staffId);

  if (staffIndex === -1) {
    throw new Error(`Staff ${staffId} non trovato.`);
  }

  if (state.staffMembers.length === 1) {
    throw new Error("Non puoi eliminare l'ultimo membro staff.");
  }

  const fallbackStaff = state.staffMembers.find((entry) => entry.id !== staffId);
  if (!fallbackStaff) {
    throw new Error("Nessun membro staff disponibile per la riassegnazione.");
  }

  const reassignedAt = new Date().toISOString();
  for (const booking of state.bookings) {
    if (booking.staffMemberId === staffId) {
      booking.staffMemberId = fallbackStaff.id;
      booking.updatedAt = reassignedAt;
    }
  }

  const [removed] = state.staffMembers.splice(staffIndex, 1);
  state.availabilityRules = state.availabilityRules.filter((rule) => rule.staffMemberId !== staffId);
  state.blackouts = state.blackouts.filter((blackout) => blackout.staffMemberId !== staffId);

  return structuredClone(removed);
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
