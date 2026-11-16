import { useEffect, useState } from 'react'
import { supabase, must } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { useAction } from '../lib/queries'
import { colorFor, levelFromXp, stageForLevel, STAGES, useLevels } from '../lib/levels'
import { Buddy } from './Buddy'
import { Person, PRESETS, SKINS, HAIR_COLORS, TOP_COLORS, type PersonLook } from './Person'
import { lookOf } from './Character'
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
  const stage = stageForLevel(levelFromXp(xp).level)
  const saved = lookOf(profile)
  const [kind, setKind] = useState<'person' | 'flame'>(saved ? 'person' : 'flame')
  const [look, setLook] = useState<PersonLook>(saved ?? PRESETS.diego)
  const [preview, setPreview] = useState(stage)
  useEffect(() => { const s = lookOf(profile); if (s) { setLook(s); setKind('person') } }, [profile])
  const save = useAction(async () => must(supabase.from('profiles').update({ character: kind === 'person' ? look : {} }).eq('id', uid!)),
    { invalidate: [['profile'], ['couple']], success: 'Personaje guardado ✨' })
  const set = (p: Partial<PersonLook>) => setLook({ ...look, ...p })
  const dirty = JSON.stringify(kind === 'person' ? look : {}) !== JSON.stringify(saved ?? {})
  return (
    <Card className="space-y-4">
      <div className="relative -mx-4 -mt-4 flex h-52 items-end justify-center overflow-hidden rounded-t-[22px] bg-gradient-to-b from-orange-100 via-rose-50 to-transparent pb-2 dark:from-noche-700 dark:via-noche-800">
        <div className="absolute bottom-0 h-14 w-64 rounded-[50%] bg-orange-200/70 dark:bg-noche-700" />
        <div className="relative">
          {kind === 'person'
            ? <Person look={look} stage={preview} mood="happy" size={130} />
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
      <Segmented value={kind} onChange={setKind} options={[{ value: 'person', label: 'Persona' }, { value: 'flame', label: 'Llamita' }]} />
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
