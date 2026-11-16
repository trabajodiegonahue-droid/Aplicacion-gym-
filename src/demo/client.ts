// Cliente de la demo: habla con la base de datos que corre en un Web Worker.
// Si el navegador no permite Workers, usa la misma base en el hilo principal (más lento, pero funciona).
type Backend = typeof import('./backend')
const STORAGE_KEY = 'sb-demo-auth-v2'

let worker: Worker | null = null
let ready = false
let inline: Promise<Backend> | null = null
let seq = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; op: string; args: Record<string, unknown> }>()

function useInline(): Promise<Backend> { return (inline ??= import('./backend')) }

function startWorker(): Worker | null {
  if (worker || inline) return worker
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; r?: unknown; error?: string; hello?: boolean }>) => {
      ready = true
      if (e.data.hello) return
      const p = pending.get(e.data.id)
      if (!p) return
      pending.delete(e.data.id)
      if (e.data.ok) p.resolve(e.data.r); else p.reject(new Error(e.data.error))
    }
    // Si en 10 s el hilo no dio señales de vida, se usa el hilo principal
    setTimeout(() => { if (!ready && worker) fallback() }, 10000)
    worker.onerror = (ev: ErrorEvent) => {
      ev.preventDefault?.()
      console.warn('[demo worker]', ev.message)
      // Si ya estaba funcionando, el error fue puntual: no se cambia de modo (evita dos bases a la vez)
      if (ready) return
      fallback()
    }
  } catch { worker = null; useInline() }
  return worker
}

/** El Worker no pudo arrancar: pasar todo al hilo principal y reintentar lo pendiente. */
function fallback() {
  worker?.terminate(); worker = null
  const list = [...pending.values()]; pending.clear()
  useInline()
  list.forEach(p => runInline(p.op, p.args).then(p.resolve, p.reject))
}

async function runInline(op: string, args: Record<string, unknown>): Promise<unknown> {
  const be = await useInline()
  if (op === 'fetch') {
    const res = await be.demoFetch(String(args.url), { method: String(args.method), headers: args.headers as Record<string, string>, body: args.body as string | undefined })
    return { status: res.status, headers: [...res.headers.entries()], text: await res.text() }
  }
  if (op === 'upload') return be.demoUpload(String(args.path), args.blob as Blob)
  if (op === 'getUrl') return be.demoGetUrl(String(args.path))
  if (op === 'delete') return be.demoDelete(String(args.path))
  if (op === 'userExists') return be.userExists(String(args.sub))
  if (op === 'resetDb') return be.resetDb()
  return be.getDb().then(() => 'pong')
}

function call<T>(op: string, args: Record<string, unknown> = {}): Promise<T> {
  const w = inline ? null : startWorker()
  if (!w) return runInline(op, args) as Promise<T>
  return new Promise<T>((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, op, args })
    w.postMessage({ id, op, args })
  })
}

export async function demoFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const headers = Object.fromEntries(new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined)).entries())
  const body = typeof init.body === 'string' ? init.body : undefined
  const r = await call<{ status: number; headers: [string, string][]; text: string }>('fetch', { url, method, headers, body })
  if (r.headers.some(([k]) => k === 'x-demo-reload')) {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* */ }
    setTimeout(() => location.reload(), 60)
  }
  return new Response(r.status === 204 || r.text === '' ? null : r.text, { status: r.status, headers: r.headers })
}
export const demoUpload = (path: string, blob: Blob) => call<void>('upload', { path, blob })
export const demoGetUrl = (path: string) => call<string | null>('getUrl', { path })
export const demoDelete = (path: string) => call<void>('delete', { path })

export async function resetDemo() {
  await call('resetDb')
  try { Object.keys(localStorage).filter(k => k.startsWith('sb-') || k.startsWith('fj-')).forEach(k => localStorage.removeItem(k)) } catch { /* */ }
}

export async function validateDemoSession(storageKey: string) {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) { call('ping').catch(() => {}); return }   // arranca la base mientras se muestra el inicio de sesión
    const sub = JSON.parse(raw)?.user?.id
    const ok = sub && (await call<boolean>('userExists', { sub }))
    if (!ok) localStorage.removeItem(storageKey)
  } catch { try { localStorage.removeItem(storageKey) } catch { /* */ } }
}
