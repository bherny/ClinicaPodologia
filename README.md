# Body Feet - Sistema clinico y administrativo

Sistema web para centralizar pacientes, citas, servicios, profesionales, historias clinicas y recordatorios de las sedes Musa, Flora Tristan y Manchay.

## Modulos incluidos

- Inicio de sesion con Supabase Auth.
- Dashboard por sede con metricas reales.
- Reportes diarios y mensuales por sede o consolidados, con dashboards, comparativos, descarga CSV e impresion/PDF.
- Pacientes con busqueda, paginacion, edicion, eliminacion logica y ficha por pestanas.
- Citas con estados, reprogramacion, cancelacion, validacion de cruces, exportacion CSV y tarjeta imprimible.
- Calendario diario, semanal y mensual.
- Historias clinicas historicas por atencion, con visualizacion, edicion por permisos, PDF y flujo manual de WhatsApp.
- Recetas medicas vinculadas al paciente, sede y profesional, con visualizacion, edicion por permisos, PDF A4, impresion y flujo manual de WhatsApp.
- Expedientes podologicos estructurados con evaluacion vascular, piel, unas, antecedentes, tratamiento y tipo de pie, PDF oficial y flujo manual de WhatsApp.
- Dictado por voz en espanol Peru integrado en todos los campos editables de texto, areas extensas y datos numericos.
- Caja y ventas en tiempo real con precios editables, medios de pago, filtros, resumen de ingresos, constancia imprimible y apertura exclusiva por PIN para Musa.
- Portal privado del paciente con telefono y PIN, consulta de historias clinicas y descarga PDF auditada, sin costo por SMS.
- La IA de Body Feet para personal autenticado, con proteccion de datos sensibles, cuota por usuario y auditoria sin guardar conversaciones.
- Recordatorios por WhatsApp manual con mensaje preparado y registro del resultado.
- Administracion de sedes, servicios, profesionales, asignaciones y roles.
- Apariencia configurable por sede con paletas guardadas en Supabase.
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
3. Ejecuta, en orden, `supabase/migrations/202607100001_init_body_feet.sql`.
4. Ejecuta `supabase/migrations/202607130001_add_prescriptions.sql`.
5. Ejecuta `supabase/migrations/202607130002_add_podology_and_sales.sql`.
6. Ejecuta `supabase/migrations/202607130003_refine_podology_workflow.sql`.
7. Ejecuta `supabase/migrations/202607130004_editable_catalog_and_sales.sql`.
8. Ejecuta `supabase/migrations/202607130005_repair_sales_actions.sql`.
9. Ejecuta `supabase/migrations/202607140001_allow_shared_patient_names_and_phones.sql`.
10. Ejecuta `supabase/migrations/202607180001_soft_delete_podology_record.sql`.
11. Ejecuta `supabase/migrations/202608140001_clinical_history_documents.sql`.
12. Ejecuta `supabase/migrations/202608140002_prescription_documents.sql`.
13. Ejecuta `supabase/migrations/202608140003_musa_cash_security.sql`.
14. Ejecuta `supabase/migrations/202608140004_podology_documents_and_branch_theme.sql`.
15. Ejecuta `supabase/migrations/202608150001_realtime_cash_and_patient_portal.sql`.
16. Ejecuta `supabase/migrations/202608150002_patient_pin_portal.sql`.
17. Ejecuta `supabase/migrations/202608150003_body_feet_ai.sql`.
18. Ejecuta `supabase/seed.sql` para cargar sedes y servicios iniciales.
19. Activa Auth por correo/contrasena para el personal.
20. Crea el primer usuario desde Authentication > Users.
21. Copia el `id` del usuario Auth.
22. Edita y ejecuta `supabase/create_first_admin.sql`.

## Crear el primer administrador

El frontend no crea administradores con clave privada. Usa Supabase:

1. Crea `admin@bodyfeet.pe` o el correo real en Supabase Auth.
2. Reemplaza `REEMPLAZAR_AUTH_USER_ID` en `supabase/create_first_admin.sql`.
3. Ejecuta el SQL.
4. Inicia sesion en el sistema con ese correo y contrasena.

Desde Administracion puedes asignar roles, sedes y activar o desactivar perfiles existentes.
## Dictado por voz

Los campos editables de texto y las areas extensas muestran automaticamente un boton de microfono. El dictado usa idioma `es-PE`, conserva el texto previo y puede detenerse con el mismo boton o con `Esc`. Los campos de DNI, RUC, telefono, WhatsApp y numero de operacion convierten la voz en digitos; las cantidades y precios convierten expresiones como `ciento veinte` en `120`. Por seguridad y precision no se habilita en PIN, contrasenas, correo, fechas, horas, selectores ni campos de solo lectura. En produccion requiere HTTPS, que Vercel proporciona. Chrome y Edge ofrecen la compatibilidad mas estable; el navegador solicitara permiso para usar el microfono.

## Seguridad de Caja Musa y actualizacion en tiempo real

Despues de aplicar `202608140003_musa_cash_security.sql` y `202608150001_realtime_cash_and_patient_portal.sql`, un administrador debe entrar a `Administracion > Seguridad` y configurar el primer PIN de 4 a 8 digitos. No existe un PIN predeterminado.

Supabase guarda solamente el hash bcrypt. Tras cinco intentos fallidos aplica un bloqueo temporal de 15 minutos. Una unica sesion autenticada puede abrir la Caja Musa; incluso el mismo usuario queda bloqueado si intenta abrirla simultaneamente desde otro equipo. La aplicacion renueva el acceso cada 20 segundos y libera una sesion abandonada despues de aproximadamente 90 segundos sin actividad. El boton `Bloquear Caja Musa` la libera inmediatamente.

Las tablas de ventas, items y comprobantes forman parte de Supabase Realtime. La pantalla invalida y vuelve a consultar los datos al recibir un cambio. RLS y las funciones de base de datos impiden leer o modificar ventas de Musa sin la sesion exclusiva vigente.

## Portal del paciente por telefono y PIN

El inicio de sesion ofrece `Soy paciente`. El paciente escribe el celular guardado en su ficha y un PIN privado de 6 a 10 digitos; luego entra a `/mi-historial`. Este flujo no usa SMS, no requiere activar Phone Auth y no genera costos por mensaje.

Para habilitarlo, un administrador o recepcionista entra a `Pacientes`, pulsa el boton de llave en la fila del paciente y selecciona `Generar PIN seguro` o escribe uno. Debe entregar el PIN directamente al paciente. El sistema solo muestra el PIN justo despues de guardarlo; Supabase conserva un hash bcrypt y nunca el valor legible.

La funcion `security definer` exige que el telefono coincida con una unica ficha activa. Cinco intentos fallidos bloquean el acceso durante 15 minutos. La sesion vence a las 8 horas o tras 30 minutos de inactividad, y cambiar o desactivar el PIN cierra todas las sesiones anteriores. Cada descarga PDF se registra en Auditoria.

No se permite entrar solamente con un numero telefonico: eso expondria diagnosticos y tratamientos a cualquiera que conozca el numero del paciente. Los proveedores de SMS pueden incorporarse mas adelante, pero requieren un servicio externo y normalmente tienen costo en produccion.

## La IA de Body Feet

La IA se ejecuta en `supabase/functions/body-feet-ai` y solo esta disponible para perfiles activos del personal. No usa una clave en el frontend, no consulta automaticamente historias clinicas y no guarda preguntas o respuestas en Auditoria. El sistema oculta identificadores comunes, pero el personal no debe escribir datos que identifiquen pacientes.

La activacion requiere una clave de Groq guardada como secreto de Supabase, aplicar `202608150003_body_feet_ai.sql` y publicar la Edge Function. Sigue [docs/body-feet-ai.md](docs/body-feet-ai.md). El plan gratuito de Groq tiene limites de uso; sin el secreto el resto de la plataforma funciona y el asistente informa que aun no fue activado.

## Control de calidad

Usa exclusivamente pnpm para mantener un solo lockfile:

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run test:coverage
pnpm audit --prod
```

`pnpm run check` ejecuta lint, TypeScript, pruebas automatizadas y compilacion de produccion. GitHub Actions repite este control en cada push y pull request.
## Publicar en Vercel

1. Sube el proyecto a GitHub, GitLab o Bitbucket.
2. Crea un proyecto en Vercel y selecciona este repositorio.
3. Framework: Vite.
4. Build command: `pnpm run build`.
5. Output directory: `dist`.
6. Agrega las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
7. Publica.

`vercel.json` ya incluye rewrites para que React Router funcione al refrescar rutas internas.

## Historias clinicas y WhatsApp

Administradores y profesionales autorizados pueden visualizar y editar historias clinicas, descargar un PDF con datos reales y preparar su envio por WhatsApp. Las descargas y los intentos de compartir se registran en Auditoria despues de aplicar `202608140001_clinical_history_documents.sql`.

La version actual descarga el PDF y abre WhatsApp con el numero y mensaje preparados. WhatsApp Web no permite adjuntar ese archivo mediante `wa.me`: el usuario debe adjuntarlo manualmente antes de enviar. El sistema no marca el documento como enviado automaticamente.

## Recetas y WhatsApp

Administradores y profesionales asignados pueden consultar y editar sus recetas, descargar un PDF A4 con datos reales y preparar su envio por WhatsApp. Las descargas y los intentos de compartir se registran en Auditoria despues de aplicar `202608140002_prescription_documents.sql`.

El PDF se descarga antes de abrir WhatsApp. El usuario debe adjuntarlo manualmente en la conversacion; esta version no envia archivos ni mensajes automaticamente.

## Expedientes podologicos y WhatsApp

Cada expediente puede imprimirse, descargarse como PDF con la plantilla oficial o prepararse para WhatsApp. Las descargas y los intentos de compartir se registran en Auditoria despues de aplicar `202608140004_podology_documents_and_branch_theme.sql`.

La aplicacion descarga primero el PDF y abre WhatsApp con el paciente y mensaje preparados. Por las restricciones de `wa.me`, el usuario debe adjuntar manualmente el PDF antes de enviar; el sistema no afirma que el archivo fue enviado automaticamente.

## Apariencia por sede

El administrador puede entrar a `Administracion > Apariencia`, seleccionar una sede y elegir una paleta o colores personalizados para la barra lateral, acciones principales y acentos. Los colores se guardan en Supabase y se aplican cuando esa sede esta seleccionada. La vista `Todas las sedes` conserva la identidad visual predeterminada de Body Feet.

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
