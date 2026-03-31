import type { BusinessProfile } from "@booking/core";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Building2, CalendarDays, KeyRound, Package } from "lucide-react";
import type { FormEvent } from "react";
import type { AppLanguage } from "../i18n";
import { BeeHiveLogo } from "./beehive-logo";

interface LaunchpadProps {
  selectedProfile: BusinessProfile | null;
  activationCode: string;
  activationError: string | null;
  onSelectProfile: (profile: BusinessProfile) => void;
  onActivationCodeChange: (value: string) => void;
  onActivate: () => void;
  language: AppLanguage;
}

interface ProfileCardMeta {
  id: BusinessProfile;
  title: string;
  subtitle: string;
  available: boolean;
  icon: typeof CalendarDays;
}

function getProfileCards(language: AppLanguage): ProfileCardMeta[] {
  return [
    {
      id: "appointments",
      title: "Appointments",
      subtitle:
        language === "en" ? "Operational profile available now" : "Profilo operativo disponibile ora",
      available: true,
      icon: CalendarDays,
    },
    {
      id: "rooms",
      title: "Rooms",
      subtitle: language === "en" ? "Planned profile, coming soon" : "Profilo previsto, in arrivo",
      available: false,
      icon: Building2,
    },
    {
      id: "resources",
      title: "Resources",
      subtitle: language === "en" ? "Planned profile, coming soon" : "Profilo previsto, in arrivo",
      available: false,
      icon: Package,
    },
  ];
}

function profileBadge(available: boolean, language: AppLanguage) {
  if (available) {
    return (
      <span className="inline-flex rounded-full border border-emerald-300/35 bg-emerald-400/12 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
        {language === "en" ? "available" : "disponibile"}
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full border border-slate-300/25 bg-slate-300/10 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
      {language === "en" ? "coming soon" : "in arrivo"}
    </span>
  );
}

export function Launchpad({
  selectedProfile,
  activationCode,
  activationError,
  onSelectProfile,
  onActivationCodeChange,
  onActivate,
  language,
}: LaunchpadProps) {
  const profileCards = getProfileCards(language);
  const activeProfile =
    profileCards.find((profile) => profile.id === selectedProfile) ?? null;
  const ActiveProfileIcon = activeProfile?.icon;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onActivate();
  }

  return (
    <div
      className="flex min-h-screen w-full items-center justify-center px-6 py-10 font-sans"
      style={{ background: "var(--app-sidebar-bg)" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className="w-full max-w-5xl"
      >
        <header className="mb-10 text-center">
          <div className="mx-auto mb-4 flex w-fit items-center justify-center">
            <BeeHiveLogo
              size={45.32}
              className="rounded-md drop-shadow-[0_0_8px_rgba(226,173,51,0.34)] [filter:drop-shadow(0_0_8px_rgba(226,173,51,0.34))_drop-shadow(0_0_18px_rgba(226,173,51,0.22))]"
            />
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white">BeeHive</h1>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {profileCards.map((profile, index) => {
            const Icon = profile.icon;
            const selected = selectedProfile === profile.id;

            return (
              <motion.button
                key={profile.id}
                type="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: index * 0.05 }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => onSelectProfile(profile.id)}
                className={[
                  "rounded-2xl border bg-[#111b31] p-5 text-left shadow-lg shadow-black/15 transition-all",
                  selected
                    ? "border-blue-300/60 ring-2 ring-blue-300/30"
                    : "border-white/12 hover:border-white/25",
                ].join(" ")}
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-slate-100">
                    <Icon className="h-5 w-5" />
                  </div>
                  {profileBadge(profile.available, language)}
                </div>
                <h2 className="mt-4 text-2xl font-bold tracking-tight text-white">
                  {profile.title}
                </h2>
                <p className="mt-2 text-sm text-slate-200/75">{profile.subtitle}</p>
              </motion.button>
            );
          })}
        </div>

        <AnimatePresence>
          {activeProfile ? (
            <motion.section
              key={activeProfile.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="mx-auto mt-6 w-full max-w-xl rounded-2xl border border-white/15 bg-[#111b31] p-5 shadow-lg shadow-black/15"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-slate-100">
                  {ActiveProfileIcon ? <ActiveProfileIcon className="h-4 w-4" /> : null}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300/80">
                    {language === "en" ? "Selected profile" : "Profilo selezionato"}
                  </p>
                  <h3 className="text-lg font-bold text-white">{activeProfile.title}</h3>
                </div>
              </div>

              <form className="mt-4 flex flex-col gap-3" onSubmit={handleSubmit}>
                <label className="flex flex-col gap-2">
                  <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-300/85">
                    <KeyRound className="h-3.5 w-3.5" />
                    {language === "en" ? "Activation code" : "Codice di attivazione"}
                  </span>
                  <input
                    autoFocus
                    type="password"
                    value={activationCode}
                    onChange={(event) => onActivationCodeChange(event.target.value)}
                    placeholder={language === "en" ? "Enter the code" : "Inserisci il codice"}
                    className={[
                      "h-11 rounded-xl border px-3 text-sm font-semibold shadow-sm transition-all",
                      "focus:outline-none focus:ring-2",
                      activationError
                        ? "border-rose-300 bg-rose-50 text-rose-900 focus:border-rose-400 focus:ring-rose-500/15"
                        : "border-white/20 bg-[#121f3a] text-white focus:border-blue-300 focus:ring-blue-300/20",
                    ].join(" ")}
                  />
                </label>

                {activationError ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                    {activationError}
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/18 bg-[#121f3a] px-3 py-2 text-xs text-slate-300">
                    {language === "en" ? "Current demo code:" : "Codice demo attuale:"}{" "}
                    <strong className="text-white">12345</strong>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!activationCode.trim()}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#0b1426] transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {language === "en" ? "Activate" : "Attiva"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            </motion.section>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
