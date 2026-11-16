import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthProvider'
import { AppShell } from './components/AppShell'
import { Loading } from './components/ui'
import { CelebrationLayer } from './components/Celebration'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import Forgot from './pages/auth/Forgot'
import ResetPassword from './pages/auth/ResetPassword'
import Home from './pages/Home'

const Streak = lazy(() => import('./pages/Streak'))
const RulesEditor = lazy(() => import('./pages/RulesEditor'))
const Proposals = lazy(() => import('./pages/Proposals'))
const LinkPartner = lazy(() => import('./pages/LinkPartner'))
const Gym = lazy(() => import('./pages/gym/Gym'))
const Habits = lazy(() => import('./pages/habits/Habits'))
const Couple = lazy(() => import('./pages/couple/Couple'))
const Profile = lazy(() => import('./pages/Profile'))
const Stats = lazy(() => import('./pages/Stats'))
const Notifications = lazy(() => import('./pages/Notifications'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return <>{children}</>
}

export default function App() {
  const { session, recovery } = useAuth()
  if (recovery) return <ResetPassword />
  return (
    <>
      <CelebrationLayer />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/registro" element={session ? <Navigate to="/vincular" replace /> : <Register />} />
          <Route path="/recuperar" element={<Forgot />} />
          <Route path="/nueva-clave" element={<ResetPassword />} />
          <Route element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route index element={<Home />} />
            <Route path="racha" element={<Streak />} />
            <Route path="racha/reglas" element={<RulesEditor />} />
            <Route path="propuestas" element={<Proposals />} />
            <Route path="vincular" element={<LinkPartner />} />
            <Route path="gym/*" element={<Gym />} />
            <Route path="habitos/*" element={<Habits />} />
            <Route path="pareja/*" element={<Couple />} />
            <Route path="perfil" element={<Profile />} />
            <Route path="estadisticas" element={<Stats />} />
            <Route path="calendario" element={<CalendarPage />} />
            <Route path="notificaciones" element={<Notifications />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}
