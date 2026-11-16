export default function SetupNeeded() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <img src="/icons/icon-192.png" className="size-20 rounded-3xl" alt="" />
      <h1 className="text-2xl font-extrabold">Falta conectar Supabase</h1>
      <p className="muted max-w-sm">
        La app todavía no tiene configuradas las variables <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>.
        Sigue la guía <b>SETUP.md</b> del repositorio (paso “Variables en Vercel”).
      </p>
    </div>
  )
}
