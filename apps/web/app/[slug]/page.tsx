import { getPublicSettings, listPublicServices, listPublicStaff } from "@booking/core";
import { notFound } from "next/navigation";

import { BookingShell } from "../../components/booking-shell";

interface TenantPageProps {
  params: Promise<{ slug: string }> | { slug: string };
  searchParams:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
}

export default async function TenantPage({ params, searchParams }: TenantPageProps) {
  const { slug } = await params;
  const query = await searchParams;

  try {
    const settings = getPublicSettings(slug);
    const services = listPublicServices(slug);
    const staffMembers = listPublicStaff(slug);
    const checkoutState = typeof query.checkout === "string" ? query.checkout : undefined;
    const bookingId = typeof query.bookingId === "string" ? query.bookingId : undefined;

    return (
      <main className="tenant-shell">
        <section className="tenant-hero">
          <div>
            <p className="eyebrow">Tenant pubblico</p>
            <h1>{settings.businessName}</h1>
            <p className="lede">
              Booking engine V1 per il profilo `appointments`: prenotazione self-service,
              caparra, conferma e dati pronti per il backoffice desktop.
            </p>
          </div>
          <div className="hero-badge">
            <span>Timezone</span>
            <strong>{settings.timezone}</strong>
            <span>Valuta</span>
            <strong>{settings.currency}</strong>
          </div>
        </section>

        <BookingShell
          settings={settings}
          services={services}
          staffMembers={staffMembers}
          checkoutState={checkoutState}
          bookingId={bookingId}
        />
      </main>
    );
  } catch {
    notFound();
  }
}
