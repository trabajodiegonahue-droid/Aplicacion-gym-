import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthProvider'
import { useFirstRun } from '../lib/firstRun'
import { Person, PRESETS } from './Person'
import { Flame } from './Flame'
import { cx } from './ui'

const SLIDES = [
  { title: 'Bienvenidos a Gymaiego', text: 'Entrenen, tomen agua y cuiden sus hábitos… aunque estén lejos. Cada uno con su cuenta, los dos en el mismo equipo.', art: 'pair' },
  { title: 'La racha es de a dos', text: 'El día suma a la racha solo cuando los DOS cumplen. Si uno se olvida, la llama no crece. ¡Dense ánimo!', art: 'flame' },
  { title: 'Sus personajes suben de nivel', text: 'Todo lo que registran da experiencia. Al subir de nivel desbloquean accesorios: pin de llama, cinta, pesas y la medalla de oro.', art: 'evolve' },
  { title: 'Privado y justo', text: 'Tus datos son tuyos: tu pareja solo ve tu progreso del día. Las reglas compartidas solo cambian si los dos aprueban.', art: 'shield' },
] as const

export function Onboarding() {
  const { uid } = useAuth()
  const first = useFirstRun()
  const [i, setI] = useState(0)
  const [closed, setClosed] = useState(false)
  // Solo la primera vez de la cuenta (se espera a tener el perfil para no mostrarla de más)
  if (closed || !uid || !first.loaded || first.onboarded) return null
  const close = (tour = false) => {
    setClosed(true)
    first.mark('onboarded')
    if (tour) window.dispatchEvent(new CustomEvent('fj-onboarding-done'))
    else first.mark('tour')
  }
  const s = SLIDES[i]
  return createPortal(
    <div className="fixed inset-0 z-[95] flex flex-col bg-fuego-50 dark:bg-noche-900" style={{ paddingTop: 'max(var(--safe-top), 16px)', paddingBottom: 'max(var(--safe-bottom), 16px)' }}>
      <div className="flex justify-end px-5"><button className="btn-ghost min-h-10 text-[14px]" onClick={() => close(false)}>Saltar</button></div>
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center" key={i}>
        <div className="relative mb-8 flex h-52 w-full items-end justify-center animate-pop">
          <div className="absolute bottom-0 h-16 w-64 rounded-[50%] bg-gradient-to-b from-orange-200/80 to-transparent dark:from-noche-700" />
          {s.art === 'pair' && <><Person look={PRESETS.diego} stage={1} mood="cheer" size={112} /><Person look={PRESETS.maite} stage={1} mood="happy" size={106} /></>}
          {s.art === 'flame' && <div className="float-soft pb-6"><Flame size={150} /></div>}
          {s.art === 'evolve' && <div className="flex items-end -space-x-2">{[0, 1, 2, 3, 4].map(k => <Person key={k} look={k % 2 ? PRESETS.maite : PRESETS.diego} stage={k} mood={k === 4 ? 'happy' : 'idle'} size={58 + k * 6} />)}</div>}
          {s.art === 'shield' && <div className="relative pb-4"><Person look={PRESETS.maite} stage={2} mood="happy" size={110} /><ShieldCheck className="absolute -right-6 top-6 size-14 rounded-full bg-white p-2 text-emerald-500 shadow-lg dark:bg-noche-800" /></div>}
        </div>
        <h2 className="text-[26px] font-bold leading-tight tracking-[-0.03em]">{s.title}</h2>
        <p className="muted mt-3 max-w-sm text-[15.5px] leading-relaxed">{s.text}</p>
      </div>
      <div className="px-6">
        <div className="mb-5 flex justify-center gap-1.5">{SLIDES.map((_, k) => <span key={k} className={cx('h-1.5 rounded-full transition-all', k === i ? 'w-6 bg-ember' : 'w-1.5 bg-fuego-300')} />)}</div>
        <button className="btn-ember w-full" onClick={() => (i < SLIDES.length - 1 ? setI(i + 1) : close(true))}>{i < SLIDES.length - 1 ? 'Siguiente' : 'Ver cómo funciona'}</button>
      </div>
    </div>, document.body)
}
