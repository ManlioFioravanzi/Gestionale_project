# Booking OS

Desktop-first SaaS per gestire prenotazioni multi-tenant con un core condiviso pronto per tre profili operativi:

- `appointments` per appuntamenti e servizi a calendario
- `rooms` per ospitalita' e inventory camere
- `resources` per risorse prenotabili a slot

La prima release rende operativo il solo profilo `appointments`, con backoffice Electron, booking page pubblica in Next.js, schema Supabase con RLS e integrazione Stripe per caparre e pagamenti cliente.

## Stack

- `apps/web`: Next.js 16 + React 19 per booking page pubblica, route handlers e webhook Stripe
- `apps/desktop`: Electron + React + TypeScript per il gestionale staff
- `packages/core`: dominio condiviso, motore disponibilita', seed demo, guardie di profilo e helper pagamenti
- `supabase/`: schema SQL iniziale con tenancy, ruoli, prenotazioni, pagamenti, notifiche e audit log

## Avvio locale

1. Installa le dipendenze:

   ```bash
   npm install
   ```

2. Copia le variabili ambiente:

   ```bash
   cp .env.example .env
   ```

3. Avvia la booking page pubblica:

   ```bash
   npm run dev:web
   ```

4. Avvia il desktop admin in una seconda shell:

   ```bash
   npm run dev:desktop
   ```

## Demo tenant

- Booking pubblico: `http://127.0.0.1:3000/studio-aurora`
- Tenant demo: `Studio Aurora`
- Profilo attivo: `appointments`

Se `SUPABASE_URL`, `SUPABASE_ANON_KEY` o `STRIPE_SECRET_KEY` non sono configurate, il progetto usa dati demo e una simulazione di checkout per mantenere l'app navigabile end-to-end.
