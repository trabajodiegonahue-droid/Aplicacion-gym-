import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

// ---------------------------------------------------------------------
export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return <div onClick={onClick} className={cx('card', onClick && 'cursor-pointer transition active:scale-[.985]', className)}>{children}</div>
}

export function Button({ variant = 'primary', loading, className, children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'soft' | 'ghost' | 'danger' | 'ember'; loading?: boolean }) {
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
  return <Loader2 className={cx('size-5 animate-spin text-fuego-800/50', className)} />
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return <div className="flex flex-col items-center justify-center gap-3 py-16"><Spinner /><span className="muted text-sm">{label}</span></div>
}

export function ProgressBar({ value, max, className, color = 'bg-ember' }: { value: number; max: number; className?: string; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-fuego-100 dark:bg-noche-700', className)}>
      <div className={cx('h-full rounded-full transition-all duration-700', pct >= 100 ? 'bg-emerald-500' : color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Ring({ value, max, size = 96, stroke = 8, children, color = '#e11d48' }: { value: number; max: number; size?: number; stroke?: number; children?: ReactNode; color?: string }) {
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
      <span className={cx('relative inline-flex h-[30px] w-[50px] shrink-0 rounded-full transition-colors', checked ? 'bg-emerald-500' : 'bg-fuego-200 dark:bg-noche-700')}>
        <span className={cx('absolute top-[2px] size-[26px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,.18)] transition-all', checked ? 'left-[22px]' : 'left-[2px]')} />
      </span>
    </button>
  )
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cx('no-scrollbar flex gap-0.5 overflow-x-auto rounded-[14px] bg-fuego-200/60 p-[3px] dark:bg-noche-800', className)}>
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cx('min-h-9 flex-1 whitespace-nowrap rounded-[11px] px-3 text-[13px] font-semibold transition',
            value === o.value ? 'bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,.1)] dark:bg-noche-700 dark:text-white' : 'text-fuego-800 dark:text-white/55')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
      {icon && <div className="mb-2 flex size-14 items-center justify-center rounded-full bg-fuego-100 text-2xl dark:bg-noche-800">{icon}</div>}
      <p className="text-[15px] font-semibold">{title}</p>
      {text && <p className="muted text-sm">{text}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-7 flex items-center justify-between px-1">
      <h2 className="eyebrow">{children}</h2>
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
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[3px]" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[26px] bg-fuego-50 shadow-2xl animate-rise dark:bg-noche-900"
        style={{ paddingBottom: 'max(var(--safe-bottom), 16px)' }}>
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div className="absolute left-1/2 top-2 h-1 w-9 -translate-x-1/2 rounded-full bg-fuego-300 dark:bg-noche-700" />
          <h3 className="text-[17px] font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="Cerrar" className="flex size-8 items-center justify-center rounded-full bg-fuego-200/70 text-fuego-800 dark:bg-noche-700 dark:text-white/70"><X className="size-4" strokeWidth={2.5} /></button>
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
            <div key={t.id} className={cx('pointer-events-auto flex max-w-md items-start gap-2 rounded-full px-4 py-2.5 text-[14px] font-medium shadow-[0_10px_30px_-10px_rgba(0,0,0,.4)] animate-pop',
              t.kind === 'ok' ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'bg-red-600 text-white')}>
              {t.kind === 'ok' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
              <span>{t.text}</span>
            </div>
          ))}
        </div>, document.body)}
      {conf && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/50" onClick={() => close(false)} />
          <div className="relative w-full max-w-[320px] rounded-[22px] bg-white p-5 text-center shadow-2xl animate-pop dark:bg-noche-800">
            <h3 className="text-[17px] font-semibold">{conf.title}</h3>
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
