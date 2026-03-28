import type { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: ReactNode;
  description?: string;
}

export function MetricCard({ title, value, description }: MetricCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <h3 className="text-sm font-medium text-slate-500 mb-1">{title}</h3>
      <div className="text-3xl font-bold text-slate-900 tracking-tight">{value}</div>
      {description && (
        <p className="text-xs text-slate-500 mt-2">{description}</p>
      )}
    </div>
  );
}
