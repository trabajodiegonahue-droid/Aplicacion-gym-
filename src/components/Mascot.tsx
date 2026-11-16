import { useId } from 'react'
import { cx } from './ui'
import type { Mood } from './Buddy'

export type Species = 'gato' | 'perro' | 'conejo' | 'oso' | 'dragon' | 'fenix'

/** Colección de personajes que se desbloquean al subir de nivel. */
export const MASCOTS: { species: Species; name: string; level: number; text: string }[] = [
  { species: 'gato', name: 'Gatito', level: 3, text: 'Ágil y curioso: nunca se salta el estiramiento.' },
  { species: 'perro', name: 'Perrito', level: 5, text: 'Fiel compañero de caminatas y carreras.' },
  { species: 'conejo', name: 'Conejita', level: 7, text: 'Pura energía: reina del cardio y los saltos.' },
  { species: 'oso', name: 'Osito', level: 10, text: 'Fuerza bruta y abrazos de oso.' },
  { species: 'dragon', name: 'Dragoncito', level: 15, text: 'Escupe fuego en cada serie.' },
  { species: 'fenix', name: 'Fénix', level: 20, text: 'Renace más fuerte cada día. Leyenda absoluta.' },
]

const PALETTE: Record<Species, { body: string; shade: string; belly: string; accent: string }> = {
  gato: { body: '#f6a560', shade: '#e0843c', belly: '#ffe8d1', accent: '#ff9db0' },
  perro: { body: '#c98a54', shade: '#9c6234', belly: '#f3dcc2', accent: '#ff8a8a' },
  conejo: { body: '#f4f1ee', shade: '#d9d2cc', belly: '#ffffff', accent: '#ffadc6' },
  oso: { body: '#8b5a3c', shade: '#6c432b', belly: '#d9b18c', accent: '#ff9b9b' },
  dragon: { body: '#34c27a', shade: '#1f9d5c', belly: '#fde68a', accent: '#f97316' },
  fenix: { body: '#fb7a3c', shade: '#e11d48', belly: '#fde68a', accent: '#fbbf24' },
}

/** Mascota animada estilo chibi. Mismos ánimos y accesorios por etapa que el resto de personajes. */
export function Mascot({ species, stage = 0, mood = 'idle', size = 120, className }:
  { species: Species; stage?: number; mood?: Mood | 'love'; size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  const c = PALETTE[species]
  const love = mood === 'love'
  const up = mood === 'happy' || mood === 'cheer'
  const closed = mood === 'sleep' || love
  const bodyMood = love ? 'happy' : mood
  return (
    <svg viewBox="0 0 120 140" width={size} height={size * 140 / 120} className={cx('overflow-visible', className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c.body} /><stop offset="1" stopColor={c.shade} /></linearGradient>
        <radialGradient id={`${id}a`} cx="0.5" cy="0.55" r="0.5"><stop offset="0" stopColor="#fbbf24" stopOpacity="0.45" /><stop offset="1" stopColor="#fbbf24" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="60" cy="135" rx="26" ry="4" className={cx('buddy-shadow', bodyMood === 'happy' && 'fast')} fill="#17130f" opacity="0.12" />
      <g className={cx('buddy-body', `mood-${bodyMood}`)}>
        {(stage >= 4 || species === 'fenix') && <circle className="buddy-aura" cx="60" cy="78" r="60" fill={`url(#${id}a)`} />}

        {/* alas / cola detrás */}
        {species === 'dragon' && <g fill={c.shade}><path d="M36 96 Q12 78 14 60 Q26 72 40 80 Z" /><path d="M84 96 Q108 78 106 60 Q94 72 80 80 Z" /></g>}
        {species === 'fenix' && <g className="buddy-arm-l wave"><path d="M38 98 Q8 84 10 58 Q22 70 30 70 Q22 78 42 88 Z" fill="#fbbf24" /><path d="M82 98 Q112 84 110 58 Q98 70 90 70 Q98 78 78 88 Z" fill="#fbbf24" /></g>}
        {species === 'gato' && <path d="M80 118 Q104 116 98 92 Q96 84 102 80" stroke={c.shade} strokeWidth="7" strokeLinecap="round" fill="none" />}
        {species === 'perro' && <path d="M80 112 Q96 104 94 92" stroke={c.shade} strokeWidth="7" strokeLinecap="round" fill="none" className="buddy-arm-r wave" />}
        {species === 'dragon' && <path d="M80 120 Q104 124 106 108 L112 112 L106 100" stroke={c.shade} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />}

        {/* cuerpo y patas */}
        <ellipse cx="60" cy="106" rx="25" ry="23" fill={`url(#${id}b)`} />
        <ellipse cx="60" cy="110" rx="15" ry="14" fill={c.belly} />
        <ellipse cx="49" cy="128" rx="8" ry="5" fill={c.shade} />
        <ellipse cx="71" cy="128" rx="8" ry="5" fill={c.shade} />
        {/* brazos */}
        <g stroke={c.shade} strokeWidth="8" strokeLinecap="round" fill="none">
          <path className={cx(up && 'buddy-arm-l wave')} d={up ? 'M39 96 L28 78' : 'M38 100 L32 114'} />
          {stage < 3 && <path className={cx(up && 'buddy-arm-r wave')} d={up ? 'M81 96 L92 78' : 'M82 100 L88 114'} />}
        </g>

        {/* orejas detrás de la cabeza */}
        {species === 'gato' && <g fill={c.body}><path d="M34 44 L36 18 L54 34 Z" /><path d="M86 44 L84 18 L66 34 Z" /><path d="M38 38 L39 25 L48 33 Z M82 38 L81 25 L72 33 Z" fill={c.accent} /></g>}
        {species === 'conejo' && <g><ellipse cx="46" cy="16" rx="8" ry="22" fill={c.body} transform="rotate(-10 46 16)" /><ellipse cx="74" cy="16" rx="8" ry="22" fill={c.body} transform="rotate(10 74 16)" /><ellipse cx="46" cy="18" rx="4" ry="15" fill={c.accent} transform="rotate(-10 46 18)" /><ellipse cx="74" cy="18" rx="4" ry="15" fill={c.accent} transform="rotate(10 74 18)" /></g>}
        {species === 'oso' && <g><circle cx="36" cy="34" r="10" fill={c.body} /><circle cx="84" cy="34" r="10" fill={c.body} /><circle cx="36" cy="34" r="5" fill={c.belly} /><circle cx="84" cy="34" r="5" fill={c.belly} /></g>}
        {species === 'dragon' && <g fill="#fde68a"><path d="M42 34 L38 16 L50 30 Z" /><path d="M78 34 L82 16 L70 30 Z" /></g>}
        {species === 'fenix' && <g fill="#e11d48"><path d="M56 30 Q52 10 60 4 Q60 18 62 28 Z" /><path d="M62 30 Q66 12 76 10 Q68 20 66 30 Z" fill="#f97316" /><path d="M54 30 Q46 14 40 14 Q48 22 50 32 Z" fill="#fbbf24" /></g>}

        {/* cabeza */}
        <ellipse cx="60" cy="58" rx="30" ry="28" fill={`url(#${id}b)`} />
        {species === 'perro' && <g fill={c.shade}><ellipse cx="32" cy="58" rx="8" ry="17" transform="rotate(12 32 58)" /><ellipse cx="88" cy="58" rx="8" ry="17" transform="rotate(-12 88 58)" /></g>}
        {(species === 'oso' || species === 'perro') && <ellipse cx="60" cy="69" rx="13" ry="10" fill={c.belly} />}
        {species === 'gato' && <g stroke={c.shade} strokeWidth="2.4" strokeLinecap="round"><path d="M52 36 L52 44 M60 34 L60 43 M68 36 L68 44" /></g>}
        {species === 'dragon' && <g fill={c.shade}><circle cx="52" cy="40" r="2.5" /><circle cx="60" cy="37" r="2.5" /><circle cx="68" cy="40" r="2.5" /></g>}

        {/* cara */}
        {closed ? (
          <g stroke="#2a1a14" strokeWidth="2.6" strokeLinecap="round" fill="none"><path d="M45 58 Q50 62 55 58" /><path d="M65 58 Q70 62 75 58" /></g>
        ) : (
          <g className="buddy-eyes">
            <ellipse cx="50" cy="57" rx="4" ry={mood === 'happy' ? 3.6 : 5} fill="#2a1a14" /><ellipse cx="70" cy="57" rx="4" ry={mood === 'happy' ? 3.6 : 5} fill="#2a1a14" />
            <circle cx="51.5" cy="55.2" r="1.4" fill="#fff" /><circle cx="71.5" cy="55.2" r="1.4" fill="#fff" />
          </g>
        )}
        <circle cx="42" cy="66" r="4.5" fill="#ff8a8a" opacity="0.4" /><circle cx="78" cy="66" r="4.5" fill="#ff8a8a" opacity="0.4" />
        {species === 'fenix'
          ? <path d="M55 64 L65 64 L60 71 Z" fill="#fbbf24" stroke="#d97706" strokeWidth="1" />
          : <ellipse cx="60" cy="65" rx={species === 'oso' || species === 'perro' ? 4 : 2.6} ry={species === 'oso' || species === 'perro' ? 3 : 2} fill={species === 'conejo' || species === 'gato' ? c.accent : '#2a1a14'} />}
        {species === 'gato' && <g stroke="#2a1a14" strokeWidth="1.1" opacity="0.6"><path d="M38 64 L28 62 M38 68 L28 70 M82 64 L92 62 M82 68 L92 70" /></g>}
        {love ? <ellipse cx="60" cy="72" rx="3.2" ry="2.8" fill="#e07a86" />
          : mood === 'happy' || mood === 'cheer' ? <path d="M54 69 Q60 77 66 69 Z" fill="#7a2626" />
          : mood === 'sad' ? <path d="M55 74 Q60 70 65 74" stroke="#7a2626" strokeWidth="2" fill="none" strokeLinecap="round" />
          : mood === 'sleep' ? <ellipse cx="60" cy="72" rx="2" ry="2.4" fill="#7a2626" />
          : <path d="M55 70 Q60 74 65 70" stroke="#7a2626" strokeWidth="2" fill="none" strokeLinecap="round" />}
        {species === 'perro' && (mood === 'happy' || mood === 'cheer') && <ellipse cx="60" cy="76" rx="3" ry="4" fill="#ff7b8a" />}

        {/* accesorios por etapa */}
        {stage >= 1 && stage < 4 && <path transform="translate(66 96) scale(0.1)" fill="#e11d48" d="M50 6c4 14 22 24 27 42 5 18-4 40-27 44C27 88 18 70 22 54c2-9 8-14 11-22 2 7 5 11 10 13-3-15 0-28 7-39Z" />}
        {stage >= 2 && stage < 4 && <g><path d="M31 46 Q60 34 89 46 L89 52 Q60 40 31 52 Z" fill="#e11d48" /><path d="M88 48 L97 44 L95 52 Z" fill="#e11d48" /></g>}
        {stage >= 3 && (
          <g className="buddy-lift">
            <path d="M82 98 L94 80" stroke={c.shade} strokeWidth="8" strokeLinecap="round" />
            <rect x="82" y="74" width="24" height="3.6" rx="1.8" fill="#57534e" /><rect x="80" y="68" width="5.5" height="16" rx="2" fill="#292524" /><rect x="103" y="68" width="5.5" height="16" rx="2" fill="#292524" />
          </g>
        )}
        {stage >= 4 && (
          <g className="buddy-crown">
            <path d="M50 86 L60 100 L70 86" stroke="#e11d48" strokeWidth="3" fill="none" />
            <circle cx="60" cy="103" r="6" fill="#fbbf24" stroke="#d97706" strokeWidth="1.5" />
          </g>
        )}
      </g>
      {mood === 'sleep' && <g fill="#7c8aa5" fontWeight="700" fontFamily="system-ui"><text x="90" y="30" fontSize="14" className="buddy-z z1">z</text><text x="100" y="18" fontSize="11" className="buddy-z z2">z</text></g>}
      {love && <g fill="#f43f5e"><path className="buddy-spark s1" d="M98 44 c-3-4-9-1-6 4 l6 6 6-6 c3-5-3-8-6-4z" /><path className="buddy-spark s2" d="M18 38 c-2-3-7-1-5 3 l5 5 5-5 c2-4-3-6-5-3z" /></g>}
      {(mood === 'happy' || stage >= 4) && !love && <g fill="#fbbf24"><path className="buddy-spark s1" d="M14 50 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" /><path className="buddy-spark s2" d="M104 30 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z" /></g>}
    </svg>
  )
}
