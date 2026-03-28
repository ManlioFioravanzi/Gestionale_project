import {
  getDashboardSnapshot,
  markBookingDepositPaid,
  markBookingRefunded,
  resetDemoState,
  updateBookingStatus,
} from "@booking/core";
import type { BookingStatus, DashboardSnapshot } from "@booking/core";
import { startTransition, useDeferredValue, useState, type MouseEvent } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Lock, MailOpen, AlertCircle, Inbox, User, Wallet, Activity, Settings } from "lucide-react";

import { PlanningBoard } from "./planning-board";
import { Sidebar, type SidebarSection } from "./components/sidebar";
import { MetricCard } from "./components/metric-card";
import { DataTable, type ColumnDef } from "./components/data-table";
import { ToastStack, type ToastMessage, type ToastTone } from "./components/toast-stack";
import { PageHeader } from "./components/page-header";
import { StatusBadge, type StatusVariant } from "./components/status-badge";

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
  const deferredSearch = useDeferredValue(search.toLowerCase());

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

  function handleResetDemo(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    resetDemoState();
    setPlannerVersion((current) => current + 1);
    refresh({
      toast: {
        tone: "success",
        text: "Demo ripristinata ai dati iniziali.",
      },
    });
  }

  const filteredBookings = snapshot.bookings.filter((booking) => {
    if (!deferredSearch) return true;
    const haystack = `${booking.customerName} ${booking.serviceName} ${booking.staffName}`.toLowerCase();
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

  return (
    <div className="flex h-screen bg-slate-50 w-full overflow-hidden font-sans">
      <Sidebar
        activeSection={section}
        onSectionSelect={(s) => startTransition(() => setSection(s))}
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
              {(section === "dashboard" || section === "settings") && (
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
                  {readOnlyNotice}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                    {snapshot.staffMembers.map(s => (
                      <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0 text-blue-600 font-bold text-lg">
                          {s.fullName.charAt(0)}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-900">{s.fullName}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs uppercase tracking-wider font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{s.role}</span>
                            <span className="text-xs text-slate-500 truncate">{s.locationIds.join(", ")}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
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

              {section === "settings" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                      <h3 className="font-semibold text-slate-900">Configurazione Base</h3>
                      <Settings className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="divide-y divide-slate-100">
                      <div className="px-5 py-4 flex justify-between items-center sm:grid sm:grid-cols-2">
                        <span className="text-sm font-medium text-slate-500">Slug pubblico</span>
                        <span className="text-sm font-semibold text-slate-900 sm:text-right">{snapshot.tenant.slug}</span>
                      </div>
                      <div className="px-5 py-4 flex justify-between items-center sm:grid sm:grid-cols-2">
                        <span className="text-sm font-medium text-slate-500">Timezone</span>
                        <span className="text-sm font-semibold text-slate-900 sm:text-right">{snapshot.tenant.timezone}</span>
                      </div>
                      <div className="px-5 py-4 flex justify-between items-center sm:grid sm:grid-cols-2">
                        <span className="text-sm font-medium text-slate-500">Intervallo booking</span>
                        <span className="text-sm font-semibold text-slate-900 sm:text-right">{snapshot.tenant.bookingIntervalMinutes} minuti</span>
                      </div>
                      <div className="px-5 py-4 flex justify-between items-center sm:grid sm:grid-cols-2">
                        <span className="text-sm font-medium text-slate-500">Lead time minimo</span>
                        <span className="text-sm font-semibold text-slate-900 sm:text-right">{snapshot.tenant.bookingLeadHours} ore</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                      <h3 className="font-semibold text-slate-900">Roadmap Profili e Features</h3>
                      <Activity className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="p-6">
                      <p className="text-sm text-slate-500 mb-6 leading-relaxed">I feature flags determinano le sezioni attive per questo tenant in base al piano e al modello di business.</p>
                      
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-900">Appointments Engine</span>
                          <StatusBadge status="ready" variant="success" />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-900">Rooms & Locations</span>
                          <StatusBadge status="planned" variant="neutral" />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-900">Physical Resources</span>
                          <StatusBadge status="planned" variant="neutral" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
