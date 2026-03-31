import type { ReactNode } from "react";
import { format } from "date-fns";
import type { AppLanguage } from "../i18n";
import { getDateFnsLocale } from "../i18n";

interface PageHeaderProps {
  title: string;
  badges?: ReactNode[];
  actions?: ReactNode;
  language: AppLanguage;
}

export function PageHeader({ title, badges, actions, language }: PageHeaderProps) {
  const currentDate = format(new Date(), "EEEE d MMMM yyyy", {
    locale: getDateFnsLocale(language),
  });

  return (
    <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--app-content-muted)" }}
          >
            {currentDate}
          </span>
          {badges && badges.length > 0 && (
            <>
              <span style={{ color: "var(--app-content-muted)" }}>•</span>
              <div className="flex items-center gap-2">
                {badges.map((badge, i) => (
                  <div key={i}>{badge}</div>
                ))}
              </div>
            </>
          )}
        </div>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--app-content-heading)" }}>
          {title}
        </h1>
      </div>
      
      {actions && (
        <div className="flex items-center gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}
