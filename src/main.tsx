import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource-variable/inter'
import './index.css'
import App from './App'
import { AuthProvider } from './context/AuthProvider'
import { UiProvider } from './components/ui'
import { isConfigured } from './lib/supabase'
import SetupNeeded from './pages/SetupNeeded'

registerSW({ immediate: true })

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: true } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConfigured ? (
      <QueryClientProvider client={qc}>
        <BrowserRouter>
          <UiProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </UiProvider>
        </BrowserRouter>
      </QueryClientProvider>
    ) : <SetupNeeded />}
  </StrictMode>,
)
document.getElementById('boot')?.remove()
