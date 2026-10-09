/**
 * Toast context + hook, intentionally co-located.
 */
/* eslint-disable react-refresh/only-export-components */

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleCheck, CircleX, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  variant: ToastVariant;
  title: string;
  message?: string;
}

interface ToastContextValue {
  push: (variant: ToastVariant, title: string, message?: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastVariant, typeof Info> = {
  success: CircleCheck,
  error: CircleX,
  info: Info,
};

const AUTO_DISMISS_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, title: string, message?: string) => {
      counterRef.current += 1;
      const id = counterRef.current;
      setToasts((current) => [...current.slice(-3), { id, variant, title, message }]);
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Toast viewport */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:top-6 sm:bottom-auto"
      >
        {toasts.map((toast) => {
          const Icon = ICONS[toast.variant];
          return (
            <div
              key={toast.id}
              className="animate-toast-in pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-lg border border-line bg-navy-850 shadow-xl shadow-black/40"
            >
              <div className="flex items-start gap-3 px-4 py-3.5">
                <Icon
                  className={`mt-0.5 h-5 w-5 shrink-0 ${
                    toast.variant === 'success'
                      ? 'text-emerald-400'
                      : toast.variant === 'error'
                        ? 'text-rose-400'
                        : 'text-electric-400'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{toast.title}</p>
                  {toast.message ? <p className="mt-0.5 text-sm text-slate-300">{toast.message}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                  aria-label="Dismiss notification"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider.');
  return ctx;
}