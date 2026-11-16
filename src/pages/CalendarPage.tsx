import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { PageHeader } from '../components/AppShell'
import { JointCalendar } from '../components/JointCalendar'
import { useAuth } from '../context/AuthProvider'

export default function CalendarPage() {
  const nav = useNavigate()
  const { partner } = useAuth()
  return (
    <div>
      <PageHeader title="Calendario" subtitle={partner ? `Tú y ${partner.display_name} · todo junto` : 'Tu mes'}
        back={<button onClick={() => nav(-1)} className="flex size-10 items-center justify-center rounded-full bg-white dark:bg-noche-800" aria-label="Volver"><ChevronLeft /></button>} />
      <div className="px-4 pb-6"><JointCalendar /></div>
    </div>
  )
}
