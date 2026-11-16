import { useMemo, useState } from 'react'
import { cx } from './ui'

/** Zonas del cuerpo que se pueden pintar. */
type Region = 'traps' | 'delt_front' | 'delt_side' | 'delt_rear' | 'chest_up' | 'chest_low' | 'biceps' | 'triceps' | 'forearm' | 'abs' | 'obliques'
  | 'hip_flex' | 'quads' | 'adductors' | 'rhomboids' | 'lats' | 'lower_back' | 'glute_med' | 'glutes' | 'hamstrings' | 'calves'

const LABEL: Record<Region, string> = {
  traps: 'Trapecio', delt_front: 'Hombro (frontal)', delt_side: 'Hombro (lateral)', delt_rear: 'Hombro (posterior)', chest_up: 'Pecho (superior)',
  chest_low: 'Pecho (inferior)', biceps: 'Bíceps', triceps: 'Tríceps', forearm: 'Antebrazo', abs: 'Abdomen', obliques: 'Oblicuos', hip_flex: 'Flexores de cadera',
  quads: 'Cuádriceps', adductors: 'Aductores', rhomboids: 'Romboides', lats: 'Dorsal', lower_back: 'Zona lumbar', glute_med: 'Glúteo medio', glutes: 'Glúteo',
  hamstrings: 'Isquiotibiales', calves: 'Gemelos',
}

/** Traduce el nombre del músculo (de la biblioteca) a zonas del dibujo. */
function regionsFor(name: string): Region[] {
  const n = name.toLowerCase()
  const has = (...w: string[]) => w.some(x => n.includes(x))
  const out = new Set<Region>()
  if (has('pectoral superior')) out.add('chest_up')
  else if (has('pectoral inferior')) out.add('chest_low')
  else if (has('pectoral', 'pecho')) { out.add('chest_up'); out.add('chest_low') }
  if (has('deltoide anterior')) out.add('delt_front')
  else if (has('deltoide lateral')) out.add('delt_side')
  else if (has('deltoide posterior')) out.add('delt_rear')
  else if (has('deltoides', 'hombro')) { out.add('delt_front'); out.add('delt_side'); out.add('delt_rear') }
  if (has('manguito')) out.add('delt_rear')
  if (has('tríceps', 'triceps')) out.add('triceps')
  if (has('bíceps', 'biceps') || n === 'braquial' || has('braquial ')) out.add('biceps')
  if (has('braquiorradial', 'antebrazo', 'agarre')) out.add('forearm')
  if (has('brazos')) { out.add('biceps'); out.add('triceps'); out.add('forearm') }
  if (has('trapecio')) out.add('traps')
  if (has('romboides')) out.add('rhomboids')
  if (has('dorsal', 'redondo')) out.add('lats')
  if (has('espalda') && !has('baja')) { out.add('lats'); out.add('rhomboids') }
  if (has('erectores', 'lumbar')) out.add('lower_back')
  if (has('recto abdominal', 'transverso', 'suelo pélvico')) out.add('abs')
  if (has('oblicuos')) out.add('obliques')
  if (has('core')) { out.add('abs'); out.add('obliques') }
  if (has('flexores de cadera')) out.add('hip_flex')
  if (has('glúteo medio', 'glúteo menor', 'tensor')) out.add('glute_med')
  else if (has('glúteo', 'gluteo')) out.add('glutes')
  if (has('cuádriceps', 'cuadriceps')) out.add('quads')
  if (has('aductores')) out.add('adductors')
  if (has('isquiotibiales')) out.add('hamstrings')
  if (has('gemelos', 'sóleo')) out.add('calves')
  if (has('piernas')) { out.add('quads'); out.add('hamstrings'); out.add('calves') }
  return [...out]
}

const COLOR = (v: number) => (v >= 40 ? '#e11d48' : v >= 20 ? '#f97316' : v >= 10 ? '#fbbf24' : '#fde68a')

/**
 * Mapa del cuerpo (frente y espalda) con cada músculo pintado según el % de trabajo.
 * Toca una zona para ver su porcentaje.
 */
export function BodyMap({ muscles }: { muscles: [string, number][] }) {
  const { val, src, unmapped } = useMemo(() => {
    const val = new Map<Region, number>(), src = new Map<Region, string[]>(), unmapped: string[] = []
    for (const [m, p] of muscles) {
      const rs = regionsFor(m)
      if (!rs.length) { unmapped.push(`${m} ${p}%`); continue }
      for (const r of rs) { val.set(r, (val.get(r) ?? 0) + p); src.set(r, [...(src.get(r) ?? []), `${m} ${p}%`]) }
    }
    return { val, src, unmapped }
  }, [muscles])
  const [sel, setSel] = useState<Region | null>(null)

  const R = (r: Region, el: React.ReactElement<React.SVGProps<SVGElement>>, mirror = true) => {
    const v = val.get(r) ?? 0
    const props = {
      fill: v ? COLOR(v) : undefined,
      className: cx('muscle transition-[fill,opacity] duration-500', !v && 'fill-[#e9d9cf] dark:fill-[#3b3337]', v >= 40 && 'muscle-hot', sel === r && 'muscle-sel'),
      onClick: () => setSel(sel === r ? null : r),
      style: { cursor: 'pointer' },
    }
    const shape = { ...el, props: { ...el.props, ...props } } as React.ReactElement
    return (
      <g key={r}>
        <title>{`${LABEL[r]}${v ? `: ${v}%` : ''}`}</title>
        {shape}
        {mirror && <g transform="translate(120,0) scale(-1,1)">{{ ...shape, key: r + 'm' }}</g>}
      </g>
    )
  }

  const Silhouette = () => (
    <g className="fill-[#f5ebe5] dark:fill-[#29272b]">
      <ellipse cx="60" cy="19" rx="12.5" ry="14.5" />
      <rect x="53.5" y="31" width="13" height="10" rx="4" />
      <path d="M33 44 Q60 37 87 44 L91 62 Q89 92 83 110 L37 110 Q31 92 29 62 Z" />
      <path d="M36 108 L84 108 L86 128 L34 128 Z" />
      {[0, 1].map(i => (
        <g key={i} transform={i ? 'translate(120,0) scale(-1,1)' : undefined}>
          <path d="M31 45 Q21 49 19 66 L16 100 Q15 114 18 130 L25 130 Q27 112 28 100 L33 70 Z" />
          <ellipse cx="21" cy="136" rx="4.5" ry="6.5" />
          <path d="M35 124 Q34 160 38 188 L40 230 L52 230 L54 188 Q58 158 59 126 Z" />
        </g>
      ))}
    </g>
  )

  return (
    <div data-testid="body-map">
      <div className="grid grid-cols-2 gap-2">
        {/* FRENTE */}
        <figure className="rounded-2xl bg-gradient-to-b from-orange-50 to-rose-50 p-2 dark:from-noche-700/60 dark:to-noche-800">
          <svg viewBox="0 0 120 236" className="mx-auto h-56 w-auto" role="img" aria-label="Músculos que trabaja (frente)">
            <Silhouette />
            {R('traps', <path d="M53 40 Q47 43 41 45.5 L54 46.5 Z" />)}
            {R('delt_front', <ellipse cx="38.5" cy="50" rx="5.5" ry="7" />)}
            {R('delt_side', <ellipse cx="31.5" cy="52.5" rx="4.2" ry="8" />)}
            {R('chest_up', <path d="M41 49 Q50 45.5 59 47.5 L59 55.5 Q49.5 56 41 54.5 Z" />)}
            {R('chest_low', <path d="M41 55.5 Q50 57 59 56.5 L59 63 Q50 67 43 62.5 Z" />)}
            {R('biceps', <ellipse cx="26" cy="72" rx="4.4" ry="10" />)}
            {R('forearm', <ellipse cx="21.5" cy="104" rx="3.8" ry="13" transform="rotate(4 21.5 104)" />)}
            {R('abs', <rect x="53" y="66" width="14" height="38" rx="5" />, false)}
            {R('obliques', <path d="M42 68 L51 70 L51 102 L45 100 Q40 86 42 68 Z" />)}
            {R('hip_flex', <path d="M44.5 111 L54 113.5 L52.5 124 L44 120 Z" />)}
            {R('quads', <ellipse cx="46" cy="150" rx="8.6" ry="22" />)}
            {R('adductors', <path d="M54.5 128 Q58 141 56 160 L51.5 158 Q51 141 53 128 Z" />)}
            {R('calves', <ellipse cx="46.5" cy="200" rx="5" ry="13" />)}
          </svg>
          <figcaption className="muted text-center text-[11px] font-semibold">Frente</figcaption>
        </figure>
        {/* ESPALDA */}
        <figure className="rounded-2xl bg-gradient-to-b from-orange-50 to-rose-50 p-2 dark:from-noche-700/60 dark:to-noche-800">
          <svg viewBox="0 0 120 236" className="mx-auto h-56 w-auto" role="img" aria-label="Músculos que trabaja (espalda)">
            <Silhouette />
            {R('traps', <path d="M60 36 L73 46 L60 70 L47 46 Z" />, false)}
            {R('delt_rear', <ellipse cx="37" cy="50.5" rx="6.5" ry="7.5" />)}
            {R('delt_side', <ellipse cx="31" cy="53" rx="3.6" ry="7" />)}
            {R('rhomboids', <path d="M52 52 L58.5 50 L58.5 64 L53 62 Z" />)}
            {R('lats', <path d="M40 58 Q50 60 58 69 L58 86 Q48 83 42 72 Z" />)}
            {R('triceps', <ellipse cx="26" cy="72" rx="4.4" ry="10" />)}
            {R('forearm', <ellipse cx="21.5" cy="104" rx="3.8" ry="13" transform="rotate(4 21.5 104)" />)}
            {R('lower_back', <rect x="53.5" y="84" width="13" height="22" rx="4" />, false)}
            {R('glute_med', <ellipse cx="41.5" cy="112" rx="6.5" ry="5" />)}
            {R('glutes', <ellipse cx="48.5" cy="123" rx="10" ry="9.5" />)}
            {R('hamstrings', <ellipse cx="47" cy="156" rx="8" ry="20" />)}
            {R('calves', <ellipse cx="46.5" cy="199" rx="6" ry="14" />)}
          </svg>
          <figcaption className="muted text-center text-[11px] font-semibold">Espalda</figcaption>
        </figure>
      </div>
      <p className="mt-2 min-h-[20px] text-center text-[13px]">
        {sel ? <><b>{LABEL[sel]}</b>{val.get(sel) ? ` · ${val.get(sel)}% (${(src.get(sel) ?? []).join(' + ')})` : ' · no trabaja en este ejercicio'}</>
          : <span className="muted">Toca un músculo del dibujo para ver su %</span>}
      </p>
      <div className="mt-1.5 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px]">
        {[{ c: '#e11d48', l: '40 %+ principal' }, { c: '#f97316', l: '20–39 %' }, { c: '#fbbf24', l: '10–19 %' }, { c: '#fde68a', l: 'menos de 10 %' }].map(x => (
          <span key={x.l} className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-full" style={{ background: x.c }} />{x.l}</span>
        ))}
      </div>
      {unmapped.length > 0 && <p className="muted mt-1 text-center text-[11px]">También: {unmapped.join(' · ')}</p>}
    </div>
  )
}
