-- =====================================================================
--  Policía Militar · Reportes — esquema de Supabase
--  Pégalo completo en: Supabase → SQL Editor → New query → Run
--  Es idempotente: se puede volver a ejecutar sin romper nada.
-- =====================================================================

-- ---------- Roles (con permisos) ----------
create table if not exists public.roles (
  id          text primary key,                 -- slug: admin, usuario, ...
  nombre      text not null,
  descripcion text default '',
  permisos    jsonb not null default '{}'::jsonb,
  -- permisos: {"usuarios":bool, "roles":bool, "formularios":bool, "historial":bool}
  formularios text[] not null default '{}',     -- ids de formularios permitidos; '{*}' = todos
  protegido   boolean not null default false,   -- el rol admin no se puede borrar
  rango_pm    text,                              -- Rango PM que heredan los usuarios del rol
  creado_en   timestamptz not null default now()
);
alter table public.roles add column if not exists rango_pm text;
alter table public.roles drop constraint if exists roles_rango_pm_check;
alter table public.roles add constraint roles_rango_pm_check check (rango_pm is null or rango_pm in ('Auxiliar PM','Co-líder PM','Líder PM'));

-- ---------- Perfiles (uno por usuario de auth) ----------
create table if not exists public.perfiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  usuario   text not null unique,               -- nombre de usuario para iniciar sesión
  nombre    text not null default '',
  rol_id    text references public.roles(id) on delete set null,
  activo    boolean not null default false,
  rango     text,                               -- rango militar, lo asigna un administrador
  creado_en timestamptz not null default now()
);
alter table public.perfiles add column if not exists rango text;
alter table public.perfiles drop constraint if exists perfiles_rango_check;
alter table public.perfiles add constraint perfiles_rango_check check (rango is null or rango in
  ('Sargento Primero','Sargento Mayor','Teniente','Capitán','Mayor','Coronel','Mayor General','Teniente General','Coronel General','FG Adjunto','FG'));

-- ---------- Catálogo de formularios ----------
create table if not exists public.formularios (
  id          text primary key,
  titulo      text not null,
  descripcion text default '',
  ruta        text not null,
  icono       text default '📋',
  orden       int  not null default 100,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

-- ---------- Historial de reportes exportados ----------
create table if not exists public.reportes (
  id             bigint generated always as identity primary key,
  formulario_id  text references public.formularios(id) on delete set null,
  usuario_id     uuid references public.perfiles(id) on delete set null,
  fecha          date,
  resumen        text default '',
  datos          jsonb not null default '{}'::jsonb,
  imagen_path    text,                          -- ruta en el bucket "reportes"
  creado_en      timestamptz not null default now()
);

-- ---------- Datos iniciales ----------
insert into public.roles (id, nombre, descripcion, permisos, formularios, protegido, rango_pm) values
  ('admin',   'Administrador', 'Control total del sitio',
     '{"usuarios":true,"roles":true,"formularios":true,"historial":true}', '{*}', true, 'Líder PM'),
  ('usuario', 'Usuario',       'Solo llena reportes',
     '{"usuarios":false,"roles":false,"formularios":false,"historial":false}', '{*}', false, 'Auxiliar PM')
on conflict (id) do nothing;

insert into public.formularios (id, titulo, descripcion, ruta, icono, orden) values
  ('bajas', 'Reporte de Bajas',
   'Registro de personas abatidas con datos del emisor y hasta 10 pruebas gráficas. Exporta el formato lleno como imagen en alta resolución.',
   'reportes/bajas/', '🎯', 10),
  ('reclutamiento', 'Reporte de Reclutamiento',
   'Registro de un oficial reclutado: datos de quien reporta (con Rango PM), rango y rango asignado PM, notas y una foto de evidencia.',
   'reportes/reclutamiento/', '🪖', 20)
on conflict (id) do nothing;

-- ---------- Funciones auxiliares (SECURITY DEFINER evita recursión en RLS) ----------
create or replace function public.mi_perfil_activo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select activo from public.perfiles where id = auth.uid()), false);
$$;

create or replace function public.tengo_permiso(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select (r.permisos ->> p)::boolean
    from public.perfiles pf join public.roles r on r.id = pf.rol_id
    where pf.id = auth.uid() and pf.activo
  ), false);
$$;

create or replace function public.puedo_usar_formulario(f text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select ('*' = any(r.formularios)) or (f = any(r.formularios))
    from public.perfiles pf join public.roles r on r.id = pf.rol_id
    where pf.id = auth.uid() and pf.activo
  ), false);
$$;

-- Al crear un usuario en auth, se crea su perfil INACTIVO.
-- Solo alguien con permiso "usuarios" puede activarlo desde el panel.
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, usuario, nombre, rol_id, activo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'usuario', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    'usuario',
    false
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.crear_perfil();


-- Cambiar el rol de un usuario exige el permiso "roles" (además de "usuarios" para editar perfiles)
create or replace function public.validar_cambio_rol()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.rol_id is distinct from old.rol_id and not public.tengo_permiso('roles') then
    raise exception 'No tienes permiso para asignar roles';
  end if;
  return new;
end $$;
drop trigger if exists perfiles_validar_rol on public.perfiles;
create trigger perfiles_validar_rol before update on public.perfiles
  for each row execute function public.validar_cambio_rol();

-- Solo usuarios autenticados pueden ejecutar las funciones de permisos; las de trigger, nadie
revoke execute on function public.crear_perfil() from anon, authenticated, public;
revoke execute on function public.validar_cambio_rol() from anon, authenticated, public;
revoke execute on function public.mi_perfil_activo() from anon, public;
revoke execute on function public.tengo_permiso(text) from anon, public;
revoke execute on function public.puedo_usar_formulario(text) from anon, public;
grant execute on function public.mi_perfil_activo() to authenticated;
grant execute on function public.tengo_permiso(text) to authenticated;
grant execute on function public.puedo_usar_formulario(text) to authenticated;

-- ---------- RLS ----------
alter table public.roles       enable row level security;
alter table public.perfiles    enable row level security;
alter table public.formularios enable row level security;
alter table public.reportes    enable row level security;

-- roles: todos los activos leen; solo permiso "roles" escribe
drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select using (public.mi_perfil_activo());
drop policy if exists roles_write on public.roles;
create policy roles_write on public.roles for all
  using (public.tengo_permiso('roles')) with check (public.tengo_permiso('roles'));

-- perfiles: cada quien ve el suyo; permiso "usuarios" ve y edita todos
drop policy if exists perfiles_self on public.perfiles;
create policy perfiles_self on public.perfiles for select using (id = auth.uid());
drop policy if exists perfiles_admin_select on public.perfiles;
create policy perfiles_admin_select on public.perfiles for select using (public.tengo_permiso('usuarios'));
drop policy if exists perfiles_admin_update on public.perfiles;
create policy perfiles_admin_update on public.perfiles for update
  using (public.tengo_permiso('usuarios')) with check (public.tengo_permiso('usuarios'));
drop policy if exists perfiles_admin_delete on public.perfiles;
create policy perfiles_admin_delete on public.perfiles for delete using (public.tengo_permiso('usuarios'));

-- formularios: activos leen los activos (o todos si tienen permiso); permiso "formularios" escribe
drop policy if exists formularios_select on public.formularios;
create policy formularios_select on public.formularios for select
  using (public.mi_perfil_activo() and (activo or public.tengo_permiso('formularios')));
drop policy if exists formularios_write on public.formularios;
create policy formularios_write on public.formularios for all
  using (public.tengo_permiso('formularios')) with check (public.tengo_permiso('formularios'));

-- reportes: inserto los míos si puedo usar ese formulario; veo los míos; "historial" ve todos
drop policy if exists reportes_insert on public.reportes;
create policy reportes_insert on public.reportes for insert
  with check (usuario_id = auth.uid() and public.puedo_usar_formulario(formulario_id));
drop policy if exists reportes_select_own on public.reportes;
create policy reportes_select_own on public.reportes for select using (usuario_id = auth.uid());
drop policy if exists reportes_select_all on public.reportes;
create policy reportes_select_all on public.reportes for select using (public.tengo_permiso('historial'));
drop policy if exists reportes_delete on public.reportes;
create policy reportes_delete on public.reportes for delete using (public.tengo_permiso('historial'));

-- ---------- Storage: bucket privado "reportes" ----------
insert into storage.buckets (id, name, public) values ('reportes', 'reportes', false)
on conflict (id) do nothing;

drop policy if exists reportes_storage_insert on storage.objects;
create policy reportes_storage_insert on storage.objects for insert
  with check (bucket_id = 'reportes' and public.mi_perfil_activo()
              and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists reportes_storage_select on storage.objects;
create policy reportes_storage_select on storage.objects for select
  using (bucket_id = 'reportes' and (
         (storage.foldername(name))[1] = auth.uid()::text or public.tengo_permiso('historial')));
drop policy if exists reportes_storage_delete on storage.objects;
create policy reportes_storage_delete on storage.objects for delete
  using (bucket_id = 'reportes' and public.tengo_permiso('historial'));

-- ---------- Vista cómoda para el historial ----------
create or replace view public.reportes_vista with (security_invoker = true) as
  select r.id, r.formulario_id, f.titulo as formulario, r.usuario_id,
         p.usuario, p.nombre as usuario_nombre, r.fecha, r.resumen, r.datos, r.imagen_path, r.creado_en,
         p.rango as usuario_rango
  from public.reportes r
  left join public.formularios f on f.id = r.formulario_id
  left join public.perfiles p on p.id = r.usuario_id;

-- =====================================================================
--  DESPUÉS DE EJECUTAR ESTO:
--  1) Authentication → Providers → Email: desactiva "Confirm email".
--  2) Authentication → Users → Add user: email  admin@armywasco.local ,
--     contraseña la que quieras, "Auto Confirm User" activado.
--  3) Ejecuta en SQL Editor (reemplaza el correo si usaste otro):
--       update public.perfiles set rol_id='admin', activo=true, nombre='Administrador'
--       where id = (select id from auth.users where email='admin@armywasco.local');
-- =====================================================================
