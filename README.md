# 🔥 Fuego Juntos

Aplicación web instalable (PWA) de gimnasio, hábitos y **racha compartida** para parejas a distancia.
Optimizada para iPhone 13 en adelante (Safari / pantalla de inicio), funciona también en Android y escritorio.

👉 **Para ponerla en marcha sigue [SETUP.md](SETUP.md)** (paso a paso, sin programar, todo gratis).

## Tecnologías (todas gratuitas)

React 19 · Vite · TypeScript · Tailwind CSS 4 · Supabase Free (Auth, Postgres, RLS, Realtime, Storage, pg_cron, pg_net) ·
Vercel Hobby (hosting + 1 función serverless para Web Push) · Web App Manifest + Service Worker (Workbox) · Recharts · lucide-react.

## Cómo funciona la racha (corazón de la app)

- Cada persona registra **sus** actividades (entrenos, actividad, agua, hábitos, descansos). RLS impide escribir datos de otra persona.
- El **servidor** (funciones PL/pgSQL + triggers) calcula el estado diario de cada uno: *Pendiente, En progreso, Completado, Descanso, No cumplido*. El navegador nunca decide si alguien cumplió.
- El día de la pareja se completa **solo si los dos** cumplen su propio día (cada uno en su zona horaria, con horario de cierre configurable).
- Solo cuentan registros creados **antes del cierre** de ese día: no se puede rellenar un día pasado.
- `pg_cron` cierra los días vencidos cada 15 min; los días cerrados **nunca se recalculan** (historial inmutable).
- Las reglas están **versionadas**: un cambio se propone, la otra persona lo aprueba y rige **desde mañana**. Se registra quién propuso, quién aprobó, fecha y versión (`streak_rules`, `shared_change_proposals`, `audit_logs`).
- Recuperación de racha opcional (límite mensual, últimos 3 días, requiere aprobación).

## Estructura

```
supabase/migrations/   0001 esquema · 0002 lógica (racha, propuestas, RPC, recordatorios) · 0003 RLS + Realtime · 0004 fotos · 0005 cron
supabase/setup.sql     todo lo anterior en un solo archivo (para pegar en el SQL Editor)
supabase/tests/        pruebas de base de datos (90+ comprobaciones) con Postgres local
scripts/e2e/           prueba de extremo a extremo con 2 iPhone simulados
api/push.ts            función de Vercel que envía Web Push
src/                   la app (páginas, componentes, service worker)
```

## Estado de las funcionalidades

| Módulo | Estado |
|---|---|
| Registro, login, cierre de sesión, recuperación de contraseña, cambio de contraseña | ✅ (recuperación requiere SMTP: ver SETUP Paso 7) |
| Perfil: nombre, foto, bio, cumpleaños, zona horaria, tema claro/oscuro | ✅ |
| Vinculación por código, aceptación, desvinculación (sin borrar datos personales) | ✅ |
| Racha compartida, récord, calendario, estados, alertas de peligro, historial, recuperación | ✅ |
| Reglas configurables con aprobación de ambos y versionado | ✅ |
| Gimnasio: rutinas, ejercicios por grupo muscular, series/reps/kg/duración/descanso, notas, historial, récords, gráficos, favoritas, temporizador de descanso (+15/−15 s, sonido y vibración), entrenamiento a medio hacer que se guarda solo, repetir el último, sugerencia de progresión | ✅ |
| Resumen semanal en equipo (XP juntos, días que cumplieron los dos, lo mejor de cada uno; sin competencia) + aviso el domingo 19:00 | ✅ |
| Agua: meta, vasos/botellas/personalizado, añadir/quitar, historial semanal/mensual | ✅ |
| Actividad física: caminata, pasos, cardio, bici, correr, deportes, estadísticas, objetivos | ✅ (manual; Apple Salud no es accesible desde apps web) |
| Hábitos con categorías editables, metas individuales/compartidas, retos con insignias y recompensas | ✅ |
| Espacio de pareja: mensajes, corazones, fotos, álbum/recuerdos, notas, contador de días, aniversario | ✅ |
| Calendario compartido (eventos, cumpleaños, aniversarios, entrenos, descansos, metas, retos) | ✅ |
| Notificaciones en la app (campana) + Web Push configurable por categoría y horario | ✅ (push requiere SETUP Pasos 5–6 e iOS 16.4+ con la app instalada) |
| Estadísticas día/semana/mes, comparación motivadora y progreso conjunto | ✅ |
| PWA: icono, pantalla de carga, pantalla completa, safe areas / Dynamic Island | ✅ |

## Demo sin servidor

`npm run build:demo` genera una versión de prueba en `dist-demo/` que funciona sin Supabase:
usa PostgreSQL real dentro del navegador (PGlite) con las mismas migraciones, lógica de racha y RLS,
y trae dos cuentas de ejemplo ya vinculadas (ana@demo.app / beto@demo.app, clave `demo1234`).
Los datos de la demo se guardan solo en ese navegador. La versión real no incluye nada de esto.

## Desarrollo local (opcional)

```bash
npm install
cp .env.example .env.local   # y rellena VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

Pruebas de base de datos (requiere PostgreSQL 16 local): `PGHOST=… PGPORT=… ./supabase/tests/run_local.sh`
