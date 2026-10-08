import { createContext, useCallback, useContext, useRef, useState } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const push = useCallback((message, type = 'info', timeout = 4500) => {
    const id = ++idRef.current
    // Only one toast on screen at a time — a new one replaces whatever was showing,
    // instead of stacking up (matters a lot when something fires repeatedly, like
    // auth state changes during sign-in).
    setToasts([{ id, message, type }])
    if (timeout) {
      setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== id))
      }, timeout)
    }
    return id
  }, [])

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const api = {
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error', 7000),
    info: (m) => push(m, 'info'),
    warn: (m) => push(m, 'warn'),
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center w-full px-4 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={
              'pointer-events-auto cursor-pointer max-w-md w-full sm:w-auto px-4 py-2.5 rounded-lg border text-sm font-medium shadow-lg backdrop-blur-sm ' +
              (t.type === 'error'
                ? 'bg-danger/15 border-danger/40 text-danger'
                : t.type === 'success'
                ? 'bg-brand-500/15 border-brand-500/40 text-brand-200'
                : t.type === 'warn'
                ? 'bg-warn/15 border-warn/40 text-warn'
                : 'bg-bg-raised border-line text-ink')
            }
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}