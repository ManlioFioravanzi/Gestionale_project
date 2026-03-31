import {
  createStaffMember,
  deleteStaffMember,
  getDashboardSnapshot,
  markBookingDepositPaid,
  markBookingRefunded,
  resetDemoState,
  updateStaffMember,
  updateBookingStatus,
} from "@booking/core";
import type { BookingStatus, BusinessProfile, DashboardSnapshot, UserRole } from "@booking/core";
import { startTransition, useDeferredValue, useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { format } from "date-fns";
import {
  Lock,
  MailOpen,
  AlertCircle,
  User,
  Wallet,
  UserPlus,
  Pencil,
  Trash2,
  ShieldCheck,
  Copy,
  Check,
} from "lucide-react";

import { PlanningBoard } from "./planning-board";
import { EmailPlugin } from "./components/email-plugin";
import { Launchpad } from "./components/launchpad";
import { DashboardPerformance } from "./components/dashboard-performance";
import { Sidebar, type SidebarSection } from "./components/sidebar";
import { MetricCard } from "./components/metric-card";
import { DataTable, type ColumnDef } from "./components/data-table";
import { ToastStack, type ToastMessage, type ToastTone } from "./components/toast-stack";
import { PageHeader } from "./components/page-header";
import { StatusBadge, type StatusVariant } from "./components/status-badge";
import { getLanguageFromLocale, translateRoleLabel, translateStatusLabel, type AppLanguage } from "./i18n";
import { desktopThemes, loadUiPreferences, saveUiPreferences, type ThemeMode } from "./theme";

const ACTIVATION_CODE = "12345";
const STAFF_OWNER_CODE = "12345";
const SETTINGS_OWNER_CODE = "12345";

type StaffEditorMode = "create" | "edit";

interface StaffFormState {
  fullName: string;
  role: UserRole;
  locationIds: string;
  accentColor: string;
  active: boolean;
}

type SettingsSectionId =
  | "tema"
  | "generale"
  | "prenotazioni"
  | "notifiche"
  | "pagamenti"
  | "integrazioni"
  | "account";
type DepositMode = "percentage" | "fixed";

interface SettingsDraft {
  themeMode: ThemeMode;
  themeSwatches: Record<ThemeMode, string>;
  tenantName: string;
  publicSlug: string;
  timezone: string;
  locale: string;
  currency: string;
  bookingIntervalMinutes: number;
  bookingLeadHours: number;
  maxAdvanceBookingDays: number;
  cancellationPolicy: string;
  autoConfirmBookings: boolean;
  emailToCustomer: boolean;
  smsToCustomer: boolean;
  emailToStaff: boolean;
  smsToStaff: boolean;
  confirmationMessage: string;
  acceptsCash: boolean;
  acceptsStripe: boolean;
  acceptsOther: boolean;
  depositMode: DepositMode;
  depositValue: number;
  refundPolicy: string;
  stripeConnected: boolean;
  googleCalendarConnected: boolean;
  stripePublishableKey: string;
  stripeSecretKey: string;
  googleCalendarApiKey: string;
  adminEmail: string;
  newPassword: string;
  confirmPassword: string;
  staffRoles: Record<string, UserRole>;
}

function getLocalizedSettingsDefaults(language: AppLanguage) {
  if (language === "en") {
    return {
      cancellationPolicy: "Free cancellation up to 24 hours before the appointment.",
      confirmationMessage:
        "Your booking is confirmed. We look forward to seeing you at the selected time. Reply to this email for any change.",
      refundPolicy:
        "Full refund up to 24 hours before the appointment. After that threshold the deposit is non-refundable.",
    };
  }

  return {
    cancellationPolicy: "Cancellazione gratuita fino a 24 ore prima dell'appuntamento.",
    confirmationMessage:
      "La tua prenotazione è confermata. Ti aspettiamo all'orario selezionato. Per modifiche rispondi a questa email.",
    refundPolicy:
      "Rimborso completo entro 24 ore prima dell'appuntamento. Oltre questa soglia la caparra non è rimborsabile.",
  };
}

function normalizeHex(hex: string) {
  const cleaned = hex.trim().replace("#", "");
  if (cleaned.length !== 6) {
    return "#2563eb";
  }
  return `#${cleaned.toLowerCase()}`;
}

const READABLE_NEAR_BLACK = "#0b1426";
const READABLE_NEAR_WHITE = "#f8fbff";

function hexToRgb(hex: string) {
  const normalized = normalizeHex(hex);
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixHex(baseHex: string, targetHex: string, weight: number) {
  const base = hexToRgb(baseHex);
  const target = hexToRgb(targetHex);
  const ratio = Math.max(0, Math.min(1, weight));

  return rgbToHex(
    base.r + (target.r - base.r) * ratio,
    base.g + (target.g - base.g) * ratio,
    base.b + (target.b - base.b) * ratio,
  );
}

function toRgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

function blendHex(overlayHex: string, baseHex: string, alpha: number) {
  const overlay = hexToRgb(overlayHex);
  const base = hexToRgb(baseHex);
  const ratio = Math.max(0, Math.min(1, alpha));

  return rgbToHex(
    overlay.r * ratio + base.r * (1 - ratio),
    overlay.g * ratio + base.g * (1 - ratio),
    overlay.b * ratio + base.b * (1 - ratio),
  );
}

function getComplementaryHex(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(255 - r, 255 - g, 255 - b);
}

function getContrastText(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const channels = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const relativeLuminance =
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];

  return relativeLuminance > 0.5 ? READABLE_NEAR_BLACK : READABLE_NEAR_WHITE;
}

function getReadableAccentText(hex: string) {
  const normalized = normalizeHex(hex);
  return getContrastText(normalized) === READABLE_NEAR_BLACK
    ? mixHex(normalized, READABLE_NEAR_BLACK, 0.62)
    : normalized;
}

function getSettingsSections(language: AppLanguage) {
  if (language === "en") {
    return [
      { id: "tema" as const, label: "Theme" },
      { id: "generale" as const, label: "General" },
      { id: "prenotazioni" as const, label: "Bookings" },
      { id: "notifiche" as const, label: "Notifications" },
      { id: "pagamenti" as const, label: "Payments" },
      { id: "integrazioni" as const, label: "Integrations" },
      { id: "account" as const, label: "Account & access" },
    ];
  }

  return [
    { id: "tema" as const, label: "Tema" },
    { id: "generale" as const, label: "Generale" },
    { id: "prenotazioni" as const, label: "Prenotazioni" },
    { id: "notifiche" as const, label: "Notifiche" },
    { id: "pagamenti" as const, label: "Pagamenti" },
    { id: "integrazioni" as const, label: "Integrazioni" },
    { id: "account" as const, label: "Account e accesso" },
  ];
}

function buildSettingsDraft(snapshot: DashboardSnapshot): SettingsDraft {
  const uiPreferences = loadUiPreferences();
  const defaults = getLocalizedSettingsDefaults(getLanguageFromLocale(uiPreferences.locale));
  const staffRoles = Object.fromEntries(
    snapshot.staffMembers.map((staffMember) => [staffMember.id, staffMember.role]),
  );

  return {
    themeMode: uiPreferences.themeMode,
    themeSwatches: uiPreferences.themeSwatches,
    tenantName: snapshot.tenant.businessName,
    publicSlug: snapshot.tenant.slug,
    timezone: snapshot.tenant.timezone,
    locale: uiPreferences.locale,
    currency: snapshot.tenant.currency,
    bookingIntervalMinutes: snapshot.tenant.bookingIntervalMinutes,
    bookingLeadHours: snapshot.tenant.bookingLeadHours,
    maxAdvanceBookingDays: 60,
    cancellationPolicy: defaults.cancellationPolicy,
    autoConfirmBookings: true,
    emailToCustomer: true,
    smsToCustomer: false,
    emailToStaff: true,
    smsToStaff: false,
    confirmationMessage: defaults.confirmationMessage,
    acceptsCash: true,
    acceptsStripe: true,
    acceptsOther: false,
    depositMode: "percentage",
    depositValue: snapshot.tenant.defaultDepositPercentage,
    refundPolicy: defaults.refundPolicy,
    stripeConnected: true,
    googleCalendarConnected: false,
    stripePublishableKey: "pk_live_beehive_xxxxxxxxxxxx_42fa",
    stripeSecretKey: "sk_live_beehive_xxxxxxxxxxxx_87bc",
    googleCalendarApiKey: "gcal_live_beehive_xxxxxxxxxx_91dd",
    adminEmail: "owner@beehive.example",
    newPassword: "",
    confirmPassword: "",
    staffRoles,
  };
}

function maskSecret(secret: string) {
  if (!secret) {
    return "";
  }

  if (secret.length <= 8) {
    return "••••••••";
  }

  return `${secret.slice(0, 4)}••••••${secret.slice(-4)}`;
}

function getSectionMeta(language: AppLanguage): Record<SidebarSection, { title: string; description: string }> {
  if (language === "en") {
    return {
      dashboard: {
        title: "Dashboard",
        description:
          "Monitor the day, payment flows, and the tenant's overall state from one workspace.",
      },
      planning: {
        title: "Daily planning",
        description:
          "Organize staff schedules in a vertical timeline, spot open gaps, and reschedule quickly.",
      },
      bookings: {
        title: "Bookings",
        description:
          "Manage statuses, deposits, and operational actions across confirmed or recovery bookings.",
      },
      customers: {
        title: "Customers CRM",
        description: "Browse active customer records and keep contacts and relationship history aligned.",
      },
      services: {
        title: "Service catalog",
        description: "Monitor duration, pricing, and online setup for appointments services.",
      },
      staff: {
        title: "Team & shifts",
        description: "Review the active team and operational coverage across enabled locations.",
      },
      payments: {
        title: "Payments ledger",
        description: "Track deposits, manual collections, and Stripe movements with per-booking clarity.",
      },
      notifications: {
        title: "Notifications",
        description: "Track transactional communication delivery and quickly spot failed sends.",
      },
      email: {
        title: "Email",
        description: "Read and reply to customer email directly from the desktop app, with Gmail support.",
      },
      settings: {
        title: "Tenant settings",
        description: "Manage visual identity, language, and operational configuration from one control surface.",
      },
    };
  }

  return {
    dashboard: {
      title: "Dashboard",
      description:
        "Controlla la giornata, i flussi di pagamento e lo stato generale del tenant da un unico workspace.",
    },
    planning: {
      title: "Planning giornaliero",
      description:
        "Organizza il calendario staff con una vista verticale, individua le buche libere e riprogramma rapidamente.",
    },
    bookings: {
      title: "Prenotazioni",
      description:
        "Gestisci stati, caparre e movimenti operativi sulle prenotazioni confermate o da recuperare.",
    },
    customers: {
      title: "Clienti CRM",
      description: "Consulta le schede cliente attive e mantieni allineati contatti e storico relazionale.",
    },
    services: {
      title: "Catalogo servizi",
      description: "Monitora durata, pricing e configurazione dei servizi online per il profilo appointments.",
    },
    staff: {
      title: "Organico e turni",
      description: "Verifica il team attivo sul tenant e la copertura operativa sulle location abilitate.",
    },
    payments: {
      title: "Ledger pagamenti",
      description: "Segui caparre, incassi manuali e movimenti Stripe con uno stato leggibile per singola prenotazione.",
    },
    notifications: {
      title: "Notifiche",
      description: "Controlla l'invio delle comunicazioni transazionali e individua rapidamente eventuali errori.",
    },
    email: {
      title: "Email",
      description: "Leggi e rispondi alle email dei clienti direttamente dal gestionale, con supporto Gmail.",
    },
    settings: {
      title: "Impostazioni tenant",
      description: "Verifica configurazione base, profilo attivo e readiness delle feature pianificate per le prossime fasi.",
    },
  };
}

function currency(cents: number, snapshot: DashboardSnapshot, locale = snapshot.tenant.locale) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: snapshot.tenant.currency,
  }).format(cents / 100);
}

function formatBookingMoment(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCompactBookingMoment(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getNextActiveBooking(snapshot: DashboardSnapshot) {
  return (
    [...snapshot.bookings]
      .filter(
        (booking) =>
          booking.status !== "completed" &&
          booking.status !== "cancelled" &&
          booking.status !== "no_show",
      )
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt))[0] ?? null
  );
}

function getFinancialActionState(
  booking: DashboardSnapshot["bookings"][number],
  language: AppLanguage,
) {
  const financeAllowed = booking.status === "confirmed" || booking.status === "completed";
  const blockedStatusReason =
    language === "en"
      ? `Action unavailable for bookings in ${translateStatusLabel(booking.status, language)} status.`
      : `Azione non disponibile per prenotazioni in stato ${translateStatusLabel(booking.status, language)}.`;

  return {
    collectDisabled:
      !financeAllowed || booking.paymentStatus === "paid" || booking.paymentStatus === "refunded",
    collectReason: !financeAllowed
      ? blockedStatusReason
      : booking.paymentStatus === "paid"
        ? language === "en"
          ? "Deposit already collected."
          : "Caparra già incassata."
        : booking.paymentStatus === "refunded"
          ? language === "en"
            ? "Deposit already refunded."
            : "Caparra già rimborsata."
          : undefined,
    refundDisabled: !financeAllowed || booking.paymentStatus !== "paid",
    refundReason: !financeAllowed
      ? blockedStatusReason
      : booking.paymentStatus !== "paid"
        ? language === "en"
          ? "No collected deposit available to refund."
          : "Nessuna caparra incassata da rimborsare."
        : undefined,
  };
}

function mapStatusToBadge(status: string): StatusVariant {
  switch (status) {
    case "confirmed":
    case "completed":
    case "paid":
    case "sent":
      return "success";
    case "pending":
    case "queued":
      return "warning";
    case "cancelled":
    case "no_show":
    case "failed":
      return "error";
    case "refunded":
      return "info";
    default:
      return "neutral";
  }
}

export default function App() {
  const [section, setSection] = useState<SidebarSection>("dashboard");
  const [search, setSearch] = useState("");
  const [snapshot, setSnapshot] = useState(() => getDashboardSnapshot("studio-aurora"));
  const [plannerVersion, setPlannerVersion] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<BusinessProfile | null>(null);
  const [activationCode, setActivationCode] = useState("");
  const [activationError, setActivationError] = useState<string | null>(null);
  const [isActivated, setIsActivated] = useState(false);
  const [staffAccessGranted, setStaffAccessGranted] = useState(false);
  const [staffAccessCode, setStaffAccessCode] = useState("");
  const [staffAccessError, setStaffAccessError] = useState<string | null>(null);
  const [staffEditorMode, setStaffEditorMode] = useState<StaffEditorMode | null>(null);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffFormError, setStaffFormError] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState<StaffFormState>({
    fullName: "",
    role: "operator",
    locationIds: "",
    accentColor: "#1d4ed8",
    active: true,
  });
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>("tema");
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(() =>
    buildSettingsDraft(getDashboardSnapshot("studio-aurora")),
  );
  const [confirmedUiPreferences, setConfirmedUiPreferences] = useState(() => loadUiPreferences());
  const [previewUiPreferences, setPreviewUiPreferences] = useState(() => loadUiPreferences());
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsAccessGranted, setSettingsAccessGranted] = useState(false);
  const [settingsAccessCode, setSettingsAccessCode] = useState("");
  const [settingsAccessError, setSettingsAccessError] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState<"stripePublishableKey" | "stripeSecretKey" | "googleCalendarApiKey" | null>(null);
  const deferredSearch = useDeferredValue(search.toLowerCase());
  const appUnlocked = selectedProfile === "appointments" && isActivated;
  const appLanguage = getLanguageFromLocale(previewUiPreferences.locale);
  const settingsSections = getSettingsSections(appLanguage);
  const sectionMeta = getSectionMeta(appLanguage);
  const theme = desktopThemes[previewUiPreferences.themeMode];
  const liveAccentColor =
    previewUiPreferences.themeSwatches[previewUiPreferences.themeMode] ??
    theme.preview[1];
  const hasPendingUiPreview =
    settingsDraft.themeMode !== confirmedUiPreferences.themeMode ||
    settingsDraft.locale !== confirmedUiPreferences.locale ||
    settingsDraft.themeSwatches[settingsDraft.themeMode] !==
      confirmedUiPreferences.themeSwatches[settingsDraft.themeMode];
  const isEnglish = appLanguage === "en";

  useEffect(() => {
    document.documentElement.lang = isEnglish ? "en" : "it";
    document.body.dataset.theme = previewUiPreferences.themeMode;
    document.body.dataset.appShell = "desktop";

    for (const [key, value] of Object.entries(theme.cssVars)) {
      document.documentElement.style.setProperty(key, value);
    }

    const accentColor = normalizeHex(liveAccentColor);
    const shellColor = normalizeHex(theme.cssVars["--app-shell-bg"] ?? "#f8fafc");
    const surfaceColor = normalizeHex(theme.cssVars["--app-surface"] ?? "#ffffff");
    const accentContrast = getContrastText(accentColor);
    const accentReadable = getReadableAccentText(accentColor);
    const sidebarColor = mixHex(accentColor, "#0f172a", 0.18);
    const sidebarText = getContrastText(sidebarColor);
    const sidebarMuted = toRgba(sidebarText, 0.72);
    const accentSoft = toRgba(accentColor, 0.14);
    const accentSoftStrong = toRgba(accentColor, 0.22);
    const accentSoftText = getContrastText(blendHex(accentColor, shellColor, 0.22));
    const accentHover = mixHex(accentColor, "#000000", 0.18);
    const primaryButtonDisabledBg = mixHex(accentColor, shellColor, 0.55);
    const primaryButtonDisabledText = getContrastText(primaryButtonDisabledBg);
    const complement = getComplementaryHex(accentColor);
    const secondaryColor = mixHex(complement, "#f59e0b", 0.5);
    const secondaryContrast = getContrastText(secondaryColor);
    const secondaryReadable = getReadableAccentText(secondaryColor);
    const secondarySoft = toRgba(secondaryColor, 0.2);
    const secondarySoftText = getContrastText(blendHex(secondaryColor, shellColor, 0.2));
    const stripStart = mixHex(accentColor, "#0f172a", 0.34);
    const stripEnd = mixHex(accentColor, "#ffffff", 0.3);
    const stripMid = mixHex(stripStart, stripEnd, 0.52);
    const stripText = getContrastText(stripMid);
    const contentText = getContrastText(shellColor);
    const contentMuted = toRgba(contentText, 0.72);
    const contentHeading = getContrastText(surfaceColor);
    const neutralBadgeBg = mixHex(surfaceColor, contentText, 0.1);
    const neutralBadgeText = getContrastText(neutralBadgeBg);
    const neutralBadgeBorder = mixHex(surfaceColor, contentText, 0.22);
    const successBadgeBg = "#dcfce7";
    const errorBadgeBg = "#ffe4e6";

    document.documentElement.style.setProperty("--app-content-text", contentText);
    document.documentElement.style.setProperty("--app-content-muted", contentMuted);
    document.documentElement.style.setProperty("--app-content-heading", contentHeading);
    document.documentElement.style.setProperty("--app-sidebar-bg", sidebarColor);
    document.documentElement.style.setProperty("--app-sidebar-text", sidebarText);
    document.documentElement.style.setProperty("--app-sidebar-muted", sidebarMuted);
    document.documentElement.style.setProperty("--app-sidebar-hover-bg", toRgba(sidebarText, 0.12));
    document.documentElement.style.setProperty("--app-sidebar-active-bg", toRgba(sidebarText, 0.2));
    document.documentElement.style.setProperty("--app-sidebar-border", toRgba(sidebarText, 0.18));
    document.documentElement.style.setProperty("--app-sidebar-surface", toRgba(sidebarText, 0.12));
    document.documentElement.style.setProperty("--app-sidebar-notification-text", accentContrast);
    document.documentElement.style.setProperty("--app-accent", accentColor);
    document.documentElement.style.setProperty("--app-accent-readable", accentReadable);
    document.documentElement.style.setProperty("--app-accent-soft", accentSoft);
    document.documentElement.style.setProperty("--app-accent-soft-strong", accentSoftStrong);
    document.documentElement.style.setProperty("--app-accent-soft-text", accentSoftText);
    document.documentElement.style.setProperty("--app-accent-contrast", accentContrast);
    document.documentElement.style.setProperty("--app-secondary", secondaryColor);
    document.documentElement.style.setProperty("--app-secondary-readable", secondaryReadable);
    document.documentElement.style.setProperty("--app-secondary-soft", secondarySoft);
    document.documentElement.style.setProperty("--app-secondary-soft-text", secondarySoftText);
    document.documentElement.style.setProperty("--app-secondary-contrast", secondaryContrast);
    document.documentElement.style.setProperty(
      "--app-top-strip-bg",
      `linear-gradient(135deg, ${stripStart} 0%, ${accentColor} 56%, ${stripEnd} 100%)`,
    );
    document.documentElement.style.setProperty("--app-top-strip-text", stripText);
    document.documentElement.style.setProperty("--app-top-strip-muted", toRgba(stripText, 0.72));
    document.documentElement.style.setProperty("--app-primary-button-bg", accentColor);
    document.documentElement.style.setProperty("--app-primary-button-hover", accentHover);
    document.documentElement.style.setProperty("--app-primary-button-text", accentContrast);
    document.documentElement.style.setProperty("--app-primary-button-disabled-bg", primaryButtonDisabledBg);
    document.documentElement.style.setProperty("--app-primary-button-disabled-text", primaryButtonDisabledText);
    document.documentElement.style.setProperty("--app-status-info-bg", accentSoftStrong);
    document.documentElement.style.setProperty("--app-status-info-text", accentSoftText);
    document.documentElement.style.setProperty("--app-status-info-border", toRgba(accentColor, 0.36));
    document.documentElement.style.setProperty("--app-status-warning-bg", secondarySoft);
    document.documentElement.style.setProperty("--app-status-warning-text", secondarySoftText);
    document.documentElement.style.setProperty("--app-status-warning-border", toRgba(secondaryColor, 0.36));
    document.documentElement.style.setProperty("--app-status-neutral-bg", neutralBadgeBg);
    document.documentElement.style.setProperty("--app-status-neutral-text", neutralBadgeText);
    document.documentElement.style.setProperty("--app-status-neutral-border", neutralBadgeBorder);
    document.documentElement.style.setProperty("--app-status-success-bg", successBadgeBg);
    document.documentElement.style.setProperty("--app-status-success-text", getContrastText(successBadgeBg));
    document.documentElement.style.setProperty("--app-status-success-border", "#a7f3d0");
    document.documentElement.style.setProperty("--app-status-error-bg", errorBadgeBg);
    document.documentElement.style.setProperty("--app-status-error-text", getContrastText(errorBadgeBg));
    document.documentElement.style.setProperty("--app-status-error-border", "#fecdd3");
  }, [isEnglish, previewUiPreferences.themeMode, theme.cssVars, liveAccentColor]);

  function notify(tone: ToastTone, text: string) {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, tone, text }]);
    window.setTimeout(() => {
      dismissToast(id);
    }, 4000);
  }

  function dismissToast(id: string) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function resetSettingsState(nextSnapshot: DashboardSnapshot) {
    const nextDraft = buildSettingsDraft(nextSnapshot);
    setSettingsDraft(nextDraft);
    setPreviewUiPreferences({
      locale: nextDraft.locale,
      themeMode: nextDraft.themeMode,
      themeSwatches: nextDraft.themeSwatches,
    });
    setConfirmedUiPreferences(loadUiPreferences());
    setSettingsDirty(false);
    setSettingsSaving(false);
    setCopiedSecret(null);
    setSettingsSection("tema");
    setSettingsAccessGranted(false);
    setSettingsAccessCode("");
    setSettingsAccessError(null);
  }

  function resetSettingsAccessGate() {
    setSettingsAccessGranted(false);
    setSettingsAccessCode("");
    setSettingsAccessError(null);
  }

  function updateSettingsField<Key extends keyof SettingsDraft>(key: Key, value: SettingsDraft[Key]) {
    setSettingsDraft((current) => ({ ...current, [key]: value }));
    setSettingsDirty(true);
  }

  function handleThemeCardSelect(nextMode: ThemeMode) {
    setSettingsDraft((current) => ({
      ...current,
      themeMode: nextMode,
    }));
    setPreviewUiPreferences((current) => ({
      ...current,
      themeMode: nextMode,
    }));
    setSettingsDirty(true);
  }

  function handleThemeSwatchSelect(themeMode: ThemeMode, swatchHex: string) {
    setSettingsDraft((current) => ({
      ...current,
      themeMode,
      themeSwatches: {
        ...current.themeSwatches,
        [themeMode]: swatchHex,
      },
    }));
    setPreviewUiPreferences((current) => ({
      ...current,
      themeMode,
      themeSwatches: {
        ...current.themeSwatches,
        [themeMode]: swatchHex,
      },
    }));
    setSettingsDirty(true);
  }

  function discardSettingsChanges() {
    const nextDraft = buildSettingsDraft(snapshot);
    setSettingsDraft(nextDraft);
    setPreviewUiPreferences({
      locale: nextDraft.locale,
      themeMode: nextDraft.themeMode,
      themeSwatches: nextDraft.themeSwatches,
    });
    setCopiedSecret(null);
    setSettingsDirty(false);
    notify(
      "info",
      isEnglish ? "Unsaved changes discarded." : "Modifiche non salvate annullate.",
    );
  }

  function restoreConfirmedUiPreferences() {
    setPreviewUiPreferences(confirmedUiPreferences);
    setSettingsDraft((current) => ({
      ...current,
      themeMode: confirmedUiPreferences.themeMode,
      locale: confirmedUiPreferences.locale,
      themeSwatches: confirmedUiPreferences.themeSwatches,
    }));
    setSettingsDirty(false);
  }

  function handleLocaleChange(nextLocale: string) {
    const nextLanguage = getLanguageFromLocale(nextLocale);
    const previousDefaults = getLocalizedSettingsDefaults(appLanguage);
    const nextDefaults = getLocalizedSettingsDefaults(nextLanguage);

    setSettingsDraft((current) => ({
      ...current,
      locale: nextLocale,
      themeSwatches: current.themeSwatches,
      cancellationPolicy:
        current.cancellationPolicy === previousDefaults.cancellationPolicy
          ? nextDefaults.cancellationPolicy
          : current.cancellationPolicy,
      confirmationMessage:
        current.confirmationMessage === previousDefaults.confirmationMessage
          ? nextDefaults.confirmationMessage
          : current.confirmationMessage,
      refundPolicy:
        current.refundPolicy === previousDefaults.refundPolicy
          ? nextDefaults.refundPolicy
          : current.refundPolicy,
    }));
    setPreviewUiPreferences((current) => ({
      ...current,
      locale: nextLocale,
    }));
    setSettingsDirty(true);
  }

  function updateStaffRoleSetting(staffId: string, role: UserRole) {
    setSettingsDraft((current) => ({
      ...current,
      staffRoles: {
        ...current.staffRoles,
        [staffId]: role,
      },
    }));
    setSettingsDirty(true);
  }

  async function copySecretValue(
    key: "stripePublishableKey" | "stripeSecretKey" | "googleCalendarApiKey",
  ) {
    try {
      await navigator.clipboard.writeText(settingsDraft[key]);
      setCopiedSecret(key);
      notify("success", isEnglish ? "Key copied to clipboard." : "Chiave copiata negli appunti.");
      window.setTimeout(() => setCopiedSecret(null), 1600);
    } catch {
      notify(
        "error",
        isEnglish
          ? "Unable to copy the key. Check clipboard permissions."
          : "Impossibile copiare la chiave. Verifica i permessi clipboard.",
      );
    }
  }

  function saveSettingsChanges() {
    if (settingsSaving) {
      return;
    }

    if (!settingsDraft.acceptsCash && !settingsDraft.acceptsStripe && !settingsDraft.acceptsOther) {
      setSettingsSection("pagamenti");
      notify(
        "error",
        isEnglish
          ? "Select at least one accepted payment method."
          : "Seleziona almeno un metodo di pagamento accettato.",
      );
      return;
    }

    if (
      settingsDraft.newPassword &&
      settingsDraft.newPassword.trim() !== settingsDraft.confirmPassword.trim()
    ) {
      setSettingsSection("account");
      notify(
        "error",
        isEnglish ? "Password confirmation does not match." : "La conferma password non coincide.",
      );
      return;
    }

    setSettingsSaving(true);

    try {
      let rolesChanged = false;

      for (const staffMember of snapshot.staffMembers) {
        const desiredRole = settingsDraft.staffRoles[staffMember.id] ?? staffMember.role;
        if (desiredRole !== staffMember.role) {
          updateStaffMember(staffMember.id, { role: desiredRole });
          rolesChanged = true;
        }
      }

      if (rolesChanged) {
        const nextSnapshot = getDashboardSnapshot("studio-aurora");
        setSnapshot(nextSnapshot);
        setSettingsDraft((current) => ({
          ...current,
          staffRoles: Object.fromEntries(
            nextSnapshot.staffMembers.map((staffMember) => [staffMember.id, staffMember.role]),
          ),
          newPassword: "",
          confirmPassword: "",
        }));
      } else {
        setSettingsDraft((current) => ({
          ...current,
          newPassword: "",
          confirmPassword: "",
        }));
      }

      saveUiPreferences({
        locale: settingsDraft.locale,
        themeMode: settingsDraft.themeMode,
        themeSwatches: settingsDraft.themeSwatches,
      });
      setConfirmedUiPreferences({
        locale: settingsDraft.locale,
        themeMode: settingsDraft.themeMode,
        themeSwatches: settingsDraft.themeSwatches,
      });
      setPreviewUiPreferences({
        locale: settingsDraft.locale,
        themeMode: settingsDraft.themeMode,
        themeSwatches: settingsDraft.themeSwatches,
      });
      setSettingsDirty(false);
      notify(
        "success",
        isEnglish ? "Settings saved successfully." : "Impostazioni salvate correttamente.",
      );
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : isEnglish
            ? "Error while saving settings."
            : "Errore durante il salvataggio delle impostazioni.",
      );
    } finally {
      setSettingsSaving(false);
    }
  }

  function resetStaffAccessState() {
    setStaffAccessGranted(false);
    setStaffAccessCode("");
    setStaffAccessError(null);
    setStaffEditorMode(null);
    setEditingStaffId(null);
    setStaffFormError(null);
  }

  function handleProfileSelect(profile: BusinessProfile) {
    const nextSnapshot = getDashboardSnapshot("studio-aurora");
    setSelectedProfile(profile);
    setActivationCode("");
    setActivationError(null);
    setIsActivated(false);
    setSnapshot(nextSnapshot);
    resetSettingsState(nextSnapshot);
    resetStaffAccessState();
    notify(
      "info",
      isEnglish
        ? `${translateStatusLabel(profile, appLanguage)} profile selected. Enter the activation code.`
        : `Profilo ${profile} selezionato. Inserisci il codice di attivazione.`,
    );
  }

  function handleReturnToProfileSelection() {
    const nextSnapshot = getDashboardSnapshot("studio-aurora");
    setSection("dashboard");
    setSearch("");
    setSelectedProfile(null);
    setActivationCode("");
    setActivationError(null);
    setIsActivated(false);
    setSnapshot(nextSnapshot);
    resetSettingsState(nextSnapshot);
    resetStaffAccessState();
    notify("info", isEnglish ? "Returned to profile selection." : "Ritorno alla selezione profilo.");
  }

  function handleSectionSelect(nextSection: SidebarSection) {
    if (section === "settings" && nextSection !== "settings") {
      restoreConfirmedUiPreferences();
    }

    startTransition(() => setSection(nextSection));
    if (nextSection !== "staff") {
      resetStaffAccessState();
    }
    if (nextSection !== "settings") {
      resetSettingsAccessGate();
    }
    if (nextSection === "settings") {
      setSettingsDraft((current) => ({
        ...current,
        staffRoles: {
          ...current.staffRoles,
          ...Object.fromEntries(snapshot.staffMembers.map((staffMember) => [staffMember.id, staffMember.role])),
        },
      }));
    }
  }

  function submitSettingsAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (settingsAccessCode.trim() !== SETTINGS_OWNER_CODE) {
      const message = isEnglish ? "Invalid owner code." : "Codice proprietario non valido.";
      setSettingsAccessError(message);
      notify("error", message);
      return;
    }

    setSettingsAccessGranted(true);
    setSettingsAccessCode("");
    setSettingsAccessError(null);
    notify(
      "success",
      isEnglish
        ? "Owner access enabled for Settings."
        : "Accesso proprietario alla sezione Impostazioni abilitato.",
    );
  }

  function handleActivationSubmit() {
    if (!selectedProfile) {
      setActivationError(isEnglish ? "Select a profile first." : "Seleziona prima un profilo.");
      setIsActivated(false);
      return;
    }

    if (activationCode.trim() !== ACTIVATION_CODE) {
      setActivationError(
        isEnglish
          ? "Invalid activation code. Try again with the correct code."
          : "Codice di attivazione non valido. Riprova con il codice corretto.",
      );
      setIsActivated(false);
      notify("error", isEnglish ? "Invalid activation code." : "Codice di attivazione non valido.");
      return;
    }

    if (selectedProfile !== "appointments") {
      setActivationError(
        isEnglish
          ? `${translateStatusLabel(selectedProfile, appLanguage)} is not active yet. Use Appointments to enter BeeHive.`
          : `Il profilo ${selectedProfile} non e ancora attivo. Usa Appointments per entrare in BeeHive.`,
      );
      setIsActivated(false);
      notify(
        "warning",
        isEnglish
          ? `${translateStatusLabel(selectedProfile, appLanguage)} profile is not available yet.`
          : `Profilo ${selectedProfile} non ancora disponibile.`,
      );
      return;
    }

    setActivationError(null);
    setIsActivated(true);
    notify(
      "success",
      isEnglish
        ? "Appointments profile activated. Access to the management app completed."
        : "Profilo Appointments attivato. Accesso al gestionale completato.",
    );
  }

  function refresh(options?: {
    previousSnapshot?: DashboardSnapshot;
    toast?: { tone: ToastTone; text: string };
    announceNextAppointmentChange?: boolean;
  }) {
    const nextSnapshot = getDashboardSnapshot("studio-aurora");
    setSnapshot(nextSnapshot);

    if (options?.toast) {
      notify(options.toast.tone, options.toast.text);
    }

    if (options?.announceNextAppointmentChange && options.previousSnapshot) {
      const previousNext = getNextActiveBooking(options.previousSnapshot);
      const currentNext = getNextActiveBooking(nextSnapshot);

      if (previousNext?.id !== currentNext?.id) {
        notify("info", isEnglish ? "Next booking updated." : "Prossimo appuntamento aggiornato.");
      }
    }

    return nextSnapshot;
  }

  function mutateBooking(bookingId: string, status: BookingStatus) {
    const previousSnapshot = snapshot;
    updateBookingStatus(bookingId, status);
    refresh({
      previousSnapshot,
      announceNextAppointmentChange: true,
      toast: {
        tone: "success",
        text: isEnglish
          ? `Booking updated to ${translateStatusLabel(status, appLanguage)}.`
          : `Prenotazione aggiornata in stato ${translateStatusLabel(status, appLanguage)}.`,
      },
    });
  }

  function openCreateStaffEditor() {
    setStaffEditorMode("create");
    setEditingStaffId(null);
    setStaffFormError(null);
    setStaffForm({
      fullName: "",
      role: "operator",
      locationIds: snapshot.locations[0]?.id ?? "",
      accentColor: "#1d4ed8",
      active: true,
    });
  }

  function openEditStaffEditor(staffMember: DashboardSnapshot["staffMembers"][number]) {
    setStaffEditorMode("edit");
    setEditingStaffId(staffMember.id);
    setStaffFormError(null);
    setStaffForm({
      fullName: staffMember.fullName,
      role: staffMember.role,
      locationIds: staffMember.locationIds.join(", "),
      accentColor: staffMember.accentColor,
      active: staffMember.active,
    });
  }

  function closeStaffEditor() {
    setStaffEditorMode(null);
    setEditingStaffId(null);
    setStaffFormError(null);
  }

  function submitStaffAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (staffAccessCode.trim() !== STAFF_OWNER_CODE) {
      const message = isEnglish ? "Invalid owner code." : "Codice proprietario non valido.";
      setStaffAccessError(message);
      notify("error", message);
      return;
    }

    setStaffAccessGranted(true);
    setStaffAccessCode("");
    setStaffAccessError(null);
    notify(
      "success",
      isEnglish
        ? "Owner access enabled for Staff."
        : "Accesso proprietario alla sezione Staff abilitato.",
    );
  }

  function saveStaffMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = staffForm.fullName.trim();
    const normalizedLocationIds = staffForm.locationIds
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (!normalizedName) {
      const message = isEnglish ? "Staff member name is required." : "Il nome del membro staff è obbligatorio.";
      setStaffFormError(message);
      notify("error", message);
      return;
    }

    if (normalizedLocationIds.length === 0) {
      const message = isEnglish ? "Enter at least one valid location." : "Inserisci almeno una location valida.";
      setStaffFormError(message);
      notify("error", message);
      return;
    }

    try {
      if (staffEditorMode === "create") {
        createStaffMember({
          slug: snapshot.tenant.slug,
          fullName: normalizedName,
          role: staffForm.role,
          locationIds: normalizedLocationIds,
          accentColor: staffForm.accentColor,
          profile: "appointments",
          active: staffForm.active,
        });
        refresh({
          toast: {
            tone: "success",
            text: isEnglish
              ? `Staff member ${normalizedName} created successfully.`
              : `Membro staff ${normalizedName} creato con successo.`,
          },
        });
        closeStaffEditor();
        return;
      }

      if (staffEditorMode === "edit" && editingStaffId) {
        updateStaffMember(editingStaffId, {
          fullName: normalizedName,
          role: staffForm.role,
          locationIds: normalizedLocationIds,
          accentColor: staffForm.accentColor,
          active: staffForm.active,
        });
        refresh({
          toast: {
            tone: "success",
            text: isEnglish
              ? `Staff member ${normalizedName} updated.`
              : `Membro staff ${normalizedName} aggiornato.`,
          },
        });
        closeStaffEditor();
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : isEnglish
          ? "Unable to save the staff member."
          : "Impossibile salvare il membro staff.";
      setStaffFormError(message);
      notify("error", message);
    }
  }

  function removeStaffMember(staffMember: DashboardSnapshot["staffMembers"][number]) {
    const confirmed = window.confirm(
      isEnglish
        ? `Do you want to delete ${staffMember.fullName}? This action cannot be undone.`
        : `Confermi l'eliminazione di ${staffMember.fullName}? Questa azione non è reversibile.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      deleteStaffMember(staffMember.id);
      refresh({
        toast: {
          tone: "success",
          text: isEnglish
            ? `Staff member ${staffMember.fullName} deleted.`
            : `Membro staff ${staffMember.fullName} eliminato.`,
        },
      });

      if (editingStaffId === staffMember.id) {
        closeStaffEditor();
      }
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : isEnglish
            ? "Unable to delete the selected staff member."
            : "Impossibile eliminare il membro staff selezionato.",
      );
    }
  }

  function handleResetDemo(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    resetDemoState();
    closeStaffEditor();
    setPlannerVersion((current) => current + 1);
    const nextSnapshot = refresh({
      toast: {
        tone: "success",
        text: isEnglish ? "Demo restored to the initial dataset." : "Demo ripristinata ai dati iniziali.",
      },
    });
    resetSettingsState(nextSnapshot);
  }

  const filteredBookings = snapshot.bookings.filter((booking) => {
    if (!deferredSearch) return true;
    const haystack = `${booking.customerName} ${booking.serviceName} ${booking.staffName}`.toLowerCase();
    return haystack.includes(deferredSearch);
  });

  const filteredStaffMembers = snapshot.staffMembers.filter((staffMember) => {
    if (!deferredSearch) return true;
    const haystack = `${staffMember.fullName} ${staffMember.role} ${staffMember.locationIds.join(" ")}`.toLowerCase();
    return haystack.includes(deferredSearch);
  });

  const activeSection = sectionMeta[section];
  const nextBooking = getNextActiveBooking(snapshot);
  const unreadNotifications = snapshot.notifications.filter((n) => n.status === "queued").length;
  const todayBookings = snapshot.bookings.filter(b => b.startsAt.startsWith(format(new Date(), "yyyy-MM-dd")));

  const readOnlyNotice = (
    <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 flex gap-3 text-blue-900 mb-6">
      <Lock className="w-5 h-5 text-blue-500 shrink-0" />
      <div>
        <strong className="font-semibold">
          {isEnglish ? "Read-only section" : "Sezione in sola lettura"}
        </strong>
        <span className="text-blue-800/80">
          {isEnglish
            ? " — Full management will arrive in the next desktop iterations."
            : " — Gestione completa in arrivo nelle prossime iterazioni del desktop."}
        </span>
      </div>
    </div>
  );

  if (!appUnlocked) {
    return (
      <div className="relative min-h-screen overflow-hidden font-sans" style={{ background: "var(--app-shell-bg)" }}>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
        <Launchpad
          selectedProfile={selectedProfile}
          activationCode={activationCode}
          activationError={activationError}
          onSelectProfile={handleProfileSelect}
          onActivationCodeChange={(value) => {
            setActivationCode(value);
            if (activationError) {
              setActivationError(null);
            }
          }}
          onActivate={handleActivationSubmit}
          language={appLanguage}
        />
      </div>
    );
  }

  return (
    <div
      className="flex h-screen w-full overflow-hidden font-sans"
      style={{ background: "var(--app-shell-bg)", color: "var(--app-content-text)" }}
    >
      <Sidebar
        activeSection={section}
        onSectionSelect={handleSectionSelect}
        onReturnToProfileSelection={handleReturnToProfileSelection}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        notificationCount={unreadNotifications}
        language={appLanguage}
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <ToastStack toasts={toasts} onDismiss={dismissToast} />

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto w-full">
          {section === "planning" ? (
            <PlanningBoard
              key={plannerVersion}
              snapshot={snapshot}
              searchQuery={search}
              onRefresh={refresh}
              onNotify={notify}
              language={appLanguage}
              locale={settingsDraft.locale}
              theme={theme}
            />
          ) : (
            <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8 lg:py-10">
              <PageHeader
                title={activeSection.title}
                badges={[
                  <StatusBadge key="tenant" status={`tenant/${snapshot.tenant.slug}`} variant="neutral" />,
                  <StatusBadge key="profile" status={translateStatusLabel(snapshot.tenant.primaryProfile, appLanguage)} variant="info" />
                ]}
                language={appLanguage}
                actions={
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder={isEnglish ? "Search customer, service..." : "Cerca cliente, servizio..."}
                        className="w-64 h-10 pl-4 pr-4 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <button
                      onClick={handleResetDemo}
                      className="h-10 px-4 bg-white border border-slate-200 text-slate-700 font-medium text-sm rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm whitespace-nowrap"
                    >
                      {isEnglish ? "Reset demo" : "Reset demo"}
                    </button>
                  </div>
                }
              />

              {/* Next Booking Strip */}
              {section === "dashboard" && (
                <div
                  className="text-white rounded-xl p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 shadow-sm"
                  style={{ background: "var(--app-top-strip-bg)", color: "var(--app-top-strip-text)" }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                      <AlertCircle className="w-4 h-4" style={{ color: "var(--app-secondary)" }} />
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--app-top-strip-muted)" }}>
                        {isEnglish ? "Next booking" : "Prossimo appuntamento"}
                      </p>
                      {nextBooking ? (
                        <p className="font-semibold mt-0.5">
                          {nextBooking.customerName}{" "}
                          <span className="font-normal" style={{ color: "var(--app-top-strip-muted)" }}>
                            · {formatBookingMoment(nextBooking.startsAt, settingsDraft.locale)}
                          </span>
                        </p>
                      ) : (
                        <p className="font-semibold mt-0.5" style={{ color: "var(--app-top-strip-muted)" }}>
                          {isEnglish ? "No upcoming booking" : "Nessuna prenotazione imminente"}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono" style={{ color: "var(--app-top-strip-muted)" }}>
                    <span className="bg-white/10 px-2 py-1 rounded">{snapshot.tenant.timezone}</span>
                    <span className="bg-white/10 px-2 py-1 rounded">
                      {isEnglish ? "interval" : "intervallo"} {snapshot.tenant.bookingIntervalMinutes}m
                    </span>
                  </div>
                </div>
              )}

              {/* Metric Grid */}
              {section === "dashboard" && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  <MetricCard
                    title={isEnglish ? "Upcoming bookings" : "Prossime prenotazioni"}
                    value={snapshot.metrics.upcomingBookings}
                    description={
                      nextBooking
                        ? `${isEnglish ? "Next" : "Prossima"}: ${formatCompactBookingMoment(nextBooking.startsAt, settingsDraft.locale)}`
                        : isEnglish
                          ? "No active booking."
                          : "Nessun appuntamento attivo."
                    }
                  />
                  <MetricCard
                    title={isEnglish ? "Collected today" : "Incassato oggi"}
                    value={currency(snapshot.metrics.revenueTodayCents, snapshot, settingsDraft.locale)}
                    description={isEnglish ? "Cash desk and Stripe processed." : "Elaborato cassa e Stripe."}
                  />
                  <MetricCard
                    title={isEnglish ? "Pending deposits" : "Caparre in attesa"}
                    value={currency(snapshot.metrics.pendingDepositsCents, snapshot, settingsDraft.locale)}
                    description={isEnglish ? "Deposits still open." : "Depositi ancora aperti."}
                  />
                  <MetricCard
                    title={isEnglish ? "CRM customers" : "Clienti CRM"}
                    value={snapshot.metrics.customerCount}
                    description={isEnglish ? "Active customer records." : "Schede cliente attive."}
                  />
                </div>
              )}

              {section === "dashboard" && (
                <DashboardPerformance
                  snapshot={snapshot}
                  language={appLanguage}
                  locale={settingsDraft.locale}
                  theme={theme}
                />
              )}

              {/* Tab Contents */}
              {section === "dashboard" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <div className="flex items-center justify-between mb-4 mt-2">
                      <h3 className="font-semibold text-slate-900 border-b-2 border-slate-900 pb-1 inline-block">
                        {isEnglish ? "Today's timeline" : "Timeline di oggi"}
                      </h3>
                      <span className="text-xs text-slate-500 bg-slate-200/50 px-2 py-1 rounded-md font-medium">
                        {todayBookings.length} {isEnglish ? "bookings" : "prenotazioni"}
                      </span>
                    </div>
                    <DataTable
                      data={todayBookings}
                      keyExtractor={(b) => b.id}
                      emptyMessage={isEnglish ? "No booking for today" : "Nessun booking per oggi"}
                      columns={[
                        {
                          header: isEnglish ? "Time" : "Ora",
                          className: "w-20 font-medium font-mono text-slate-900",
                          cell: (b) => b.startsAt.slice(11, 16),
                        },
                        {
                          header: isEnglish ? "Customer" : "Cliente",
                          cell: (b) => (
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-900">{b.customerName}</span>
                              <span className="text-xs text-slate-500">{b.serviceName} · {b.staffName}</span>
                            </div>
                          ),
                        },
                        {
                          header: isEnglish ? "Status" : "Stato",
                          className: "text-right",
                          cell: (b) => (
                            <StatusBadge
                              status={translateStatusLabel(b.status, appLanguage)}
                              variant={mapStatusToBadge(b.status)}
                            />
                          ),
                        },
                      ]}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-4 mt-2">
                      <h3 className="font-semibold text-slate-900 border-b-2 border-slate-900 pb-1 inline-block">
                        {isEnglish ? "Payments" : "Pagamenti"}
                      </h3>
                      <span className="text-xs text-slate-500 bg-slate-200/50 px-2 py-1 rounded-md font-medium">
                        {isEnglish ? "Stripe and manual" : "Stripe e manuale"}
                      </span>
                    </div>
                    <DataTable
                      data={snapshot.payments.slice(0, 10)}
                      keyExtractor={(p) => p.id}
                      emptyMessage={isEnglish ? "No recent movement" : "Nessun movimento recente"}
                      columns={[
                        {
                          header: isEnglish ? "Method" : "Metodo",
                          cell: (p) => (
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-900 uppercase text-xs tracking-wider">
                                {p.provider === "manual" && isEnglish ? "manual" : p.provider}
                              </span>
                              <span className="text-xs text-slate-500 font-mono">{p.bookingId}</span>
                            </div>
                          ),
                        },
                        {
                          header: isEnglish ? "Amount" : "Importo",
                          className: "font-medium text-slate-900",
                          cell: (p) => currency(p.amountCents, snapshot, settingsDraft.locale),
                        },
                        {
                          header: isEnglish ? "Status" : "Stato",
                          className: "text-right",
                          cell: (p) => (
                            <StatusBadge
                              status={translateStatusLabel(p.status, appLanguage)}
                              variant={mapStatusToBadge(p.status)}
                            />
                          ),
                        },
                      ]}
                    />
                  </div>
                </div>
              )}

              {section === "bookings" && (
                <div>
                  <div className="flex items-center justify-between mb-4 mt-2">
                    <h3 className="font-semibold text-slate-900 border-b-2 border-slate-900 pb-1 inline-block">
                      {isEnglish ? "Operational bookings" : "Prenotazioni operative"}
                    </h3>
                    <span className="text-xs text-slate-500 bg-slate-200/50 px-2 py-1 rounded-md font-medium">
                      {filteredBookings.length} {isEnglish ? "results" : "risultati"}
                    </span>
                  </div>
                  <DataTable
                    data={filteredBookings}
                    keyExtractor={(b) => b.id}
                    emptyMessage={isEnglish ? "No booking found" : "Nessuna prenotazione trovata"}
                    columns={[
                      {
                        header: isEnglish ? "Customer & service" : "Cliente & Servizio",
                        cell: (b) => (
                          <div className="flex flex-col py-1">
                            <span className="font-semibold text-slate-900">{b.customerName}</span>
                            <span className="text-xs text-slate-500 mt-0.5">{b.serviceName} · {b.staffName}</span>
                          </div>
                        ),
                      },
                      {
                        header: isEnglish ? "Schedule" : "Programmazione",
                        cell: (b) => (
                          <div className="flex flex-col py-1">
                            <span className="font-medium text-slate-900">{b.startsAt.slice(0, 16).replace("T", " ")}</span>
                            <span className="text-xs font-mono text-slate-400 mt-0.5">{b.id}</span>
                          </div>
                        ),
                      },
                      {
                        header: isEnglish ? "Status" : "Stato",
                        cell: (b) => (
                          <StatusBadge
                            status={translateStatusLabel(b.status, appLanguage)}
                            variant={mapStatusToBadge(b.status)}
                          />
                        ),
                      },
                      {
                        header: isEnglish ? "Actions" : "Azioni",
                        className: "text-right",
                        cell: (b) => {
                          const finState = getFinancialActionState(b, appLanguage);
                          return (
                            <div className="flex items-center justify-end gap-2 flex-wrap max-w-sm ml-auto">
                              <button
                                onClick={() => mutateBooking(b.id, "completed")}
                                className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-600 rounded text-xs font-medium hover:bg-slate-50 transition-colors shadow-sm"
                              >
                                {isEnglish ? "Complete" : "Completa"}
                              </button>
                              <button
                                onClick={() => mutateBooking(b.id, "no_show")}
                                className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-600 rounded text-xs font-medium hover:bg-slate-50 transition-colors shadow-sm"
                              >
                                No-show
                              </button>
                              <button
                                disabled={finState.collectDisabled}
                                title={finState.collectReason}
                                onClick={() => {
                                  try {
                                    markBookingDepositPaid(b.id, `manual_${b.id}`);
                                    refresh({
                                      toast: {
                                        tone: "success",
                                        text: isEnglish
                                          ? `Deposit collected for ${b.customerName}.`
                                          : `Caparra incassata per ${b.customerName}.`,
                                      },
                                    });
                                  } catch (error) {
                                    notify(
                                      "error",
                                      error instanceof Error
                                        ? error.message
                                        : isEnglish
                                          ? "Unable to collect the deposit."
                                          : "Errore incasso caparra.",
                                    );
                                  }
                                }}
                                className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-600 rounded text-xs font-medium hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isEnglish ? "Collect" : "Incassa"}
                              </button>
                              <button
                                disabled={finState.refundDisabled}
                                title={finState.refundReason}
                                onClick={() => {
                                  try {
                                    markBookingRefunded(b.id);
                                    refresh({
                                      toast: {
                                        tone: "info",
                                        text: isEnglish
                                          ? `Deposit refunded for ${b.customerName}.`
                                          : `Caparra rimborsata per ${b.customerName}.`,
                                      },
                                    });
                                  } catch (error) {
                                    notify(
                                      "error",
                                      error instanceof Error
                                        ? error.message
                                        : isEnglish
                                          ? "Unable to refund the deposit."
                                          : "Errore rimborso caparra.",
                                    );
                                  }
                                }}
                                className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-600 rounded text-xs font-medium hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isEnglish ? "Refund" : "Rimborso"}
                              </button>
                            </div>
                          );
                        },
                      },
                    ]}
                  />
                </div>
              )}

              {section === "customers" && (
                <div>
                  {readOnlyNotice}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-2">
                    {snapshot.customers.map(c => (
                      <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-slate-500">
                          <User className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-slate-900 truncate">{c.fullName}</h3>
                          <p className="text-sm text-slate-500 truncate mt-0.5">{c.email}</p>
                          <p className="text-xs font-medium text-slate-400 mt-1">{c.phone}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {section === "services" && (
                <div>
                  {readOnlyNotice}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-2">
                    {snapshot.services.map(s => (
                      <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                        <h3 className="font-semibold text-slate-900">{s.name}</h3>
                        <p className="text-sm text-slate-500 mt-2 line-clamp-2">{s.description}</p>
                        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-100">
                          <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md">
                            {s.durationMinutes} {isEnglish ? "min" : "min"}
                          </span>
                          <span className="text-sm font-semibold text-slate-900">
                            {currency(s.priceCents, snapshot, settingsDraft.locale)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {section === "staff" && (
                <div>
                  {!staffAccessGranted ? (
                    <div className="mx-auto mt-6 w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="mb-4 flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                          <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">
                            {isEnglish ? "Owner access required" : "Accesso proprietario richiesto"}
                          </h3>
                          <p className="mt-1 text-sm text-slate-500">
                            {isEnglish
                              ? "Enter the owner code to unlock full staff management."
                              : "Inserisci il codice proprietario per aprire la gestione completa dello staff."}
                          </p>
                        </div>
                      </div>

                      <form className="space-y-3" onSubmit={submitStaffAccess}>
                        <label className="block">
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {isEnglish ? "Owner code" : "Codice proprietario"}
                          </span>
                          <input
                            type="password"
                            value={staffAccessCode}
                            onChange={(event) => {
                              setStaffAccessCode(event.target.value);
                              if (staffAccessError) {
                                setStaffAccessError(null);
                              }
                            }}
                            placeholder={isEnglish ? "Enter code" : "Inserisci codice"}
                            className={[
                              "h-11 w-full rounded-lg border bg-white px-3 text-sm font-medium text-slate-900 shadow-sm transition-colors",
                              "focus:outline-none focus:ring-2 focus:ring-blue-500/20",
                              staffAccessError ? "border-rose-300" : "border-slate-200",
                            ].join(" ")}
                          />
                        </label>

                        {staffAccessError ? (
                          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            {staffAccessError}
                          </p>
                        ) : (
                          <p className="rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 text-xs font-medium text-blue-700">
                            {isEnglish ? "Owner demo code:" : "Codice demo proprietario:"} <strong>12345</strong>
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="submit"
                            className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                          >
                            {isEnglish ? "Unlock staff management" : "Sblocca gestione staff"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSectionSelect("dashboard")}
                            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            {isEnglish ? "Back to dashboard" : "Torna alla dashboard"}
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-4 mt-2 flex flex-wrap items-center justify-between gap-3">
                        <h3 className="inline-block border-b-2 border-slate-900 pb-1 font-semibold text-slate-900">
                          {isEnglish ? "Staff management" : "Gestione membri staff"}
                        </h3>
                        <button
                          onClick={openCreateStaffEditor}
                          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                        >
                          <UserPlus className="h-4 w-4" />
                          {isEnglish ? "New member" : "Nuovo membro"}
                        </button>
                      </div>

                      {staffEditorMode ? (
                        <form
                          onSubmit={saveStaffMember}
                          className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                        >
                          <h4 className="text-base font-semibold text-slate-900">
                            {staffEditorMode === "create"
                              ? isEnglish ? "New staff member" : "Nuovo membro staff"
                              : isEnglish ? "Edit staff member" : "Modifica membro staff"}
                          </h4>

                          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                            <label className="flex flex-col gap-1.5">
                              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                {isEnglish ? "Full name" : "Nome completo"}
                              </span>
                              <input
                                type="text"
                                value={staffForm.fullName}
                                onChange={(event) => setStaffForm((current) => ({ ...current, fullName: event.target.value }))}
                                placeholder={isEnglish ? "Full name" : "Nome e cognome"}
                                className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              />
                            </label>

                            <label className="flex flex-col gap-1.5">
                              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                {isEnglish ? "Role" : "Ruolo"}
                              </span>
                              <select
                                value={staffForm.role}
                                onChange={(event) =>
                                  setStaffForm((current) => ({ ...current, role: event.target.value as UserRole }))
                                }
                                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              >
                                <option value="owner">{translateRoleLabel("owner", appLanguage)}</option>
                                <option value="manager">{translateRoleLabel("manager", appLanguage)}</option>
                                <option value="operator">{translateRoleLabel("operator", appLanguage)}</option>
                              </select>
                            </label>

                            <label className="flex flex-col gap-1.5">
                              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                {isEnglish ? "Location IDs" : "Location IDs"}
                              </span>
                              <input
                                type="text"
                                value={staffForm.locationIds}
                                onChange={(event) =>
                                  setStaffForm((current) => ({ ...current, locationIds: event.target.value }))
                                }
                                placeholder="loc_main, loc_nord"
                                className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              />
                            </label>

                            <label className="flex flex-col gap-1.5">
                              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                {isEnglish ? "Accent color" : "Colore accento"}
                              </span>
                              <input
                                type="text"
                                value={staffForm.accentColor}
                                onChange={(event) =>
                                  setStaffForm((current) => ({ ...current, accentColor: event.target.value }))
                                }
                                placeholder="#1d4ed8"
                                className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              />
                            </label>
                          </div>

                          <label className="mt-4 inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={staffForm.active}
                              onChange={(event) =>
                                setStaffForm((current) => ({ ...current, active: event.target.checked }))
                              }
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                            />
                            <span className="text-sm font-medium text-slate-700">
                              {isEnglish ? "Active member" : "Membro attivo"}
                            </span>
                          </label>

                          {staffFormError ? (
                            <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                              {staffFormError}
                            </p>
                          ) : null}

                          <div className="mt-5 flex flex-wrap gap-2">
                            <button
                              type="submit"
                              className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                            >
                              {staffEditorMode === "create"
                                ? isEnglish ? "Create member" : "Crea membro"
                                : isEnglish ? "Save changes" : "Salva modifiche"}
                            </button>
                            <button
                              type="button"
                              onClick={closeStaffEditor}
                              className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                            >
                              {isEnglish ? "Cancel" : "Annulla"}
                            </button>
                          </div>
                        </form>
                      ) : null}

                      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 mt-2">
                        {filteredStaffMembers.map((staffMember) => {
                          const locationLabel = staffMember.locationIds
                            .map((locationId) => {
                              const location = snapshot.locations.find((entry) => entry.id === locationId);
                              return location ? location.name : locationId;
                            })
                            .join(", ");

                          return (
                            <div
                              key={staffMember.id}
                              className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                            >
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-600">
                                {staffMember.fullName.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-slate-900">{staffMember.fullName}</h3>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-blue-600">
                                    {translateRoleLabel(staffMember.role, appLanguage)}
                                  </span>
                                  <span className="truncate text-xs text-slate-500">{locationLabel}</span>
                                  {!staffMember.active ? (
                                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                                      {isEnglish ? "inactive" : "non attivo"}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <button
                                  onClick={() => openEditStaffEditor(staffMember)}
                                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  {isEnglish ? "Edit" : "Modifica"}
                                </button>
                                <button
                                  onClick={() => removeStaffMember(staffMember)}
                                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  {isEnglish ? "Delete" : "Elimina"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {filteredStaffMembers.length === 0 ? (
                        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
                          {isEnglish
                            ? "No staff member found with the current filters."
                            : "Nessun membro staff trovato con i filtri correnti."}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}

              {section === "payments" && (
                <div>
                  <div className="flex items-center justify-between mb-4 mt-2">
                    <h3 className="font-semibold text-slate-900 border-b-2 border-slate-900 pb-1 inline-block">
                      {isEnglish ? "Payments ledger" : "Ledger pagamenti"}
                    </h3>
                    <span className="text-xs text-slate-500 bg-slate-200/50 px-2 py-1 rounded-md font-medium">
                      {snapshot.payments.length} {isEnglish ? "entries" : "movimenti"}
                    </span>
                  </div>
                  <DataTable
                    data={snapshot.payments}
                    keyExtractor={(p) => p.id}
                    emptyMessage={isEnglish ? "No payment movement recorded" : "Nessun movimento registrato"}
                    columns={[
                      {
                        header: isEnglish ? "Booking reference" : "Riferimento booking",
                        className: "font-mono text-xs",
                        cell: (p) => p.bookingId,
                      },
                      {
                        header: isEnglish ? "Method" : "Metodo",
                        cell: (p) => (
                          <div className="flex items-center gap-2">
                            <Wallet className="w-4 h-4 text-slate-400" />
                            <span className="font-medium text-slate-700 capitalize">
                              {p.provider === "manual" && isEnglish ? "manual" : p.provider}
                            </span>
                          </div>
                        ),
                      },
                      {
                        header: isEnglish ? "Amount" : "Importo",
                        className: "font-semibold text-slate-900",
                        cell: (p) => currency(p.amountCents, snapshot, settingsDraft.locale),
                      },
                      {
                        header: isEnglish ? "Status" : "Stato",
                        className: "text-right",
                        cell: (p) => (
                          <StatusBadge
                            status={translateStatusLabel(p.status, appLanguage)}
                            variant={mapStatusToBadge(p.status)}
                          />
                        ),
                      },
                    ]}
                  />
                </div>
              )}

              {section === "notifications" && (
                <div>
                  <div className="flex items-center justify-between mb-4 mt-2">
                    <h3 className="font-semibold text-slate-900 border-b-2 border-slate-900 pb-1 inline-block">
                      {isEnglish ? "Notification history" : "Storico Notifiche"}
                    </h3>
                    <span className="text-xs text-slate-500 bg-slate-200/50 px-2 py-1 rounded-md font-medium">
                      {snapshot.notifications.length} {isEnglish ? "events" : "eventi"}
                    </span>
                  </div>
                  <DataTable
                    data={snapshot.notifications}
                    keyExtractor={(n) => n.id}
                    emptyMessage={isEnglish ? "No notification sent" : "Nessuna notifica inviata"}
                    columns={[
                      {
                        header: isEnglish ? "Recipient" : "Destinatario",
                        cell: (n) => (
                          <div className="flex items-center gap-2">
                            <MailOpen className="w-4 h-4 text-slate-400" />
                            <span className="font-medium text-slate-700">{n.recipient}</span>
                          </div>
                        ),
                      },
                      {
                        header: isEnglish ? "Template" : "Template",
                        className: "font-mono text-xs text-slate-500",
                        cell: (n) => n.templateKey,
                      },
                      {
                        header: isEnglish ? "Delivery status" : "Stato invio",
                        className: "text-right",
                        cell: (n) => (
                          <StatusBadge
                            status={translateStatusLabel(n.status, appLanguage)}
                            variant={mapStatusToBadge(n.status)}
                          />
                        ),
                      },
                    ]}
                  />
                </div>
              )}

              {section === "email" && <EmailPlugin language={appLanguage} />}

              {section === "settings" && (
                <div>
                  {!settingsAccessGranted ? (
                    <div className="mx-auto mt-6 w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="mb-4 flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                          <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">
                            {isEnglish ? "Owner access required" : "Accesso proprietario richiesto"}
                          </h3>
                          <p className="mt-1 text-sm text-slate-500">
                            {isEnglish
                              ? "Enter the owner code to unlock the Settings page."
                              : "Per aprire la pagina Impostazioni inserisci il codice proprietario."}
                          </p>
                        </div>
                      </div>

                      <form className="space-y-3" onSubmit={submitSettingsAccess}>
                        <label className="block">
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {isEnglish ? "Owner code" : "Codice proprietario"}
                          </span>
                          <input
                            type="password"
                            value={settingsAccessCode}
                            onChange={(event) => {
                              setSettingsAccessCode(event.target.value);
                              if (settingsAccessError) {
                                setSettingsAccessError(null);
                              }
                            }}
                            placeholder="Inserisci codice"
                            className={[
                              "h-11 w-full rounded-lg border bg-white px-3 text-sm font-medium text-slate-900 shadow-sm transition-colors",
                              "focus:outline-none focus:ring-2 focus:ring-blue-500/20",
                              settingsAccessError ? "border-rose-300" : "border-slate-200",
                            ].join(" ")}
                          />
                        </label>

                        {settingsAccessError ? (
                          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                            {settingsAccessError}
                          </p>
                        ) : (
                          <p className="rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 text-xs font-medium text-blue-700">
                            {isEnglish ? "Owner demo code:" : "Codice demo proprietario:"} <strong>12345</strong>
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="submit"
                            className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                          >
                            {isEnglish ? "Unlock settings" : "Sblocca impostazioni"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSectionSelect("dashboard")}
                            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            {isEnglish ? "Back to dashboard" : "Torna alla dashboard"}
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <div className="pb-24">
                      <div className="mb-5 overflow-x-auto">
                        <div className="inline-flex min-w-full gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
                          {settingsSections.map((item) => {
                            const active = settingsSection === item.id;
                            return (
                              <button
                                key={item.id}
                                onClick={() => setSettingsSection(item.id)}
                                className={[
                                  "rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors",
                                  active
                                    ? "bg-slate-900 text-white"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                                ].join(" ")}
                              >
                                {item.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                        {settingsSection === "tema" && (
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900">
                              {isEnglish ? "Theme & language" : "Tema e lingua"}
                            </h3>
                            <p className="mt-1 text-sm text-slate-500">
                              {isEnglish
                                ? "Switch the desktop palette and translate the full interface for demos and presentations."
                                : "Cambia palette del desktop e traduci l'intera interfaccia per demo e presentazioni."}
                            </p>

                            <div className="mt-6">
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                {isEnglish ? "Color theme" : "Tema colori"}
                              </p>
                              {hasPendingUiPreview ? (
                                <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                                  {isEnglish
                                    ? "Live preview active: save changes to confirm this theme."
                                    : "Anteprima live attiva: salva le modifiche per confermare questo tema."}
                                </div>
                              ) : (
                                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                                  {isEnglish
                                    ? "This is the currently confirmed theme."
                                    : "Questo e il tema attualmente confermato."}
                                </div>
                              )}
                              <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                                {Object.values(desktopThemes).map((themeOption) => {
                                  const active = settingsDraft.themeMode === themeOption.id;
                                  const selectedSwatch =
                                    settingsDraft.themeSwatches[themeOption.id] ?? themeOption.preview[1];
                                  const confirmed =
                                    confirmedUiPreferences.themeMode === themeOption.id &&
                                    confirmedUiPreferences.themeSwatches[themeOption.id] === selectedSwatch;
                                  const preview = active && !confirmed;

                                  return (
                                    <div
                                      key={themeOption.id}
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => handleThemeCardSelect(themeOption.id)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                          event.preventDefault();
                                          handleThemeCardSelect(themeOption.id);
                                        }
                                      }}
                                      className={[
                                        "relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-150 cursor-pointer active:scale-[0.995] focus:outline-none focus:ring-2 focus:ring-blue-500/20",
                                        active
                                          ? preview
                                            ? "border-blue-600 bg-blue-50/40 shadow-md shadow-blue-200 ring-4 ring-blue-100"
                                            : "border-slate-900 bg-slate-50 shadow-md shadow-slate-300 ring-4 ring-slate-200"
                                          : confirmed
                                            ? "border-emerald-300 bg-emerald-50/30 shadow-sm"
                                            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/80",
                                      ].join(" ")}
                                      aria-pressed={active}
                                    >
                                      <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-3">
                                          <span
                                            className={[
                                              "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                                              preview
                                                ? "border-blue-600 bg-blue-100 text-blue-700"
                                                : active
                                                  ? "border-slate-900 bg-slate-900 text-white"
                                                  : confirmed
                                                    ? "border-emerald-600 bg-emerald-600 text-white"
                                                    : "border-slate-300 bg-white text-transparent",
                                            ].join(" ")}
                                          >
                                            <Check className="h-3.5 w-3.5" />
                                          </span>
                                          <div>
                                          <p className="text-sm font-semibold text-slate-900">
                                            {themeOption.label[appLanguage]}
                                          </p>
                                          <p className="mt-1 text-sm text-slate-500">
                                            {themeOption.description[appLanguage]}
                                          </p>
                                          </div>
                                        </div>
                                        <span
                                          className={[
                                            "rounded-full px-2 py-1 text-[11px] font-semibold",
                                            preview
                                              ? "bg-blue-600 text-white"
                                              : active
                                              ? "bg-slate-900 text-white"
                                              : confirmed
                                                ? "bg-emerald-600 text-white"
                                              : "bg-slate-100 text-slate-500",
                                          ].join(" ")}
                                        >
                                          {preview
                                            ? isEnglish
                                              ? "Live preview"
                                              : "Anteprima live"
                                            : active
                                            ? isEnglish
                                              ? "Confirmed"
                                              : "Confermato"
                                            : confirmed
                                              ? isEnglish
                                                ? "Confirmed"
                                                : "Confermato"
                                            : isEnglish
                                              ? "Available"
                                              : "Disponibile"}
                                        </span>
                                      </div>
                                      <div className="mt-4 flex items-center gap-2">
                                        {themeOption.preview.map((color) => {
                                          const swatchSelected = selectedSwatch.toLowerCase() === color.toLowerCase();
                                          const oppositeBorder = getComplementaryHex(color);

                                          return (
                                            <button
                                              key={color}
                                              type="button"
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                handleThemeSwatchSelect(themeOption.id, color);
                                              }}
                                              title={color.toUpperCase()}
                                              aria-label={`${themeOption.label[appLanguage]} ${color.toUpperCase()}`}
                                              className={[
                                                "h-10 flex-1 rounded-xl border shadow-inner transition-all duration-150",
                                                swatchSelected
                                                  ? "opacity-100"
                                                  : "opacity-90 hover:opacity-100",
                                              ].join(" ")}
                                              style={{
                                                backgroundColor: color,
                                                borderWidth: swatchSelected ? "3px" : "1px",
                                                borderColor: swatchSelected ? oppositeBorder : "rgba(255, 255, 255, 0.65)",
                                                transform: swatchSelected ? "scale(1.08)" : "scale(1)",
                                              }}
                                            >
                                              <span className="sr-only">{color.toUpperCase()}</span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="mt-8 border-t border-slate-100 pt-6">
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                {isEnglish ? "Interface language" : "Lingua interfaccia"}
                              </p>
                              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                                {[
                                  {
                                    locale: "it-IT",
                                    title: "Italiano",
                                    description: isEnglish
                                      ? "Keep the management app in Italian."
                                      : "Mantieni il gestionale in italiano.",
                                  },
                                  {
                                    locale: "en-GB",
                                    title: "English",
                                    description: isEnglish
                                      ? "Translate menus, settings, planning, and email to English."
                                      : "Traduce menu, impostazioni, planning ed email in inglese.",
                                  },
                                ].map((option) => {
                                  const active = settingsDraft.locale === option.locale;

                                  return (
                                    <button
                                      key={option.locale}
                                      type="button"
                                      onClick={() => handleLocaleChange(option.locale)}
                                      className={[
                                        "rounded-2xl border p-4 text-left transition-all",
                                        active
                                          ? "border-slate-900 bg-slate-50 shadow-sm"
                                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/80",
                                      ].join(" ")}
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm font-semibold text-slate-900">{option.title}</p>
                                        <span
                                          className={[
                                            "rounded-full px-2 py-1 text-[11px] font-semibold",
                                            active
                                              ? "bg-slate-900 text-white"
                                              : "bg-slate-100 text-slate-500",
                                          ].join(" ")}
                                        >
                                          {active
                                            ? isEnglish
                                              ? "Active"
                                              : "Attiva"
                                            : isEnglish
                                              ? "Switch"
                                              : "Cambia"}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-sm text-slate-500">{option.description}</p>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                              {isEnglish
                                ? "Theme and language preview instantly. Save changes to keep them after reload."
                                : "Tema e lingua si aggiornano subito in anteprima. Salva le modifiche per mantenerli anche dopo il riavvio."}
                            </div>
                          </div>
                        )}

                        {settingsSection === "generale" && (
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900">
                              {isEnglish ? "General" : "Generale"}
                            </h3>
                            <p className="mt-1 text-sm text-slate-500">
                              {isEnglish
                                ? "Core tenant information and public identity."
                                : "Parametri principali del tenant e identità pubblica."}
                            </p>
                            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                              <label className="flex flex-col gap-1.5">
                                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  {isEnglish ? "Tenant name" : "Nome tenant"}
                                </span>
                                <input
                                  type="text"
                                  value={settingsDraft.tenantName}
                                  onChange={(event) => updateSettingsField("tenantName", event.target.value)}
                                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                              </label>
                              <label className="flex flex-col gap-1.5">
                                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  {isEnglish ? "Public slug" : "Slug pubblico"}
                                </span>
                                <input
                                  type="text"
                                  value={settingsDraft.publicSlug}
                                  onChange={(event) => updateSettingsField("publicSlug", event.target.value.trim().toLowerCase())}
                                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                              </label>
                              <label className="flex flex-col gap-1.5">
                                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  Timezone
                                </span>
                                <select
                                  value={settingsDraft.timezone}
                                  onChange={(event) => updateSettingsField("timezone", event.target.value)}
                                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                >
                                  <option value="Europe/Rome">Europe/Rome</option>
                                  <option value="Europe/Madrid">Europe/Madrid</option>
                                  <option value="Europe/Paris">Europe/Paris</option>
                                </select>
                              </label>
                              <label className="flex flex-col gap-1.5">
                                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  {isEnglish ? "Interface language" : "Lingua interfaccia"}
                                </span>
                                <input
                                  readOnly
                                  value={settingsDraft.locale === "en-GB" ? "English (en-GB)" : "Italiano (it-IT)"}
                                  className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-600"
                                />
                              </label>
                              <label className="flex flex-col gap-1.5 md:col-span-2">
                                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  {isEnglish ? "Default currency" : "Valuta predefinita"}
                                </span>
                                <select
                                  value={settingsDraft.currency}
                                  onChange={(event) => updateSettingsField("currency", event.target.value)}
                                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                >
                                  <option value="EUR">EUR - {isEnglish ? "Euro" : "Euro"}</option>
                                  <option value="USD">USD - {isEnglish ? "Dollar" : "Dollaro"}</option>
                                  <option value="GBP">GBP - {isEnglish ? "Pound" : "Sterlina"}</option>
                                </select>
                              </label>
                            </div>
                          </div>
                        )}

                        {settingsSection === "prenotazioni" && (
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900">
                              {isEnglish ? "Bookings" : "Prenotazioni"}
                            </h3>
                            <p className="mt-1 text-sm text-slate-500">
                              {isEnglish
                                ? "Operational rules for availability, lead time, and confirmations."
                                : "Regole operative per disponibilità e conferme."}
                            </p>
                            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                              <label className="flex flex-col gap-1.5">
                                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  {isEnglish ? "Booking interval (minutes)" : "Intervallo booking (minuti)"}
                                </span>
                                <select
                                  value={settingsDraft.bookingIntervalMinutes}
                                  onChange={(event) => updateSettingsField("bookingIntervalMinutes", Number(event.target.value))}
                                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                >
                                  <option value={15}>15</option>
                                  <option value={30}>30</option>
                                  <option value={45}>45</option>
                                  <option value={60}>60</option>
                                </select>
                              </label>
                              <label className="flex flex-col gap-1.5">
                                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  {isEnglish ? "Minimum lead time (hours)" : "Lead time minimo (ore)"}
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  value={settingsDraft.bookingLeadHours}
                                  onChange={(event) => updateSettingsField("bookingLeadHours", Number(event.target.value))}
                                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                              </label>
                              <label className="flex flex-col gap-1.5 md:col-span-2">
                                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  {isEnglish
                                    ? "Advance booking window (days)"
                                    : "Finestra prenotazione anticipata (giorni)"}
                                </span>
                                <input
                                  type="number"
                                  min={1}
                                  value={settingsDraft.maxAdvanceBookingDays}
                                  onChange={(event) => updateSettingsField("maxAdvanceBookingDays", Number(event.target.value))}
                                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                              </label>
                              <label className="inline-flex items-center gap-2 md:col-span-2">
                                <input
                                  type="checkbox"
                                  checked={settingsDraft.autoConfirmBookings}
                                  onChange={(event) => updateSettingsField("autoConfirmBookings", event.target.checked)}
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                                />
                                <span className="text-sm font-medium text-slate-700">
                                  {isEnglish ? "Automatically confirm bookings" : "Conferma automatica prenotazioni"}
                                </span>
                              </label>
                              <label className="flex flex-col gap-1.5 md:col-span-2">
                                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  {isEnglish ? "Cancellation policy" : "Politica di cancellazione"}
                                </span>
                                <textarea
                                  value={settingsDraft.cancellationPolicy}
                                  onChange={(event) => updateSettingsField("cancellationPolicy", event.target.value)}
                                  rows={4}
                                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                              </label>
                            </div>
                          </div>
                        )}

                        {settingsSection === "notifiche" && (
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900">
                              {isEnglish ? "Notifications" : "Notifiche"}
                            </h3>
                            <p className="mt-1 text-sm text-slate-500">
                              {isEnglish
                                ? "Active channels and booking confirmation message."
                                : "Canali attivi e template conferma prenotazione."}
                            </p>
                            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={settingsDraft.emailToCustomer}
                                  onChange={(event) => updateSettingsField("emailToCustomer", event.target.checked)}
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                                />
                                <span className="text-sm font-medium text-slate-700">
                                  {isEnglish ? "Email to customer" : "Email al cliente"}
                                </span>
                              </label>
                              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={settingsDraft.smsToCustomer}
                                  onChange={(event) => updateSettingsField("smsToCustomer", event.target.checked)}
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                                />
                                <span className="text-sm font-medium text-slate-700">
                                  {isEnglish ? "SMS to customer" : "SMS al cliente"}
                                </span>
                              </label>
                              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={settingsDraft.emailToStaff}
                                  onChange={(event) => updateSettingsField("emailToStaff", event.target.checked)}
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                                />
                                <span className="text-sm font-medium text-slate-700">
                                  {isEnglish ? "Email to staff" : "Email allo staff"}
                                </span>
                              </label>
                              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={settingsDraft.smsToStaff}
                                  onChange={(event) => updateSettingsField("smsToStaff", event.target.checked)}
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                                />
                                <span className="text-sm font-medium text-slate-700">
                                  {isEnglish ? "SMS to staff" : "SMS allo staff"}
                                </span>
                              </label>
                            </div>
                            <label className="mt-4 flex flex-col gap-1.5">
                              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                {isEnglish ? "Booking confirmation message" : "Messaggio conferma prenotazione"}
                              </span>
                              <textarea
                                value={settingsDraft.confirmationMessage}
                                onChange={(event) => updateSettingsField("confirmationMessage", event.target.value)}
                                rows={5}
                                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              />
                            </label>
                          </div>
                        )}

                        {settingsSection === "pagamenti" && (
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900">
                              {isEnglish ? "Payments" : "Pagamenti"}
                            </h3>
                            <p className="mt-1 text-sm text-slate-500">
                              {isEnglish
                                ? "Accepted methods, deposit settings, and refund policies."
                                : "Metodi accettati, caparre e politiche rimborso."}
                            </p>
                            <div className="mt-5 grid grid-cols-1 gap-4">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  {isEnglish ? "Accepted methods" : "Metodi accettati"}
                                </p>
                                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                                  <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                    <input
                                      type="checkbox"
                                      checked={settingsDraft.acceptsCash}
                                      onChange={(event) => updateSettingsField("acceptsCash", event.target.checked)}
                                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                                    />
                                    <span className="text-sm font-medium text-slate-700">
                                      {isEnglish ? "Cash desk" : "Cassa"}
                                    </span>
                                  </label>
                                  <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                    <input
                                      type="checkbox"
                                      checked={settingsDraft.acceptsStripe}
                                      onChange={(event) => updateSettingsField("acceptsStripe", event.target.checked)}
                                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                                    />
                                    <span className="text-sm font-medium text-slate-700">Stripe</span>
                                  </label>
                                  <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                    <input
                                      type="checkbox"
                                      checked={settingsDraft.acceptsOther}
                                      onChange={(event) => updateSettingsField("acceptsOther", event.target.checked)}
                                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                                    />
                                    <span className="text-sm font-medium text-slate-700">
                                      {isEnglish ? "Other" : "Altro"}
                                    </span>
                                  </label>
                                </div>
                              </div>

                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  {isEnglish ? "Deposit management" : "Gestione caparre"}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-4">
                                  <label className="inline-flex items-center gap-2">
                                    <input
                                      type="radio"
                                      name="deposit-mode"
                                      checked={settingsDraft.depositMode === "percentage"}
                                      onChange={() => updateSettingsField("depositMode", "percentage")}
                                      className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500/20"
                                    />
                                    <span className="text-sm text-slate-700">
                                      {isEnglish ? "Percentage" : "Percentuale"}
                                    </span>
                                  </label>
                                  <label className="inline-flex items-center gap-2">
                                    <input
                                      type="radio"
                                      name="deposit-mode"
                                      checked={settingsDraft.depositMode === "fixed"}
                                      onChange={() => updateSettingsField("depositMode", "fixed")}
                                      className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500/20"
                                    />
                                    <span className="text-sm text-slate-700">
                                      {isEnglish ? "Fixed amount" : "Importo fisso"}
                                    </span>
                                  </label>
                                </div>
                                <label className="mt-3 flex max-w-xs flex-col gap-1.5">
                                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                    {settingsDraft.depositMode === "percentage"
                                      ? isEnglish
                                        ? "Deposit value (%)"
                                        : "Valore caparra (%)"
                                      : isEnglish
                                        ? "Deposit value (€)"
                                        : "Valore caparra (€)"}
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={settingsDraft.depositValue}
                                    onChange={(event) => updateSettingsField("depositValue", Number(event.target.value))}
                                    className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                  />
                                </label>
                              </div>

                              <label className="flex flex-col gap-1.5">
                                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  {isEnglish ? "Refund policy" : "Politica di rimborso"}
                                </span>
                                <textarea
                                  value={settingsDraft.refundPolicy}
                                  onChange={(event) => updateSettingsField("refundPolicy", event.target.value)}
                                  rows={4}
                                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                              </label>
                            </div>
                          </div>
                        )}

                        {settingsSection === "integrazioni" && (
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900">
                              {isEnglish ? "Integrations" : "Integrazioni"}
                            </h3>
                            <p className="mt-1 text-sm text-slate-500">
                              {isEnglish
                                ? "Connection status and masked API credentials."
                                : "Stato connessioni e chiavi API mascherate."}
                            </p>

                            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                                <p className="text-sm font-semibold text-slate-900">Stripe</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {isEnglish ? "Status:" : "Stato:"}{" "}
                                  <span className={settingsDraft.stripeConnected ? "font-semibold text-emerald-600" : "font-semibold text-amber-600"}>
                                    {settingsDraft.stripeConnected
                                      ? isEnglish
                                        ? "connected"
                                        : "connesso"
                                      : isEnglish
                                        ? "not connected"
                                        : "non connesso"}
                                  </span>
                                </p>
                                <label className="mt-2 inline-flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={settingsDraft.stripeConnected}
                                    onChange={(event) => updateSettingsField("stripeConnected", event.target.checked)}
                                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                                  />
                                  <span className="text-sm text-slate-700">
                                    {isEnglish ? "Enable Stripe connection" : "Abilita connessione Stripe"}
                                  </span>
                                </label>
                              </div>

                              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                                <p className="text-sm font-semibold text-slate-900">Google Calendar</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {isEnglish ? "Status:" : "Stato:"}{" "}
                                  <span className={settingsDraft.googleCalendarConnected ? "font-semibold text-emerald-600" : "font-semibold text-amber-600"}>
                                    {settingsDraft.googleCalendarConnected
                                      ? isEnglish
                                        ? "connected"
                                        : "connesso"
                                      : isEnglish
                                        ? "not connected"
                                        : "non connesso"}
                                  </span>
                                </p>
                                <label className="mt-2 inline-flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={settingsDraft.googleCalendarConnected}
                                    onChange={(event) => updateSettingsField("googleCalendarConnected", event.target.checked)}
                                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                                  />
                                  <span className="text-sm text-slate-700">
                                    {isEnglish ? "Enable Google Calendar" : "Abilita Google Calendar"}
                                  </span>
                                </label>
                              </div>
                            </div>

                            <div className="mt-5 grid grid-cols-1 gap-4">
                              {([
                                ["stripePublishableKey", "Stripe publishable key"],
                                ["stripeSecretKey", "Stripe secret key"],
                                ["googleCalendarApiKey", "Google Calendar API key"],
                              ] as const).map(([key, label]) => (
                                <div key={key} className="rounded-lg border border-slate-200 p-3">
                                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
                                  <div className="mt-2 flex items-center gap-2">
                                    <input
                                      readOnly
                                      value={maskSecret(settingsDraft[key])}
                                      className="h-10 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => void copySecretValue(key)}
                                      className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                                    >
                                      {copiedSecret === key ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                                      {copiedSecret === key
                                        ? isEnglish
                                          ? "Copied"
                                          : "Copiata"
                                        : isEnglish
                                          ? "Copy"
                                          : "Copia"}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {settingsSection === "account" && (
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900">
                              {isEnglish ? "Account & access" : "Account e accesso"}
                            </h3>
                            <p className="mt-1 text-sm text-slate-500">
                              {isEnglish
                                ? "Admin account, password, and staff role management."
                                : "Gestione account amministratore, password e ruoli staff."}
                            </p>
                            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                              <label className="flex flex-col gap-1.5 md:col-span-2">
                                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  {isEnglish ? "Admin account email" : "Email account amministratore"}
                                </span>
                                <input
                                  type="email"
                                  value={settingsDraft.adminEmail}
                                  onChange={(event) => updateSettingsField("adminEmail", event.target.value)}
                                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                              </label>
                              <label className="flex flex-col gap-1.5">
                                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  {isEnglish ? "New password" : "Nuova password"}
                                </span>
                                <input
                                  type="password"
                                  value={settingsDraft.newPassword}
                                  onChange={(event) => updateSettingsField("newPassword", event.target.value)}
                                  placeholder="••••••••"
                                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                              </label>
                              <label className="flex flex-col gap-1.5">
                                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                  {isEnglish ? "Confirm password" : "Conferma password"}
                                </span>
                                <input
                                  type="password"
                                  value={settingsDraft.confirmPassword}
                                  onChange={(event) => updateSettingsField("confirmPassword", event.target.value)}
                                  placeholder="••••••••"
                                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                              </label>
                            </div>

                            <div className="mt-5 rounded-lg border border-slate-200">
                              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                                <p className="text-sm font-semibold text-slate-900">
                                  {isEnglish ? "Staff role management" : "Gestione ruoli staff"}
                                </p>
                              </div>
                              <div className="divide-y divide-slate-100">
                                {snapshot.staffMembers.map((staffMember) => (
                                  <div key={staffMember.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900">{staffMember.fullName}</p>
                                      <p className="text-xs text-slate-500">{staffMember.locationIds.join(", ")}</p>
                                    </div>
                                    <select
                                      value={settingsDraft.staffRoles[staffMember.id] ?? staffMember.role}
                                      onChange={(event) => updateStaffRoleSetting(staffMember.id, event.target.value as UserRole)}
                                      className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    >
                                      <option value="owner">{translateRoleLabel("owner", appLanguage)}</option>
                                      <option value="manager">{translateRoleLabel("manager", appLanguage)}</option>
                                      <option value="operator">{translateRoleLabel("operator", appLanguage)}</option>
                                    </select>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </section>

                      <div className="sticky bottom-4 mt-6 flex justify-end">
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg shadow-slate-200/70">
                          <span className="text-xs font-semibold text-slate-500">
                            {settingsDirty
                              ? isEnglish
                                ? "Unsaved changes"
                                : "Modifiche non salvate"
                              : isEnglish
                                ? "All changes are saved"
                                : "Tutte le modifiche sono salvate"}
                          </span>
                          <button
                            onClick={discardSettingsChanges}
                            disabled={!settingsDirty || settingsSaving}
                            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isEnglish ? "Cancel" : "Annulla"}
                          </button>
                          <button
                            onClick={saveSettingsChanges}
                            disabled={!settingsDirty || settingsSaving}
                            className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            {settingsSaving
                              ? isEnglish
                                ? "Saving..."
                                : "Salvataggio..."
                              : isEnglish
                                ? "Save changes"
                                : "Salva modifiche"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
