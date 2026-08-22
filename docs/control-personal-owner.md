# Control de personal y panel owner

Este modulo amplia Body Feet sin crear una lista paralela de trabajadores ni una caja adicional.

## Aplicar en Supabase

Ejecutar las migraciones en este orden desde **SQL Editor**:

1. `supabase/migrations/202608210001_add_owner_role.sql`
2. `supabase/migrations/202608210002_staff_attendance_products.sql`
3. `supabase/migrations/202608210003_admin_staff_selection.sql`
4. `supabase/migrations/202608210004_sync_auth_profiles.sql`

Cada migracion debe terminar antes de ejecutar la siguiente. Las migraciones crean:

- turnos vinculados a `profesionales`;
- jornadas de asistencia con hora del servidor;
- catalogo de productos;
- relacion de productos con `venta_items`;
- bucket privado `attendance-evidence`;
- RLS y funciones seguras de marcacion;
- terminal compartido con seleccion segura del profesional.

No reiniciar la base de datos ni volver a ejecutar migraciones antiguas.

## Crear la cuenta de la propietaria

1. Ejecutar primero las cuatro migraciones indicadas arriba.
2. Crear una cuenta distinta en **Supabase > Authentication > Users > Add user**.
3. Escribir el correo real de la dueña, asignar una contrasena y activar **Auto Confirm User**.
4. Ingresar con la cuenta administradora actual.
5. Abrir **Administracion > Usuarios**. La cuenta aparecera automaticamente.
6. Editar el perfil de la nueva cuenta y elegir el rol **Propietaria**.
7. Cerrar la sesion administradora e ingresar con el correo nuevo.

La propietaria sera dirigida a `/owner`. Ese panel es independiente y permite ver las fotos, entradas, salidas, horas y reportes de todo el personal. La ruta esta protegida en frontend y los datos se protegen con RLS en PostgreSQL.

Si aparece **Correo o contrasena incorrectos**, la cuenta todavia no existe en Supabase Auth, la contrasena no coincide o el usuario no fue confirmado.

## Preparar a cada profesional

Para el terminal compartido, cada trabajador necesita:

1. Un registro activo en **Administracion > Profesionales**.
2. Al menos una sede asignada.
3. Un turno configurado en **Administracion > Horarios y asistencia**.

Una cuenta personal y el campo **Usuario vinculado** solo son necesarios cuando el profesional ingresara con su propio correo para marcarse. No se crea otra ficha de trabajador. Si el profesional se desactiva, deja de poder marcar y su historial se conserva.

## Flujo de asistencia

1. El profesional inicia sesion y presiona **Marcar entrada / salida**. Solo puede marcarse a si mismo.
2. En un terminal compartido, Administrador o Propietaria presiona el mismo boton y selecciona primero al profesional existente.
3. El sistema detecta automaticamente si corresponde entrada o salida.
4. Se autoriza la camara, se toma la fotografia y se confirma.
5. La imagen se comprime a WebP y se guarda en el bucket privado.
6. PostgreSQL registra la hora real del servidor en zona `America/Lima`.

La base de datos impide que un profesional marque por otro, entradas consecutivas, salidas sin entrada, solicitudes repetidas y marcaciones simultaneas. Las fotografias se consultan mediante URLs firmadas temporales.

## Turnos y reportes

Desde **Administracion > Horarios y asistencia** y desde `/owner` se puede:

- elegir un profesional existente y su sede;
- crear horarios distintos por dia y sede con controles AM/PM;
- copiar un turno a varios dias;
- ver la duracion diaria y el total de horas semanales por profesional;
- configurar descanso, vigencia y tolerancia;
- cancelar turnos futuros sin borrar el historial;
- revisar asistencia, tardanzas, jornadas abiertas y evidencias;
- filtrar el historial;
- descargar el resumen mensual en CSV.

## Productos y Caja

Los productos se administran desde el panel owner. Una venta rapida llama al RPC existente `create_sale` y se registra en las mismas tablas `ventas`, `venta_items` y `comprobantes`.

En sede Musa se mantiene el mismo bloqueo por PIN. Para vender desde Musa, primero se debe desbloquear la sede en **Caja y ventas**.

## Despliegue

1. Aplicar las cuatro migraciones en Supabase, en el orden indicado.
2. Crear la cuenta Auth de la propietaria, confirmarla y asignarle el rol **Propietaria**.
3. Verificar que los profesionales tengan sede y horarios; vincular usuario solo si tendran acceso personal.
4. Ejecutar `pnpm run check`.
5. Publicar el mismo repositorio en Vercel.

No se necesitan variables de entorno nuevas ni claves privadas en el frontend.
