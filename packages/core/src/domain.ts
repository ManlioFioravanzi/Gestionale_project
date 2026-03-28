import { z } from "zod";

export const businessProfiles = ["appointments", "rooms", "resources"] as const;
export type BusinessProfile = (typeof businessProfiles)[number];

export const userRoles = ["owner", "manager", "operator"] as const;
export type UserRole = (typeof userRoles)[number];

export const bookingStatuses = [
  "draft",
  "confirmed",
  "checked_in",
  "completed",
  "cancelled",
  "no_show",
] as const;
export type BookingStatus = (typeof bookingStatuses)[number];

export const paymentStatuses = ["pending", "authorized", "paid", "refunded"] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export const bookingChannels = ["admin", "web"] as const;
export type BookingChannel = (typeof bookingChannels)[number];

export const notificationChannels = ["email", "sms", "whatsapp"] as const;
export type NotificationChannel = (typeof notificationChannels)[number];

export interface Tenant {
  id: string;
  businessName: string;
  slug: string;
  timezone: string;
  currency: string;
  locale: string;
  primaryProfile: BusinessProfile;
  enabledProfiles: BusinessProfile[];
  supportEmail: string;
  bookingLeadHours: number;
  bookingIntervalMinutes: number;
  defaultDepositPercentage: number;
}

export interface Location {
  id: string;
  tenantId: string;
  name: string;
  address: string;
  profile: BusinessProfile;
}

export interface StaffMember {
  id: string;
  tenantId: string;
  fullName: string;
  role: UserRole;
  profile: BusinessProfile;
  locationIds: string[];
  accentColor: string;
  active: boolean;
}

export interface Service {
  id: string;
  tenantId: string;
  profile: BusinessProfile;
  locationId: string;
  name: string;
  description: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  priceCents: number;
  depositType: "none" | "percentage" | "fixed";
  depositValue: number;
  onlineEnabled: boolean;
}

export interface Customer {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  phone: string;
  notes?: string;
}

export interface AvailabilityRule {
  id: string;
  tenantId: string;
  locationId: string;
  profile: BusinessProfile;
  weekday: number;
  startMinutes: number;
  endMinutes: number;
  staffMemberId?: string;
}

export interface Blackout {
  id: string;
  tenantId: string;
  locationId: string;
  profile: BusinessProfile;
  date: string;
  startMinutes: number;
  endMinutes: number;
  staffMemberId?: string;
  reason: string;
}

export interface BookingItem {
  id: string;
  bookingId: string;
  serviceId: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  unitPriceCents: number;
}

export interface Booking {
  id: string;
  tenantId: string;
  locationId: string;
  customerId: string;
  staffMemberId: string;
  profile: BusinessProfile;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  channel: BookingChannel;
  startsAt: string;
  endsAt: string;
  notes?: string;
  depositRequiredCents: number;
  depositCollectedCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  tenantId: string;
  bookingId: string;
  provider: "stripe" | "manual";
  status: PaymentStatus;
  amountCents: number;
  checkoutSessionId?: string;
  paymentIntentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationLog {
  id: string;
  tenantId: string;
  bookingId: string;
  channel: NotificationChannel;
  recipient: string;
  status: "queued" | "sent" | "failed";
  templateKey: string;
  sentAt?: string;
}

export interface AuditEvent {
  id: string;
  tenantId: string;
  actorLabel: string;
  entityType: "booking" | "payment" | "tenant";
  entityId: string;
  action: string;
  createdAt: string;
  payload: Record<string, string | number | boolean | null>;
}

export interface BookingDraft {
  slug: string;
  serviceId: string;
  staffMemberId?: string;
  date: string;
  startsAt: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes?: string;
}

export interface AvailabilitySlot {
  startsAt: string;
  endsAt: string;
  staffMemberId: string;
  staffName: string;
}

export interface PublicSettings {
  businessName: string;
  slug: string;
  timezone: string;
  currency: string;
  locale: string;
  leadHours: number;
  depositPercentage: number;
  locations: Array<Pick<Location, "id" | "name" | "address">>;
}

export interface BookingConfirmation {
  booking: Booking;
  items: BookingItem[];
  customer: Customer;
  payment: Payment;
}

export const bookingDraftSchema = z.object({
  serviceId: z.string().min(1),
  staffMemberId: z.string().optional(),
  date: z.string().min(10),
  startsAt: z.string().datetime({ offset: true }),
  customerName: z.string().min(2),
  customerEmail: z.string().email(),
  customerPhone: z.string().min(6),
  notes: z.string().max(500).optional(),
});

export const paymentCheckoutSchema = z.object({
  bookingId: z.string().min(1),
});
