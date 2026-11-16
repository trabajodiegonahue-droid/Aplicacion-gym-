import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

let trigger: ((emojis?: string[]) => void) | null = null
/** Lanza la animación de celebración (llamas y corazones subiendo). */
export const celebrate = (emojis?: string[]) => trigger?.(emojis)

export function CelebrationLayer() {
  const [items, setItems] = useState<{ id: number; left: number; delay: number; e: string; size: number }[]>([])
  useEffect(() => {
    trigger = (emojis = ['🔥', '❤️', '💪', '✨', '💖']) => {
      if (navigator.vibrate) navigator.vibrate(30)
      const base = Date.now()
      setItems(Array.from({ length: 26 }, (_, i) => ({
        id: base + i, left: Math.random() * 100, delay: Math.random() * 0.6, e: emojis[i % emojis.length], size: 22 + Math.random() * 22,
      })))
      setTimeout(() => setItems([]), 2800)
    }
    return () => { trigger = null }
  }, [])
  if (!items.length) return null
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[90] overflow-hidden">
      {items.map(it => (
        <span key={it.id} className="absolute bottom-0" style={{ left: `${it.left}%`, fontSize: it.size, animation: `float-up 2.2s ease-out ${it.delay}s forwards`, opacity: 0 }}>{it.e}</span>
      ))}
    </div>, document.body)
}
