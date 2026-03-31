import type { CSSProperties } from "react";

export type StatusVariant = "success" | "warning" | "error" | "info" | "neutral";

interface StatusBadgeProps {
  status: string;
  variant: StatusVariant;
  className?: string;
}

const variants: Record<StatusVariant, CSSProperties> = {
  success: {
    backgroundColor: "var(--app-status-success-bg)",
    color: "var(--app-status-success-text)",
    borderColor: "var(--app-status-success-border)",
  },
  warning: {
    backgroundColor: "var(--app-status-warning-bg)",
    color: "var(--app-status-warning-text)",
    borderColor: "var(--app-status-warning-border)",
  },
  error: {
    backgroundColor: "var(--app-status-error-bg)",
    color: "var(--app-status-error-text)",
    borderColor: "var(--app-status-error-border)",
  },
  info: {
    backgroundColor: "var(--app-status-info-bg)",
    color: "var(--app-status-info-text)",
    borderColor: "var(--app-status-info-border)",
  },
  neutral: {
    backgroundColor: "var(--app-status-neutral-bg)",
    color: "var(--app-status-neutral-text)",
    borderColor: "var(--app-status-neutral-border)",
  },
};

export function StatusBadge({ status, variant, className }: StatusBadgeProps) {
  return (
    <span
      className={`theme-status-badge inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${className || ""}`}
      style={variants[variant]}
    >
      {status}
    </span>
  );
}
