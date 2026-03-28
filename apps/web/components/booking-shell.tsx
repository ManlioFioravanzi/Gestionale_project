"use client";

import type { AvailabilitySlot, BookingConfirmation, PublicSettings, Service, StaffMember } from "@booking/core";
import { useDeferredValue, useEffect, useState, useTransition } from "react";

interface BookingShellProps {
  settings: PublicSettings;
  services: Service[];
  staffMembers: StaffMember[];
  checkoutState?: string;
  bookingId?: string;
}

function formatMoney(cents: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function getTomorrowDate() {
  const candidate = new Date();
  candidate.setDate(candidate.getDate() + 1);

  while (candidate.getDay() === 0) {
    candidate.setDate(candidate.getDate() + 1);
  }

  return candidate.toISOString().slice(0, 10);
}

export function BookingShell({
  settings,
  services,
  staffMembers,
  checkoutState,
  bookingId,
}: BookingShellProps) {
  const [selectedServiceId, setSelectedServiceId] = useState(services[0]?.id ?? "");
  const [selectedDate, setSelectedDate] = useState(getTomorrowDate);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, startTransition] = useTransition();
  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    notes: "",
  });

  const selectedService = services.find((service) => service.id === selectedServiceId) ?? services[0];
  const deferredStaffId = useDeferredValue(selectedStaffId);

  useEffect(() => {
    if (!selectedServiceId || !selectedDate) {
      return;
    }

    let cancelled = false;

    async function loadAvailability() {
      setError(null);
      const response = await fetch(
        `/api/public/${settings.slug}/availability?serviceId=${selectedServiceId}&date=${selectedDate}`,
      );
      const payload = (await response.json()) as { slots?: AvailabilitySlot[]; error?: string };

      if (cancelled) {
        return;
      }

      if (!response.ok) {
        startTransition(() => {
          setError(payload.error ?? "Impossibile caricare la disponibilita'.");
          setSlots([]);
        });
        return;
      }

      startTransition(() => {
        setSlots(payload.slots ?? []);
        setSelectedSlot("");
      });
    }

    void loadAvailability();

    return () => {
      cancelled = true;
    };
  }, [selectedDate, selectedServiceId, settings.slug]);

  const filteredSlots = deferredStaffId
    ? slots.filter((slot) => slot.staffMemberId === deferredStaffId)
    : slots;

  const staffForService = staffMembers.filter((staff) =>
    slots.some((slot) => slot.staffMemberId === staff.id) || staff.id === selectedStaffId,
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedService || !selectedSlot) {
      setError("Seleziona servizio e orario prima di confermare.");
      return;
    }

    setError(null);
    const bookingResponse = await fetch(`/api/public/${settings.slug}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: selectedService.id,
        staffMemberId: selectedStaffId || undefined,
        date: selectedDate,
        startsAt: selectedSlot,
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone,
        notes: form.notes || undefined,
      }),
    });

    const bookingPayload = (await bookingResponse.json()) as
      | BookingConfirmation
      | { error: string };

    if (!bookingResponse.ok || "error" in bookingPayload) {
      setError(
        "error" in bookingPayload
          ? bookingPayload.error
          : "Impossibile creare la prenotazione.",
      );
      return;
    }

    setConfirmation(bookingPayload);

    if (bookingPayload.booking.depositRequiredCents > 0) {
      const checkoutResponse = await fetch(
        `/api/public/${settings.slug}/payments/checkout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId: bookingPayload.booking.id }),
        },
      );

      const checkoutPayload = (await checkoutResponse.json()) as {
        url?: string;
        error?: string;
      };

      if (!checkoutResponse.ok || !checkoutPayload.url) {
        setError(checkoutPayload.error ?? "Checkout non disponibile.");
        return;
      }

      window.location.assign(checkoutPayload.url);
      return;
    }
  }

  return (
    <section className="booking-layout">
      <div className="booking-main">
        {checkoutState === "success" ? (
          <div className="status-banner success">
            Caparra registrata con successo per la prenotazione `{bookingId}`.
          </div>
        ) : null}

        {checkoutState === "cancelled" ? (
          <div className="status-banner warning">
            Il checkout e&apos; stato annullato. La prenotazione resta creata con pagamento in attesa.
          </div>
        ) : null}

        <form className="booking-card" onSubmit={handleSubmit}>
          <div className="section-head">
            <p className="eyebrow">Prenotazione online</p>
            <h2>Scegli servizio, staff e orario</h2>
          </div>

          <label className="field">
            <span>Servizio</span>
            <select
              value={selectedServiceId}
              onChange={(event) => setSelectedServiceId(event.target.value)}
            >
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} · {formatMoney(service.priceCents, settings.currency, settings.locale)}
                </option>
              ))}
            </select>
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Data</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
            </label>

            <label className="field">
              <span>Preferenza staff</span>
              <select
                value={selectedStaffId}
                onChange={(event) => setSelectedStaffId(event.target.value)}
              >
                <option value="">Qualsiasi disponibile</option>
                {staffForService.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.fullName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="field">
            <span>Orario</span>
            <div className="slot-grid">
              {isBusy ? <p className="slot-hint">Aggiorno la disponibilita&apos;...</p> : null}
              {!isBusy && filteredSlots.length === 0 ? (
                <p className="slot-hint">Nessuno slot libero per i filtri selezionati.</p>
              ) : null}
              {filteredSlots.map((slot) => (
                <button
                  key={`${slot.staffMemberId}-${slot.startsAt}`}
                  className={selectedSlot === slot.startsAt ? "slot-button active" : "slot-button"}
                  type="button"
                  onClick={() => {
                    setSelectedSlot(slot.startsAt);
                    setSelectedStaffId(slot.staffMemberId);
                  }}
                >
                  <span>{slot.startsAt.slice(11, 16)}</span>
                  <small>{slot.staffName}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="section-head compact">
            <h3>Dati cliente</h3>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Nome e cognome</span>
              <input
                required
                value={form.customerName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, customerName: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                required
                type="email"
                value={form.customerEmail}
                onChange={(event) =>
                  setForm((current) => ({ ...current, customerEmail: event.target.value }))
                }
              />
            </label>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Telefono</span>
              <input
                required
                value={form.customerPhone}
                onChange={(event) =>
                  setForm((current) => ({ ...current, customerPhone: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Note</span>
              <input
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </label>
          </div>

          {error ? <div className="status-banner error">{error}</div> : null}

          <button className="primary-button full" type="submit">
            Conferma e vai al checkout
          </button>
        </form>
      </div>

      <aside className="booking-sidebar">
        <div className="summary-card">
          <p className="eyebrow">Riepilogo</p>
          <h3>{selectedService?.name}</h3>
          <p>{selectedService?.description}</p>
          <dl>
            <div>
              <dt>Durata</dt>
              <dd>{selectedService?.durationMinutes} min</dd>
            </div>
            <div>
              <dt>Prezzo</dt>
              <dd>
                {selectedService
                  ? formatMoney(selectedService.priceCents, settings.currency, settings.locale)
                  : "-"}
              </dd>
            </div>
            <div>
              <dt>Caparra</dt>
              <dd>
                {selectedService
                  ? formatMoney(
                      selectedService.depositType === "fixed"
                        ? selectedService.depositValue
                        : Math.round(selectedService.priceCents * (selectedService.depositValue / 100)),
                      settings.currency,
                      settings.locale,
                    )
                  : "-"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="summary-card accent">
          <p className="eyebrow">Operativita&apos;</p>
          <h3>Setup pronto per il backoffice</h3>
          <p>
            Ogni booking generato qui entra nel core condiviso, pronto per essere letto dal
            desktop admin, dai webhook Stripe e dallo schema Supabase.
          </p>
        </div>

        {confirmation ? (
          <div className="summary-card confirmation">
            <p className="eyebrow">Prenotazione creata</p>
            <h3>{confirmation.customer.fullName}</h3>
            <p>ID booking: {confirmation.booking.id}</p>
            <p>
              Stato pagamento: <strong>{confirmation.payment.status}</strong>
            </p>
          </div>
        ) : null}
      </aside>
    </section>
  );
}
