# La IA de Body Feet

Asistente interno para personal autenticado. La clave de Groq vive exclusivamente en una Supabase Edge Function; nunca debe agregarse como variable `VITE_*` ni enviarse al navegador.

## Activacion

1. Ejecuta `supabase/migrations/202608150003_body_feet_ai.sql` en el SQL Editor de Supabase.
2. Crea una clave privada en GroqCloud.
3. Configura los secretos:

```bash
supabase secrets set GROQ_API_KEY=tu_clave_privada
supabase secrets set GROQ_MODEL=openai/gpt-oss-20b
supabase secrets set ALLOWED_ORIGINS=https://tu-dominio.vercel.app,http://127.0.0.1:5173
```

El secreto `GROQ_MODEL` es opcional; la funcion usa `openai/gpt-oss-20b` por defecto y puede recurrir a `openai/gpt-oss-120b` si el modelo configurado deja de estar disponible.

4. Publica la funcion:

```bash
supabase functions deploy body-feet-ai
```

## Seguridad y privacidad

- Solo perfiles activos y autenticados pueden consultar la funcion.
- Maximo 20 consultas cada 5 minutos por usuario.
- La conversacion permanece en memoria del navegador y se borra al recargar o cerrar sesion.
- El frontend y la funcion ocultan correos, telefonos peruanos y documentos identificados como DNI, RUC o CE.
- La auditoria guarda usuario, modelo, estado y tamanos; nunca guarda preguntas ni respuestas.
- La clave de Groq se mantiene en Supabase y nunca llega al navegador.
- No se debe pegar informacion que identifique pacientes. La funcion no consulta la base clinica.

## Plan gratuito

GroqCloud ofrece un nivel gratuito con limites de solicitudes y tokens. Cuando se alcanza el limite, el asistente muestra un aviso temporal y el resto de la plataforma continua funcionando normalmente.