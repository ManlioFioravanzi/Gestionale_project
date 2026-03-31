export type ThemeMode = "classic" | "lakers";

export interface DesktopTheme {
  id: ThemeMode;
  label: {
    it: string;
    en: string;
  };
  description: {
    it: string;
    en: string;
  };
  preview: [string, string, string];
  cssVars: Record<string, string>;
  chartPalette: {
    navy: string;
    blue: string;
    amber: string;
    green: string;
    orange: string;
    slate: string;
  };
  bookingTones: string[];
}

export interface UiPreferences {
  locale: string;
  themeMode: ThemeMode;
  themeSwatches: Record<ThemeMode, string>;
}

const STORAGE_KEY = "booking_os_desktop_ui";

export const desktopThemes: Record<ThemeMode, DesktopTheme> = {
  classic: {
    id: "classic",
    label: {
      it: "BeeHive Classic",
      en: "BeeHive Classic",
    },
    description: {
      it: "Palette attuale con blu operativo, superfici neutre e sidebar navy.",
      en: "Current palette with operational blues, neutral surfaces, and a navy sidebar.",
    },
    preview: ["#0f172a", "#2563eb", "#f59e0b"],
    cssVars: {
      "--app-shell-bg": "#f8fafc",
      "--app-foreground": "#0f172a",
      "--app-surface": "#ffffff",
      "--app-surface-muted": "#f8fafc",
      "--app-surface-hover": "#f1f5f9",
      "--app-border": "#e2e8f0",
      "--app-border-strong": "#cbd5e1",
      "--app-sidebar-bg": "#0f172a",
      "--app-sidebar-muted": "#94a3b8",
      "--app-accent": "#2563eb",
      "--app-accent-soft": "rgba(37, 99, 235, 0.12)",
      "--app-accent-soft-strong": "rgba(37, 99, 235, 0.18)",
      "--app-accent-contrast": "#ffffff",
      "--app-secondary": "#f59e0b",
      "--app-secondary-soft": "rgba(245, 158, 11, 0.16)",
      "--app-secondary-contrast": "#5b3a00",
      "--app-top-strip-bg": "#0f172a",
      "--app-top-strip-text": "#ffffff",
      "--app-top-strip-muted": "#94a3b8",
    },
    chartPalette: {
      navy: "#1e3a8a",
      blue: "#2563eb",
      amber: "#f59e0b",
      green: "#16a34a",
      orange: "#f97316",
      slate: "#64748b",
    },
    bookingTones: ["#2563eb", "#0f766e", "#c2410c", "#7c3aed", "#b91c1c", "#0369a1"],
  },
  lakers: {
    id: "lakers",
    label: {
      it: "Lakers Purple & Gold",
      en: "Lakers Purple & Gold",
    },
    description: {
      it: "Tema viola e arancione/oro ispirato al look purple-gold richiesto.",
      en: "Purple and orange-gold theme inspired by the requested purple-gold look.",
    },
    preview: ["#2c174d", "#552583", "#fdb927"],
    cssVars: {
      "--app-shell-bg": "#fbf7ee",
      "--app-foreground": "#231435",
      "--app-surface": "#ffffff",
      "--app-surface-muted": "#faf4e6",
      "--app-surface-hover": "#f6edd8",
      "--app-border": "#eadfc6",
      "--app-border-strong": "#dac89f",
      "--app-sidebar-bg": "#2c174d",
      "--app-sidebar-muted": "#d8c8ef",
      "--app-accent": "#552583",
      "--app-accent-soft": "rgba(85, 37, 131, 0.13)",
      "--app-accent-soft-strong": "rgba(85, 37, 131, 0.21)",
      "--app-accent-contrast": "#ffffff",
      "--app-secondary": "#f5a623",
      "--app-secondary-soft": "rgba(245, 166, 35, 0.18)",
      "--app-secondary-contrast": "#5f3d00",
      "--app-top-strip-bg": "linear-gradient(135deg, #2c174d 0%, #552583 56%, #8e63d2 100%)",
      "--app-top-strip-text": "#fff8ea",
      "--app-top-strip-muted": "#f3dc9f",
    },
    chartPalette: {
      navy: "#2c174d",
      blue: "#552583",
      amber: "#f5a623",
      green: "#2f855a",
      orange: "#f08c2e",
      slate: "#7c6b8c",
    },
    bookingTones: ["#552583", "#7c3aed", "#f5a623", "#c77800", "#9353d3", "#2f855a"],
  },
};

const DEFAULT_THEME_SWATCHES: Record<ThemeMode, string> = {
  classic: desktopThemes.classic.preview[1],
  lakers: desktopThemes.lakers.preview[1],
};

function normalizeThemeSwatches(input?: Partial<Record<ThemeMode, string>> | null) {
  return {
    classic:
      input?.classic && desktopThemes.classic.preview.includes(input.classic)
        ? input.classic
        : DEFAULT_THEME_SWATCHES.classic,
    lakers:
      input?.lakers && desktopThemes.lakers.preview.includes(input.lakers)
        ? input.lakers
        : DEFAULT_THEME_SWATCHES.lakers,
  } satisfies Record<ThemeMode, string>;
}

export function loadUiPreferences(): UiPreferences {
  if (typeof window === "undefined") {
    return {
      locale: "it-IT",
      themeMode: "classic",
      themeSwatches: DEFAULT_THEME_SWATCHES,
    };
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as
      | Partial<UiPreferences>
      | null;

    return {
      locale: parsed?.locale === "en-GB" ? "en-GB" : "it-IT",
      themeMode: parsed?.themeMode === "lakers" ? "lakers" : "classic",
      themeSwatches: normalizeThemeSwatches(parsed?.themeSwatches),
    };
  } catch {
    return {
      locale: "it-IT",
      themeMode: "classic",
      themeSwatches: DEFAULT_THEME_SWATCHES,
    };
  }
}

export function saveUiPreferences(preferences: UiPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...preferences,
      themeSwatches: normalizeThemeSwatches(preferences.themeSwatches),
    }),
  );
}
