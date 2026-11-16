/* eslint-disable @typescript-eslint/no-explicit-any */
// =====================================================================
// MODO DEMO: un "Supabase" completo dentro del navegador.
// PostgreSQL real (PGlite, WebAssembly) con las MISMAS migraciones, la misma
// lógica de racha y las mismas políticas RLS que en producción.
// Los datos se guardan solo en este navegador (IndexedDB).
// =====================================================================
import { PGlite } from '@electric-sql/pglite'
import mockSql from '../../supabase/tests/00_mock_supabase.sql?raw'
import m1 from '../../supabase/migrations/0001_schema.sql?raw'
import m2 from '../../supabase/migrations/0002_functions.sql?raw'
import m3 from '../../supabase/migrations/0003_rls.sql?raw'
import m6 from '../../supabase/migrations/0006_levels.sql?raw'
import m7 from '../../supabase/migrations/0007_body_weight.sql?raw'
import m8 from '../../supabase/migrations/0008_character.sql?raw'
import m9 from '../../supabase/migrations/0009_body_records.sql?raw'
import m10 from '../../supabase/migrations/0010_weekly.sql?raw'
import m11 from '../../supabase/migrations/0011_life.sql?raw'
import m13 from '../../supabase/migrations/0013_cycle.sql?raw'
import m14 from '../../supabase/migrations/0014_more.sql?raw'
import { seedSql } from './seed'

const DB_NAME = 'idb://fuego-juntos-demo-v7'
let dbPromise: Promise<PGlite> | null = null

async function open(): Promise<PGlite> {
  try {
    const db = new PGlite(DB_NAME)
    await db.waitReady
    return db
  } catch {
    // Sin almacenamiento persistente (modo privado, etc.): base de datos en memoria
    const db = new PGlite()
    await db.waitReady
    return db
  }
}

async function init(): Promise<PGlite> {
  const db = await open()
  const ready = (await db.query<{ ok: boolean }>(`select to_regclass('public.profiles') is not null as ok`)).rows[0].ok
  if (!ready) {
    for (const sql of [mockSql, m1, m2, m3, m6, m7, m8, m9, m10, m11, m13, m14]) await db.exec(sql)
    await db.exec(`
      create table if not exists auth.demo_passwords(email text primary key, password text not null, user_id uuid not null);
      create table if not exists public.demo_media(path text primary key, data_url text not null, owner uuid);
    `)
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    await db.exec(seedSql(tz))
  }
  return db
}
export const getDb = () => (dbPromise ??= init())

export async function resetDemo() {
  try { const db = await getDb(); await db.close() } catch { /* */ }
  await new Promise<void>(res => { const r = indexedDB.deleteDatabase('/pglite/fuego-juntos-demo-v7'); r.onsuccess = r.onerror = r.onblocked = () => res() })
  try { Object.keys(localStorage).filter(k => k.startsWith('sb-') || k.startsWith('fj-')).forEach(k => localStorage.removeItem(k)) } catch { /* */ }
}

// ---------------- JWT de juguete (solo demo) ----------------
const b64u = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
const unb64u = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))
const sign = (p: any) => `${b64u(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${b64u(JSON.stringify(p))}.demo`
const verify = (t: string): any => { try { const c = JSON.parse(unb64u(t.split('.')[1])); return c.exp > Date.now() / 1000 ? c : null } catch { return null } }

function session(u: { id: string; email: string; meta: any }) {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24
  const user = { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, user_metadata: u.meta, app_metadata: {}, created_at: new Date().toISOString() }
  return { access_token: sign({ sub: u.id, role: 'authenticated', email: u.email, exp }), token_type: 'bearer', expires_in: 86400, expires_at: exp, refresh_token: sign({ sub: u.id, email: u.email, exp: exp + 86400 * 30 }), user }
}

// ---------------- Traducción PostgREST → SQL ----------------
const q = (id: string) => '"' + id.replace(/"/g, '""') + '"'
const OPS: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }
const val = (v: any) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v)

function buildWhere(params: [string, string][], vals: any[], pre = '') {
  const parts: string[] = []
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue
    let neg = false, s = v
    if (s.startsWith('not.')) { neg = true; s = s.slice(4) }
    const i = s.indexOf('.'), op = s.slice(0, i), arg = s.slice(i + 1)
    let sql: string
    if (op === 'is') sql = `${pre}${q(k)} is ${arg === 'null' ? 'null' : arg === 'true' ? 'true' : 'false'}`
    else if (op === 'in') { vals.push(arg.replace(/^\(|\)$/g, '').split(',').map(x => x.replace(/^"|"$/g, ''))); sql = `${pre}${q(k)}::text = any($${vals.length})` }
    else if (OPS[op]) { vals.push(arg); sql = `${pre}${q(k)} ${OPS[op]} $${vals.length}` }
    else throw new Error('Filtro no soportado: ' + op)
    parts.push(neg ? `not (${sql})` : sql)
  }
  return parts.length ? ' where ' + parts.join(' and ') : ''
}

/** select=*,rel(*, sub(*)) → SQL con subconsultas JSON (embebidos por clave foránea). */
async function selectSql(db: PGlite, table: string, select: string | null, alias: string): Promise<string> {
  const items: string[] = []; let depth = 0, cur = ''
  for (const ch of (select || '*') + ',') {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { if (cur.trim()) items.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  const out: string[] = []
  for (const it of items) {
    const m = it.match(/^(\w+)(!inner)?\((.*)\)$/s)
    if (!m) { out.push(it === '*' ? `${alias}.*` : `${alias}.${q(it)}`); continue }
    const rel = m[1], inner = m[3]
    // ¿hijo (rel tiene FK hacia table) o padre (table tiene FK hacia rel)?
    const fk = (await db.query<any>(`
      select a.attname as col, c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent, af.attname as pcol
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1]
      where c.contype = 'f' and ((c.conrelid = $1::regclass and c.confrelid = $2::regclass) or (c.conrelid = $2::regclass and c.confrelid = $1::regclass))`,
      [`public.${rel}`, `public.${table}`])).rows[0]
    if (!fk) continue
    const sub = `t_${rel}_${Math.random().toString(36).slice(2, 6)}`
    const subSel = await selectSql(db, rel, inner, sub)
    if (fk.child === rel || fk.child === `public.${rel}`) {
      out.push(`coalesce((select json_agg(x) from (select ${subSel} from public.${q(rel)} ${sub} where ${sub}.${q(fk.col)} = ${alias}.${q(fk.pcol)}) x), '[]'::json) as ${q(rel)}`)
    } else {
      out.push(`(select row_to_json(x) from (select ${subSel} from public.${q(rel)} ${sub} where ${sub}.${q(fk.pcol)} = ${alias}.${q(fk.col)}) x) as ${q(rel)}`)
    }
  }
  return out.join(', ') || `${alias}.*`
}

async function withRole<T>(claims: any, fn: (tx: any) => Promise<T>): Promise<T> {
  const db = await getDb()
  return db.transaction(async tx => {
    await tx.query(`set local role ${claims?.sub ? 'authenticated' : 'anon'}`)
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims ?? { role: 'anon' })])
    return fn(tx)
  }) as Promise<T>
}

const json = (status: number, body?: any) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export async function demoFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
  const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined))
  const raw: any = init.body
  const body = typeof raw === 'string' && raw ? JSON.parse(raw) : undefined
  const claims = verify((headers.get('authorization') ?? '').replace(/^Bearer /, ''))
  const db = await getDb()
  if (claims?.sub && !url.pathname.startsWith('/auth/')) {
    const exists = (await db.query(`select 1 from auth.users where id = $1`, [claims.sub])).rows.length > 0
    if (!exists) {
      // Sesión de una persona que ya no existe en esta demo: volver al inicio de sesión
      try { localStorage.removeItem('sb-demo-auth-v2') } catch { /* */ }
      setTimeout(() => location.reload(), 60)
      return json(401, { code: 'PGRST301', message: 'Tu sesión de la demo expiró. Vuelve a entrar.' })
    }
  }
  try {
    // ---------------- AUTH ----------------
    if (url.pathname === '/auth/v1/signup') {
      const email = String(body.email).toLowerCase()
      if ((await db.query(`select 1 from auth.demo_passwords where email = $1`, [email])).rows.length) return json(422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' })
      const id = crypto.randomUUID()
      await db.query(`insert into auth.users(id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, JSON.stringify(body.data ?? {})])
      await db.query(`insert into auth.demo_passwords values ($1, $2, $3)`, [email, body.password, id])
      return json(200, session({ id, email, meta: body.data ?? {} }))
    }
    if (url.pathname === '/auth/v1/token') {
      const gt = url.searchParams.get('grant_type')
      let row: any
      if (gt === 'password') row = (await db.query<any>(`select p.*, u.raw_user_meta_data meta from auth.demo_passwords p join auth.users u on u.id = p.user_id where p.email = $1 and p.password = $2`, [String(body.email).toLowerCase(), body.password])).rows[0]
      else { const c = verify(body.refresh_token); if (c) row = (await db.query<any>(`select p.*, u.raw_user_meta_data meta from auth.demo_passwords p join auth.users u on u.id = p.user_id where p.user_id = $1`, [c.sub])).rows[0] }
      if (!row) return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
      return json(200, session({ id: row.user_id, email: row.email, meta: row.meta }))
    }
    if (url.pathname === '/auth/v1/user') {
      if (!claims?.sub) return json(401, { msg: 'invalid' })
      if (method === 'PUT' && body?.password) await db.query(`update auth.demo_passwords set password = $1 where user_id = $2`, [body.password, claims.sub])
      const u = (await db.query<any>(`select id, email, raw_user_meta_data meta from auth.users where id = $1`, [claims.sub])).rows[0]
      return json(200, session(u).user)
    }
    if (url.pathname === '/auth/v1/logout') return json(204)
    if (url.pathname.startsWith('/auth/v1/recover')) return json(200, {})

    // ---------------- RPC ----------------
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/)
    if (rpc) {
      const fn = rpc[1], args = body ?? {}
      const out = await withRole(claims, async tx => {
        const meta = (await tx.query(`select p.proretset, t.typname, t.typtype = 'c' or p.prorettype = 'pg_catalog.record'::regtype as composite
          from pg_proc p join pg_type t on t.oid = p.prorettype join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [fn])).rows[0] as any
        if (!meta) throw Object.assign(new Error(`function ${fn} not found`), { code: 'PGRST202' })
        const keys = Object.keys(args)
        const call = `public.${q(fn)}(${keys.map((k, i) => `${q(k)} => $${i + 1}`).join(',')})`
        const vals = keys.map(k => val(args[k]))
        if (meta.proretset || meta.composite) return (await tx.query(`select coalesce(json_agg(t), '[]') j from ${call} t`, vals)).rows[0].j
        if (meta.typname === 'void') { await tx.query(`select ${call}`, vals); return null }
        return (await tx.query(`select to_json(${call}) j`, vals)).rows[0].j
      })
      return json(200, out)
    }

    // ---------------- REST ----------------
    const m = url.pathname.match(/^\/rest\/v1\/(\w+)$/)
    if (m) {
      const tbl = m[1], table = `public.${q(tbl)}`
      const params = [...url.searchParams.entries()] as [string, string][]
      const vals: any[] = []
      const single = (headers.get('accept') ?? '').includes('vnd.pgrst.object')
      const prefer = headers.get('prefer') ?? ''
      const ret = prefer.includes('return=representation')
      let rows: any[] = []
      if (method === 'GET' || method === 'HEAD') {
        const where = buildWhere(params, vals, 't0.')
        const order = url.searchParams.get('order')
        const ob = order ? ' order by ' + order.split(',').map(o => { const [c, dir, nulls] = o.split('.'); return `t0.${q(c)} ${dir === 'desc' ? 'desc' : 'asc'}${nulls ? ' ' + nulls.replace('nulls', 'nulls ') : ''}` }).join(',') : ''
        const lim = url.searchParams.get('limit') ? ` limit ${Number(url.searchParams.get('limit'))}` : ''
        const inner = (url.searchParams.get('select') ?? '').match(/(\w+)!inner\(/)
        const sel = await selectSql(db, tbl, url.searchParams.get('select'), 't0')
        const innerWhere = inner ? `${where ? ' and' : ' where'} ${q(inner[1])} is not null` : ''
        rows = await withRole(claims, async tx => (await tx.query(`select coalesce(json_agg(r), '[]') j from (select * from (select ${sel} from ${table} t0${where}${ob}${lim}) s) r${innerWhere.replace(/^ and/, ' where')}`, vals)).rows[0].j)
      } else if (method === 'POST') {
        const items = Array.isArray(body) ? body : [body]
        const upsert = prefer.includes('resolution=') ? url.searchParams.get('on_conflict') : null
        const ignore = prefer.includes('resolution=ignore-duplicates')
        rows = await withRole(claims, async tx => {
          const out: any[] = []
          for (const it of items) {
            const ks = Object.keys(it)
            const conflict = upsert ? ` on conflict (${upsert.split(',').map(q).join(',')}) ${ignore ? 'do nothing' : `do update set ${ks.map(k => `${q(k)} = excluded.${q(k)}`).join(',')}`}` : ''
            const r = await tx.query(`insert into ${table} (${ks.map(q).join(',')}) values (${ks.map((_, i) => `$${i + 1}`).join(',')})${conflict} returning row_to_json(${q(tbl)}.*) j`, ks.map(k => val(it[k])))
            if (r.rows[0]) out.push((r.rows[0] as any).j)
          }
          return out
        })
      } else if (method === 'PATCH') {
        const ks = Object.keys(body)
        const where = buildWhere(params, vals).replace(/\$(\d+)/g, (_x, n) => `$${Number(n) + ks.length}`)
        rows = await withRole(claims, async tx => (await tx.query(`with u as (update ${table} set ${ks.map((k, i) => `${q(k)} = $${i + 1}`).join(',')}${where} returning *) select coalesce(json_agg(u), '[]') j from u`, [...ks.map(k => val(body[k])), ...vals])).rows[0].j)
      } else if (method === 'DELETE') {
        const where = buildWhere(params, vals)
        rows = await withRole(claims, async tx => (await tx.query(`with d as (delete from ${table}${where} returning *) select coalesce(json_agg(d), '[]') j from d`, vals)).rows[0].j)
      }
      if (single) {
        if (rows.length !== 1) return json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows` })
        return json(200, rows[0])
      }
      if (method !== 'GET' && !ret) return json(201)
      return json(200, rows)
    }
    return json(404, { message: 'not found' })
  } catch (e: any) {
    const msg = e?.message ?? String(e)
    return json(e?.code === '42501' ? 403 : 400, { code: e?.code, message: msg, details: e?.detail ?? null, hint: null })
  }
}

// ---------------- Fotos (demo: se guardan como data URL) ----------------
export async function demoUpload(path: string, blob: Blob) {
  const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(blob) })
  const db = await getDb()
  await db.query(`insert into public.demo_media(path, data_url) values ($1, $2) on conflict (path) do update set data_url = excluded.data_url`, [path, dataUrl])
}
export async function demoGetUrl(path: string) {
  const db = await getDb()
  return ((await db.query<any>(`select data_url from public.demo_media where path = $1`, [path])).rows[0]?.data_url as string) ?? null
}
export async function demoDelete(path: string) {
  const db = await getDb()
  await db.query(`delete from public.demo_media where path = $1`, [path])
}

/**
 * Al abrir la demo: si el teléfono guardó la sesión de una persona que ya no existe
 * (por ejemplo, tras reiniciar la demo o cambiar de versión), se borra para volver a entrar.
 */
export async function validateDemoSession(storageKey: string) {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return
    const sub = JSON.parse(raw)?.user?.id
    const db = await getDb()
    const ok = sub && (await db.query(`select 1 from auth.users where id = $1`, [sub])).rows.length > 0
    if (!ok) localStorage.removeItem(storageKey)
  } catch { try { localStorage.removeItem(storageKey) } catch { /* */ } }
}
