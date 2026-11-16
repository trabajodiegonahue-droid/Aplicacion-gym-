import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

// ---------------------------------------------------------------------
export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return <div onClick={onClick} className={cx('card animate-rise', onClick && 'cursor-pointer active:scale-[.99] transition', className)}>{children}</div>
}

export function Button({ variant = 'primary', loading, className, children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'soft' | 'ghost' | 'danger'; loading?: boolean }) {
  return (
    <button {...rest} disabled={rest.disabled || loading} className={cx(`btn-${variant}`, className)}>
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="muted mt-1 block text-xs">{hint}</span>}
    </label>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx('input', props.className)} />
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-6 animate-spin text-fuego-500', className)} />
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return <div className="flex flex-col items-center justify-center gap-3 py-16"><Spinner /><span className="muted text-sm">{label}</span></div>
}

export function ProgressBar({ value, max, className, color = 'from-fuego-500 to-rosa-400' }: { value: number; max: number; className?: string; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className={cx('h-3 w-full overflow-hidden rounded-full bg-fuego-100 dark:bg-noche-700', className)}>
      <div className={cx('h-full rounded-full bg-gradient-to-r transition-all duration-700', color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Ring({ value, max, size = 96, stroke = 10, children, color = '#ef233c' }: { value: number; max: number; size?: number; stroke?: number; children?: ReactNode; color?: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(1, value / max) : 0
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeWidth={stroke} fill="none" className="text-fuego-100 dark:text-noche-700" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset .8s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center justify-between gap-3 text-left disabled:opacity-50">
      {label && <span className="flex-1">{label}</span>}
      <span className={cx('relative inline-flex h-8 w-14 shrink-0 rounded-full transition', checked ? 'bg-gradient-to-r from-fuego-500 to-rosa-400' : 'bg-fuego-100 dark:bg-noche-700')}>
        <span className={cx('absolute top-1 size-6 rounded-full bg-white shadow transition-all', checked ? 'left-7' : 'left-1')} />
      </span>
    </button>
  )
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cx('no-scrollbar flex gap-1 overflow-x-auto rounded-2xl bg-fuego-100/70 p-1 dark:bg-noche-800', className)}>
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cx('min-h-10 flex-1 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition',
            value === o.value ? 'bg-white text-fuego-600 shadow-sm dark:bg-noche-700 dark:text-fuego-200' : 'text-fuego-800/70 dark:text-fuego-100/60')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon && <div className="mb-1 text-4xl">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {text && <p className="muted text-sm">{text}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between px-1">
      <h2 className="text-lg font-bold">{children}</h2>
      {action}
    </div>
  )
}

// ---------------------------------------------------------------------
// Hoja inferior (modal estilo iOS)
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-fuego-50 shadow-2xl animate-rise dark:bg-noche-900"
        style={{ paddingBottom: 'max(var(--safe-bottom), 16px)' }}>
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div className="mx-auto mb-1 h-1.5 w-10 rounded-full bg-fuego-200 dark:bg-noche-700 absolute left-1/2 top-2 -translate-x-1/2" />
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="flex size-10 items-center justify-center rounded-full bg-fuego-100 dark:bg-noche-700"><X className="size-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 pb-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------------
// Toasts + confirmaciones
type Toast = { id: number; text: string; kind: 'ok' | 'error' }
type ConfirmReq = { title: string; text?: string; confirm?: string; danger?: boolean; resolve: (v: boolean) => void }
const UiCtx = createContext<{ toast: (text: string, kind?: 'ok' | 'error') => void; confirm: (o: Omit<ConfirmReq, 'resolve'>) => Promise<boolean> } | null>(null)

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [conf, setConf] = useState<ConfirmReq | null>(null)
  const idRef = useRef(0)
  const toast = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = ++idRef.current
    setToasts(t => [...t, { id, text, kind }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), kind === 'error' ? 5000 : 2800)
  }, [])
  const confirm = useCallback((o: Omit<ConfirmReq, 'resolve'>) => new Promise<boolean>(resolve => setConf({ ...o, resolve })), [])
  const close = (v: boolean) => { conf?.resolve(v); setConf(null) }
  return (
    <UiCtx.Provider value={{ toast, confirm }}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4" style={{ top: 'calc(var(--safe-top) + 8px)' }}>
          {toasts.map(t => (
            <div key={t.id} className={cx('pointer-events-auto flex max-w-md items-start gap-2 rounded-2xl px-4 py-3 text-sm font-semibold shadow-xl animate-pop',
              t.kind === 'ok' ? 'bg-white text-fuego-700 dark:bg-noche-700 dark:text-fuego-100' : 'bg-red-600 text-white')}>
              {t.kind === 'ok' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
              <span>{t.text}</span>
            </div>
          ))}
        </div>, document.body)}
      {conf && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/50" onClick={() => close(false)} />
          <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl animate-pop dark:bg-noche-800">
            <h3 className="text-lg font-bold">{conf.title}</h3>
            {conf.text && <p className="muted mt-2 text-sm">{conf.text}</p>}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button className="btn-soft" onClick={() => close(false)}>Cancelar</button>
              <button className={conf.danger ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)}>{conf.confirm ?? 'Aceptar'}</button>
            </div>
          </div>
        </div>, document.body)}
    </UiCtx.Provider>
  )
}

export function useUi() {
  const v = useContext(UiCtx)
  if (!v) throw new Error('useUi fuera de UiProvider')
  return v
}
