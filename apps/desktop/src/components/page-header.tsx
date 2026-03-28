import type { ReactNode } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface PageHeaderProps {
  title: string;
  badges?: ReactNode[];
  actions?: ReactNode;
}

export function PageHeader({ title, badges, actions }: PageHeaderProps) {
  const currentDate = format(new Date(), "EEEE d MMMM yyyy", { locale: it });

  return (
    <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
            {currentDate}
          </span>
          {badges && badges.length > 0 && (
            <>
              <span className="text-slate-300">•</span>
              <div className="flex items-center gap-2">
                {badges.map((badge, i) => (
                  <div key={i}>{badge}</div>
                ))}
              </div>
            </>
          )}
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
      </div>
      
      {actions && (
        <div className="flex items-center gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}
