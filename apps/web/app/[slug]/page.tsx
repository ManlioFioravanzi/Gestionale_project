import { getPublicSettings, listPublicServices, listPublicStaff } from "@booking/core";
import Link from "next/link";
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
      <>
        <nav className="site-navbar">
          <Link href="/" className="brand">
            <span className="brand-icon">BO</span>
            Booking OS
          </Link>
          <div className="nav-links">
            <Link className="nav-link" href="/">Home</Link>
            <Link className="nav-link cta" href={`/${slug}`}>Prenota ora</Link>
          </div>
        </nav>

        <main className="tenant-shell">
          <nav className="breadcrumb animate-in" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span className="separator" aria-hidden="true">›</span>
            <span>{settings.businessName}</span>
          </nav>

          <section className="tenant-hero animate-in animate-in-d1">
            <div>
              <p className="eyebrow">Prenota online</p>
              <h1>{settings.businessName}</h1>
              <p className="lede">
                Scegli il servizio che preferisci, seleziona data e orario,
                e conferma il tuo appuntamento in pochi click.
              </p>
            </div>
            <div className="hero-badge">
              <div className="hero-badge-row">
                <span className="hero-badge-icon" aria-hidden="true">🌍</span>
                <span>Timezone</span>
              </div>
              <strong>{settings.timezone}</strong>
              <div className="hero-badge-row">
                <span className="hero-badge-icon" aria-hidden="true">💳</span>
                <span>Valuta</span>
              </div>
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

        <footer className="site-footer">
          <div className="footer-brand">
            <span className="brand-icon" style={{ width: 28, height: 28, fontSize: '0.6rem', borderRadius: 8 }}>BO</span>
            {settings.businessName}
          </div>
          <span>Powered by Booking OS</span>
        </footer>
      </>
    );
  } catch {
    notFound();
  }
}
