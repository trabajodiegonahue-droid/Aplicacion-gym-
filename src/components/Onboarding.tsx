import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthProvider'
import { Buddy } from './Buddy'
import { Flame } from './Flame'
import { cx } from './ui'

const SLIDES = [
  { title: 'Bienvenidos a Fuego Juntos', text: 'Entrenen, tomen agua y cuiden sus hábitos… aunque estén lejos. Cada uno con su cuenta, los dos en el mismo equipo.', art: 'pair' },
  { title: 'La racha es de a dos', text: 'El día suma a la racha solo cuando los DOS cumplen. Si uno se olvida, la llama no crece. ¡Dense ánimo!', art: 'flame' },
  { title: 'Su llamita sube de nivel', text: 'Todo lo que registran da experiencia. Su personaje evoluciona: Chispa, Llamita, Fueguito, Brasa y Llamarada.', art: 'evolve' },
  { title: 'Privado y justo', text: 'Tus datos son tuyos: tu pareja solo ve tu progreso del día. Las reglas compartidas solo cambian si los dos aprueban.', art: 'shield' },
] as const

export function Onboarding() {
  const { uid } = useAuth()
  const key = `fj-onboarded-${uid}`
  const [i, setI] = useState(0)
  const [open, setOpen] = useState(() => { try { return !!uid && localStorage.getItem(key) !== '1' } catch { return false } })
  if (!open || !uid) return null
  const close = () => { try { localStorage.setItem(key, '1') } catch { /* */ } setOpen(false) }
  const s = SLIDES[i]
  return createPortal(
    <div className="fixed inset-0 z-[95] flex flex-col bg-fuego-50 dark:bg-noche-900" style={{ paddingTop: 'max(var(--safe-top), 16px)', paddingBottom: 'max(var(--safe-bottom), 16px)' }}>
      <div className="flex justify-end px-5"><button className="btn-ghost min-h-10 text-[14px]" onClick={close}>Saltar</button></div>
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center" key={i}>
        <div className="relative mb-8 flex h-52 w-full items-end justify-center animate-pop">
          <div className="absolute bottom-0 h-16 w-64 rounded-[50%] bg-gradient-to-b from-orange-200/80 to-transparent dark:from-noche-700" />
          {s.art === 'pair' && <><Buddy stage={1} color="rojo" mood="cheer" size={110} /><Buddy stage={1} color="naranja" mood="happy" size={100} /></>}
          {s.art === 'flame' && <div className="float-soft pb-6"><Flame size={150} /></div>}
          {s.art === 'evolve' && <div className="flex items-end gap-1">{[0, 1, 2, 3, 4].map(k => <Buddy key={k} stage={k} color={k % 2 ? 'naranja' : 'rojo'} mood={k === 4 ? 'happy' : 'idle'} size={44 + k * 10} />)}</div>}
          {s.art === 'shield' && <div className="relative pb-4"><Buddy stage={2} color="rojo" mood="happy" size={110} /><ShieldCheck className="absolute -right-6 top-6 size-14 rounded-full bg-white p-2 text-emerald-500 shadow-lg dark:bg-noche-800" /></div>}
        </div>
        <h2 className="text-[26px] font-bold leading-tight tracking-[-0.03em]">{s.title}</h2>
        <p className="muted mt-3 max-w-sm text-[15.5px] leading-relaxed">{s.text}</p>
      </div>
      <div className="px-6">
        <div className="mb-5 flex justify-center gap-1.5">{SLIDES.map((_, k) => <span key={k} className={cx('h-1.5 rounded-full transition-all', k === i ? 'w-6 bg-ember' : 'w-1.5 bg-fuego-300')} />)}</div>
        <button className="btn-ember w-full" onClick={() => (i < SLIDES.length - 1 ? setI(i + 1) : close())}>{i < SLIDES.length - 1 ? 'Siguiente' : '¡Empezar!'}</button>
      </div>
    </div>, document.body)
}
