import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <nav className="site-navbar">
        <Link href="/" className="brand">
          <span className="brand-icon">BO</span>
          Booking OS
        </Link>
        <div className="nav-links">
          <a className="nav-link" href="#features">Funzionalità</a>
          <a className="nav-link" href="#come-funziona">Come funziona</a>
          <Link className="nav-link cta" href="/studio-aurora">Demo live →</Link>
        </div>
      </nav>

      <main className="marketing-shell">
        <section className="hero-panel animate-in">
          <p className="eyebrow">Booking OS — Gestionale SaaS</p>
          <h1>Il nucleo operativo per prenotazioni, staff, caparre e booking pubblico.</h1>
          <p className="lede">
            Una piattaforma SaaS desktop-first con tenant, ruoli, Stripe Checkout,
            schema Supabase e un primo profilo pronto all&apos;uso per appuntamenti.
          </p>
          <div className="hero-stats">
            <span className="stat-chip">
              <span className="stat-icon">👥</span> 2 staff operativi
            </span>
            <span className="stat-chip">
              <span className="stat-icon">💈</span> 3 servizi attivi
            </span>
            <span className="stat-chip">
              <span className="stat-icon">📍</span> Milano Centro
            </span>
          </div>
          <div className="hero-actions">
            <Link className="primary-button" href="/studio-aurora">
              Apri il tenant demo
              <span aria-hidden="true">→</span>
            </Link>
            <a className="ghost-button" href="https://www.slope.it/" target="_blank" rel="noreferrer">
              Riferimento prodotto
            </a>
          </div>
        </section>

        <section id="features" className="feature-grid">
          <article className="feature-card animate-in animate-in-d1">
            <div className="feature-icon" aria-hidden="true">🖥️</div>
            <h2>Backoffice desktop</h2>
            <p>
              Electron + React per calendario operativo, clienti, staff, caparre e
              storico notifiche. Tutto in un unico workspace.
            </p>
          </article>
          <article className="feature-card animate-in animate-in-d2">
            <div className="feature-icon" aria-hidden="true">🌐</div>
            <h2>Booking pubblico</h2>
            <p>
              Ogni tenant ha uno slug pubblico per servizi, disponibilità,
              raccolta dati cliente e checkout Stripe.
            </p>
          </article>
          <article className="feature-card animate-in animate-in-d3">
            <div className="feature-icon" aria-hidden="true">⚙️</div>
            <h2>Core profile-aware</h2>
            <p>
              Il dominio nasce pronto per appointments, rooms e resources,
              pur esponendo solo il primo profilo nella V1.
            </p>
          </article>
        </section>

        <section id="come-funziona" className="steps-section animate-in animate-in-d3">
          <div className="steps-header">
            <p className="eyebrow">Come funziona</p>
            <h2>Prenota in 4 semplici passaggi</h2>
            <p>Il flusso completo che il tuo cliente seguirà dalla scoperta alla conferma.</p>
          </div>
          <div className="steps-grid">
            <div className="step-card animate-in animate-in-d2">
              <div className="step-number">1</div>
              <h3>Scegli il servizio</h3>
              <p>Il cliente seleziona dal tuo catalogo online con prezzi e durate trasparenti.</p>
            </div>
            <div className="step-card animate-in animate-in-d3">
              <div className="step-number">2</div>
              <h3>Scegli data e staff</h3>
              <p>Disponibilità in tempo reale, con preferenza staff opzionale.</p>
            </div>
            <div className="step-card animate-in animate-in-d4">
              <div className="step-number">3</div>
              <h3>Inserisci i dati</h3>
              <p>Nome, email e telefono per la conferma e le notifiche transazionali.</p>
            </div>
            <div className="step-card animate-in animate-in-d5">
              <div className="step-number">4</div>
              <h3>Conferma e paga</h3>
              <p>Checkout rapido con caparra via Stripe, conferma immediata via email.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-brand">
          <span className="brand-icon" style={{ width: 28, height: 28, fontSize: '0.6rem', borderRadius: 8 }}>BO</span>
          Booking OS
        </div>
        <div className="footer-links">
          <Link href="/studio-aurora">Demo</Link>
          <a href="https://www.slope.it/" target="_blank" rel="noreferrer">Slope.it</a>
        </div>
        <span>© {new Date().getFullYear()} Booking OS · Desktop-first SaaS</span>
      </footer>
    </>
  );
}
