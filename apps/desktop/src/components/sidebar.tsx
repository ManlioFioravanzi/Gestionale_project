import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeftCircle,
  Bell,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Mail,
  Package,
  Settings,
  UserCog,
  Users,
} from "lucide-react";
import type { AppLanguage } from "../i18n";
import { BeeHiveLogo } from "./beehive-logo";

export type SidebarSection =
  | "dashboard"
  | "planning"
  | "bookings"
  | "customers"
  | "services"
  | "staff"
  | "payments"
  | "notifications"
  | "email"
  | "settings";

interface SidebarProps {
  activeSection: SidebarSection;
  onSectionSelect: (section: SidebarSection) => void;
  onReturnToProfileSelection: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  notificationCount: number;
  language: AppLanguage;
}

function getNavItems(language: AppLanguage): Array<{ id: SidebarSection; label: string; icon: React.ElementType }> {
  if (language === "en") {
    return [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { id: "planning", label: "Planning", icon: Calendar },
      { id: "bookings", label: "Bookings", icon: ClipboardList },
      { id: "customers", label: "Customers", icon: Users },
      { id: "services", label: "Services", icon: Package },
      { id: "staff", label: "Staff", icon: UserCog },
      { id: "payments", label: "Payments", icon: CreditCard },
      { id: "notifications", label: "Notifications", icon: Bell },
      { id: "email", label: "Email", icon: Mail },
      { id: "settings", label: "Settings", icon: Settings },
    ];
  }

  return [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "planning", label: "Planning", icon: Calendar },
    { id: "bookings", label: "Prenotazioni", icon: ClipboardList },
    { id: "customers", label: "Clienti", icon: Users },
    { id: "services", label: "Servizi", icon: Package },
    { id: "staff", label: "Staff", icon: UserCog },
    { id: "payments", label: "Pagamenti", icon: CreditCard },
    { id: "notifications", label: "Notifiche", icon: Bell },
    { id: "email", label: "Email", icon: Mail },
    { id: "settings", label: "Impostazioni", icon: Settings },
  ];
}

export function Sidebar({
  activeSection,
  onSectionSelect,
  onReturnToProfileSelection,
  collapsed,
  onToggleCollapse,
  notificationCount,
  language,
}: SidebarProps) {
  const navItems = getNavItems(language);
  const returnLabel =
    language === "en" ? "Return to profile selection" : "Torna alla selezione profilo";

  return (
    <motion.aside
      className="flex h-full flex-col relative"
      animate={{ width: collapsed ? 68 : 240 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      style={{
        willChange: "width",
        background: "var(--app-sidebar-bg)",
        color: "var(--app-sidebar-text)",
      }}
      data-theme-surface="sidebar"
    >
      <div className="flex-1 overflow-y-auto py-6 flex flex-col gap-6 no-scrollbar">
        {/* Branding */}
        <div className="px-4 flex items-center justify-center min-h-[48px]">
          <div
            className="w-10 h-10 rounded shadow-sm flex items-center justify-center shrink-0 overflow-hidden"
            style={{ backgroundColor: "var(--app-sidebar-surface)" }}
          >
            <BeeHiveLogo size={24} />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="ml-3 overflow-hidden whitespace-nowrap"
              >
                <div className="text-[10px] font-bold tracking-wider" style={{ color: "var(--app-sidebar-muted)" }}>
                  DESKTOP ADMIN
                </div>
                <div className="font-semibold text-lg leading-tight mt-0.5 tracking-tight">BeeHive</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1 px-3">
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => onSectionSelect(item.id)}
                className="app-sidebar-nav-btn relative flex items-center h-10 px-2 rounded-lg transition-colors group"
                data-active={isActive ? "true" : "false"}
                title={collapsed ? item.label : undefined}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active-indicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full"
                    style={{ backgroundColor: "var(--app-accent)" }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                
                <AnimatePresence mode="popLayout">
                  {collapsed ? (
                    <motion.div 
                      key="icon"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.15 }}
                      className="w-6 h-6 flex items-center justify-center shrink-0"
                    >
                      <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="label"
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }}
                      className="text-sm font-medium whitespace-nowrap overflow-hidden text-left flex-1 px-2"
                    >
                      {item.label}
                    </motion.div>
                  )}
                </AnimatePresence>

                {item.id === "notifications" && notificationCount > 0 && (
                  <div className={`
                    absolute right-2 flex items-center justify-center font-bold rounded-full
                    ${collapsed ? "top-1 right-1 w-4 h-4 text-[9px]" : "top-1/2 -translate-y-1/2 w-5 h-5 text-[10px]"}
                  `}
                  style={{
                    backgroundColor: "var(--app-accent)",
                    color: "var(--app-sidebar-notification-text)",
                  }}>
                    {notificationCount}
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-3">
          <div className="mb-3 border-t" style={{ borderColor: "var(--app-sidebar-border)" }} />
          <button
            onClick={onReturnToProfileSelection}
            className="app-sidebar-return-btn relative flex h-10 w-full items-center rounded-lg px-2 transition-colors group"
            title={collapsed ? returnLabel : undefined}
          >
            <AnimatePresence mode="popLayout">
              {collapsed ? (
                <motion.div
                  key="return-icon"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                  className="flex h-6 w-6 items-center justify-center shrink-0"
                >
                  <ArrowLeftCircle className="h-[18px] w-[18px]" strokeWidth={2} />
                </motion.div>
              ) : (
                <motion.div
                  key="return-label"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="flex items-center gap-3 overflow-hidden whitespace-nowrap px-2 text-left"
                >
                  <ArrowLeftCircle className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                  <span className="text-sm font-medium">{language === "en" ? "Profile selection" : "Selezione profilo"}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>

      {/* Footer Toggle */}
      <div className="p-4 border-t" style={{ borderColor: "var(--app-sidebar-border)" }}>
        <button
          onClick={onToggleCollapse}
          className="app-sidebar-toggle-btn w-full flex items-center justify-center h-10 rounded-lg transition-colors"
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>
    </motion.aside>
  );
}
