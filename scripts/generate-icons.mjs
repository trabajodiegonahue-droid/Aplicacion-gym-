// Genera iconos PNG y pantallas de carga de iPhone a partir de public/flame.svg
import sharp from 'sharp'
import { mkdirSync, readFileSync } from 'node:fs'

const svg = readFileSync('public/flame.svg')
mkdirSync('public/icons', { recursive: true })
mkdirSync('public/splash', { recursive: true })

const icon = (size, file, pad = 0) =>
  sharp(svg).resize(size - pad * 2, size - pad * 2)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: '#e11d48' })
    .png().toFile(`public/icons/${file}`)

await icon(192, 'icon-192.png')
await icon(512, 'icon-512.png')
await icon(512, 'icon-maskable-512.png', 56)
await icon(180, 'apple-touch-icon.png')
await icon(32, 'favicon-32.png')

// iPhone 13 en adelante (px reales, vertical)
const splash = [
  [1080, 2340], // 13 mini
  [1170, 2532], // 13, 13 Pro, 14
  [1284, 2778], // 13 Pro Max, 14 Plus
  [1179, 2556], // 14 Pro, 15, 15 Pro, 16
  [1290, 2796], // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  [1206, 2622], // 16 Pro, 17
  [1320, 2868], // 16 Pro Max, 17 Pro Max
]
const logo = await sharp(svg).resize(360, 360).png().toBuffer()
const rounded = await sharp(logo).composite([{
  input: Buffer.from('<svg><rect width="360" height="360" rx="80" ry="80"/></svg>'), blend: 'dest-in',
}]).png().toBuffer()
for (const [w, h] of splash) {
  await sharp({ create: { width: w, height: h, channels: 4, background: '#fafaf9' } })
    .composite([{ input: rounded, top: Math.round(h / 2 - 260), left: Math.round(w / 2 - 180) }])
    .png().toFile(`public/splash/splash-${w}x${h}.png`)
}
console.log('Iconos y splash generados')
