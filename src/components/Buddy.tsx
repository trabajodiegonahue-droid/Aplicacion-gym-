import { useId } from 'react'
import { BUDDY_COLORS, type BuddyColor } from '../lib/levels'
import { cx } from './ui'

export type Mood = 'happy' | 'idle' | 'sleep' | 'sad' | 'cheer'

/**
 * Personaje "llamita" (diseño original de Gymaiego).
 * stage 0 Chispa · 1 Llamita (brazos) · 2 Fueguito (cinta) · 3 Brasa (pesa) · 4 Llamarada (corona + aura)
 */
export function Buddy({ stage = 0, color = 'rojo', mood = 'idle', size = 120, className }:
  { stage?: number; color?: BuddyColor; mood?: Mood; size?: number; className?: string }) {
  const id = useId().replace(/:/g, '')
  const c = BUDDY_COLORS[color]
  const arms = stage >= 1
  const up = mood === 'happy' || mood === 'cheer'
  const scale = stage === 0 ? 0.74 : stage === 1 ? 0.88 : 1
  return (
    <svg viewBox="0 0 120 140" width={size} height={size * 140 / 120} className={cx('overflow-visible', className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}b`} x1="0.3" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor={c.a} /><stop offset="0.55" stopColor={c.b} /><stop offset="1" stopColor={c.c} />
        </linearGradient>
        <radialGradient id={`${id}g`} cx="0.5" cy="0.6" r="0.5">
          <stop offset="0" stopColor={c.a} stopOpacity="0.55" /><stop offset="1" stopColor={c.a} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* sombra */}
      <ellipse cx="60" cy="133" rx={30 * scale} ry="4.5" className={cx('buddy-shadow', mood === 'happy' && 'fast')} fill="#17130f" opacity="0.12" />

      <g className={cx('buddy-body', `mood-${mood}`)}>
        <g transform={`translate(60 130) scale(${scale}) translate(-60 -130)`}>
          {stage >= 4 && (
            <g className="buddy-aura">
              <circle cx="60" cy="80" r="62" fill={`url(#${id}g)`} />
            </g>
          )}

          {/* brazos (detrás del cuerpo) */}
          {arms && (
            <g stroke={c.c} strokeWidth="8" strokeLinecap="round" fill="none">
              <path className={cx('buddy-arm-l', up && 'wave')} d={up ? 'M32 96 L16 76' : 'M32 100 L18 112'} />
              {stage >= 3
                ? <path d="M88 94 L104 74" />
                : <path className={cx('buddy-arm-r', up && 'wave')} d={up ? 'M88 96 L104 76' : 'M88 100 L102 112'} />}
            </g>
          )}

          {/* cuerpo */}
          <g className="buddy-flicker">
            <path fill={`url(#${id}b)`} d="M60 10 C66 26 84 36 92 58 C100 80 96 104 84 116 C76 124 68 128 60 128 C52 128 44 124 36 116 C24 104 20 82 28 62 C32 52 38 46 42 40 C44 50 48 55 53 57 C50 42 53 24 60 10 Z" />
            <path fill="#fff" opacity="0.28" d="M44 64 C40 72 38 84 41 94 C36 86 36 72 44 64Z" />
          </g>
          <path fill={c.belly} opacity="0.9" d="M60 101 C67 105 76 109 76 117 C76 124 69 127 60 127 C51 127 44 124 44 117 C44 109 53 105 60 101Z" />

          {/* cinta de entrenamiento */}
          {stage >= 2 && stage < 4 && (
            <g>
              <path d="M30 68 Q60 59 90 68 L90 75 Q60 66 30 75 Z" fill="#fff" />
              <path d="M30 68 Q60 59 90 68 L90 70 Q60 61 30 70 Z" fill={c.b} opacity="0.35" />
              <path d="M89 70 L99 64 L97 74 Z M89 72 L100 76 L92 80 Z" fill="#fff" />
            </g>
          )}

          {/* corona */}
          {stage >= 4 && (
            <g className="buddy-crown">
              <path d="M45 62 L45 50 L52 56 L60 45 L68 56 L75 50 L75 62 Z" fill="#fbbf24" stroke="#d97706" strokeWidth="1.5" strokeLinejoin="round" />
              <circle cx="60" cy="56" r="2.5" fill="#e11d48" /><circle cx="50" cy="58" r="1.6" fill="#fff" /><circle cx="70" cy="58" r="1.6" fill="#fff" />
            </g>
          )}

          {/* cara */}
          <g>
            {mood === 'sleep' ? (
              <g stroke="#2a1215" strokeWidth="2.6" strokeLinecap="round" fill="none">
                <path d="M43 84 Q48 88 53 84" /><path d="M67 84 Q72 88 77 84" />
              </g>
            ) : (
              <g className="buddy-eyes">
                <ellipse cx="48" cy="83" rx="4.6" ry={mood === 'happy' ? 4 : 5.6} fill="#2a1215" />
                <ellipse cx="72" cy="83" rx="4.6" ry={mood === 'happy' ? 4 : 5.6} fill="#2a1215" />
                <circle cx="49.6" cy="81" r="1.6" fill="#fff" /><circle cx="73.6" cy="81" r="1.6" fill="#fff" />
              </g>
            )}
            {mood === 'sad' && (
              <g stroke="#2a1215" strokeWidth="2" strokeLinecap="round"><path d="M42 75 L52 77" /><path d="M78 75 L68 77" /></g>
            )}
            <circle cx="39" cy="93" r="5" fill="#ff8fa3" opacity="0.55" />
            <circle cx="81" cy="93" r="5" fill="#ff8fa3" opacity="0.55" />
            {mood === 'happy' || mood === 'cheer'
              ? <path d="M52 92 Q60 104 68 92 Z" fill="#2a1215" stroke="#2a1215" strokeWidth="2" strokeLinejoin="round" />
              : mood === 'sad' ? <path d="M53 98 Q60 92 67 98" stroke="#2a1215" strokeWidth="2.6" strokeLinecap="round" fill="none" />
              : mood === 'sleep' ? <ellipse cx="60" cy="96" rx="3" ry="3.5" fill="#2a1215" />
              : <path d="M54 93 Q60 99 66 93" stroke="#2a1215" strokeWidth="2.6" strokeLinecap="round" fill="none" />}
          </g>

          {/* pesa */}
          {stage >= 3 && (
            <g className="buddy-lift">
              <rect x="92" y="70" width="26" height="4" rx="2" fill="#57534e" />
              <rect x="90" y="63" width="6" height="18" rx="2" fill="#292524" />
              <rect x="114" y="63" width="6" height="18" rx="2" fill="#292524" />
            </g>
          )}
        </g>
      </g>

      {/* extras */}
      {mood === 'sleep' && (
        <g fill="#7c8aa5" fontWeight="700" fontFamily="system-ui">
          <text x="84" y="40" fontSize="14" className="buddy-z z1">z</text>
          <text x="94" y="28" fontSize="11" className="buddy-z z2">z</text>
        </g>
      )}
      {(mood === 'happy' || stage >= 4) && (
        <g fill="#fbbf24">
          <path className="buddy-spark s1" d="M14 40 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
          <path className="buddy-spark s2" d="M104 24 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z" />
          <path className="buddy-spark s3" d="M108 100 l1.4 3.4 3.4 1.4 -3.4 1.4 -1.4 3.4 -1.4 -3.4 -3.4 -1.4 3.4 -1.4z" />
        </g>
      )}
    </svg>
  )
}
