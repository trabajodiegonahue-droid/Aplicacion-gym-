// La base de datos de la demo (PGlite) corre en este hilo aparte:
// así la interfaz no se traba mientras se ejecutan consultas o se guarda en IndexedDB.
import * as be from './backend'

type Msg = { id: number; op: string; args: Record<string, unknown> }

// Aviso inmediato de que el hilo arrancó (antes de cargar la base)
;(self as unknown as Worker).postMessage({ hello: true })

self.onmessage = async (e: MessageEvent<Msg>) => {
  const { id, op, args } = e.data
  try {
    let r: unknown
    if (op === 'fetch') {
      const res = await be.demoFetch(String(args.url), { method: String(args.method), headers: args.headers as Record<string, string>, body: (args.body as string | undefined) ?? undefined })
      r = { status: res.status, headers: [...res.headers.entries()], text: await res.text() }
    } else if (op === 'upload') r = await be.demoUpload(String(args.path), args.blob as Blob)
    else if (op === 'getUrl') r = await be.demoGetUrl(String(args.path))
    else if (op === 'delete') r = await be.demoDelete(String(args.path))
    else if (op === 'userExists') r = await be.userExists(String(args.sub))
    else if (op === 'resetDb') r = await be.resetDb()
    else if (op === 'ping') { await be.getDb(); r = 'pong' }
    else throw new Error('Operación desconocida: ' + op)
    ;(self as unknown as Worker).postMessage({ id, ok: true, r })
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}

// Errores asíncronos internos (p. ej. al guardar en IndexedDB) no deben tumbar el hilo
self.addEventListener('unhandledrejection', e => { { const r = (e as PromiseRejectionEvent).reason; console.warn('[demo db]', r?.errno ?? '', r?.code ?? '', String(r?.stack ?? r).slice(0, 400)) }; e.preventDefault() })
self.addEventListener('error', e => { console.warn('[demo db]', (e as ErrorEvent).message); e.preventDefault() })
