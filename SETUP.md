# 🔥 Fuego Juntos — Guía de puesta en marcha (sin programar)

Tiempo estimado: **30–40 minutos**. Todo es **gratis** (Supabase Free + Vercel Hobby + GitHub Free).
Solo necesitas un ordenador con navegador para la configuración; después todo se usa desde el iPhone.

> Vas a crear 2 cuentas de servicios (Supabase y Vercel) y copiar/pegar algunos valores.
> Los valores marcados como **SECRETOS** nunca se comparten con nadie ni se pegan en el código.

---

## Paso 1 · Crear la base de datos en Supabase

1. Entra en **https://supabase.com** y pulsa **Start your project**.
2. Elige **Continue with GitHub** (usa la misma cuenta de GitHub donde está este código).
3. Si te pide crear una organización: nombre libre (ej. `fuego`), tipo **Personal**, plan **Free – $0/month**.
4. Pulsa **New project**:
   - **Name:** `fuego-juntos`
   - **Database Password:** pulsa *Generate a password* y **guárdala** en un lugar seguro (no la necesitarás en la app).
   - **Region:** la más cercana a ustedes (ej. *South America (São Paulo)* o *Europe*).
   - Pulsa **Create new project** y espera 1–2 minutos.

## Paso 2 · Instalar las tablas y la lógica de la racha

1. En este repositorio abre el archivo **`supabase/setup.sql`** y copia **todo** su contenido
   (en GitHub: abre el archivo → botón *Copy raw file* 📋 arriba a la derecha).
2. En Supabase, menú izquierdo → **SQL Editor** → **New query** (o el botón ➕).
3. Pega todo el contenido y pulsa **Run** (abajo a la derecha).
4. Debe terminar con **Success. No rows returned**.
   - Si aparece un aviso de “destructive operation”, pulsa **Run this query** (el script solo borra y recrea sus propias políticas).
   - Si algo falla, copia el mensaje de error y envíamelo.

Esto crea: tablas, seguridad por filas (RLS), el motor de la racha, tareas automáticas cada 15 min, el almacenamiento privado de fotos y la sincronización en tiempo real.

## Paso 3 · Configurar el inicio de sesión

1. Menú izquierdo → **Authentication** → **Sign In / Providers** (o *Providers*) → **Email**.
2. Desactiva **Confirm email** y pulsa **Save**.
   *¿Por qué?* El correo gratuito de Supabase solo envía unos pocos correos por hora (y en proyectos nuevos solo a direcciones del propio equipo de Supabase), así que la confirmación por correo podría no llegar. Sin confirmación, cada uno se registra y entra al instante.
3. (Recomendado, para **recuperar contraseña**) configura el envío de correos con tu Gmail en el **Paso 7**.

## Paso 4 · Copiar las claves de Supabase

Menú izquierdo → **Project Settings** (⚙️) → **API Keys** (y **Data API** para la URL). Copia en un bloc de notas:

| Qué | Dónde está | ¿Secreta? |
|---|---|---|
| **Project URL** (ej. `https://abcd1234.supabase.co`) | Project Settings → Data API (o arriba en *Connect*) | No |
| **Publishable key** (`sb_publishable_…`) o, en pestaña *Legacy*, la **anon public** (`eyJ…`) | Project Settings → API Keys | No (es pública, la protege RLS) |
| **Secret key** (`sb_secret_…`) o *Legacy* **service_role** (`eyJ…`) | Project Settings → API Keys → *Reveal* | **SÍ — SECRETA** |

## Paso 5 · Publicar la app en Vercel (enlace HTTPS gratis)

1. Entra en **https://vercel.com/signup** → **Hobby** → **Continue with GitHub**.
2. Pulsa **Add New… → Project**. Busca el repositorio **`aplicacion-gym-`** y pulsa **Import**.
   (Si no aparece: *Adjust GitHub App Permissions* → dale acceso a ese repositorio.)
3. **Project Name:** escribe `fuegojuntos` (tu enlace será `https://fuegojuntos.vercel.app`; si está ocupado Vercel te sugerirá otro, ej. `fuegojuntos-abc.vercel.app`).
4. **Framework Preset:** debe decir **Vite** (se detecta solo). No cambies nada más.
5. Abre **Environment Variables** y añade una por una (*Key* = nombre, *Value* = valor):

   | Key | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | tu Project URL |
   | `VITE_SUPABASE_ANON_KEY` | tu Publishable / anon key |
   | `SUPABASE_URL` | tu Project URL (otra vez) |
   | `SUPABASE_SERVICE_ROLE_KEY` | tu Secret / service_role key (**SECRETA**) |
   | `VITE_VAPID_PUBLIC_KEY` | ver archivo `SECRETOS-NO-SUBIR.txt` (te lo explico abajo) |
   | `VAPID_PUBLIC_KEY` | el mismo valor que la anterior |
   | `VAPID_PRIVATE_KEY` | ver `SECRETOS-NO-SUBIR.txt` (**SECRETA**) |
   | `VAPID_SUBJECT` | `mailto:` + tu correo (ej. `mailto:tucorreo@gmail.com`) |
   | `PUSH_SECRET` | ver `SECRETOS-NO-SUBIR.txt` (**SECRETA**) |

   > Las claves VAPID son para las notificaciones push. Claude las generó y las dejó en el archivo
   > `SECRETOS-NO-SUBIR.txt` de la sesión (no está en GitHub). Si ya no lo tienes, pídele a Claude
   > que genere unas nuevas, o en cualquier ordenador con Node ejecuta `npx web-push generate-vapid-keys`.
   > `PUSH_SECRET` puede ser cualquier texto largo inventado (ej. 40 letras y números al azar).

6. Pulsa **Deploy** y espera ~1 minuto. Al terminar verás **Congratulations** y tu enlace.
7. Si cambias variables más adelante: Vercel → tu proyecto → **Deployments** → ⋯ → **Redeploy**.

## Paso 6 · Conectar Supabase con tu enlace

**a) Direcciones permitidas para el inicio de sesión**
Supabase → **Authentication** → **URL Configuration**:
- **Site URL:** `https://fuegojuntos.vercel.app` (tu enlace real) → **Save**.
- **Redirect URLs** → **Add URL:** `https://fuegojuntos.vercel.app/**` → **Save**.

**b) Activar el envío de notificaciones push**
Supabase → **SQL Editor** → **New query**, pega esto cambiando los dos valores, y pulsa **Run**:

```sql
insert into private.app_settings(key, value) values
  ('push_url', 'https://fuegojuntos.vercel.app/api/push'),
  ('push_secret', 'PEGA_AQUI_EL_MISMO_PUSH_SECRET_DE_VERCEL')
on conflict (key) do update set value = excluded.value;
```

## Paso 7 · (Recomendado) Correos para recuperar la contraseña con Gmail — gratis

1. En tu cuenta de Google activa la **Verificación en 2 pasos**: https://myaccount.google.com/security
2. Crea una **contraseña de aplicación**: https://myaccount.google.com/apppasswords → nombre `Fuego Juntos` → **Crear**. Copia las 16 letras (**SECRETA**).
3. Supabase → **Authentication** → **Emails** → pestaña **SMTP Settings** → activa **Enable Custom SMTP**:
   - **Sender email:** tu Gmail · **Sender name:** `Fuego Juntos`
   - **Host:** `smtp.gmail.com` · **Port:** `465`
   - **Username:** tu Gmail · **Password:** la contraseña de aplicación de 16 letras
   - **Save**.

Gmail gratuito permite ~500 correos al día: de sobra para dos personas.

## Paso 8 · Instalar en los dos iPhone

En **cada** iPhone (iOS 16.4 o posterior para notificaciones):

1. Abre **Safari** (no Chrome) y entra en tu enlace `https://fuegojuntos.vercel.app`.
2. Toca **Compartir** (cuadrado con flecha ↑, abajo al centro).
3. Desliza y toca **Añadir a pantalla de inicio** → **Añadir**.
4. Abre **Fuego Juntos** desde el nuevo icono 🔥 (se abre a pantalla completa).
5. **Crear cuenta** (cada uno con su correo y contraseña).
6. Persona A: **Vincular pareja → Generar código → Enviar**. Persona B: **Opción 2 → pegar código → Vincularnos**.
7. Cada uno: **Perfil (foto arriba a la derecha) → Notificaciones push → activar → Permitir**.

¡Listo! Ya tienen su racha compartida. 🔥

---

## Límites de los planes gratuitos (para estar tranquilos)

- **Supabase Free:** 500 MB de base de datos, 1 GB de fotos, 5 GB de transferencia/mes, 200 conexiones en tiempo real. Para dos personas sobra muchísimo (las fotos se comprimen a ~300 KB).
  ⚠️ Un proyecto gratuito se **pausa tras 7 días sin uso**. Si lo usan a diario no pasa; si se pausa, se reactiva desde el panel de Supabase con *Restore*.
- **Vercel Hobby:** uso personal no comercial, 100 GB de transferencia/mes. Sin costes sorpresa: si se superara, se detiene, no cobra.
- **Notificaciones push:** usan los servicios estándar de Apple/Google, gratis.
- **No hay nada de pago** ni tarjeta de crédito en ningún paso.

## Problemas frecuentes

| Problema | Solución |
|---|---|
| La app dice “Falta conectar Supabase” | Revisa las variables `VITE_…` en Vercel y haz **Redeploy**. |
| “Correo o contraseña incorrectos” recién registrado | Comprueba que desactivaste *Confirm email* (Paso 3). |
| No aparece el botón de notificaciones en iPhone | Abre la app desde el **icono** de la pantalla de inicio, no desde Safari; iOS 16.4+. |
| Las notificaciones no llegan | Revisa Paso 6b (mismo `PUSH_SECRET` en Vercel y Supabase) y las variables VAPID. Los avisos siempre quedan en la campana 🔔 de la app. |
| El enlace de “olvidé mi contraseña” no llega | Configura el Paso 7 (Gmail). |
