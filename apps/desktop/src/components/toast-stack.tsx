import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from "lucide-react";

export type ToastTone = "success" | "info" | "warning" | "error";

export interface ToastMessage {
  id: string;
  tone: ToastTone;
  text: string;
}

interface ToastStackProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const icons = {
  success: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
  info: <Info className="w-5 h-5 text-blue-500" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
  error: <XCircle className="w-5 h-5 text-rose-500" />,
};

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, x: 50, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            className="pointer-events-auto bg-white border border-slate-200 shadow-lg rounded-xl flex items-start p-4 min-w-[320px] max-w-sm"
          >
            <div className="shrink-0 mt-0.5 mr-3">
              {icons[toast.tone]}
            </div>
            <div className="flex-1 text-sm text-slate-700 pr-4 leading-relaxed">
              {toast.text}
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors ml-2 -mt-1 -mr-1 p-1 rounded-md hover:bg-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
