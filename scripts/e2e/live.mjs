// Prueba E2E: entrenar en vivo (la pareja ve y reacciona) y celebración de récords.
import { createRequire } from 'node:module'
const { chromium, devices } = createRequire(import.meta.url)('playwright')
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:4173'
const OUT = process.env.OUT ?? 'e2e-screens'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const mk = async () => {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], timezoneId: 'America/Argentina/Buenos_Aires', locale: 'es-AR' })
  await ctx.addInitScript(() => { try { localStorage.setItem('fj-no-prompts', '1') } catch {} })
  const page = await ctx.newPage()
  page.on('pageerror', e => console.log('  [error de página]', e.message))
  return page
}
const ok = (s) => console.log('  ✅', s)
const stamp = Date.now()
async function register(p, name) {
  await p.goto(BASE + '/registro')
  await p.getByPlaceholder('¿Cómo te llamamos?').fill(name)
  await p.getByPlaceholder('tu@correo.com').fill(`${name.toLowerCase()}${stamp}@prueba.local`)
  const pw = p.locator('input[type=password]')
  await pw.nth(0).fill('claveSegura123'); await pw.nth(1).fill('claveSegura123')
  await p.getByRole('button', { name: 'Crear mi cuenta' }).click()
  await p.getByText('Vincular pareja').first().waitFor()
  const b = p.getByRole('button', { name: 'Saltar' }); if (await b.isVisible().catch(() => false)) await b.click()
}
async function workout(p, kg) {
  await p.goto(BASE + '/gym'); await p.getByRole('button', { name: /Empezar entrenamiento libre/ }).click()
  const sheet = p.locator('[data-sheet]').last()
  await sheet.getByRole('button', { name: /Añadir ejercicios/ }).click()
  const pick = p.locator('[data-sheet]').last()
  await pick.getByPlaceholder(/Buscar entre/).fill('Sentadilla con barra')
  await pick.locator('p', { hasText: /^Sentadilla con barra(Mío)?$/ }).first().click()
  await pick.getByRole('button', { name: /^Añadir/ }).last().click()
  await p.waitForTimeout(600)
  const s = p.locator('[data-sheet]').last()
  const row = s.locator('input[type=number]')
  // inputs: duración, luego por serie: reps, kg, seg, desc
  await row.nth(1).fill('8'); await row.nth(2).fill(String(kg))
  await s.getByLabel('Serie hecha').first().click()
  return s
}

const A = await mk(), B = await mk()
await register(A, 'Ana'); await register(B, 'Beto')
await A.getByRole('button', { name: 'Generar código' }).click()
const code = (await A.getByTestId('invite-code').textContent()).trim()
await B.getByPlaceholder('ABC234').fill(code); await B.getByRole('button', { name: 'Vincularnos' }).click()
await B.getByText('Estás vinculado/a con Ana').waitFor()
ok('Ana y Beto vinculados')

console.log('▶ 1. Entrenar en vivo')
const s1 = await workout(A, 50)
await s1.getByTestId('live-toggle').waitFor()
if (!(await s1.getByTestId('live-toggle').isChecked())) throw new Error('compartir en vivo debía venir activado')
await B.goto(BASE + '/')
await B.getByTestId('partner-live').waitFor({ timeout: 20000 })
await B.getByTestId('partner-live').getByText('Sentadilla con barra').waitFor({ timeout: 15000 })
await B.getByTestId('partner-live').getByText('1 de 3 series').waitFor({ timeout: 15000 })
await B.getByTestId('partner-live').getByText(/Descansando \d:\d\d/).waitFor({ timeout: 5000 })
ok('Beto ve a Ana entrenando en vivo (ejercicio, 1 de 3 series y su descanso)')
const card = await B.getByTestId('partner-live').innerText()
if (/50|kg/.test(card)) throw new Error('¡La tarjeta en vivo muestra el peso!')
ok('La tarjeta en vivo NO muestra kilos')
await B.getByTestId('partner-live').screenshot({ path: `${OUT}/en-vivo-beto.png` })
await B.getByRole('button', { name: 'Enviar 🔥' }).click()
await A.getByText('Beto te mandó 🔥').waitFor({ timeout: 15000 })
ok('A Ana le llega el 🔥 de Beto mientras entrena')
await s1.getByRole('button', { name: 'Terminar y guardar' }).click()
await A.getByText('¡Entrenamiento guardado! 💪').waitFor()
await A.waitForTimeout(1500)
if (await A.getByTestId('records-sheet').count()) throw new Error('el primer entreno no debía ser récord')
ok('Primer entreno guardado (sin récord, no hay con qué comparar)')
await B.reload(); await B.waitForTimeout(3000)
if (await B.getByTestId('partner-live').count()) throw new Error('la sesión en vivo debía terminar al guardar')
ok('Al terminar, la tarjeta en vivo desaparece para Beto')

console.log('▶ 2. Récord personal')
const s2 = await workout(A, 55)
await s2.getByRole('button', { name: 'Terminar y guardar' }).click()
await A.getByTestId('records-sheet').waitFor({ timeout: 15000 })
await A.getByTestId('records-sheet').getByText('55 kg').waitFor()
ok('Ana ve la celebración: Sentadilla 50 → 55 kg')
await A.waitForTimeout(900); await A.screenshot({ path: `${OUT}/record.png` })
await A.getByRole('button', { name: '¡Vamos! 💪' }).click()
await B.goto(BASE + '/notificaciones')
await B.getByText(/Ana batió un récord/).waitFor({ timeout: 15000 })
const notif = await B.getByText(/Sentadilla con barra\. ¡Mándale un aplauso/).innerText()
if (/55|50|kg/.test(notif)) throw new Error('el aviso muestra el peso')
ok('Beto recibe "Ana batió un récord" sin ver los kilos')
await browser.close()
console.log('\n🎉 EN VIVO Y RÉCORDS FUNCIONAN')
