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
import { startTransition, useDeferredValue, useState, type FormEvent, type MouseEvent } from "react";
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

const settingsSections = [
  { id: "generale", label: "Generale" },
  { id: "prenotazioni", label: "Prenotazioni" },
  { id: "notifiche", label: "Notifiche" },
  { id: "pagamenti", label: "Pagamenti" },
  { id: "integrazioni", label: "Integrazioni" },
  { id: "account", label: "Account e accesso" },
] as const;

type SettingsSectionId = (typeof settingsSections)[number]["id"];
type DepositMode = "percentage" | "fixed";

interface SettingsDraft {
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

function buildSettingsDraft(snapshot: DashboardSnapshot): SettingsDraft {
  const staffRoles = Object.fromEntries(
    snapshot.staffMembers.map((staffMember) => [staffMember.id, staffMember.role]),
  );

  return {
    tenantName: snapshot.tenant.businessName,
    publicSlug: snapshot.tenant.slug,
    timezone: snapshot.tenant.timezone,
    locale: snapshot.tenant.locale,
    currency: snapshot.tenant.currency,
    bookingIntervalMinutes: snapshot.tenant.bookingIntervalMinutes,
    bookingLeadHours: snapshot.tenant.bookingLeadHours,
    maxAdvanceBookingDays: 60,
    cancellationPolicy: "Cancellazione gratuita fino a 24 ore prima dell'appuntamento.",
    autoConfirmBookings: true,
    emailToCustomer: true,
    smsToCustomer: false,
    emailToStaff: true,
    smsToStaff: false,
    confirmationMessage:
      "La tua prenotazione è confermata. Ti aspettiamo all'orario selezionato. Per modifiche rispondi a questa email.",
    acceptsCash: true,
    acceptsStripe: true,
    acceptsOther: false,
    depositMode: "percentage",
    depositValue: snapshot.tenant.defaultDepositPercentage,
    refundPolicy:
      "Rimborso completo entro 24 ore prima dell'appuntamento. Oltre questa soglia la caparra non è rimborsabile.",
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

const sectionMeta: Record<SidebarSection, { title: string; description: string }> = {
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

function currency(cents: number, snapshot: DashboardSnapshot) {
  return new Intl.NumberFormat(snapshot.tenant.locale, {
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

function getFinancialActionState(booking: DashboardSnapshot["bookings"][number]) {
  const financeAllowed = booking.status === "confirmed" || booking.status === "completed";
  const blockedStatusReason = `Azione non disponibile per prenotazioni in stato ${booking.status}.`;

  return {
    collectDisabled:
      !financeAllowed || booking.paymentStatus === "paid" || booking.paymentStatus === "refunded",
    collectReason: !financeAllowed
      ? blockedStatusReason
      : booking.paymentStatus === "paid"
        ? "Caparra già incassata."
        : booking.paymentStatus === "refunded"
          ? "Caparra già rimborsata."
          : undefined,
    refundDisabled: !financeAllowed || booking.paymentStatus !== "paid",
    refundReason: !financeAllowed
      ? blockedStatusReason
      : booking.paymentStatus !== "paid"
        ? "Nessuna caparra incassata da rimborsare."
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
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>("generale");
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(() =>
    buildSettingsDraft(getDashboardSnapshot("studio-aurora")),
  );
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsAccessGranted, setSettingsAccessGranted] = useState(false);
  const [settingsAccessCode, setSettingsAccessCode] = useState("");
  const [settingsAccessError, setSettingsAccessError] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState<"stripePublishableKey" | "stripeSecretKey" | "googleCalendarApiKey" | null>(null);
  const deferredSearch = useDeferredValue(search.toLowerCase());
  const appUnlocked = selectedProfile === "appointments" && isActivated;

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
    setSettingsDraft(buildSettingsDraft(nextSnapshot));
    setSettingsDirty(false);
    setSettingsSaving(false);
    setCopiedSecret(null);
    setSettingsSection("generale");
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
      notify("success", "Chiave copiata negli appunti.");
      window.setTimeout(() => setCopiedSecret(null), 1600);
    } catch {
      notify("error", "Impossibile copiare la chiave. Verifica i permessi clipboard.");
    }
  }

  function saveSettingsChanges() {
    if (settingsSaving) {
      return;
    }

    if (!settingsDraft.acceptsCash && !settingsDraft.acceptsStripe && !settingsDraft.acceptsOther) {
      setSettingsSection("pagamenti");
      notify("error", "Seleziona almeno un metodo di pagamento accettato.");
      return;
    }

    if (
      settingsDraft.newPassword &&
      settingsDraft.newPassword.trim() !== settingsDraft.confirmPassword.trim()
    ) {
      setSettingsSection("account");
      notify("error", "La conferma password non coincide.");
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

      setSettingsDirty(false);
      notify("success", "Impostazioni salvate correttamente.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error ? error.message : "Errore durante il salvataggio delle impostazioni.",
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
    notify("info", `Profilo ${profile} selezionato. Inserisci il codice di attivazione.`);
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
    notify("info", "Ritorno alla selezione profilo.");
  }

  function handleSectionSelect(nextSection: SidebarSection) {
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
      const message = "Codice proprietario non valido.";
      setSettingsAccessError(message);
      notify("error", message);
      return;
    }

    setSettingsAccessGranted(true);
    setSettingsAccessCode("");
    setSettingsAccessError(null);
    notify("success", "Accesso proprietario alla sezione Impostazioni abilitato.");
  }

  function handleActivationSubmit() {
    if (!selectedProfile) {
      setActivationError("Seleziona prima un profilo.");
      setIsActivated(false);
      return;
    }

    if (activationCode.trim() !== ACTIVATION_CODE) {
      setActivationError("Codice di attivazione non valido. Riprova con il codice corretto.");
      setIsActivated(false);
      notify("error", "Codice di attivazione non valido.");
      return;
    }

    if (selectedProfile !== "appointments") {
      setActivationError(
        `Il profilo ${selectedProfile} non e ancora attivo. Usa Appointments per entrare in BeeHive.`,
      );
      setIsActivated(false);
      notify("warning", `Profilo ${selectedProfile} non ancora disponibile.`);
      return;
    }

    setActivationError(null);
    setIsActivated(true);
    notify("success", "Profilo Appointments attivato. Accesso al gestionale completato.");
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
        notify("info", "Prossimo appuntamento aggiornato.");
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
        text: `Prenotazione aggiornata in stato ${status}.`,
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
      const message = "Codice proprietario non valido.";
      setStaffAccessError(message);
      notify("error", message);
      return;
    }

    setStaffAccessGranted(true);
    setStaffAccessCode("");
    setStaffAccessError(null);
    notify("success", "Accesso proprietario alla sezione Staff abilitato.");
  }

  function saveStaffMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = staffForm.fullName.trim();
    const normalizedLocationIds = staffForm.locationIds
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (!normalizedName) {
      const message = "Il nome del membro staff è obbligatorio.";
      setStaffFormError(message);
      notify("error", message);
      return;
    }

    if (normalizedLocationIds.length === 0) {
      const message = "Inserisci almeno una location valida.";
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
            text: `Membro staff ${normalizedName} creato con successo.`,
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
            text: `Membro staff ${normalizedName} aggiornato.`,
          },
        });
        closeStaffEditor();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossibile salvare il membro staff.";
      setStaffFormError(message);
      notify("error", message);
    }
  }

  function removeStaffMember(staffMember: DashboardSnapshot["staffMembers"][number]) {
    const confirmed = window.confirm(
      `Confermi l'eliminazione di ${staffMember.fullName}? Questa azione non è reversibile.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      deleteStaffMember(staffMember.id);
      refresh({
        toast: {
          tone: "success",
          text: `Membro staff ${staffMember.fullName} eliminato.`,
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
        text: "Demo ripristinata ai dati iniziali.",
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
        <strong className="font-semibold">Sezione in sola lettura</strong>
        <span className="text-blue-800/80"> — Gestione completa in arrivo nelle prossime iterazioni del desktop.</span>
      </div>
    </div>
  );

  if (!appUnlocked) {
    return (
      <div className="relative min-h-screen overflow-hidden font-sans">
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
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 w-full overflow-hidden font-sans">
      <Sidebar
        activeSection={section}
        onSectionSelect={handleSectionSelect}
        onReturnToProfileSelection={handleReturnToProfileSelection}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        notificationCount={unreadNotifications}
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
            />
          ) : (
            <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8 lg:py-10">
              <PageHeader
                title={activeSection.title}
                badges={[
                  <StatusBadge key="tenant" status={`tenant/${snapshot.tenant.slug}`} variant="neutral" />,
                  <StatusBadge key="profile" status={snapshot.tenant.primaryProfile} variant="info" />
                ]}
                actions={
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Cerca cliente, servizio..."
                        className="w-64 h-10 pl-4 pr-4 bg-white border border-slate-200 rounded-lg text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <button
                      onClick={handleResetDemo}
                      className="h-10 px-4 bg-white border border-slate-200 text-slate-700 font-medium text-sm rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm whitespace-nowrap"
                    >
                      Reset demo
                    </button>
                  </div>
                }
              />

              {/* Next Booking Strip */}
              {section === "dashboard" && (
                <div className="bg-slate-900 text-white rounded-xl p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                      <AlertCircle className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-300">Prossimo appuntamento</p>
                      {nextBooking ? (
                        <p className="font-semibold mt-0.5">
                          {nextBooking.customerName} <span className="text-slate-400 font-normal">· {formatBookingMoment(nextBooking.startsAt, snapshot.tenant.locale)}</span>
                        </p>
                      ) : (
                        <p className="font-semibold text-slate-400 mt-0.5">Nessuna prenotazione imminente</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                    <span className="bg-white/10 px-2 py-1 rounded">{snapshot.tenant.timezone}</span>
                    <span className="bg-white/10 px-2 py-1 rounded">interval {snapshot.tenant.bookingIntervalMinutes}m</span>
                  </div>
                </div>
              )}

              {/* Metric Grid */}
              {section === "dashboard" && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  <MetricCard
                    title="Prossime prenotazioni"
                    value={snapshot.metrics.upcomingBookings}
                    description={nextBooking ? `Prossima: ${formatCompactBookingMoment(nextBooking.startsAt, snapshot.tenant.locale)}` : "Nessun appuntamento attivo."}
                  />
                  <MetricCard
                    title="Incassato oggi"
                    value={currency(snapshot.metrics.revenueTodayCents, snapshot)}
                    description="Elaborato cassa e Stripe."
                  />
                  <MetricCard
                    title="Caparre in attesa"
                    value={currency(snapshot.metrics.pendingDepositsCents, snapshot)}
                    description="Depositi ancora aperti."
                  />
                  <MetricCard
                    title="Clienti CRM"
                    value={snapshot.metrics.customerCount}
                    description="Schede cliente attive."
                  />
                </div>
              )}

              {section === "dashboard" && <DashboardPerformance snapshot={snapshot} />}

              {/* Tab Contents */}
              {section === "dashboard" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <div className="flex items-center justify-between mb-4 mt-2">
                      <h3 className="font-semibold text-slate-900 border-b-2 border-slate-900 pb-1 inline-block">Timeline di oggi</h3>
                      <span className="text-xs text-slate-500 bg-slate-200/50 px-2 py-1 rounded-md font-medium">{todayBookings.length} booking</span>
                    </div>
                    <DataTable
                      data={todayBookings}
                      keyExtractor={(b) => b.id}
                      emptyMessage="Nessun booking per oggi"
                      columns={[
                        {
                          header: "Ora",
                          className: "w-20 font-medium font-mono text-slate-900",
                          cell: (b) => b.startsAt.slice(11, 16),
                        },
                        {
                          header: "Cliente",
                          cell: (b) => (
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-900">{b.customerName}</span>
                              <span className="text-xs text-slate-500">{b.serviceName} · {b.staffName}</span>
                            </div>
                          ),
                        },
                        {
                          header: "Stato",
                          className: "text-right",
                          cell: (b) => <StatusBadge status={b.status} variant={mapStatusToBadge(b.status)} />,
                        },
                      ]}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-4 mt-2">
                      <h3 className="font-semibold text-slate-900 border-b-2 border-slate-900 pb-1 inline-block">Pagamenti</h3>
                      <span className="text-xs text-slate-500 bg-slate-200/50 px-2 py-1 rounded-md font-medium">Stripe e manuale</span>
                    </div>
                    <DataTable
                      data={snapshot.payments.slice(0, 10)}
                      keyExtractor={(p) => p.id}
                      emptyMessage="Nessun movimento recente"
                      columns={[
                        {
                          header: "Metodo",
                          cell: (p) => (
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-900 uppercase text-xs tracking-wider">{p.provider}</span>
                              <span className="text-xs text-slate-500 font-mono">{p.bookingId}</span>
                            </div>
                          ),
                        },
                        {
                          header: "Importo",
                          className: "font-medium text-slate-900",
                          cell: (p) => currency(p.amountCents, snapshot),
                        },
                        {
                          header: "Stato",
                          className: "text-right",
                          cell: (p) => <StatusBadge status={p.status} variant={mapStatusToBadge(p.status)} />,
                        },
                      ]}
                    />
                  </div>
                </div>
              )}

              {section === "bookings" && (
                <div>
                  <div className="flex items-center justify-between mb-4 mt-2">
                    <h3 className="font-semibold text-slate-900 border-b-2 border-slate-900 pb-1 inline-block">Prenotazioni operative</h3>
                    <span className="text-xs text-slate-500 bg-slate-200/50 px-2 py-1 rounded-md font-medium">{filteredBookings.length} risultati</span>
                  </div>
                  <DataTable
                    data={filteredBookings}
                    keyExtractor={(b) => b.id}
                    emptyMessage="Nessuna prenotazione trovata"
                    columns={[
                      {
                        header: "Cliente & Servizio",
                        cell: (b) => (
                          <div className="flex flex-col py-1">
                            <span className="font-semibold text-slate-900">{b.customerName}</span>
                            <span className="text-xs text-slate-500 mt-0.5">{b.serviceName} · {b.staffName}</span>
                          </div>
                        ),
                      },
                      {
                        header: "Programmazione",
                        cell: (b) => (
                          <div className="flex flex-col py-1">
                            <span className="font-medium text-slate-900">{b.startsAt.slice(0, 16).replace("T", " ")}</span>
                            <span className="text-xs font-mono text-slate-400 mt-0.5">{b.id}</span>
                          </div>
                        ),
                      },
                      {
                        header: "Stato",
                        cell: (b) => <StatusBadge status={b.status} variant={mapStatusToBadge(b.status)} />,
                      },
                      {
                        header: "Azioni",
                        className: "text-right",
                        cell: (b) => {
                          const finState = getFinancialActionState(b);
                          return (
                            <div className="flex items-center justify-end gap-2 flex-wrap max-w-sm ml-auto">
                              <button
                                onClick={() => mutateBooking(b.id, "completed")}
                                className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-600 rounded text-xs font-medium hover:bg-slate-50 transition-colors shadow-sm"
                              >
                                Completa
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
                                    refresh({ toast: { tone: "success", text: `Caparra incassata per ${b.customerName}.` } });
                                  } catch (error) {
                                    notify("error", error instanceof Error ? error.message : "Errore incasso caparra.");
                                  }
                                }}
                                className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-600 rounded text-xs font-medium hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Incassa
                              </button>
                              <button
                                disabled={finState.refundDisabled}
                                title={finState.refundReason}
                                onClick={() => {
                                  try {
                                    markBookingRefunded(b.id);
                                    refresh({ toast: { tone: "info", text: `Caparra rimborsata per ${b.customerName}.` } });
                                  } catch (error) {
                                    notify("error", error instanceof Error ? error.message : "Errore rimborso caparra.");
                                  }
                                }}
                                className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-600 rounded text-xs font-medium hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Rimborso
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
                          <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md">{s.durationMinutes} min</span>
                          <span className="text-sm font-semibold text-slate-900">{currency(s.priceCents, snapshot)}</span>
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
                          <h3 className="text-lg font-semibold text-slate-900">Accesso proprietario richiesto</h3>
                          <p className="mt-1 text-sm text-slate-500">
                            Inserisci il codice proprietario per aprire la gestione completa dello staff.
                          </p>
                        </div>
                      </div>

                      <form className="space-y-3" onSubmit={submitStaffAccess}>
                        <label className="block">
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Codice proprietario
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
                            placeholder="Inserisci codice"
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
                            Codice demo proprietario: <strong>12345</strong>
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="submit"
                            className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                          >
                            Sblocca gestione staff
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSectionSelect("dashboard")}
                            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            Torna alla dashboard
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-4 mt-2 flex flex-wrap items-center justify-between gap-3">
                        <h3 className="inline-block border-b-2 border-slate-900 pb-1 font-semibold text-slate-900">
                          Gestione membri staff
                        </h3>
                        <button
                          onClick={openCreateStaffEditor}
                          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                        >
                          <UserPlus className="h-4 w-4" />
                          Nuovo membro
                        </button>
                      </div>

                      {staffEditorMode ? (
                        <form
                          onSubmit={saveStaffMember}
                          className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                        >
                          <h4 className="text-base font-semibold text-slate-900">
                            {staffEditorMode === "create" ? "Nuovo membro staff" : "Modifica membro staff"}
                          </h4>

                          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                            <label className="flex flex-col gap-1.5">
                              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                Nome completo
                              </span>
                              <input
                                type="text"
                                value={staffForm.fullName}
                                onChange={(event) => setStaffForm((current) => ({ ...current, fullName: event.target.value }))}
                                placeholder="Nome e cognome"
                                className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              />
                            </label>

                            <label className="flex flex-col gap-1.5">
                              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                Ruolo
                              </span>
                              <select
                                value={staffForm.role}
                                onChange={(event) =>
                                  setStaffForm((current) => ({ ...current, role: event.target.value as UserRole }))
                                }
                                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              >
                                <option value="owner">owner</option>
                                <option value="manager">manager</option>
                                <option value="operator">operator</option>
                              </select>
                            </label>

                            <label className="flex flex-col gap-1.5">
                              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                Location IDs
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
                                Colore accento
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
                            <span className="text-sm font-medium text-slate-700">Membro attivo</span>
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
                              {staffEditorMode === "create" ? "Crea membro" : "Salva modifiche"}
                            </button>
                            <button
                              type="button"
                              onClick={closeStaffEditor}
                              className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                            >
                              Annulla
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
                                    {staffMember.role}
                                  </span>
                                  <span className="truncate text-xs text-slate-500">{locationLabel}</span>
                                  {!staffMember.active ? (
                                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                                      non attivo
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
                                  Modifica
                                </button>
                                <button
                                  onClick={() => removeStaffMember(staffMember)}
                                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Elimina
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {filteredStaffMembers.length === 0 ? (
                        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
                          Nessun membro staff trovato con i filtri correnti.
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}

              {section === "payments" && (
                <div>
                  <div className="flex items-center justify-between mb-4 mt-2">
                    <h3 className="font-semibold text-slate-900 border-b-2 border-slate-900 pb-1 inline-block">Ledger pagamenti</h3>
                    <span className="text-xs text-slate-500 bg-slate-200/50 px-2 py-1 rounded-md font-medium">{snapshot.payments.length} movimenti</span>
                  </div>
                  <DataTable
                    data={snapshot.payments}
                    keyExtractor={(p) => p.id}
                    emptyMessage="Nessun movimento registrato"
                    columns={[
                      {
                        header: "Riferimento booking",
                        className: "font-mono text-xs",
                        cell: (p) => p.bookingId,
                      },
                      {
                        header: "Metodo",
                        cell: (p) => (
                          <div className="flex items-center gap-2">
                            <Wallet className="w-4 h-4 text-slate-400" />
                            <span className="font-medium text-slate-700 capitalize">{p.provider}</span>
                          </div>
                        ),
                      },
                      {
                        header: "Importo",
                        className: "font-semibold text-slate-900",
                        cell: (p) => currency(p.amountCents, snapshot),
                      },
                      {
                        header: "Stato",
                        className: "text-right",
                        cell: (p) => <StatusBadge status={p.status} variant={mapStatusToBadge(p.status)} />,
                      },
                    ]}
                  />
                </div>
              )}

              {section === "notifications" && (
                <div>
                  <div className="flex items-center justify-between mb-4 mt-2">
                    <h3 className="font-semibold text-slate-900 border-b-2 border-slate-900 pb-1 inline-block">Storico Notifiche</h3>
                    <span className="text-xs text-slate-500 bg-slate-200/50 px-2 py-1 rounded-md font-medium">{snapshot.notifications.length} eventi</span>
                  </div>
                  <DataTable
                    data={snapshot.notifications}
                    keyExtractor={(n) => n.id}
                    emptyMessage="Nessuna notifica inviata"
                    columns={[
                      {
                        header: "Destinatario",
                        cell: (n) => (
                          <div className="flex items-center gap-2">
                            <MailOpen className="w-4 h-4 text-slate-400" />
                            <span className="font-medium text-slate-700">{n.recipient}</span>
                          </div>
                        ),
                      },
                      {
                        header: "Template",
                        className: "font-mono text-xs text-slate-500",
                        cell: (n) => n.templateKey,
                      },
                      {
                        header: "Stato invio",
                        className: "text-right",
                        cell: (n) => <StatusBadge status={n.status} variant={mapStatusToBadge(n.status)} />,
                      },
                    ]}
                  />
                </div>
              )}

              {section === "email" && <EmailPlugin />}

              {section === "settings" && (
                <div>
                  {!settingsAccessGranted ? (
                    <div className="mx-auto mt-6 w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="mb-4 flex items-start gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                          <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">Accesso proprietario richiesto</h3>
                          <p className="mt-1 text-sm text-slate-500">
                            Per aprire la pagina Impostazioni inserisci il codice proprietario.
                          </p>
                        </div>
                      </div>

                      <form className="space-y-3" onSubmit={submitSettingsAccess}>
                        <label className="block">
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Codice proprietario
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
                            Codice demo proprietario: <strong>12345</strong>
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="submit"
                            className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                          >
                            Sblocca impostazioni
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSectionSelect("dashboard")}
                            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            Torna alla dashboard
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
                    {settingsSection === "generale" && (
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">Generale</h3>
                        <p className="mt-1 text-sm text-slate-500">Parametri principali del tenant e identità pubblica.</p>
                        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Nome tenant</span>
                            <input
                              type="text"
                              value={settingsDraft.tenantName}
                              onChange={(event) => updateSettingsField("tenantName", event.target.value)}
                              className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Slug pubblico</span>
                            <input
                              type="text"
                              value={settingsDraft.publicSlug}
                              onChange={(event) => updateSettingsField("publicSlug", event.target.value.trim().toLowerCase())}
                              className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Timezone</span>
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
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Lingua</span>
                            <select
                              value={settingsDraft.locale}
                              onChange={(event) => updateSettingsField("locale", event.target.value)}
                              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            >
                              <option value="it-IT">Italiano (it-IT)</option>
                              <option value="en-GB">English (en-GB)</option>
                              <option value="fr-FR">Français (fr-FR)</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1.5 md:col-span-2">
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Valuta predefinita</span>
                            <select
                              value={settingsDraft.currency}
                              onChange={(event) => updateSettingsField("currency", event.target.value)}
                              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            >
                              <option value="EUR">EUR - Euro</option>
                              <option value="USD">USD - Dollaro</option>
                              <option value="GBP">GBP - Sterlina</option>
                            </select>
                          </label>
                        </div>
                      </div>
                    )}

                    {settingsSection === "prenotazioni" && (
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">Prenotazioni</h3>
                        <p className="mt-1 text-sm text-slate-500">Regole operative per disponibilità e conferme.</p>
                        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Intervallo booking (minuti)</span>
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
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Lead time minimo (ore)</span>
                            <input
                              type="number"
                              min={0}
                              value={settingsDraft.bookingLeadHours}
                              onChange={(event) => updateSettingsField("bookingLeadHours", Number(event.target.value))}
                              className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                          </label>
                          <label className="flex flex-col gap-1.5 md:col-span-2">
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Finestra prenotazione anticipata (giorni)</span>
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
                            <span className="text-sm font-medium text-slate-700">Conferma automatica prenotazioni</span>
                          </label>
                          <label className="flex flex-col gap-1.5 md:col-span-2">
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Politica di cancellazione</span>
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
                        <h3 className="text-lg font-semibold text-slate-900">Notifiche</h3>
                        <p className="mt-1 text-sm text-slate-500">Canali attivi e template conferma prenotazione.</p>
                        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <input
                              type="checkbox"
                              checked={settingsDraft.emailToCustomer}
                              onChange={(event) => updateSettingsField("emailToCustomer", event.target.checked)}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                            />
                            <span className="text-sm font-medium text-slate-700">Email al cliente</span>
                          </label>
                          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <input
                              type="checkbox"
                              checked={settingsDraft.smsToCustomer}
                              onChange={(event) => updateSettingsField("smsToCustomer", event.target.checked)}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                            />
                            <span className="text-sm font-medium text-slate-700">SMS al cliente</span>
                          </label>
                          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <input
                              type="checkbox"
                              checked={settingsDraft.emailToStaff}
                              onChange={(event) => updateSettingsField("emailToStaff", event.target.checked)}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                            />
                            <span className="text-sm font-medium text-slate-700">Email allo staff</span>
                          </label>
                          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <input
                              type="checkbox"
                              checked={settingsDraft.smsToStaff}
                              onChange={(event) => updateSettingsField("smsToStaff", event.target.checked)}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                            />
                            <span className="text-sm font-medium text-slate-700">SMS allo staff</span>
                          </label>
                        </div>
                        <label className="mt-4 flex flex-col gap-1.5">
                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Messaggio conferma prenotazione</span>
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
                        <h3 className="text-lg font-semibold text-slate-900">Pagamenti</h3>
                        <p className="mt-1 text-sm text-slate-500">Metodi accettati, caparre e politiche rimborso.</p>
                        <div className="mt-5 grid grid-cols-1 gap-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Metodi accettati</p>
                            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={settingsDraft.acceptsCash}
                                  onChange={(event) => updateSettingsField("acceptsCash", event.target.checked)}
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                                />
                                <span className="text-sm font-medium text-slate-700">Cassa</span>
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
                                <span className="text-sm font-medium text-slate-700">Altro</span>
                              </label>
                            </div>
                          </div>

                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Gestione caparre</p>
                            <div className="mt-2 flex flex-wrap gap-4">
                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="deposit-mode"
                                  checked={settingsDraft.depositMode === "percentage"}
                                  onChange={() => updateSettingsField("depositMode", "percentage")}
                                  className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500/20"
                                />
                                <span className="text-sm text-slate-700">Percentuale</span>
                              </label>
                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="deposit-mode"
                                  checked={settingsDraft.depositMode === "fixed"}
                                  onChange={() => updateSettingsField("depositMode", "fixed")}
                                  className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500/20"
                                />
                                <span className="text-sm text-slate-700">Importo fisso</span>
                              </label>
                            </div>
                            <label className="mt-3 flex max-w-xs flex-col gap-1.5">
                              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                {settingsDraft.depositMode === "percentage" ? "Valore caparra (%)" : "Valore caparra (€)"}
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
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Politica di rimborso</span>
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
                        <h3 className="text-lg font-semibold text-slate-900">Integrazioni</h3>
                        <p className="mt-1 text-sm text-slate-500">Stato connessioni e chiavi API mascherate.</p>

                        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-sm font-semibold text-slate-900">Stripe</p>
                            <p className="mt-1 text-xs text-slate-500">
                              Stato:{" "}
                              <span className={settingsDraft.stripeConnected ? "font-semibold text-emerald-600" : "font-semibold text-amber-600"}>
                                {settingsDraft.stripeConnected ? "connesso" : "non connesso"}
                              </span>
                            </p>
                            <label className="mt-2 inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={settingsDraft.stripeConnected}
                                onChange={(event) => updateSettingsField("stripeConnected", event.target.checked)}
                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                              />
                              <span className="text-sm text-slate-700">Abilita connessione Stripe</span>
                            </label>
                          </div>

                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-sm font-semibold text-slate-900">Google Calendar</p>
                            <p className="mt-1 text-xs text-slate-500">
                              Stato:{" "}
                              <span className={settingsDraft.googleCalendarConnected ? "font-semibold text-emerald-600" : "font-semibold text-amber-600"}>
                                {settingsDraft.googleCalendarConnected ? "connesso" : "non connesso"}
                              </span>
                            </p>
                            <label className="mt-2 inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={settingsDraft.googleCalendarConnected}
                                onChange={(event) => updateSettingsField("googleCalendarConnected", event.target.checked)}
                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                              />
                              <span className="text-sm text-slate-700">Abilita Google Calendar</span>
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
                                  {copiedSecret === key ? "Copiata" : "Copia"}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {settingsSection === "account" && (
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">Account e accesso</h3>
                        <p className="mt-1 text-sm text-slate-500">Gestione account amministratore, password e ruoli staff.</p>
                        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                          <label className="flex flex-col gap-1.5 md:col-span-2">
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Email account amministratore</span>
                            <input
                              type="email"
                              value={settingsDraft.adminEmail}
                              onChange={(event) => updateSettingsField("adminEmail", event.target.value)}
                              className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Nuova password</span>
                            <input
                              type="password"
                              value={settingsDraft.newPassword}
                              onChange={(event) => updateSettingsField("newPassword", event.target.value)}
                              placeholder="••••••••"
                              className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                          </label>
                          <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Conferma password</span>
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
                            <p className="text-sm font-semibold text-slate-900">Gestione ruoli staff</p>
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
                                  <option value="owner">owner</option>
                                  <option value="manager">manager</option>
                                  <option value="operator">operator</option>
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
                        {settingsDirty ? "Modifiche non salvate" : "Tutte le modifiche sono salvate"}
                      </span>
                      <button
                        onClick={saveSettingsChanges}
                        disabled={!settingsDirty || settingsSaving}
                        className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {settingsSaving ? "Salvataggio..." : "Salva modifiche"}
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
