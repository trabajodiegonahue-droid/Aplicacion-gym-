// Carga diferida del backend de demo. En la versión real (sin VITE_DEMO) esta rama
// se elimina al compilar y PGlite no se incluye en la app.
export const loadDemoBackend = () =>
  import.meta.env.VITE_DEMO === 'true' ? import('./client') : Promise.reject(new Error('Modo demo desactivado'))
