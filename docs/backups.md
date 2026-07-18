# Copias de seguridad

Para una primera version operativa, Body Feet puede trabajar con las copias automáticas del plan de Supabase. En produccion se recomienda:

1. Activar backups diarios en Supabase.
2. Descargar un respaldo manual antes de cambios grandes de esquema.
3. Exportar mensualmente `pacientes`, `citas`, `historias_clinicas` y `recordatorios`.
4. Probar restauracion en un proyecto Supabase separado antes de usar un respaldo sobre produccion.

Ejemplo con Supabase CLI:

```bash
supabase db dump --project-ref TU_PROJECT_REF --file backups/body-feet-$(date +%F).sql
```

No guardes archivos de respaldo con datos clinicos en repositorios publicos.
