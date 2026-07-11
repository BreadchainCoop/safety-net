"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Warning, CheckCircle, Info, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type ToastTone = "error" | "success" | "info";

export interface Toast {
  id: number;
  tone: ToastTone;
  message: ReactNode;
  /** Optional inline action (e.g. "Retry"). */
  action?: { label: string; onClick: () => void };
}

interface ToastInput {
  tone?: ToastTone;
  message: ReactNode;
  action?: { label: string; onClick: () => void };
  /** ms before auto-dismiss; 0 keeps it until dismissed. Default 8000. */
  duration?: number;
}

interface ToastApi {
  toast: (input: ToastInput) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_STYLE: Record<ToastTone, string> = {
  error: "border-red-1 bg-red-0/95 text-red-main",
  success: "border-system-green/40 bg-paper-0/95 text-system-green",
  info: "border-primary-jade/40 bg-paper-0/95 text-primary-jade",
};

const ICON: Record<ToastTone, typeof Warning> = {
  error: Warning,
  success: CheckCircle,
  info: Info,
};

/**
 * App-wide toast surface. A money app must never fail silently: every write /
 * read failure is dispatched here (see use-tx, use-invite) so it stays visible
 * even if the originating component unmounts, alongside the inline TxStatus.
 * Reuses the notification-banner tone language; no new dependency.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    ({ tone = "info", message, action, duration = 8000 }: ToastInput) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-3), { id, tone, message, action }]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur",
                TONE_STYLE[t.tone],
              )}
            >
              <Icon size={18} weight="fill" className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-text-standard break-words">
                  {t.message}
                </div>
                {t.action && (
                  <button
                    type="button"
                    onClick={() => {
                      t.action?.onClick();
                      dismiss(t.id);
                    }}
                    className="text-primary-jade mt-1 font-bold hover:underline"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
                className="text-surface-grey hover:text-text-standard shrink-0"
              >
                <X size={16} weight="bold" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Access the toast API. Safe to call even outside a provider (returns no-ops),
 * so shared hooks like useTx don't crash in tests or non-app contexts.
 */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? { toast: () => 0, dismiss: () => {} };
}
