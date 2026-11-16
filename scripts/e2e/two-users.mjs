// Prueba E2E: dos personas en iPhone 13 → registro, vinculación, racha compartida, propuestas, mensajes.
import { createRequire } from 'node:module'
const { chromium, devices } = createRequire(import.meta.url)('playwright') // Playwright preinstalado (no es dependencia del proyecto)
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:4173'
const OUT = process.env.OUT ?? 'e2e-screens'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const mk = async () => {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], timezoneId: 'America/Argentina/Buenos_Aires', locale: 'es-AR' })
  const page = await ctx.newPage()
  page.on('pageerror', e => console.log('  [error de página]', e.message))
  return page
}
const step = (s) => console.log('▶', s)
const ok = (s) => console.log('  ✅', s)
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
const stamp = Date.now()

async function register(p, name) {
  await p.goto(BASE + '/registro')
  await p.getByPlaceholder('¿Cómo te llamamos?').fill(name)
  await p.getByPlaceholder('tu@correo.com').fill(`${name.toLowerCase()}${stamp}@prueba.local`)
  const pw = p.locator('input[type=password]')
  await pw.nth(0).fill('claveSegura123')
  await pw.nth(1).fill('claveSegura123')
  await p.getByRole('button', { name: 'Crear mi cuenta' }).click()
  await p.getByText('Vincular pareja').first().waitFor()
  await skipTour(p)
}
async function skipTour(p) {
  const b = p.getByRole('button', { name: 'Saltar' })
  if (await b.isVisible().catch(() => false)) await b.click()
}

const A = await mk(), B = await mk()

step('1. Registro de dos cuentas independientes')
await A.goto(BASE + '/login'); await shot(A, '01-login')
await register(A, 'Ana'); ok('Ana creó su cuenta')
await register(B, 'Beto'); ok('Beto creó su cuenta')

step('2. Vinculación con código')
await A.getByRole('button', { name: 'Generar código' }).click()
const codeEl = A.getByTestId('invite-code')
await codeEl.waitFor()
const code = (await codeEl.textContent()).trim()
ok(`Ana generó el código ${code}`)
await shot(A, '02-codigo')
await B.getByPlaceholder('ABC234').fill(code)
await B.getByRole('button', { name: 'Vincularnos' }).click()
await B.getByText('Estás vinculado/a con Ana').waitFor()
ok('Beto aceptó la invitación')
await A.getByText('Estás vinculado/a con Beto').waitFor({ timeout: 15000 })
ok('La pantalla de Ana se actualizó sola (vinculada con Beto)')

step('3. Racha compartida: solo Ana cumple')
await A.goto(BASE + '/'); await A.getByText('Racha compartida', { exact: true }).waitFor()
await A.getByRole('button', { name: 'Entreno', exact: true }).click()
await A.getByRole('button', { name: 'Guardar' }).click()
await A.getByText('¡Entrenamiento registrado!').waitFor()
await A.getByText('Falta Beto para sumar el día.').waitFor()
const countA1 = await A.getByTestId('streak-count').textContent()
if (countA1.trim() !== '0') throw new Error('La racha no debía avanzar con una sola persona')
ok('Ana: completado. La racha sigue en 0 (falta Beto)')
await shot(A, '03-ana-cumplio')

await B.goto(BASE + '/'); await B.getByText('Ana ya cumplió. Te toca a ti.').waitFor()
ok('Beto ve que Ana ya cumplió')
await shot(B, '04-beto-ve-a-ana')

step('4. Beto cumple con actividad física')
await B.getByRole('button', { name: 'Actividad', exact: true }).click()
await B.getByRole('button', { name: '45′' }).click()
await B.getByRole('button', { name: 'Guardar' }).click()
await B.getByText('Los dos cumplieron hoy.').waitFor()
const countB = await B.getByTestId('streak-count').textContent()
if (countB.trim() !== '1') throw new Error('La racha debía ser 1, es ' + countB)
ok('Racha = 1 🔥 en la pantalla de Beto')
await B.waitForTimeout(1200); await shot(B, '05-racha-1')

await A.reload(); await A.getByText('Los dos cumplieron hoy.').waitFor()
ok('Ana también ve la racha en 1')

step('5. Notificaciones dentro de la app')
await A.goto(BASE + '/notificaciones'); await A.getByText('¡Racha +1!').first().waitFor()
ok('Ana recibió "¡Racha +1!"')
await shot(A, '06-notificaciones')

step('6. Cambio de reglas con aprobación de ambos')
await A.goto(BASE + '/racha/reglas'); await A.getByText('¿Qué cuenta para cumplir el día?').waitFor()
await A.getByRole('switch').nth(3).click() // Agua
await A.getByPlaceholder('Ej.: ¿Sumamos el agua a la racha?').fill('¿Sumamos el agua?')
await shot(A, '07-reglas')
await A.getByRole('button', { name: 'Enviar propuesta' }).click()
await A.getByText('Esperando a Beto').waitFor()
ok('Ana propuso el cambio')
await B.goto(BASE + '/'); await B.getByText('Un cambio espera tu respuesta').waitFor()
await B.getByText('Un cambio espera tu respuesta').click()
await B.getByRole('button', { name: 'Aprobar' }).click()
await B.getByRole('button', { name: 'Aceptar' }).click()
await B.getByText('Respuesta guardada').waitFor()
ok('Beto aprobó; se crea la versión 2 de las reglas (desde mañana)')
await B.goto(BASE + '/racha'); await B.getByText(/Nuevas reglas \(v2\)/).waitFor()
ok('La página Racha muestra que v2 empieza mañana')
await shot(B, '08-racha-pagina')

step('7. Espacio de pareja: mensajes')
await A.goto(BASE + '/pareja'); await A.getByPlaceholder('Mensaje…').fill('¡Bien ahí, amor! 🔥')
await A.getByRole('button', { name: 'Enviar', exact: true }).click()
await A.getByRole('button', { name: 'Enviar corazón' }).click()
await B.goto(BASE + '/pareja'); await B.getByText('¡Bien ahí, amor!').waitFor()
ok('Beto recibió el mensaje')
await B.waitForTimeout(800); await shot(B, '09-chat')

step('8. Otras pantallas')
for (const [path, name] of [['/gym', '10-gym'], ['/habitos', '11-habitos'], ['/habitos/agua', '12-agua'], ['/estadisticas', '13-stats'], ['/perfil', '14-perfil'], ['/pareja/calendario', '15-calendario']]) {
  await A.goto(BASE + path); await A.waitForTimeout(900); await shot(A, name)
}
ok('Capturas guardadas en ' + OUT)
await browser.close()
console.log('\n🎉 PRUEBA E2E COMPLETA: registro, 2 cuentas, vinculación, racha compartida, propuestas y mensajes funcionan.')
