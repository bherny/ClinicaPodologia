# Body Feet - Sistema clinico y administrativo

Sistema web para centralizar pacientes, citas, servicios, profesionales, historias clinicas y recordatorios de las sedes Musa, Flora Tristan y Manchay.

## Modulos incluidos

- Inicio de sesion con Supabase Auth.
- Dashboard por sede con metricas reales.
- Pacientes con busqueda, paginacion, edicion, eliminacion logica y ficha por pestanas.
- Citas con estados, reprogramacion, cancelacion, validacion de cruces, exportacion CSV y tarjeta imprimible.
- Calendario diario, semanal y mensual.
- Historias clinicas historicas por atencion.
- Recetas medicas vinculadas al paciente, sede y profesional, con medicamentos dinamicos e impresion horizontal.
- Expedientes podologicos estructurados con evaluacion vascular, piel, unas, antecedentes, tratamiento y tipo de pie.
- Caja y ventas con precios editables, medios de pago, filtros, resumen de ingresos y constancia imprimible.
- Recordatorios por WhatsApp manual con mensaje preparado y registro del resultado.
- Administracion de sedes, servicios, profesionales, asignaciones y roles.
- Auditoria de acciones importantes.
- RLS de Supabase para administrador, recepcion y profesional.

## Variables de entorno

Copia `.env.example` como `.env` y completa:

```bash
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_clave_anon_publica
```

No coloques claves privadas de Supabase en el frontend.

## Ejecutar localmente

```bash
pnpm install
pnpm run dev
```

Abre la URL que muestra Vite. Para validar produccion:

```bash
pnpm run build
pnpm run preview
```

## Configurar Supabase

1. Crea un proyecto en Supabase.
2. Ve a SQL Editor.
3. Ejecuta `supabase/migrations/202607100001_init_body_feet.sql`.
4. Ejecuta `supabase/migrations/202607130001_add_prescriptions.sql`.
5. Ejecuta `supabase/migrations/202607130002_add_podology_and_sales.sql`.
6. Ejecuta `supabase/migrations/202607130003_refine_podology_workflow.sql`.
7. Ejecuta `supabase/migrations/202607130004_editable_catalog_and_sales.sql`.
8. Ejecuta `supabase/migrations/202607130005_repair_sales_actions.sql`.
9. Ejecuta `supabase/seed.sql` para cargar sedes y servicios iniciales.
10. Activa Auth por correo/contrasena en Supabase.
11. Crea el primer usuario desde Authentication > Users.
12. Copia el `id` del usuario Auth.
13. Edita y ejecuta `supabase/create_first_admin.sql`.

## Crear el primer administrador

El frontend no crea administradores con clave privada. Usa Supabase:

1. Crea `admin@bodyfeet.pe` o el correo real en Supabase Auth.
2. Reemplaza `REEMPLAZAR_AUTH_USER_ID` en `supabase/create_first_admin.sql`.
3. Ejecuta el SQL.
4. Inicia sesion en el sistema con ese correo y contrasena.

Desde Administracion puedes asignar roles, sedes y activar o desactivar perfiles existentes.

## Publicar en Vercel

1. Sube el proyecto a GitHub, GitLab o Bitbucket.
2. Crea un proyecto en Vercel y selecciona este repositorio.
3. Framework: Vite.
4. Build command: `pnpm run build`.
5. Output directory: `dist`.
6. Agrega las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
7. Publica.

`vercel.json` ya incluye rewrites para que React Router funcione al refrescar rutas internas.

## WhatsApp

La version actual abre WhatsApp con un mensaje preparado. El envio no es automatico. Despues de abrir WhatsApp, recepcion registra el resultado en el sistema.

La automatizacion con WhatsApp Business API requiere servicios externos y posibles costos:

- Meta WhatsApp Business Platform.
- Numero verificado.
- Plantillas aprobadas.
- Backend seguro o Supabase Edge Function para guardar tokens privados.

## Copias de seguridad

Ver `docs/backups.md`. En produccion se recomienda activar backups diarios de Supabase y exportaciones periodicas.

## Logo

El logo oficial optimizado esta disponible en `public/logo-body-feet.png` para web y en `public/logo-body-feet-4k.png` para impresion y pantallas de alta resolucion. Tambien se usa en navegacion, favicon, tarjetas y recetas.

## Notas de seguridad

- Las politicas RLS restringen datos por rol y sede.
- Recepcion trabaja principalmente con su sede asignada.
- Profesionales ven sus citas y pueden registrar informacion clinica relacionada.
- Administracion tiene acceso consolidado.
- Diagnosticos, tratamientos y telefonos solo existen dentro de rutas autenticadas.
