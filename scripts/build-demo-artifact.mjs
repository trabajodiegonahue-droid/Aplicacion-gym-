// Convierte dist-artifact/index.html en una página publicable como Artifact de Claude
// (sin <html>/<head>/<body>, rutas relativas) y lista los archivos a publicar.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
const html = readFileSync('dist-artifact/index.html', 'utf8')
const assets = [...html.matchAll(/<(script|link)[^>]+(?:src|href)="\.\/assets\/[^"]+"[^>]*>(?:<\/script>)?/g)].map(m => m[0])
const page = `<title>Fuego Juntos Demo</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#fff8f3">
${assets.join('\n')}
<style>
  #boot{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#fff8f3;font:500 14px -apple-system,system-ui,sans-serif;color:#5c5650}
  @media (prefers-color-scheme: dark){#boot{background:#0b0b0c;color:#aaa}}
</style>
<div id="boot"><svg width="64" height="64" viewBox="0 0 100 100"><path fill="#e11d48" d="M50 6c4 14 22 24 27 42 5 18-4 40-27 44C27 88 18 70 22 54c2-9 8-14 11-22 2 7 5 11 10 13-3-15 0-28 7-39Z"/></svg>Cargando la demo…</div>
<div id="root"></div>
`
writeFileSync('dist-artifact/demo.html', page)
const files = readdirSync('dist-artifact/assets').map(f => `assets/${f}`)
writeFileSync('dist-artifact/files.json', JSON.stringify(files, null, 1))
console.log('demo.html listo;', files.length, 'archivos')
