-- Tabla compartida para el CRM de prospectos
-- Correr en: https://supabase.com/dashboard → SQL Editor

create table if not exists public.prospectos_crm (
  empresa      text        primary key,
  status       text        not null default 'nuevo',
  notes        text        not null default '',
  updated_at   timestamptz not null default timezone('utc', now()),
  updated_by   text        not null default ''
);

-- Trigger para actualizar updated_at automáticamente
create or replace function public.touch_prospectos_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_prospectos_updated_at on public.prospectos_crm;
create trigger trg_prospectos_updated_at
  before update on public.prospectos_crm
  for each row execute function public.touch_prospectos_updated_at();

-- RLS: habilitar pero permitir todo (es una herramienta interna privada)
alter table public.prospectos_crm enable row level security;

drop policy if exists "equipo_acceso_total" on public.prospectos_crm;
create policy "equipo_acceso_total"
  on public.prospectos_crm for all
  to anon
  using (true)
  with check (true);

-- Función upsert para evitar conflictos de concurrencia
create or replace function public.upsert_prospecto(
  p_empresa    text,
  p_status     text,
  p_notes      text,
  p_updated_by text
)
returns void language plpgsql security definer
set search_path = public as $$
begin
  insert into public.prospectos_crm (empresa, status, notes, updated_by)
  values (p_empresa, p_status, p_notes, p_updated_by)
  on conflict (empresa) do update
    set status     = excluded.status,
        notes      = excluded.notes,
        updated_by = excluded.updated_by,
        updated_at = timezone('utc', now());
end;
$$;

grant execute on function public.upsert_prospecto(text, text, text, text) to anon;
