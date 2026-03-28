import {
  getDashboardSnapshot,
  markBookingDepositPaid,
  markBookingRefunded,
  resetDemoState,
  updateBookingStatus,
} from "@booking/core";
import type { BookingStatus, DashboardSnapshot } from "@booking/core";
import { startTransition, useDeferredValue, useState, type MouseEvent } from "react";

import { PlanningBoard } from "./planning-board";

type Section =
  | "dashboard"
  | "planning"
  | "bookings"
  | "customers"
  | "services"
  | "staff"
  | "payments"
  | "notifications"
  | "settings";

type ToastTone = "success" | "info" | "warning" | "error";

interface ToastMessage {
  id: string;
  tone: ToastTone;
  text: string;
}

const navigation: Array<{ id: Section; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "planning", label: "Planning" },
  { id: "bookings", label: "Prenotazioni" },
  { id: "customers", label: "Clienti" },
  { id: "services", label: "Servizi" },
  { id: "staff", label: "Staff" },
  { id: "payments", label: "Pagamenti" },
  { id: "notifications", label: "Notifiche" },
  { id: "settings", label: "Impostazioni" },
];

const sectionMeta: Record<Section, { title: string; description: string }> = {
  dashboard: {
    title: "Dashboard operativa",
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
    description:
      "Consulta le schede cliente attive e mantieni allineati contatti e storico relazionale.",
  },
  services: {
    title: "Catalogo servizi",
    description:
      "Monitora durata, pricing e configurazione dei servizi online per il profilo appointments.",
  },
  staff: {
    title: "Organico e turni",
    description:
      "Verifica il team attivo sul tenant e la copertura operativa sulle location abilitate.",
  },
  payments: {
    title: "Ledger pagamenti",
    description:
      "Segui caparre, incassi manuali e movimenti Stripe con uno stato leggibile per singola prenotazione.",
  },
  notifications: {
    title: "Notifiche",
    description:
      "Controlla l'invio delle comunicazioni transazionali e individua rapidamente eventuali errori.",
  },
  settings: {
    title: "Impostazioni tenant",
    description:
      "Verifica configurazione base, profilo attivo e readiness delle feature pianificate per le prossime fasi.",
  },
};

function currency(cents: number, snapshot: DashboardSnapshot) {
  return new Intl.NumberFormat(snapshot.tenant.locale, {
    style: "currency",
    currency: snapshot.tenant.currency,
  }).format(cents / 100);
}

function formatDateLabel(locale: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
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

export default function App() {
  const [section, setSection] = useState<Section>("dashboard");
  const [search, setSearch] = useState("");
  const [snapshot, setSnapshot] = useState(() => getDashboardSnapshot("studio-aurora"));
  const [plannerVersion, setPlannerVersion] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const deferredSearch = useDeferredValue(search.toLowerCase());

  function notify(tone: ToastTone, text: string) {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, tone, text }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);
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
    if (!deferredSearch) {
      return true;
    }

    const haystack = `${booking.customerName} ${booking.serviceName} ${booking.staffName}`.toLowerCase();
    return haystack.includes(deferredSearch);
  });

  const activeSection = sectionMeta[section];
  const todayLabel = formatDateLabel(snapshot.tenant.locale);
  const nextBooking = getNextActiveBooking(snapshot);
  const readOnlyNotice = (
    <div className="section-note">
      <strong>Sezione in sola lettura</strong>
      <span>Gestione completa in arrivo nelle prossime iterazioni del desktop.</span>
    </div>
  );

  return (
    <div className="desktop-shell">
      <aside className="desktop-sidebar">
        <div className="brand-block">
          <div className="brand-mark">BO</div>
          <div>
            <p className="eyebrow">Desktop admin</p>
            <h1>Booking OS</h1>
            <p>{snapshot.tenant.businessName}</p>
          </div>
        </div>

        <div className="sidebar-group">
          <p className="sidebar-label">Workspace</p>
          <nav className="nav-stack">
            {navigation.map((item) => (
              <button
                key={item.id}
                className={section === item.id ? "nav-button active" : "nav-button"}
                type="button"
                onClick={() =>
                  startTransition(() => {
                    setSection(item.id);
                  })
                }
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-meta">
          <p className="sidebar-label">Tenant</p>

          <div className="profile-card">
            <span>Profilo attivo</span>
            <strong>{snapshot.tenant.primaryProfile}</strong>
            <small>
              Cloud sync live, booking engine pubblico e depositi Stripe pronti per demo.
            </small>
          </div>

          <div className="sidebar-foot">
            <span>Tenant slug</span>
            <strong>{snapshot.tenant.slug}</strong>
            <small>Ruoli owner, manager e operator già predisposti nel modello SaaS.</small>
          </div>
        </div>
      </aside>

      <main className="desktop-main">
        <div className="toast-stack" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast toast-${toast.tone}`}>
              {toast.text}
            </div>
          ))}
        </div>

        <header className="desktop-header">
          <div className="header-copy">
            <p className="eyebrow">Operatività giornaliera</p>
            <div className="header-title-row">
              <h2>{activeSection.title}</h2>
              <span className="section-badge">{snapshot.tenant.primaryProfile}</span>
            </div>
            <p className="header-description">{activeSection.description}</p>
          </div>

          <div className="header-actions">
            <input
              aria-label="Cerca"
              className="search-input"
              placeholder="Cerca cliente, servizio o staff"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button className="ghost-button" type="button" onClick={handleResetDemo}>
              Reset demo
            </button>
          </div>
        </header>

        <section className="workspace-strip">
          <div className="workspace-chips">
            <span className="workspace-chip strong">{todayLabel}</span>
            <span className="workspace-chip">{snapshot.tenant.timezone}</span>
            <span className="workspace-chip">tenant/{snapshot.tenant.slug}</span>
            <span className="workspace-chip">
              booking interval {snapshot.tenant.bookingIntervalMinutes} min
            </span>
          </div>

          <div className="workspace-status">
            <span>Prossimo appuntamento</span>
            {nextBooking ? (
              <strong>
                {nextBooking.customerName} ·{" "}
                {formatBookingMoment(nextBooking.startsAt, snapshot.tenant.locale)}
              </strong>
            ) : (
              <strong>Nessuna prenotazione imminente</strong>
            )}
          </div>
        </section>

        <section className="metric-grid">
          <article className="metric-card">
            <span>Prossime prenotazioni</span>
            <strong>{snapshot.metrics.upcomingBookings}</strong>
            <small>
              {nextBooking
                ? `${snapshot.metrics.upcomingBookings} prossime — ${nextBooking.customerName}, ${formatCompactBookingMoment(nextBooking.startsAt, snapshot.tenant.locale)}`
                : "Nessun appuntamento attivo nelle prossime ore operative."}
            </small>
          </article>
          <article className="metric-card">
            <span>Incassato oggi</span>
            <strong>{currency(snapshot.metrics.revenueTodayCents, snapshot)}</strong>
            <small>Totale elaborato tra cassa operatore e Stripe.</small>
          </article>
          <article className="metric-card">
            <span>Caparre in attesa</span>
            <strong>{currency(snapshot.metrics.pendingDepositsCents, snapshot)}</strong>
            <small>Depositi ancora aperti e da finalizzare sul booking.</small>
          </article>
          <article className="metric-card">
            <span>Clienti CRM</span>
            <strong>{snapshot.metrics.customerCount}</strong>
            <small>Schede cliente attive già disponibili nel gestionale.</small>
          </article>
        </section>

        {section === "dashboard" ? (
          <section className="content-grid">
            <article className="panel-card">
              <div className="panel-head">
                <h3>Timeline di oggi</h3>
                <span>{snapshot.bookings.length} booking caricati</span>
              </div>
              <div className="timeline">
                {snapshot.bookings.map((booking) => (
                  <div key={booking.id} className="timeline-row">
                    <strong>{booking.startsAt.slice(11, 16)}</strong>
                    <div>
                      <p>{booking.customerName}</p>
                      <small>
                        {booking.serviceName} · {booking.staffName}
                      </small>
                    </div>
                    <span className={`pill status-${booking.status}`}>{booking.status}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel-card">
              <div className="panel-head">
                <h3>Pagamenti</h3>
                <span>Stripe e manuale</span>
              </div>
              <div className="stack-list">
                {snapshot.payments.map((payment) => (
                  <div key={payment.id} className="stack-row">
                    <div>
                      <p>{payment.provider}</p>
                      <small>{payment.bookingId}</small>
                    </div>
                    <strong>{currency(payment.amountCents, snapshot)}</strong>
                    <span className={`pill status-${payment.status}`}>{payment.status}</span>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {section === "planning" ? (
          <PlanningBoard
            key={plannerVersion}
            snapshot={snapshot}
            searchQuery={search}
            onRefresh={refresh}
            onNotify={notify}
          />
        ) : null}

        {section === "bookings" ? (
          <section className="panel-card">
            <div className="panel-head">
              <h3>Prenotazioni operative</h3>
              <span>{filteredBookings.length} risultati</span>
            </div>
            <div className="booking-table">
              {filteredBookings.map((booking) => {
                const financialState = getFinancialActionState(booking);

                return (
                  <article key={booking.id} className="booking-row">
                    <div>
                      <p>{booking.customerName}</p>
                      <small>
                        {booking.serviceName} · {booking.staffName}
                      </small>
                    </div>
                    <div>
                      <p>{booking.startsAt.slice(0, 16).replace("T", " ")}</p>
                      <small>{booking.id}</small>
                    </div>
                    <div className="inline-actions">
                      <span className={`pill status-${booking.status}`}>{booking.status}</span>
                      <button type="button" onClick={() => mutateBooking(booking.id, "completed")}>
                        Completa
                      </button>
                      <button type="button" onClick={() => mutateBooking(booking.id, "no_show")}>
                        No-show
                      </button>
                      <button
                        disabled={financialState.collectDisabled}
                        title={financialState.collectReason}
                        type="button"
                        onClick={() => {
                          try {
                            markBookingDepositPaid(booking.id, `manual_${booking.id}`);
                            refresh({
                              toast: {
                                tone: "success",
                                text: `Caparra incassata per ${booking.customerName}.`,
                              },
                            });
                          } catch (error) {
                            notify(
                              "error",
                              error instanceof Error ? error.message : "Non riesco a incassare la caparra.",
                            );
                          }
                        }}
                      >
                        Incassa caparra
                      </button>
                      <button
                        disabled={financialState.refundDisabled}
                        title={financialState.refundReason}
                        type="button"
                        onClick={() => {
                          try {
                            markBookingRefunded(booking.id);
                            refresh({
                              toast: {
                                tone: "warning",
                                text: `Caparra rimborsata per ${booking.customerName}.`,
                              },
                            });
                          } catch (error) {
                            notify(
                              "error",
                              error instanceof Error ? error.message : "Non riesco a rimborsare la caparra.",
                            );
                          }
                        }}
                      >
                        Rimborso
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {section === "customers" ? (
          <>
            {readOnlyNotice}
            <section className="card-grid">
              {snapshot.customers.map((customer) => (
                <article key={customer.id} className="panel-card compact">
                  <h3>{customer.fullName}</h3>
                  <p>{customer.email}</p>
                  <small>{customer.phone}</small>
                </article>
              ))}
            </section>
          </>
        ) : null}

        {section === "services" ? (
          <>
            {readOnlyNotice}
            <section className="card-grid">
              {snapshot.services.map((service) => (
                <article key={service.id} className="panel-card compact">
                  <h3>{service.name}</h3>
                  <p>{service.description}</p>
                  <small>
                    {service.durationMinutes} min · {currency(service.priceCents, snapshot)}
                  </small>
                </article>
              ))}
            </section>
          </>
        ) : null}

        {section === "staff" ? (
          <>
            {readOnlyNotice}
            <section className="card-grid">
              {snapshot.staffMembers.map((staff) => (
                <article key={staff.id} className="panel-card compact">
                  <h3>{staff.fullName}</h3>
                  <p>{staff.role}</p>
                  <small>{staff.locationIds.join(", ")}</small>
                </article>
              ))}
            </section>
          </>
        ) : null}

        {section === "payments" ? (
          <section className="panel-card">
            <div className="panel-head">
              <h3>Ledger pagamenti</h3>
              <span>{snapshot.payments.length} movimenti</span>
            </div>
            <div className="stack-list">
              {snapshot.payments.map((payment) => (
                <div key={payment.id} className="stack-row">
                  <div>
                    <p>{payment.bookingId}</p>
                    <small>{payment.provider}</small>
                  </div>
                  <strong>{currency(payment.amountCents, snapshot)}</strong>
                  <span className={`pill status-${payment.status}`}>{payment.status}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {section === "notifications" ? (
          <section className="panel-card">
            <div className="panel-head">
              <h3>Storico notifiche</h3>
              <span>{snapshot.notifications.length} eventi</span>
            </div>
            <div className="stack-list">
              {snapshot.notifications.map((notification) => (
                <div key={notification.id} className="stack-row">
                  <div>
                    <p>{notification.templateKey}</p>
                    <small>{notification.recipient}</small>
                  </div>
                  <span className={`pill status-${notification.status}`}>{notification.status}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {section === "settings" ? (
          <section className="content-grid">
            <article className="panel-card">
              <div className="panel-head">
                <h3>Tenant</h3>
                <span>Configurazione base</span>
              </div>
              <div className="stack-list">
                <div className="stack-row">
                  <p>Slug pubblico</p>
                  <strong>{snapshot.tenant.slug}</strong>
                </div>
                <div className="stack-row">
                  <p>Timezone</p>
                  <strong>{snapshot.tenant.timezone}</strong>
                </div>
                <div className="stack-row">
                  <p>Intervallo booking</p>
                  <strong>{snapshot.tenant.bookingIntervalMinutes} minuti</strong>
                </div>
                <div className="stack-row">
                  <p>Lead time minimo</p>
                  <strong>{snapshot.tenant.bookingLeadHours} ore</strong>
                </div>
              </div>
            </article>

            <article className="panel-card">
              <div className="panel-head">
                <h3>Roadmap profili</h3>
                <span>Feature flag ready</span>
              </div>
              <div className="inline-actions">
                <span className="pill status-confirmed">appointments</span>
                <span className="pill neutral">rooms</span>
                <span className="pill neutral">resources</span>
              </div>
            </article>
          </section>
        ) : null}
      </main>
    </div>
  );
}
