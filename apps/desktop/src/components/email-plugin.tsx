import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ExternalLink,
  Info,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GmailToken {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
}

interface ParsedEmail {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  date: string;
  read: boolean;
  snippet: string;
  messageId?: string;
}

type Mailbox = "inbox" | "sent";
type Phase = "disconnected" | "setup" | "connecting" | "loaded";

// ─── Demo Data ────────────────────────────────────────────────────────────────

const DEMO_EMAILS: ParsedEmail[] = [
  {
    id: "demo_001",
    threadId: "thread_001",
    from: "Chiara Greco <chiara.greco@email.it>",
    to: "studio.aurora@booking.it",
    subject: "Conferma appuntamento 30 marzo",
    body: "Buongiorno,\n\nvolevo confermare la mia presenza per domani, 30 marzo alle 10:00 per il Taglio Signature con Elena.\n\nSarò puntuale. Grazie per il promemoria!\n\nCordiali saluti,\nChiara Greco",
    date: "Dom, 29 Mar 2026, 09:14",
    read: false,
    snippet: "Buongiorno, volevo confermare la mia presenza per domani...",
  },
  {
    id: "demo_002",
    threadId: "thread_002",
    from: "Luca Serra <luca.serra@gmail.com>",
    to: "studio.aurora@booking.it",
    subject: "Problema con il pagamento della caparra",
    body: "Salve,\n\nho ricevuto la conferma per il mio appuntamento del 30/03 alle 15:00 (Color Ritual con Marta).\n\nNon riesco a completare il pagamento della caparra di €46 tramite il link che mi è stato inviato. La pagina mostra un errore.\n\nPotete aiutarmi o inviarmi un nuovo link?\n\nGrazie mille,\nLuca Serra",
    date: "Sab, 28 Mar 2026, 18:45",
    read: false,
    snippet: "Non riesco a completare il pagamento della caparra...",
  },
  {
    id: "demo_003",
    threadId: "thread_003",
    from: "Valentina Russo <valentina.r@libero.it>",
    to: "studio.aurora@booking.it",
    subject: "Prenotazione per inizio aprile",
    body: "Ciao,\n\nvorrei prenotare un appuntamento per la prima settimana di aprile, preferibilmente martedì o giovedì mattina.\n\nServizio desiderato: Taglio Signature\nPreferenza staff: Elena Rossi se possibile.\n\nAttendo conferma con i giorni disponibili.\n\nGrazie!\nValentina",
    date: "Ven, 27 Mar 2026, 16:30",
    read: true,
    snippet: "vorrei prenotare un appuntamento per la prima settimana di aprile...",
  },
  {
    id: "demo_004",
    threadId: "thread_004",
    from: "noreply@stripe.com",
    to: "studio.aurora@booking.it",
    subject: "Pagamento ricevuto: €16,50",
    body: "Un pagamento è stato completato con successo.\n\nImporto: €16,50\nMetodo: Carta terminante in 4242\nRiferimento prenotazione: book_001\nData operazione: 29 Mar 2026 — 10:05\n\nI fondi saranno disponibili nel tuo account Stripe entro 2 giorni lavorativi.\n\nStripe Team",
    date: "Dom, 29 Mar 2026, 10:05",
    read: true,
    snippet: "Un pagamento di €16,50 è stato completato con successo.",
  },
  {
    id: "demo_005",
    threadId: "thread_005",
    from: "info@salone-centro.it",
    to: "studio.aurora@booking.it",
    subject: "Proposta di collaborazione",
    body: "Gentilissimi,\n\nsiamo uno studio di estetica nel centro di Milano e stiamo valutando collaborazioni con professionisti del settore per espandere la nostra offerta.\n\nSarebbe possibile organizzare una breve call conoscitiva?\n\nIn attesa di un gentile riscontro,\nTeam Salone Centro",
    date: "Ven, 27 Mar 2026, 11:20",
    read: true,
    snippet: "siamo uno studio di estetica e stiamo valutando collaborazioni...",
  },
];

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

function base64urlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64urlEncode(raw.buffer);
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  const challenge = base64urlEncode(digest);
  return { verifier, challenge };
}

// ─── OAuth helpers ────────────────────────────────────────────────────────────

function getRedirectUri(): string {
  return `${window.location.origin}/oauth/callback`;
}

function buildAuthUrl(clientId: string, challenge: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(code: string, verifier: string, clientId: string): Promise<GmailToken> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: getRedirectUri(),
      code_verifier: verifier,
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as { error_description?: string };
    throw new Error(err.error_description ?? `Autenticazione fallita (${resp.status})`);
  }
  const data = await resp.json() as { access_token: string; refresh_token?: string; expires_in?: number };
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

async function refreshAccessToken(clientId: string, refreshToken: string): Promise<GmailToken> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: refreshToken,
    }),
  });
  if (!resp.ok) throw new Error("Sessione scaduta. Riconnetti Gmail.");
  const data = await resp.json() as { access_token: string; expires_in?: number };
  return {
    access_token: data.access_token,
    refresh_token: refreshToken,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

// ─── Gmail API helpers ────────────────────────────────────────────────────────

const GMAIL_BASE = "https://www.googleapis.com/gmail/v1/users/me";

function decodeBase64Url(data: string): string {
  try {
    const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

interface GmailPayload {
  mimeType: string;
  headers: { name: string; value: string }[];
  body?: { data?: string };
  parts?: GmailPayload[];
}

function extractText(payload: GmailPayload): string {
  if (payload.body?.data) {
    if (payload.mimeType === "text/plain") return decodeBase64Url(payload.body.data);
    if (payload.mimeType === "text/html") {
      const div = document.createElement("div");
      div.innerHTML = decodeBase64Url(payload.body.data);
      return div.textContent ?? "";
    }
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data)
        return decodeBase64Url(part.body.data);
    }
    for (const part of payload.parts) {
      const t = extractText(part);
      if (t) return t;
    }
  }
  return "";
}

interface RawGmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  labelIds: string[];
  payload: GmailPayload;
}

function parseMessage(msg: RawGmailMessage): ParsedEmail {
  const h = (name: string) =>
    msg.payload.headers.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: h("from"),
    to: h("to"),
    subject: h("subject") || "(Nessun oggetto)",
    body: extractText(msg.payload),
    date: h("date"),
    read: !msg.labelIds.includes("UNREAD"),
    snippet: msg.snippet,
    messageId: h("message-id"),
  };
}

async function fetchEmails(token: string, labelIds: string[], maxResults = 15): Promise<ParsedEmail[]> {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    labelIds: labelIds.join(","),
  });
  const listResp = await fetch(`${GMAIL_BASE}/messages?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listResp.ok) throw new Error(`Impossibile caricare le email (${listResp.status})`);
  const listData = await listResp.json() as { messages?: { id: string }[] };
  const messages = listData.messages ?? [];
  if (messages.length === 0) return [];
  const details = await Promise.all(
    messages.map((m) =>
      fetch(`${GMAIL_BASE}/messages/${m.id}?format=full`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json() as Promise<RawGmailMessage>)
    )
  );
  return details.map(parseMessage);
}

function buildRawEmail(to: string, subject: string, body: string, inReplyTo?: string): string {
  const lines = [
    `To: ${to}`,
    `Subject: ${subject.startsWith("Re:") ? subject : `Re: ${subject}`}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    "",
    body,
  ].filter((l): l is string => l !== null);
  const email = lines.join("\r\n");
  const bytes = new TextEncoder().encode(email);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function gmailSendReply(token: string, email: ParsedEmail, replyBody: string): Promise<void> {
  const raw = buildRawEmail(email.from, email.subject, replyBody, email.messageId);
  const resp = await fetch(`${GMAIL_BASE}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw, threadId: email.threadId }),
  });
  if (!resp.ok) throw new Error(`Invio fallito (${resp.status})`);
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function shortFrom(from: string): string {
  const match = from.match(/^([^<]+)</);
  if (match) return match[1].trim();
  return from.includes("@") ? from.split("@")[0] : from;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EmailPlugin() {
  const [clientId, setClientId] = useState(() => localStorage.getItem("gmail_client_id") ?? "");
  const [token, setToken] = useState<GmailToken | null>(() => {
    try { return JSON.parse(localStorage.getItem("gmail_token") ?? "null") as GmailToken; }
    catch { return null; }
  });
  const [phase, setPhase] = useState<Phase>(() => (localStorage.getItem("gmail_token") ? "loaded" : "disconnected"));
  const [emails, setEmails] = useState<ParsedEmail[]>([]);
  const [mailbox, setMailbox] = useState<Mailbox>("inbox");
  const [selected, setSelected] = useState<ParsedEmail | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);

  const popupRef = useRef<Window | null>(null);
  const isDemo = !token;
  const displayEmails = isDemo ? DEMO_EMAILS : emails;

  // Listen for OAuth popup callback
  useEffect(() => {
    const handleMessage = async (e: MessageEvent<{ type?: string; code?: string; state?: string }>) => {
      if (e.data?.type !== "gmail-oauth-callback" || !e.data.code) return;
      const verifier = sessionStorage.getItem("gmail_pkce_verifier");
      const storedClientId = sessionStorage.getItem("gmail_oauth_client_id");
      if (!verifier || !storedClientId) {
        setError("Sessione OAuth scaduta. Riprova.");
        setPhase("setup");
        return;
      }
      setPhase("connecting");
      try {
        const newToken = await exchangeCode(e.data.code, verifier, storedClientId);
        localStorage.setItem("gmail_token", JSON.stringify(newToken));
        localStorage.setItem("gmail_client_id", storedClientId);
        sessionStorage.removeItem("gmail_pkce_verifier");
        sessionStorage.removeItem("gmail_oauth_client_id");
        setToken(newToken);
        setPhase("loaded");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore durante l'autenticazione");
        setPhase("setup");
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Load emails when connected
  const loadEmails = useCallback(async (currentToken: GmailToken, currentMailbox: Mailbox) => {
    setLoading(true);
    setError(null);
    try {
      let accessToken = currentToken.access_token;
      if (Date.now() > currentToken.expires_at - 60_000) {
        const storedClientId = localStorage.getItem("gmail_client_id") ?? "";
        if (currentToken.refresh_token && storedClientId) {
          const refreshed = await refreshAccessToken(storedClientId, currentToken.refresh_token);
          localStorage.setItem("gmail_token", JSON.stringify(refreshed));
          setToken(refreshed);
          accessToken = refreshed.access_token;
        }
      }
      const labelIds = currentMailbox === "inbox" ? ["INBOX"] : ["SENT"];
      const fetched = await fetchEmails(accessToken, labelIds);
      setEmails(fetched);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token && phase === "loaded") {
      void loadEmails(token, mailbox);
    }
  }, [token, phase, mailbox, loadEmails]);

  async function startOAuth() {
    if (!clientId.trim()) return;
    const { verifier, challenge } = await generatePKCE();
    sessionStorage.setItem("gmail_pkce_verifier", verifier);
    sessionStorage.setItem("gmail_oauth_client_id", clientId.trim());
    const authUrl = buildAuthUrl(clientId.trim(), challenge);
    const popup = window.open(authUrl, "gmail-auth", "width=550,height=670,left=300,top=120");
    popupRef.current = popup;
    setPhase("connecting");
  }

  async function handleSendReply() {
    if (!token || !selected || !replyText.trim()) return;
    setReplying(true);
    setError(null);
    try {
      await gmailSendReply(token.access_token, selected, replyText.trim());
      setReplyText("");
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nell'invio");
    } finally {
      setReplying(false);
    }
  }

  function handleDemoReply() {
    if (!replyText.trim()) return;
    setSendSuccess(true);
    setReplyText("");
    setTimeout(() => setSendSuccess(false), 3000);
  }

  function disconnect() {
    localStorage.removeItem("gmail_token");
    localStorage.removeItem("gmail_client_id");
    setToken(null);
    setEmails([]);
    setSelected(null);
    setPhase("disconnected");
    setError(null);
  }

  // ── DISCONNECTED ───────────────────────────────────────────────────────────
  if (phase === "disconnected") {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Mail className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Collega Gmail</h2>
          <p className="text-sm text-slate-500 mb-8 leading-relaxed">
            Leggi e rispondi alle email dei tuoi clienti direttamente dal gestionale, senza uscire dall'app.
          </p>
          <button
            onClick={() => setPhase("setup")}
            className="w-full h-11 bg-slate-900 text-white font-semibold text-sm rounded-xl hover:bg-slate-700 transition-colors"
          >
            Connetti Gmail →
          </button>
          <button
            onClick={() => setPhase("loaded")}
            className="w-full mt-3 h-10 text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Prova modalità demo
          </button>
        </div>
      </div>
    );
  }

  // ── SETUP ──────────────────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 max-w-lg w-full">
          <button
            onClick={() => { setPhase("disconnected"); setError(null); }}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 mb-6 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Indietro
          </button>

          <h2 className="text-lg font-bold text-slate-900 mb-1">Configura Google OAuth</h2>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            Per connettere Gmail serve un <strong>Client ID OAuth 2.0</strong> dal tuo progetto Google Cloud.
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
            <p className="text-xs font-semibold text-slate-700 mb-2">Come ottenere il Client ID</p>
            <ol className="list-decimal list-inside text-xs text-slate-600 space-y-1.5 leading-relaxed">
              <li>Vai su <span className="font-mono bg-white border border-slate-200 px-1 py-0.5 rounded text-[11px]">console.cloud.google.com</span></li>
              <li>Crea un progetto e abilita la <strong>Gmail API</strong></li>
              <li>Vai in <em>Credenziali</em> → <em>Crea credenziale</em> → <strong>ID client OAuth 2.0</strong></li>
              <li>Tipo applicazione: <strong>App Desktop</strong></li>
              <li>
                Aggiungi URI di reindirizzamento:{" "}
                <span className="font-mono bg-white border border-slate-200 px-1 py-0.5 rounded text-[11px] break-all">{getRedirectUri()}</span>
              </li>
              <li>Copia il <strong>Client ID</strong> qui sotto</li>
            </ol>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg p-3 mb-4 text-sm text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Google Client ID</label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => { setClientId(e.target.value); setError(null); }}
            placeholder="000000000000-xxxxxxxxxxxxxxxx.apps.googleusercontent.com"
            className="w-full h-10 px-3 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 mb-5"
          />

          <button
            disabled={!clientId.trim()}
            onClick={startOAuth}
            className="w-full h-11 bg-slate-900 text-white font-semibold text-sm rounded-xl hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Autorizza con Google →
          </button>
        </div>
      </div>
    );
  }

  // ── CONNECTING ─────────────────────────────────────────────────────────────
  if (phase === "connecting") {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="w-10 h-10 animate-spin text-slate-300 mb-4" />
        <p className="text-sm font-medium text-slate-600">Autenticazione in corso…</p>
        <p className="text-xs text-slate-400 mt-1">Completa il login nella finestra Google che si è aperta.</p>
        <button
          onClick={() => { popupRef.current?.close(); setPhase("setup"); setError(null); }}
          className="mt-6 text-xs text-slate-400 hover:text-slate-600 underline transition-colors"
        >
          Annulla
        </button>
      </div>
    );
  }

  // ── LOADED ─────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col" style={{ minHeight: 540 }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/80 shrink-0">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">{token ? "Gmail" : "Email"}</span>
          {isDemo && (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded tracking-wide">
              DEMO
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {token && (
            <button
              onClick={() => void loadEmails(token, mailbox)}
              disabled={loading}
              className="flex items-center gap-1.5 h-8 px-3 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              Aggiorna
            </button>
          )}
          {token ? (
            <button
              onClick={disconnect}
              className="flex items-center gap-1.5 h-8 px-3 text-xs text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-lg transition-colors"
            >
              <X className="w-3 h-3" /> Disconnetti
            </button>
          ) : (
            <button
              onClick={() => setPhase("setup")}
              className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <ExternalLink className="w-3 h-3" /> Connetti Gmail
            </button>
          )}
        </div>
      </div>

      {/* Body: 3 panels */}
      <div className="flex flex-1 overflow-hidden">
        {/* Panel 1: Mailboxes */}
        <div className="w-44 shrink-0 border-r border-slate-100 flex flex-col py-3">
          {(["inbox", "sent"] as Mailbox[]).map((mb) => (
            <button
              key={mb}
              onClick={() => { setMailbox(mb); setSelected(null); setError(null); }}
              className={`flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                mailbox === mb
                  ? "bg-slate-100 text-slate-900 font-semibold"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              }`}
            >
              {mb === "inbox"
                ? <Inbox className="w-3.5 h-3.5 shrink-0" />
                : <Send className="w-3.5 h-3.5 shrink-0" />}
              {mb === "inbox" ? "In arrivo" : "Inviati"}
            </button>
          ))}

          {error && (
            <div className="mx-3 mt-3 p-2 bg-rose-50 rounded-lg">
              <p className="text-[10px] text-rose-600 leading-snug">{error}</p>
            </div>
          )}

          {isDemo && (
            <div className="mx-3 mt-auto mb-2 p-2 bg-amber-50 border border-amber-100 rounded-lg">
              <div className="flex items-start gap-1.5">
                <Info className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-700 leading-snug">
                  Email di esempio. Connetti Gmail per le email reali.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Panel 2: Email list */}
        <div className="w-72 shrink-0 border-r border-slate-100 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
            </div>
          ) : displayEmails.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-slate-300">
              <Mail className="w-7 h-7 mb-2 opacity-40" />
              <p className="text-xs">Nessuna email</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {displayEmails.map((email) => (
                <button
                  key={email.id}
                  onClick={() => { setSelected(email); setReplyText(""); setSendSuccess(false); }}
                  className={`w-full text-left px-4 py-3.5 transition-colors hover:bg-slate-50 ${
                    selected?.id === email.id ? "bg-blue-50 border-r-2 border-blue-500" : ""
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2 mb-0.5">
                    <span className={`text-sm truncate ${email.read ? "text-slate-600" : "font-bold text-slate-900"}`}>
                      {shortFrom(email.from)}
                    </span>
                    {!email.read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                  </div>
                  <p className={`text-xs truncate mb-0.5 ${email.read ? "text-slate-500" : "font-semibold text-slate-700"}`}>
                    {email.subject}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate leading-snug">{email.snippet}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Panel 3: Email detail + reply */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-200">
              <Mail className="w-12 h-12 mb-3" />
              <p className="text-sm text-slate-400">Seleziona un'email per leggerla</p>
            </div>
          ) : (
            <>
              {/* Email header */}
              <div className="px-6 py-4 border-b border-slate-100 shrink-0">
                <h3 className="font-semibold text-slate-900 mb-3 leading-snug text-base">{selected.subject}</h3>
                <div className="space-y-1">
                  {[
                    { label: "Da", value: selected.from },
                    { label: "A", value: selected.to },
                    { label: "Data", value: selected.date },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex gap-3 text-xs text-slate-500">
                      <span className="font-semibold text-slate-600 w-8 shrink-0">{label}</span>
                      <span className="truncate">{value || "—"}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Email body */}
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                  {selected.body || selected.snippet}
                </pre>
              </div>

              {/* Reply composer */}
              <div className="border-t border-slate-100 px-6 py-4 bg-slate-50/60 shrink-0">
                {sendSuccess && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3 text-sm text-emerald-700">
                    <span>✓</span>
                    <span>{isDemo ? "Risposta inviata (demo)" : "Email inviata con successo!"}</span>
                  </div>
                )}
                <p className="text-xs font-semibold text-slate-600 mb-2">
                  Rispondi a <span className="text-slate-900">{shortFrom(selected.from)}</span>
                </p>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Scrivi la tua risposta…"
                  rows={4}
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none bg-white mb-3 transition-all"
                />
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => setReplyText("")}
                    className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Annulla
                  </button>
                  <button
                    onClick={isDemo ? handleDemoReply : handleSendReply}
                    disabled={!replyText.trim() || replying}
                    className="flex items-center gap-2 h-9 px-5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {replying
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Send className="w-3.5 h-3.5" />}
                    {isDemo ? "Invia (demo)" : "Invia risposta"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
