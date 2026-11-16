import { loadDemoBackend } from '../demo/lazy'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Modo demo: base de datos real (PGlite) dentro del navegador, sin servidor. */
export const isDemo = import.meta.env.VITE_DEMO === 'true'
/** Datos PÚBLICOS del proyecto (la clave anon no es secreta: la protección es RLS). */
export const publicConfig = { url: url ?? '', anonKey: key ?? '' }
export const isConfigured = isDemo || Boolean(url && key && /^https?:\/\//.test(url))

export const DEMO_STORAGE_KEY = 'sb-demo-auth-v2'
const demoFetch: typeof fetch = async (input, init) => (await loadDemoBackend()).demoFetch(input, init)

export const supabase: SupabaseClient = isDemo
  ? createClient('https://demo.fuegojuntos.local', 'demo-anon-key', {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: DEMO_STORAGE_KEY },
      global: { fetch: demoFetch },
    })
  : isConfigured
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // "implicit": el enlace de recuperación de contraseña funciona aunque se abra en Safari
        // y no dentro de la app instalada.
        flowType: 'implicit',
      },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : (null as unknown as SupabaseClient)

/** Convierte errores de Supabase/Postgres a mensajes legibles en español. */
export function errorMessage(e: unknown): string {
  const raw = (e as { message?: string })?.message ?? String(e)
  const map: [RegExp, string][] = [
    [/Invalid login credentials/i, 'Correo o contraseña incorrectos.'],
    [/Email not confirmed/i, 'Debes confirmar tu correo antes de entrar. Revisa tu bandeja de entrada.'],
    [/User already registered/i, 'Ya existe una cuenta con ese correo.'],
    [/Password should be at least/i, 'La contraseña debe tener al menos 8 caracteres.'],
    [/rate limit/i, 'Demasiados intentos. Espera unos minutos.'],
    [/row-level security/i, 'No tienes permiso para hacer esto.'],
    [/permission denied/i, 'No tienes permiso para hacer esto.'],
    [/duplicate key/i, 'Ese registro ya existe.'],
    [/Failed to fetch|NetworkError|Load failed/i, 'Sin conexión. Revisa tu internet e inténtalo otra vez.'],
    [/JWT expired/i, 'Tu sesión expiró. Vuelve a iniciar sesión.'],
  ]
  for (const [re, msg] of map) if (re.test(raw)) return msg
  return raw
}

/** Lanza si hay error; devuelve data tipada. */
export async function must<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(errorMessage(error))
  return data
}
