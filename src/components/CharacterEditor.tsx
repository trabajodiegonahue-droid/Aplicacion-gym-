import { useEffect, useState } from 'react'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useAction } from '../lib/queries'
import { colorFor, levelFromXp, stageForLevel, STAGES, useLevels } from '../lib/levels'
import { Buddy } from './Buddy'
import { Person, PRESETS, SKINS, HAIR_COLORS, TOP_COLORS, type PersonLook } from './Person'
import { defaultLook, lookOf, speciesOf } from './Character'
import { Mascot, MASCOTS, type Species } from './Mascot'
import { Lock } from 'lucide-react'
import { Button, Card, Segmented, Toggle, cx } from './ui'

const Swatches = ({ colors, value, onChange, label }: { colors: string[]; value: string; onChange: (c: string) => void; label: string }) => (
  <div>
    <p className="label">{label}</p>
    <div className="flex flex-wrap gap-2">
      {colors.map(c => (
        <button key={c} type="button" aria-label={c} onClick={() => onChange(c)}
          className={cx('size-9 rounded-full ring-1 ring-black/10 transition', value === c && 'ring-[3px] ring-ember ring-offset-2 ring-offset-white dark:ring-offset-noche-800')} style={{ background: c }} />
      ))}
    </div>
  </div>
)

/** Editor del personaje: llamita o persona caricatura (piel, pelo, ropa…). */
export function CharacterEditor() {
  const { uid, partner, profile } = useAuth()
  const xp = useLevels().data?.find(l => l.user_id === uid)?.xp ?? 0
  const level = levelFromXp(xp).level
  const stage = stageForLevel(level)
  const saved = lookOf(profile)
  const savedSp = speciesOf(profile)
  const savedFlame = (profile?.character as { kind?: string } | null)?.kind === 'flame'
  const [kind, setKind] = useState<'person' | 'flame' | 'mascot'>(saved ? 'person' : savedSp ? 'mascot' : savedFlame ? 'flame' : 'person')
  const [species, setSpecies] = useState<Species>(savedSp ?? 'gato')
  const [look, setLook] = useState<PersonLook>(saved ?? defaultLook(profile))
  const [preview, setPreview] = useState(stage)
  useEffect(() => { const s = lookOf(profile); if (s) { setLook(s); setKind('person') } const sp = speciesOf(profile); if (sp) { setSpecies(sp); setKind('mascot') } }, [profile])
  const value = kind === 'person' ? look : kind === 'mascot' ? { kind: 'mascot', species } : { kind: 'flame' }
  const save = useAction(async () => must(supabase.from('profiles').update({ character: value }).eq('id', uid!)),
    { invalidate: [['profile'], ['couple']], success: 'Personaje guardado ✨' })
  const set = (p: Partial<PersonLook>) => setLook({ ...look, ...p })
  const dirty = JSON.stringify(value) !== JSON.stringify(profile?.character ?? {})
  return (
    <Card className="space-y-4">
      <div className="relative -mx-4 -mt-4 flex h-52 items-end justify-center overflow-hidden rounded-t-[22px] bg-gradient-to-b from-orange-100 via-rose-50 to-transparent pb-2 dark:from-noche-700 dark:via-noche-800">
        <div className="absolute bottom-0 h-14 w-64 rounded-[50%] bg-orange-200/70 dark:bg-noche-700" />
        <div className="relative">
          {kind === 'person'
            ? <Person look={look} stage={preview} mood="happy" size={130} />
            : kind === 'mascot' ? <Mascot species={species} stage={preview} mood="happy" size={125} />
            : <Buddy stage={preview} color={colorFor(uid, partner?.id)} mood="happy" size={120} />}
        </div>
      </div>
      <div>
        <p className="label">Vista previa de etapas</p>
        <div className="no-scrollbar flex gap-1 overflow-x-auto">
          {STAGES.map((s, i) => (
            <button key={s.name} type="button" onClick={() => setPreview(i)}
              className={cx('shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold', preview === i ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'bg-fuego-100 dark:bg-noche-700', i > stage && 'opacity-60')}>
              {s.name}{i > stage ? ' 🔒' : ''}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="label">Tu colección <span className="font-normal opacity-70">(nivel {level})</span></p>
        <div className="grid grid-cols-4 gap-2">
          {[{ k: 'person' as const, name: 'Persona', lvl: 1 }, { k: 'flame' as const, name: 'Llamita', lvl: 1 }].map(o => (
            <button key={o.k} type="button" onClick={() => setKind(o.k)} className={cx('flex flex-col items-center rounded-2xl pb-1.5 pt-1 transition', kind === o.k ? 'bg-blush ring-2 ring-ember dark:bg-noche-700' : 'bg-white ring-1 ring-black/[.06] dark:bg-noche-800')}>
              {o.k === 'person' ? <Person look={look} stage={0} mood="idle" size={52} /> : <Buddy stage={1} color={colorFor(uid, partner?.id)} mood="idle" size={48} />}
              <span className="text-[11.5px] font-semibold">{o.name}</span>
            </button>
          ))}
          {MASCOTS.map(m => {
            const locked = level < m.level
            const on = kind === 'mascot' && species === m.species
            return (
              <button key={m.species} type="button" disabled={locked} onClick={() => { setKind('mascot'); setSpecies(m.species) }}
                className={cx('relative flex flex-col items-center rounded-2xl pb-1.5 pt-1 transition', on ? 'bg-blush ring-2 ring-ember dark:bg-noche-700' : 'bg-white ring-1 ring-black/[.06] dark:bg-noche-800')}>
                <div className={cx(locked && 'opacity-25 grayscale')}><Mascot species={m.species} stage={0} mood="idle" size={50} /></div>
                <span className={cx('text-[11.5px] font-semibold', locked && 'opacity-60')}>{m.name}</span>
                {locked && <span className="absolute inset-x-1 top-6 flex flex-col items-center"><Lock className="size-4 text-fuego-800" /><span className="rounded-full bg-ink px-1.5 text-[10px] font-bold text-white">Nv {m.level}</span></span>}
              </button>
            )
          })}
        </div>
        {kind === 'mascot' && <p className="muted mt-2 text-[12.5px]">{MASCOTS.find(m => m.species === species)?.text}</p>}
      </div>
      {kind === 'person' && (
        <div className="space-y-4">
          <div>
            <p className="label">Estilos rápidos</p>
            <div className="flex gap-2">
              <Button type="button" variant="soft" className="min-h-10 flex-1 text-[13px]" onClick={() => setLook(PRESETS.diego)}>Estilo Diego</Button>
              <Button type="button" variant="soft" className="min-h-10 flex-1 text-[13px]" onClick={() => setLook(PRESETS.maite)}>Estilo Maite</Button>
            </div>
          </div>
          <Swatches label="Tono de piel" colors={SKINS} value={look.skin} onChange={skin => set({ skin })} />
          <div>
            <p className="label">Peinado</p>
            <Segmented value={look.hair} onChange={hair => set({ hair })} options={[{ value: 'short', label: 'Corto' }, { value: 'long', label: 'Largo' }, { value: 'bun', label: 'Rodete' }, { value: 'curly', label: 'Rizado' }]} />
          </div>
          <Swatches label="Color de pelo" colors={HAIR_COLORS} value={look.hairColor} onChange={hairColor => set({ hairColor })} />
          <div>
            <p className="label">Ropa</p>
            <Segmented value={look.outfit} onChange={outfit => set({ outfit })} options={[{ value: 'tee', label: 'Remera' }, { value: 'blazer', label: 'Blazer' }, { value: 'hoodie', label: 'Buzo' }]} />
          </div>
          <Swatches label={look.outfit === 'blazer' ? 'Color de la remera' : 'Color de la ropa'} colors={TOP_COLORS} value={look.top} onChange={top => set({ top })} />
          <div className="divide-y divide-black/[.05] dark:divide-white/[.06]">
            <Toggle checked={!!look.lashes} onChange={lashes => set({ lashes })} label="Pestañas" />
            <Toggle checked={!!look.mole} onChange={mole => set({ mole })} label="Lunar en la mejilla" />
          </div>
        </div>
      )}
      <p className="muted text-[12px]">Tu pareja ve tu personaje en la racha. Las etapas con 🔒 se desbloquean al subir de nivel (ahora: {STAGES[stage].name}).</p>
      <Button className="w-full" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>Guardar personaje</Button>
    </Card>
  )
}
