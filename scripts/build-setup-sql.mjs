// Une todas las migraciones en supabase/setup.sql para pegarlo de una vez en el SQL Editor de Supabase.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
const dir = 'supabase/migrations'
const parts = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  .map(f => `-- >>>>>>>>>>>>>>>>>>>> ${f} <<<<<<<<<<<<<<<<<<<<\n${readFileSync(`${dir}/${f}`, 'utf8')}`)
writeFileSync('supabase/setup.sql', `-- FUEGO JUNTOS · instalación completa de la base de datos.\n-- Generado automáticamente desde supabase/migrations. Se puede ejecutar más de una vez.\n\n${parts.join('\n\n')}\n`)
console.log('supabase/setup.sql generado con', parts.length, 'archivos')
