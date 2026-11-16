import { useId } from 'react'
import { cx } from './ui'
import type { Mood } from './Buddy'

/** Apariencia configurable de un personaje humano (estilo caricatura). */
export interface PersonLook {
  kind: 'person'
  skin: string
  hair: 'short' | 'long' | 'bun' | 'curly'
  hairColor: string
  outfit: 'tee' | 'blazer' | 'hoodie'
  top: string
  pants: string
  mole?: boolean
  lashes?: boolean
}

export const SKINS = ['#f6d5bd', '#f0c4a4', '#e3ab84', '#c98c62', '#9a6844', '#6c4329']
export const HAIR_COLORS = ['#141010', '#2b1b13', '#4f3322', '#8a5a33', '#c9a25f', '#7d2a24']
export const TOP_COLORS = ['#f5f5f4', '#17130f', '#e11d48', '#f97316', '#0ea5e9', '#10b981', '#8b5cf6', '#f9a8d4']

const shade = (hex: string, f: number) => {
  const n = parseInt(hex.slice(1), 16)
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)))
  return `#${[c(n >> 16), c((n >> 8) & 255), c(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Personaje humano animado. Evoluciona igual que las llamitas:
 * 1 pin de llama · 2 cinta deportiva · 3 levanta pesa · 4 medalla de oro + destellos.
 */
export function Person({ look, stage = 0, mood = 'idle', size = 120, className }:
  { look: PersonLook; stage?: number; mood?: Mood | 'love'; size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  const { skin, hairColor: hc, top, pants } = look
  const skinD = shade(skin, 0.86)
  const topD = shade(top, top === '#f5f5f4' ? 0.86 : 0.8)
  const up = mood === 'happy' || mood === 'cheer'
  const lift = stage >= 3
  const love = mood === 'love'
  const eyesClosed = mood === 'sleep' || love
  const bodyMood = love ? 'happy' : mood
  const sleeve = look.outfit === 'tee' ? top : look.outfit === 'blazer' ? '#1c1917' : top

  // Brazo: hombro → mano
  const arm = (x1: number, y1: number, x2: number, y2: number, cls?: string) => {
    const sx = x1 + (x2 - x1) * (look.outfit === 'tee' ? 0.42 : 0.9), sy = y1 + (y2 - y1) * (look.outfit === 'tee' ? 0.42 : 0.9)
    return (
      <g className={cls}>
        <path d={`M${x1} ${y1} L${x2} ${y2}`} stroke={skin} strokeWidth="8" strokeLinecap="round" />
        <path d={`M${x1} ${y1} L${sx} ${sy}`} stroke={sleeve} strokeWidth="9.5" strokeLinecap="round" />
        <circle cx={x2} cy={y2} r="4.6" fill={skin} />
      </g>
    )
  }

  return (
    <svg viewBox="0 0 120 140" width={size} height={size * 140 / 120} className={cx('overflow-visible', className)} aria-hidden>
      <defs>
        <radialGradient id={`${id}aura`} cx="0.5" cy="0.55" r="0.5">
          <stop offset="0" stopColor="#fbbf24" stopOpacity="0.45" /><stop offset="1" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="135" rx="26" ry="4" className={cx('buddy-shadow', bodyMood === 'happy' && 'fast')} fill="#17130f" opacity="0.12" />

      <g className={cx('buddy-body', `mood-${bodyMood}`)}>
        {stage >= 4 && <circle className="buddy-aura" cx="60" cy="72" r="62" fill={`url(#${id}aura)`} />}

        {/* pelo largo: capa trasera */}
        {look.hair === 'long' && (
          <path fill={shade(hc, 0.85)} d="M31 48 Q28 18 60 17 Q92 18 89 48 L93 106 Q84 116 74 111 L71 74 L49 74 L46 111 Q36 116 27 106 Z" />
        )}

        {/* piernas y zapatillas */}
        <rect x="46" y="116" width="12" height="15" rx="4" fill={pants} />
        <rect x="62" y="116" width="12" height="15" rx="4" fill={pants} />
        <ellipse cx="51" cy="132" rx="8" ry="4" fill="#fafaf9" stroke="#d6d3d1" strokeWidth="1.2" />
        <ellipse cx="69" cy="132" rx="8" ry="4" fill="#fafaf9" stroke="#d6d3d1" strokeWidth="1.2" />

        {/* brazos detrás del torso cuando están abajo */}
        {!up && arm(41, 87, 34, 110)}
        {!up && !lift && arm(79, 87, 86, 110)}

        {/* cuello y torso */}
        <rect x="54" y="70" width="12" height="12" rx="3" fill={skinD} />
        <path fill={look.outfit === 'blazer' ? '#f5f5f4' : top} d="M38 93 Q38 80 51 79 L69 79 Q82 80 82 93 L82 118 Q82 122 78 122 L42 122 Q38 122 38 118 Z" />
        {look.outfit === 'tee' && <path d="M52 79.5 Q60 87 68 79.5" stroke={topD} strokeWidth="2" fill="none" strokeLinecap="round" />}
        {look.outfit === 'blazer' && (
          <g>
            <path fill="#1c1917" d="M38 93 Q38 80 51 79 L54 79 L60 101 L56 122 L42 122 Q38 122 38 118 Z" />
            <path fill="#1c1917" d="M82 93 Q82 80 69 79 L66 79 L60 101 L64 122 L78 122 Q82 122 82 118 Z" />
            <path d="M54 79 L58 92 M66 79 L62 92" stroke="#44403c" strokeWidth="1.5" />
            <circle cx="61.5" cy="110" r="1.4" fill="#57534e" />
          </g>
        )}
        {look.outfit === 'hoodie' && (
          <g>
            <path d="M48 80 Q60 92 72 80" stroke={topD} strokeWidth="4" fill="none" strokeLinecap="round" />
            <path d="M56 86 L55 96 M64 86 L65 96" stroke={topD} strokeWidth="1.5" strokeLinecap="round" />
            <path d="M48 106 L72 106 L69 116 L51 116 Z" fill={topD} opacity="0.55" />
          </g>
        )}
        {stage >= 1 && stage < 4 && (
          <path transform="translate(66 88) scale(0.11)" fill="#e11d48" d="M50 6c4 14 22 24 27 42 5 18-4 40-27 44C27 88 18 70 22 54c2-9 8-14 11-22 2 7 5 11 10 13-3-15 0-28 7-39Z" />
        )}
        {stage >= 4 && (
          <g className="buddy-crown">
            <path d="M51 79 L60 96 L69 79" stroke="#e11d48" strokeWidth="3" fill="none" />
            <circle cx="60" cy="99" r="6" fill="#fbbf24" stroke="#d97706" strokeWidth="1.5" />
            <path d="M60 95.5 l1.1 2.3 2.5 .3 -1.8 1.7 .5 2.5 -2.3 -1.2 -2.3 1.2 .5 -2.5 -1.8 -1.7 2.5 -.3z" fill="#fff7d6" />
          </g>
        )}

        {/* brazos delante (arriba / pesa) */}
        {up && arm(41, 86, 27, 64, 'buddy-arm-l wave')}
        {(up || lift) && !lift && arm(79, 86, 93, 64, 'buddy-arm-r wave')}
        {lift && (
          <g className="buddy-lift">
            {arm(79, 86, 92, 66)}
            <rect x="80" y="61" width="24" height="3.6" rx="1.8" fill="#57534e" />
            <rect x="78" y="55" width="5.5" height="16" rx="2" fill="#292524" />
            <rect x="101" y="55" width="5.5" height="16" rx="2" fill="#292524" />
          </g>
        )}

        {/* cabeza */}
        <circle cx="34.5" cy="54" r="5" fill={skin} />
        <circle cx="85.5" cy="54" r="5" fill={skin} />
        <ellipse cx="60" cy="50" rx="26" ry="27" fill={skin} />

        {/* cara */}
        <g>
          {eyesClosed ? (
            <g stroke="#2a1a14" strokeWidth={look.lashes ? 2.8 : 2.4} strokeLinecap="round" fill="none">
              <path d="M46 55 Q50 58.5 54 55" /><path d="M66 55 Q70 58.5 74 55" />
            </g>
          ) : (
            <g className="buddy-eyes">
              <ellipse cx="50" cy="54" rx="3.3" ry={mood === 'happy' ? 3.2 : 4.1} fill="#2a1a14" />
              <ellipse cx="70" cy="54" rx="3.3" ry={mood === 'happy' ? 3.2 : 4.1} fill="#2a1a14" />
              <circle cx="51.2" cy="52.6" r="1.1" fill="#fff" /><circle cx="71.2" cy="52.6" r="1.1" fill="#fff" />
            </g>
          )}
          {look.lashes && !eyesClosed && (
            <g stroke="#2a1a14" strokeWidth="1.4" strokeLinecap="round">
              <path d="M46.5 51.5 L44.5 50" /><path d="M73.5 51.5 L75.5 50" />
            </g>
          )}
          {/* cejas */}
          {look.lashes
            ? <g stroke={hc} strokeWidth="1.9" strokeLinecap="round" fill="none"><path d="M45 46 Q50 43 55 45.5" /><path d="M65 45.5 Q70 43 75 46" /></g>
            : <g stroke={hc} strokeWidth="3.3" strokeLinecap="round" fill="none"><path d={mood === 'sad' ? 'M45 45 L55 47' : 'M44.5 46.5 Q50 43.5 55.5 46'} /><path d={mood === 'sad' ? 'M75 45 L65 47' : 'M64.5 46 Q70 43.5 75.5 46.5'} /></g>}
          <path d="M58.5 58.5 Q60 61.5 62 59.5" stroke={skinD} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <circle cx="44" cy="62" r="4" fill="#ff8a8a" opacity="0.33" />
          <circle cx="76" cy="62" r="4" fill="#ff8a8a" opacity="0.33" />
          {look.mole && <circle cx="72" cy="66.5" r="1.1" fill="#4a2c20" />}
          {love ? (
            <g><ellipse cx="60" cy="66.5" rx="3.6" ry="3.1" fill="#e07a86" /><path d="M57.3 66.5 Q60 65.4 62.7 66.5" stroke="#b4525f" strokeWidth="1" fill="none" /></g>
          ) : mood === 'happy' || mood === 'cheer' ? (
            <path d="M53.5 64 Q60 72.5 66.5 64 Z" fill="#7a2626" stroke="#7a2626" strokeWidth="1.5" strokeLinejoin="round" />
          ) : mood === 'sad' ? (
            <path d="M55 68 Q60 64.5 65 68" stroke="#7a2626" strokeWidth="2" fill="none" strokeLinecap="round" />
          ) : mood === 'sleep' ? (
            <ellipse cx="60" cy="66" rx="2.2" ry="2.6" fill="#7a2626" />
          ) : (
            <path d="M55 65 Q60 69 65 65" stroke="#7a2626" strokeWidth="2" fill="none" strokeLinecap="round" />
          )}
        </g>

        {/* pelo delantero */}
        {look.hair === 'short' && (
          <g>
            <path fill={hc} opacity="0.45" d="M34 50 Q33 38 38 31 L40 49 Z M86 50 Q87 38 82 31 L80 49 Z" />
            <path fill={hc} d="M35 42 Q30 22 46 15 Q52 10 60 12 Q70 9 78 15 Q90 22 86 38 Q82 33 77 34 Q74 39 69 35 Q65 41 60 36.5 Q55 42 50 37.5 Q45 42 41 38 Q38 41 35 42 Z" />
            <path fill={hc} d="M40 22 Q44 12 52 13 Q48 17 47 22 Z M58 13 Q64 7 71 11 Q66 12 63 16 Z M74 15 Q82 15 84 22 Q79 19 75 20 Z" />
            <path d="M47 27 q6 -4 12 -1 M62 25 q6 -3 11 1" stroke={shade(hc, 1.9)} strokeWidth="1.2" opacity="0.5" fill="none" strokeLinecap="round" />
          </g>
        )}
        {look.hair === 'long' && (
          <g>
            <path fill={hc} d="M33 50 Q30 21 59 19 Q90 18 87 50 Q82 35 68 29 Q60 41 37 47 Q35 48 33 50 Z" />
            <path fill={hc} d="M34 44 Q29 72 32 106 Q38 110 45 105 Q40 78 42 54 Z" />
            <path fill={hc} d="M86 44 Q91 72 88 106 Q82 110 75 105 Q80 78 78 54 Z" />
            <path d="M40 34 Q50 26 64 26" stroke={shade(hc, 2.2)} strokeWidth="1.4" opacity="0.45" fill="none" strokeLinecap="round" />
          </g>
        )}
        {look.hair === 'bun' && (
          <g>
            <circle cx="60" cy="17" r="9" fill={hc} />
            <path fill={hc} d="M34 48 Q31 21 60 20 Q89 21 86 48 Q80 32 60 30 Q40 32 34 48 Z" />
          </g>
        )}
        {look.hair === 'curly' && (
          <g fill={hc}>
            {[[38, 36], [44, 27], [53, 22], [63, 21], [72, 25], [79, 33], [84, 42], [36, 45], [48, 31], [60, 28], [70, 31]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="8" />)}
          </g>
        )}

        {/* cinta deportiva */}
        {stage >= 2 && stage < 4 && (
          <g>
            <path d="M34.5 41 Q60 31 85.5 41 L85.5 46.5 Q60 36.5 34.5 46.5 Z" fill="#e11d48" />
            <path d="M85 43 L94 39 L92 47 Z" fill="#e11d48" />
          </g>
        )}
      </g>

      {mood === 'sleep' && (
        <g fill="#7c8aa5" fontWeight="700" fontFamily="system-ui">
          <text x="88" y="26" fontSize="14" className="buddy-z z1">z</text>
          <text x="98" y="14" fontSize="11" className="buddy-z z2">z</text>
        </g>
      )}
      {love && (
        <g fill="#f43f5e">
          <path className="buddy-spark s1" d="M96 40 c-3-4-9-1-6 4 l6 6 6-6 c3-5-3-8-6-4z" />
          <path className="buddy-spark s2" d="M18 34 c-2-3-7-1-5 3 l5 5 5-5 c2-4-3-6-5-3z" />
        </g>
      )}
      {(mood === 'happy' || stage >= 4) && !love && (
        <g fill="#fbbf24">
          <path className="buddy-spark s1" d="M14 46 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
          <path className="buddy-spark s2" d="M104 28 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z" />
        </g>
      )}
    </svg>
  )
}

/** Apariencias de ejemplo. */
export const PRESETS: Record<string, PersonLook> = {
  diego: { kind: 'person', skin: '#e3ab84', hair: 'short', hairColor: '#141010', outfit: 'tee', top: '#f5f5f4', pants: '#2f3b55', mole: true },
  maite: { kind: 'person', skin: '#f0c4a4', hair: 'long', hairColor: '#2b1b13', outfit: 'blazer', top: '#f5f5f4', pants: '#1f2937', lashes: true },
}
