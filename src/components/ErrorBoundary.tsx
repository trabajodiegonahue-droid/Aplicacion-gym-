import { Component, type ReactNode } from 'react'
import { Buddy } from './Buddy'

/** Si una pantalla falla, muestra un mensaje amable en lugar de una pantalla en blanco. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error('[Fuego Juntos] Error de pantalla:', error) }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-[70dvh] flex-col items-center justify-center px-8 text-center">
        <Buddy stage={1} mood="sad" size={96} />
        <h2 className="mt-4 text-[20px] font-bold">Algo salió mal en esta pantalla</h2>
        <p className="muted mt-1 text-[14px]">Tus datos están a salvo. Prueba volver al inicio o recargar.</p>
        <div className="mt-5 flex gap-2">
          <button className="btn-soft" onClick={() => { this.setState({ error: null }); window.dispatchEvent(new CustomEvent('fj-go-home')) }}>Ir al inicio</button>
          <button className="btn-primary" onClick={() => location.reload()}>Recargar</button>
        </div>
        <p className="mt-6 max-w-xs break-words text-[11px] text-fuego-800/50">Detalle técnico: {this.state.error.message}</p>
      </div>
    )
  }
}
