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
  Scissors,
  Settings,
  UserCog,
  Users,
} from "lucide-react";
import type { MouseEvent } from "react";
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
}

const navItems: Array<{ id: SidebarSection; label: string; icon: React.ElementType }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "planning", label: "Planning", icon: Calendar },
  { id: "bookings", label: "Prenotazioni", icon: ClipboardList },
  { id: "customers", label: "Clienti", icon: Users },
  { id: "services", label: "Servizi", icon: Scissors },
  { id: "staff", label: "Staff", icon: UserCog },
  { id: "payments", label: "Pagamenti", icon: CreditCard },
  { id: "notifications", label: "Notifiche", icon: Bell },
  { id: "email", label: "Email", icon: Mail },
  { id: "settings", label: "Impostazioni", icon: Settings },
];

export function Sidebar({
  activeSection,
  onSectionSelect,
  onReturnToProfileSelection,
  collapsed,
  onToggleCollapse,
  notificationCount,
}: SidebarProps) {
  return (
    <motion.aside
      className="bg-[#0f172a] text-white flex flex-col h-full relative"
      animate={{ width: collapsed ? 68 : 240 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      style={{ willChange: "width" }}
    >
      <div className="flex-1 overflow-y-auto py-6 flex flex-col gap-6 no-scrollbar">
        {/* Branding */}
        <div className="px-4 flex items-center justify-center min-h-[48px]">
          <div className="bg-white/10 w-10 h-10 rounded shadow-sm flex items-center justify-center shrink-0 overflow-hidden">
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
                <div className="text-[10px] font-bold tracking-wider text-slate-400">DESKTOP ADMIN</div>
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
                className={`
                  relative flex items-center h-10 px-2 rounded-lg transition-colors group
                  ${isActive ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"}
                `}
                title={collapsed ? item.label : undefined}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active-indicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-blue-500 rounded-full"
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
                      className={`text-sm font-medium whitespace-nowrap overflow-hidden text-left flex-1 px-2 ${isActive ? "text-white" : "text-slate-300"}`}
                    >
                      {item.label}
                    </motion.div>
                  )}
                </AnimatePresence>

                {item.id === "notifications" && notificationCount > 0 && (
                  <div className={`
                    absolute right-2 flex items-center justify-center bg-blue-600 font-bold text-white rounded-full
                    ${collapsed ? "top-1 right-1 w-4 h-4 text-[9px]" : "top-1/2 -translate-y-1/2 w-5 h-5 text-[10px]"}
                  `}>
                    {notificationCount}
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-3">
          <div className="mb-3 border-t border-white/10" />
          <button
            onClick={onReturnToProfileSelection}
            className="relative flex h-10 w-full items-center rounded-lg px-2 text-amber-200 transition-colors group hover:bg-white/5 hover:text-white"
            title={collapsed ? "Torna alla selezione profilo" : undefined}
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
                  <span className="text-sm font-medium">Selezione profilo</span>
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>

      {/* Footer Toggle */}
      <div className="p-4 border-t border-white/10">
        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center h-10 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>
    </motion.aside>
  );
}
