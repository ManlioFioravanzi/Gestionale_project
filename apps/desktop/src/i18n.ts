import { enUS, it } from "date-fns/locale";

export type AppLanguage = "it" | "en";

export function getLanguageFromLocale(locale: string): AppLanguage {
  return locale.toLowerCase().startsWith("en") ? "en" : "it";
}

export function getDateFnsLocale(language: AppLanguage) {
  return language === "en" ? enUS : it;
}

export function translateStatusLabel(value: string, language: AppLanguage) {
  const labels: Record<string, { it: string; en: string }> = {
    confirmed: { it: "Confermata", en: "Confirmed" },
    completed: { it: "Completata", en: "Completed" },
    checked_in: { it: "Accolta", en: "Checked in" },
    cancelled: { it: "Annullata", en: "Cancelled" },
    no_show: { it: "No-show", en: "No-show" },
    paid: { it: "Pagata", en: "Paid" },
    pending: { it: "In attesa", en: "Pending" },
    refunded: { it: "Rimborsata", en: "Refunded" },
    sent: { it: "Inviata", en: "Sent" },
    queued: { it: "In coda", en: "Queued" },
    failed: { it: "Fallita", en: "Failed" },
    appointments: { it: "Appuntamenti", en: "Appointments" },
    rooms: { it: "Camere", en: "Rooms" },
    resources: { it: "Risorse", en: "Resources" },
  };

  return labels[value]?.[language] ?? value;
}

export function translateRoleLabel(value: string, language: AppLanguage) {
  const labels: Record<string, { it: string; en: string }> = {
    owner: { it: "Titolare", en: "Owner" },
    manager: { it: "Manager", en: "Manager" },
    operator: { it: "Operatore", en: "Operator" },
  };

  return labels[value]?.[language] ?? value;
}
