import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter, MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource-variable/inter'
import './index.css'
import App from './App'
import { AuthProvider } from './context/AuthProvider'
import { UiProvider } from './components/ui'
import { DEMO_STORAGE_KEY, isConfigured, isDemo } from './lib/supabase'
import { loadDemoBackend } from './demo/lazy'
import SetupNeeded from './pages/SetupNeeded'

if (!isDemo) registerSW({ immediate: true })
// En la página publicada de Claude la navegación no puede usar la URL: MemoryRouter.
const Router = import.meta.env.VITE_MEMORY_ROUTER === 'true' ? MemoryRouter : isDemo ? HashRouter : BrowserRouter

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: true } },
})

// Demo: preparar la base de datos y descartar sesiones viejas antes de mostrar la app
if (isDemo) await (await loadDemoBackend()).validateDemoSession(DEMO_STORAGE_KEY)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConfigured ? (
      <QueryClientProvider client={qc}>
        <Router>
          <UiProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </UiProvider>
        </Router>
      </QueryClientProvider>
    ) : <SetupNeeded />}
  </StrictMode>,
)
document.getElementById('boot')?.remove()
