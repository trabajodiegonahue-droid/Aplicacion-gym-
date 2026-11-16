// Servidor de PRUEBAS que imita un subconjunto de la API de Supabase (Auth + PostgREST + RPC)
// sobre un PostgreSQL local, aplicando RLS real (SET ROLE authenticated + claims JWT).
// Solo para pruebas automáticas locales. NO se usa en producción.
import http from 'node:http'
import crypto from 'node:crypto'
import pg from 'pg'

const PORT = Number(process.env.MOCK_PORT ?? 54321)
const SECRET = 'e2e-secret'
const pool = new pg.Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT ?? 5432), user: 'postgres', database: process.env.PGDATABASE ?? 'fuego_e2e' })

const b64u = b => Buffer.from(b).toString('base64url')
const sign = payload => {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), p = b64u(JSON.stringify(payload))
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`
}
const verify = t => {
  try {
    const [h, p, s] = t.split('.')
    if (crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url') !== s) return null
    const c = JSON.parse(Buffer.from(p, 'base64url').toString())
    return c.exp > Date.now() / 1000 ? c : null
  } catch { return null }
}
export const ANON_KEY = sign({ role: 'anon', exp: 4102444800 })

const users = new Map() // email -> {id, password, email, meta}
const refresh = new Map()
const session = u => {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const rt = crypto.randomUUID()
  refresh.set(rt, u.email)
  const user = { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, user_metadata: u.meta, app_metadata: {}, created_at: new Date().toISOString() }
  return { access_token: sign({ sub: u.id, role: 'authenticated', email: u.email, exp, aud: 'authenticated' }), token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: rt, user }
}

const q = id => '"' + id.replace(/"/g, '""') + '"'
const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }

function buildWhere(params, vals) {
  const parts = []
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue
    let neg = false, val = v
    if (val.startsWith('not.')) { neg = true; val = val.slice(4) }
    const i = val.indexOf('.')
    const op = val.slice(0, i), arg = val.slice(i + 1)
    let sql
    if (op === 'is') sql = `${q(k)} is ${arg === 'null' ? 'null' : arg === 'true' ? 'true' : 'false'}`
    else if (op === 'in') { const items = arg.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')); sql = `${q(k)}::text = any($${vals.push(items)})` }
    else if (OPS[op]) sql = `${q(k)} ${OPS[op]} $${vals.push(arg)}`
    else throw new Error('Filtro no soportado: ' + op)
    parts.push(neg ? `not (${sql})` : sql)
  }
  return parts.length ? ' where ' + parts.join(' and ') : ''
}
function cols(select) {
  if (!select || select === '*') return '*'
  // ignora recursos embebidos (rel(...)) y alias "!inner"
  const out = []; let depth = 0, cur = ''
  for (const ch of select + ',') {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { if (!cur.includes('(')) out.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  return out.length ? out.map(c => (c === '*' ? '*' : q(c))).join(',') : '*'
}

async function withRole(claims, fn) {
  const c = await pool.connect()
  try {
    await c.query('begin')
    await c.query(`set local role ${claims?.sub ? 'authenticated' : 'anon'}`)
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims ?? { role: 'anon' })])
    const r = await fn(c)
    await c.query('commit')
    return r
  } catch (e) { await c.query('rollback'); throw e } finally { c.release() }
}

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*', ...headers })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204)
  const url = new URL(req.url, 'http://x')
  let raw = ''
  for await (const ch of req) raw += ch
  const body = raw ? JSON.parse(raw) : undefined
  const auth = (req.headers.authorization ?? '').replace(/^Bearer /, '')
  const claims = verify(auth)
  try {
    // ---------------- AUTH ----------------
    if (url.pathname === '/auth/v1/signup') {
      if (users.has(body.email)) return send(res, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' })
      const u = { id: crypto.randomUUID(), email: body.email, password: body.password, meta: body.data ?? {} }
      await pool.query('insert into auth.users(id, email, raw_user_meta_data) values ($1,$2,$3)', [u.id, u.email, u.meta])
      users.set(u.email, u)
      return send(res, 200, session(u))
    }
    if (url.pathname === '/auth/v1/token') {
      const gt = url.searchParams.get('grant_type')
      const u = gt === 'password' ? users.get(body.email) : users.get(refresh.get(body.refresh_token))
      if (!u || (gt === 'password' && u.password !== body.password)) return send(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
      return send(res, 200, session(u))
    }
    if (url.pathname === '/auth/v1/user') {
      if (!claims?.sub) return send(res, 401, { msg: 'invalid' })
      const u = [...users.values()].find(x => x.id === claims.sub)
      if (req.method === 'PUT') { if (body.password) u.password = body.password }
      return send(res, 200, session(u).user)
    }
    if (url.pathname === '/auth/v1/logout') return send(res, 204)
    if (url.pathname.startsWith('/auth/v1/recover')) return send(res, 200, {})

    // ---------------- RPC ----------------
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/)
    if (rpc) {
      const fn = rpc[1]
      const args = body ?? {}
      const out = await withRole(claims, async c => {
        const meta = (await c.query(`select p.proretset, t.typname, p.prorettype = 'pg_catalog.record'::regtype or t.typtype = 'c' as composite
          from pg_proc p join pg_type t on t.oid = p.prorettype join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [fn])).rows[0]
        if (!meta) throw Object.assign(new Error(`function ${fn} not found`), { code: 'PGRST202' })
        const keys = Object.keys(args)
        const call = `public.${q(fn)}(${keys.map((k, i) => `${q(k)} => $${i + 1}`).join(',')})`
        const vals = keys.map(k => (args[k] !== null && typeof args[k] === 'object' && !Array.isArray(args[k]) ? JSON.stringify(args[k]) : args[k]))
        if (meta.proretset || meta.composite) return (await c.query(`select coalesce(json_agg(t), '[]') j from ${call} t`, vals)).rows[0].j
        if (meta.typname === 'void') { await c.query(`select ${call}`, vals); return null }
        return (await c.query(`select to_json(${call}) j`, vals)).rows[0].j
      })
      return send(res, 200, out)
    }

    // ---------------- REST ----------------
    const m = url.pathname.match(/^\/rest\/v1\/(\w+)$/)
    if (m) {
      const table = `public.${q(m[1])}`
      const params = [...url.searchParams.entries()]
      const vals = []
      const where = buildWhere(params, vals)
      const single = (req.headers.accept ?? '').includes('vnd.pgrst.object')
      const ret = (req.headers.prefer ?? '').includes('return=representation')
      const select = cols(url.searchParams.get('select'))
      let rows
      if (req.method === 'GET' || req.method === 'HEAD') {
        const order = url.searchParams.get('order')
        const ob = order ? ' order by ' + order.split(',').map(o => { const [c2, dir, nulls] = o.split('.'); return `${q(c2)} ${dir === 'desc' ? 'desc' : 'asc'}${nulls ? ' ' + nulls.replace('nulls', 'nulls ') : ''}` }).join(',') : ''
        const lim = url.searchParams.get('limit') ? ` limit ${Number(url.searchParams.get('limit'))}` : ''
        rows = await withRole(claims, async c => (await c.query(`select coalesce(json_agg(t), '[]') j from (select ${select} from ${table}${where}${ob}${lim}) t`, vals)).rows[0].j)
      } else if (req.method === 'POST') {
        const items = Array.isArray(body) ? body : [body]
        rows = await withRole(claims, async c => {
          const out = []
          for (const it of items) {
            const ks = Object.keys(it)
            const v = ks.map(k => (it[k] !== null && typeof it[k] === 'object' && !Array.isArray(it[k]) ? JSON.stringify(it[k]) : it[k]))
            const r = await c.query(`insert into ${table} (${ks.map(q).join(',')}) values (${ks.map((_, i) => `$${i + 1}`).join(',')}) returning to_json(${table.split('.')[1]}.*) j`, v)
            out.push(r.rows[0].j)
          }
          return out
        })
      } else if (req.method === 'PATCH') {
        const ks = Object.keys(body)
        const setVals = ks.map(k => (body[k] !== null && typeof body[k] === 'object' && !Array.isArray(body[k]) ? JSON.stringify(body[k]) : body[k]))
        const whereShift = where.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + ks.length}`)
        rows = await withRole(claims, async c => (await c.query(`with u as (update ${table} set ${ks.map((k, i) => `${q(k)} = $${i + 1}`).join(',')}${whereShift} returning *) select coalesce(json_agg(u), '[]') j from u`, [...setVals, ...vals])).rows[0].j)
      } else if (req.method === 'DELETE') {
        rows = await withRole(claims, async c => (await c.query(`with d as (delete from ${table}${where} returning *) select coalesce(json_agg(d), '[]') j from d`, vals)).rows[0].j)
      }
      if (single) {
        if (rows.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows` })
        return send(res, 200, rows[0])
      }
      if (req.method !== 'GET' && !ret) return send(res, 201)
      return send(res, 200, rows)
    }
    if (url.pathname.startsWith('/storage/v1')) return send(res, 400, { message: 'Storage no disponible en el servidor de pruebas' })
    send(res, 404, { message: 'not found' })
  } catch (e) {
    send(res, e.code === '42501' ? 403 : 400, { code: e.code, message: e.message, details: e.detail ?? null, hint: null })
  }
}).listen(PORT, () => console.log(`mock supabase en http://localhost:${PORT}\nANON_KEY=${ANON_KEY}`))
