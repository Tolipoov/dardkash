"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastContextValue {
  push: (message: string, type?: ToastItem["type"]) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Butun ilova bo'ylab bildirishnoma chiqarish uchun shu hook ishlatiladi:
// const toast = useToast(); toast.push("Saqlandi!", "success");
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast albatta <ToastProvider> ichida ishlatilishi kerak");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, type: ToastItem["type"] = "info") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    // 4 soniyadan keyin o'zi yo'qoladi
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // `push` referensi barqaror bo'lsa ham, {} obyekti har render'da yangi
  // bo'lardi — useMemo bilan o'raymiz, aks holda ToastProvider render
  // bo'lgan sari useToast()'ga bog'liq har qanday useEffect qayta ishga
  // tushib ketishi mumkin (masalan dashboard'dagi ma'lumot yuklash effekti).
  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Bildirishnomalar ekranning pastki o'ng burchagida chiqadi */}
      <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={clsx(
              "pointer-events-auto min-w-[260px] max-w-sm rounded-2xl px-4 py-3 text-sm font-sans shadow-lg backdrop-blur-md animate-toast-in",
              t.type === "success" && "bg-barg text-sahar",
              t.type === "error" && "bg-gisht text-sahar",
              t.type === "info" && "bg-tun-deep text-sahar"
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
