import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  visible: boolean;
}

interface ToastCtx {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastCtx>({ toast: () => {} });

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Track pending timers so we can clear them on unmount and avoid "setState on
  // unmounted component" warnings / leaks.
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type, visible: false }]);
    // Trigger show animation
    requestAnimationFrame(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: true } : t)));
    });
    // Auto-dismiss (tracked so unmount cancels both timers)
    const hideTimer = setTimeout(() => {
      timersRef.current.delete(hideTimer);
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: false } : t)));
      const removeTimer = setTimeout(() => {
        timersRef.current.delete(removeTimer);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
      timersRef.current.add(removeTimer);
    }, 3000);
    timersRef.current.add(hideTimer);
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="toast-container" id="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}${t.visible ? ' show' : ''}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
