drop index if exists public.pacientes_telefono_unico_idx;

create index if not exists pacientes_telefono_busqueda_idx
on public.pacientes (telefono_normalizado)
where telefono_normalizado is not null and eliminado = false;

comment on index public.pacientes_telefono_busqueda_idx is
  'Indice de busqueda no unico: familiares pueden compartir telefono.';
