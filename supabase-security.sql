-- ═══════════════════════════════════════════════════════════
--  NEXSOAR LEASING — SQL DE SEGURIDAD Y ROLES
--  Pega esto en Supabase → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════

-- Tabla de perfiles de usuario (roles)
create table if not exists profiles (
  id        uuid references auth.users(id) on delete cascade primary key,
  email     text not null,
  full_name text default '',
  role      text default 'user' check (role in ('admin','user')),
  created_at timestamptz default now()
);

alter table profiles enable row level security;

-- Función auxiliar para verificar admin sin recursión en RLS
create or replace function is_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- Políticas de la tabla profiles
create policy "ver_propio_perfil"   on profiles for select using (auth.uid() = id or is_admin());
create policy "admin_update_perfiles" on profiles for update using (is_admin()) with check (is_admin());

-- Trigger: el PRIMER usuario que se registra se convierte en admin automáticamente
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cnt integer;
begin
  select count(*) into cnt from public.profiles;
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when cnt = 0 then 'admin' else 'user' end
  );
  return new;
end;
$$;

-- Eliminar trigger si ya existe, luego recrear
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
