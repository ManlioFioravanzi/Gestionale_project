import {
  getDashboardSnapshot,
  markBookingDepositPaid,
  markBookingRefunded,
  resetDemoState,
  updateBookingStatus,
} from "@booking/core";
import type { BookingStatus, DashboardSnapshot } from "@booking/core";
import { startTransition, useDeferredValue, useState } from "react";

type Section =
  | "dashboard"
  | "bookings"
  | "customers"
  | "services"
  | "staff"
  | "payments"
  | "notifications"
  | "settings";

const navigation: Array<{ id: Section; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "bookings", label: "Prenotazioni" },
  { id: "customers", label: "Clienti" },
  { id: "services", label: "Servizi" },
  { id: "staff", label: "Staff" },
  { id: "payments", label: "Pagamenti" },
  { id: "notifications", label: "Notifiche" },
  { id: "settings", label: "Impostazioni" },
];

function currency(cents: number, snapshot: DashboardSnapshot) {
  return new Intl.NumberFormat(snapshot.tenant.locale, {
    style: "currency",
    currency: snapshot.tenant.currency,
  }).format(cents / 100);
}

export default function App() {
  const [section, setSection] = useState<Section>("dashboard");
  const [search, setSearch] = useState("");
  const [snapshot, setSnapshot] = useState(() => getDashboardSnapshot("studio-aurora"));
  const deferredSearch = useDeferredValue(search.toLowerCase());

  function refresh() {
    setSnapshot(getDashboardSnapshot("studio-aurora"));
  }

  function mutateBooking(bookingId: string, status: BookingStatus) {
    updateBookingStatus(bookingId, status);
    refresh();
  }

  const filteredBookings = snapshot.bookings.filter((booking) => {
    if (!deferredSearch) {
      return true;
    }

    const haystack = `${booking.customerName} ${booking.serviceName} ${booking.staffName}`.toLowerCase();
    return haystack.includes(deferredSearch);
  });

  return (
    <div className="desktop-shell">
      <aside className="desktop-sidebar">
        <div className="brand-block">
          <p className="eyebrow">Desktop admin</p>
          <h1>Booking OS</h1>
          <p>{snapshot.tenant.businessName}</p>
        </div>

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

        <div className="profile-card">
          <span>Profilo attivo</span>
          <strong>{snapshot.tenant.primaryProfile}</strong>
          <small>Cloud sync pronto · OTA adapter previsto · Stripe depositi attivo</small>
        </div>
      </aside>

      <main className="desktop-main">
        <header className="desktop-header">
          <div>
            <p className="eyebrow">Operativita&apos; giornaliera</p>
            <h2>{navigation.find((item) => item.id === section)?.label}</h2>
          </div>

          <div className="header-actions">
            <input
              aria-label="Cerca"
              className="search-input"
              placeholder="Cerca cliente, servizio o staff"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                resetDemoState();
                refresh();
              }}
            >
              Reset demo
            </button>
          </div>
        </header>

        <section className="metric-grid">
          <article className="metric-card">
            <span>Prossime prenotazioni</span>
            <strong>{snapshot.metrics.upcomingBookings}</strong>
          </article>
          <article className="metric-card">
            <span>Incassato oggi</span>
            <strong>{currency(snapshot.metrics.revenueTodayCents, snapshot)}</strong>
          </article>
          <article className="metric-card">
            <span>Caparre in attesa</span>
            <strong>{currency(snapshot.metrics.pendingDepositsCents, snapshot)}</strong>
          </article>
          <article className="metric-card">
            <span>Clienti CRM</span>
            <strong>{snapshot.metrics.customerCount}</strong>
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

        {section === "bookings" ? (
          <section className="panel-card">
            <div className="panel-head">
              <h3>Prenotazioni operative</h3>
              <span>{filteredBookings.length} risultati</span>
            </div>
            <div className="booking-table">
              {filteredBookings.map((booking) => (
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
                      type="button"
                      onClick={() => {
                        markBookingDepositPaid(booking.id, `manual_${booking.id}`);
                        refresh();
                      }}
                    >
                      Incassa caparra
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        markBookingRefunded(booking.id);
                        refresh();
                      }}
                    >
                      Rimborso
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {section === "customers" ? (
          <section className="card-grid">
            {snapshot.customers.map((customer) => (
              <article key={customer.id} className="panel-card compact">
                <h3>{customer.fullName}</h3>
                <p>{customer.email}</p>
                <small>{customer.phone}</small>
              </article>
            ))}
          </section>
        ) : null}

        {section === "services" ? (
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
        ) : null}

        {section === "staff" ? (
          <section className="card-grid">
            {snapshot.staffMembers.map((staff) => (
              <article key={staff.id} className="panel-card compact">
                <h3>{staff.fullName}</h3>
                <p>{staff.role}</p>
                <small>{staff.locationIds.join(", ")}</small>
              </article>
            ))}
          </section>
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
