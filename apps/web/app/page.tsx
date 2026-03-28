import Link from "next/link";

export default function HomePage() {
  return (
    <main className="marketing-shell">
      <section className="hero-panel">
        <p className="eyebrow">Booking OS</p>
        <h1>Il nucleo operativo per prenotazioni, staff, caparre e booking pubblico.</h1>
        <p className="lede">
          Una piattaforma SaaS desktop-first con tenant, ruoli, Stripe Checkout,
          schema Supabase e un primo profilo pronto all&apos;uso per appuntamenti.
        </p>
        <div className="hero-actions">
          <Link className="primary-button" href="/studio-aurora">
            Apri il tenant demo
          </Link>
          <a className="ghost-button" href="https://www.slope.it/" target="_blank" rel="noreferrer">
            Riferimento prodotto
          </a>
        </div>
      </section>

      <section className="feature-grid">
        <article className="feature-card">
          <h2>Backoffice desktop</h2>
          <p>
            Electron + React per calendario operativo, clienti, staff, caparre e
            storico notifiche.
          </p>
        </article>
        <article className="feature-card">
          <h2>Booking pubblico</h2>
          <p>
            Ogni tenant ha uno slug pubblico per servizi, disponibilita&apos;,
            raccolta dati cliente e checkout.
          </p>
        </article>
        <article className="feature-card">
          <h2>Core profile-aware</h2>
          <p>
            Il dominio nasce pronto per `appointments`, `rooms` e `resources`,
            pur esponendo solo il primo profilo nella V1.
          </p>
        </article>
      </section>
    </main>
  );
}
