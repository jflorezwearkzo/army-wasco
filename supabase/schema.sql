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
  -- permisos: usuarios, asignar_roles, reset_password, crear_roles, crear_reportes, gestion_reportes, historial, eliminar_historial (bool)
  formularios text[] not null default '{}',     -- ids de formularios permitidos; '{*}' = todos
  protegido   boolean not null default false,   -- el rol admin no se puede borrar
  rango_pm    text,                              -- Rango PM que heredan los usuarios del rol
  creado_en   timestamptz not null default now()
);
-- ---------- Catálogo de Rangos PM (editable desde el panel con permiso "roles") ----------
create table if not exists public.rangos_pm (
  nombre    text primary key,
  orden     int not null default 100,
  creado_en timestamptz not null default now()
);
insert into public.rangos_pm (nombre, orden) values ('Auxiliar PM',10),('Co-líder PM',20),('Líder PM',30) on conflict do nothing;
alter table public.roles add column if not exists rango_pm text;
alter table public.roles drop constraint if exists roles_rango_pm_check;
alter table public.roles drop constraint if exists roles_rango_pm_fkey;
alter table public.roles add constraint roles_rango_pm_fkey foreign key (rango_pm) references public.rangos_pm(nombre) on update cascade on delete set null;

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
  creado_en      timestamptz not null default now(),
  folio_v2       text generated always as ('PM-' || lpad(id::text, 6, '0')) stored   -- folio de verificación
);
alter table public.reportes add column if not exists folio_v2 text generated always as ('PM-' || lpad(id::text, 6, '0')) stored;

-- ---------- Datos iniciales ----------
insert into public.roles (id, nombre, descripcion, permisos, formularios, protegido, rango_pm) values
  ('admin',   'Administrador', 'Control total del sitio',
     '{"usuarios":true,"asignar_roles":true,"reset_password":true,"crear_roles":true,"crear_reportes":true,"gestion_reportes":true,"historial":true,"eliminar_historial":true,"auditoria":true}', '{*}', true, 'Líder PM'),
  ('usuario', 'Usuario',       'Solo llena reportes',
     '{}', '{*}', false, 'Auxiliar PM')
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
    null,            -- sin rol hasta que un gestor le asigne uno
    false
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.crear_perfil();


-- ¿El usuario actual tiene un rol protegido (super administrador)?
create or replace function public.soy_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select r.protegido from public.perfiles pf join public.roles r on r.id = pf.rol_id
    where pf.id = auth.uid() and pf.activo
  ), false);
$$;

-- ¿Un conjunto de permisos/formularios cabe dentro de los míos? (superadmin: siempre)
create or replace function public.dentro_de_mis_permisos(p jsonb, f text[])
returns boolean language plpgsql stable security definer set search_path = public as $$
declare mp jsonb; mf text[]; k text;
begin
  if public.soy_superadmin() then return true; end if;
  select r.permisos, r.formularios into mp, mf from public.perfiles pf join public.roles r on r.id = pf.rol_id
    where pf.id = auth.uid() and pf.activo;
  if mp is null then return false; end if;
  for k in select jsonb_object_keys(coalesce(p,'{}'::jsonb)) loop
    if coalesce((p->>k)::boolean,false) and not coalesce((mp->>k)::boolean,false) then return false; end if;
  end loop;
  if '*' = any(coalesce(mf,'{}')) then return true; end if;
  if '*' = any(coalesce(f,'{}')) then return false; end if;
  return coalesce(f,'{}') <@ coalesce(mf,'{}');
end $$;
create or replace function public.rol_dentro_de_mis_permisos(rid text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select public.dentro_de_mis_permisos(r.permisos, r.formularios) from public.roles r where r.id = rid), rid is null);
$$;
revoke execute on function public.dentro_de_mis_permisos(jsonb, text[]) from anon, public;
grant execute on function public.dentro_de_mis_permisos(jsonb, text[]) to authenticated;
revoke execute on function public.rol_dentro_de_mis_permisos(text) from anon, public;
grant execute on function public.rol_dentro_de_mis_permisos(text) to authenticated;

-- Perfiles: cambiar rol exige permiso "roles"; tocar a un superadmin (o nombrar uno) exige ser superadmin;
-- solo gestiono cuentas y asigno roles que caben en mis permisos
create or replace function public.validar_cambio_rol()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rol_viejo_prot boolean; rol_nuevo_prot boolean;
begin
  if tg_op = 'UPDATE' and new.rol_id is distinct from old.rol_id and not public.tengo_permiso('asignar_roles') then
    raise exception 'No tienes permiso para asignar roles';
  end if;
  if tg_op = 'UPDATE' and (new.nombre is distinct from old.nombre or new.rango is distinct from old.rango
      or new.activo is distinct from old.activo or new.usuario is distinct from old.usuario)
     and not public.tengo_permiso('usuarios') then
    raise exception 'No tienes permiso para gestionar usuarios';
  end if;
  select coalesce(protegido,false) into rol_viejo_prot from public.roles where id = old.rol_id;
  if tg_op <> 'DELETE' then
    select coalesce(protegido,false) into rol_nuevo_prot from public.roles where id = new.rol_id;
  end if;
  if (coalesce(rol_viejo_prot,false) or coalesce(rol_nuevo_prot,false)) and not public.soy_superadmin() then
    raise exception 'Solo un Administrador puede gestionar cuentas de Administrador';
  end if;
  if old.id <> auth.uid() and not public.rol_dentro_de_mis_permisos(old.rol_id) then
    raise exception 'No puedes gestionar una cuenta con permisos que no tienes';
  end if;
  if tg_op = 'UPDATE' and new.rol_id is distinct from old.rol_id and not public.rol_dentro_de_mis_permisos(new.rol_id) then
    raise exception 'Solo puedes asignar roles con permisos que tú mismo tienes';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists perfiles_validar_rol on public.perfiles;
drop trigger if exists perfiles_validar_rol_v2 on public.perfiles;
create trigger perfiles_validar_rol_v2 before update or delete on public.perfiles
  for each row execute function public.validar_cambio_rol();

-- Roles: el rol protegido solo lo modifica un superadmin y nunca se elimina
create or replace function public.validar_rol_protegido()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.protegido then raise exception 'El rol Administrador no se puede eliminar'; end if;
    if not public.dentro_de_mis_permisos(old.permisos, old.formularios) then
      raise exception 'No puedes eliminar un rol con permisos que no tienes';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.protegido and not public.soy_superadmin() then
    raise exception 'Solo un Administrador puede modificar el rol Administrador';
  end if;
  if tg_op = 'UPDATE' and old.protegido and not new.protegido then
    raise exception 'El rol Administrador debe seguir protegido';
  end if;
  if new.protegido and not public.soy_superadmin() then
    raise exception 'Solo un Administrador puede crear roles protegidos';
  end if;
  if tg_op = 'UPDATE' and not public.dentro_de_mis_permisos(old.permisos, old.formularios) then
    raise exception 'No puedes modificar un rol con permisos que no tienes';
  end if;
  if not public.dentro_de_mis_permisos(new.permisos, new.formularios) then
    raise exception 'Solo puedes otorgar permisos y formularios que tú mismo tienes';
  end if;
  return new;
end $$;
drop trigger if exists roles_validar_protegido on public.roles;
create trigger roles_validar_protegido before insert or update or delete on public.roles
  for each row execute function public.validar_rol_protegido();

-- Solo usuarios autenticados pueden ejecutar las funciones de permisos; las de trigger, nadie
revoke execute on function public.crear_perfil() from anon, authenticated, public;
revoke execute on function public.validar_cambio_rol() from anon, authenticated, public;
revoke execute on function public.validar_rol_protegido() from anon, authenticated, public;
revoke execute on function public.soy_superadmin() from anon, public;
grant execute on function public.soy_superadmin() to authenticated;
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
alter table public.rangos_pm   enable row level security;
drop policy if exists rangos_pm_select on public.rangos_pm;
create policy rangos_pm_select on public.rangos_pm for select using (public.mi_perfil_activo());
drop policy if exists rangos_pm_write on public.rangos_pm;
create policy rangos_pm_write on public.rangos_pm for all using (public.tengo_permiso('crear_roles')) with check (public.tengo_permiso('crear_roles'));

-- roles: todos los activos leen; solo permiso "roles" escribe
drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select using (public.mi_perfil_activo());
drop policy if exists roles_write on public.roles;
create policy roles_write on public.roles for all
  using (public.tengo_permiso('crear_roles')) with check (public.tengo_permiso('crear_roles'));

-- perfiles: cada quien ve el suyo; permiso "usuarios" ve y edita todos
drop policy if exists perfiles_self on public.perfiles;
create policy perfiles_self on public.perfiles for select using (id = auth.uid());
drop policy if exists perfiles_admin_select on public.perfiles;
create policy perfiles_admin_select on public.perfiles for select
  using (public.tengo_permiso('usuarios') or public.tengo_permiso('asignar_roles') or public.tengo_permiso('reset_password'));
drop policy if exists perfiles_admin_update on public.perfiles;
create policy perfiles_admin_update on public.perfiles for update
  using (public.tengo_permiso('usuarios') or public.tengo_permiso('asignar_roles'))
  with check (public.tengo_permiso('usuarios') or public.tengo_permiso('asignar_roles'));
drop policy if exists perfiles_admin_delete on public.perfiles;
create policy perfiles_admin_delete on public.perfiles for delete using (public.tengo_permiso('usuarios'));

-- formularios: activos leen los activos (o todos si tienen permiso); permiso "formularios" escribe
drop policy if exists formularios_select on public.formularios;
create policy formularios_select on public.formularios for select
  using (public.mi_perfil_activo() and (activo or public.tengo_permiso('gestion_reportes') or public.tengo_permiso('crear_reportes')));
drop policy if exists formularios_write on public.formularios;
create policy formularios_write on public.formularios for all
  using (public.tengo_permiso('gestion_reportes')) with check (public.tengo_permiso('gestion_reportes') or public.tengo_permiso('crear_reportes'));
drop policy if exists formularios_insert on public.formularios;
create policy formularios_insert on public.formularios for insert with check (public.tengo_permiso('crear_reportes'));

-- reportes: inserto los míos si puedo usar ese formulario; veo los míos; "historial" ve todos
drop policy if exists reportes_insert on public.reportes;
create policy reportes_insert on public.reportes for insert
  with check (usuario_id = auth.uid() and public.puedo_usar_formulario(formulario_id));
drop policy if exists reportes_select_own on public.reportes;
create policy reportes_select_own on public.reportes for select using (usuario_id = auth.uid());
drop policy if exists reportes_select_all on public.reportes;
create policy reportes_select_all on public.reportes for select using (public.tengo_permiso('historial'));
drop policy if exists reportes_delete on public.reportes;
create policy reportes_delete on public.reportes for delete using (public.tengo_permiso('eliminar_historial'));

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
  using (bucket_id = 'reportes' and public.tengo_permiso('eliminar_historial'));

-- ---------- Integridad de reportes ----------
-- Al insertar, el servidor sella usuario, nombre, rango y Rango PM desde el perfil/rol (ignora lo que mande el navegador)
create or replace function public.sellar_reporte()
returns trigger language plpgsql security definer set search_path = public as $$
declare pf record; r record; emisor jsonb;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  select * into pf from public.perfiles where id = auth.uid() and activo;
  if not found then raise exception 'Perfil inactivo'; end if;
  select * into r from public.roles where id = pf.rol_id;
  new.usuario_id := auth.uid();
  if new.formulario_id is null or not public.puedo_usar_formulario(new.formulario_id) then
    raise exception 'No tienes acceso a este formulario';
  end if;
  if new.fecha is null then raise exception 'Fecha obligatoria'; end if;
  if new.fecha > current_date + 1 then raise exception 'La fecha no puede ser futura'; end if;
  emisor := jsonb_build_object('nombre', coalesce(nullif(pf.nombre,''), pf.usuario), 'rango', pf.rango, 'rangoPM', r.rango_pm, 'usuario', pf.usuario);
  new.datos := coalesce(new.datos,'{}'::jsonb) || emisor || jsonb_build_object('sellado_en', now());
  new.imagen_path := null;
  new.creado_en := now();
  return new;
end $$;
revoke execute on function public.sellar_reporte() from anon, authenticated, public;
drop trigger if exists reportes_sellar on public.reportes;
create trigger reportes_sellar before insert on public.reportes for each row execute function public.sellar_reporte();

-- Tras el sello, el dueño solo puede adjuntar la imagen una vez; nada más cambia
create or replace function public.validar_update_reporte()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.imagen_path is not null then raise exception 'El reporte ya tiene imagen; no se puede modificar'; end if;
  if new.imagen_path is null or (storage.foldername(new.imagen_path))[1] <> auth.uid()::text then
    raise exception 'Ruta de imagen inválida';
  end if;
  new.formulario_id := old.formulario_id; new.usuario_id := old.usuario_id;
  new.fecha := old.fecha; new.resumen := old.resumen; new.datos := old.datos; new.creado_en := old.creado_en;
  return new;
end $$;
revoke execute on function public.validar_update_reporte() from anon, authenticated, public;
drop trigger if exists reportes_validar_update on public.reportes;
create trigger reportes_validar_update before update on public.reportes for each row execute function public.validar_update_reporte();
drop policy if exists reportes_update_own on public.reportes;
create policy reportes_update_own on public.reportes for update
  using (usuario_id = auth.uid() and imagen_path is null) with check (usuario_id = auth.uid());

-- ¿Puedo restablecer la contraseña de este usuario? (la usa la Edge Function reset-password)
create or replace function public.puedo_resetear(objetivo uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare r_id text; prot boolean;
begin
  if auth.uid() is null or objetivo = auth.uid() then return false; end if;
  if not public.tengo_permiso('reset_password') then return false; end if;
  select pf.rol_id, coalesce(r.protegido,false) into r_id, prot
    from public.perfiles pf left join public.roles r on r.id = pf.rol_id where pf.id = objetivo;
  if not found then return false; end if;
  if prot and not public.soy_superadmin() then return false; end if;
  return public.rol_dentro_de_mis_permisos(r_id);
end $$;
revoke execute on function public.puedo_resetear(uuid) from anon, public;
grant execute on function public.puedo_resetear(uuid) to authenticated;

-- ---------- Auditoría (inalterable, 30 días) ----------
create table if not exists public.auditoria (
  id          bigint generated always as identity primary key,
  en          timestamptz not null default now(),
  usuario_id  uuid,
  usuario     text,
  accion      text not null,
  tabla       text not null,
  registro    text,
  detalle     jsonb not null default '{}'::jsonb
);
create index if not exists auditoria_en_idx on public.auditoria (en desc);
alter table public.auditoria enable row level security;
drop policy if exists auditoria_select on public.auditoria;
create policy auditoria_select on public.auditoria for select using (public.tengo_permiso('auditoria'));
revoke insert, update, delete, truncate on public.auditoria from anon, authenticated;

create or replace function public.registrar_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare u text; reg text; det jsonb; fila jsonb;
begin
  select usuario into u from public.perfiles where id = auth.uid();
  fila := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  reg := case tg_table_name
           when 'perfiles'    then coalesce(fila->>'usuario', fila->>'id')
           when 'reportes'    then coalesce(fila->>'folio_v2', fila->>'id')
           else coalesce(fila->>'id', fila->>'nombre') end;
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(k, jsonb_build_object('antes', o.value, 'despues', n.value)), '{}'::jsonb) into det
      from jsonb_each(to_jsonb(old)) o(k, value) join jsonb_each(to_jsonb(new)) n(k, value) using (k)
     where o.value is distinct from n.value;
    if det = '{}'::jsonb then return new; end if;
  else
    det := fila - 'datos';
  end if;
  insert into public.auditoria (usuario_id, usuario, accion, tabla, registro, detalle)
    values (auth.uid(), coalesce(u, case when auth.uid() is null then 'sistema' else auth.uid()::text end), lower(tg_op), tg_table_name, reg, det);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke execute on function public.registrar_auditoria() from anon, authenticated, public;
drop trigger if exists aud_perfiles on public.perfiles;       create trigger aud_perfiles    after insert or update or delete on public.perfiles    for each row execute function public.registrar_auditoria();
drop trigger if exists aud_roles on public.roles;             create trigger aud_roles       after insert or update or delete on public.roles       for each row execute function public.registrar_auditoria();
drop trigger if exists aud_formularios on public.formularios; create trigger aud_formularios after insert or update or delete on public.formularios for each row execute function public.registrar_auditoria();
drop trigger if exists aud_reportes on public.reportes;       create trigger aud_reportes    after insert or update or delete on public.reportes    for each row execute function public.registrar_auditoria();
drop trigger if exists aud_rangos_pm on public.rangos_pm;     create trigger aud_rangos_pm   after insert or update or delete on public.rangos_pm   for each row execute function public.registrar_auditoria();

create or replace function public.auditar_evento(p_usuario_id uuid, p_accion text, p_tabla text, p_registro text, p_detalle jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.auditoria (usuario_id, usuario, accion, tabla, registro, detalle)
  select p_usuario_id, coalesce((select usuario from public.perfiles where id = p_usuario_id), p_usuario_id::text), p_accion, p_tabla, p_registro, coalesce(p_detalle,'{}'::jsonb);
$$;
revoke execute on function public.auditar_evento(uuid, text, text, text, jsonb) from anon, authenticated, public;

-- Retención 30 días (pg_cron, diario 03:15 UTC)
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('auditoria_retencion_30d', '15 3 * * *', $$delete from public.auditoria where en < now() - interval '30 days'$$);

-- ---------- Vista cómoda para el historial ----------
create or replace view public.reportes_vista with (security_invoker = true) as
  select r.id, r.formulario_id, f.titulo as formulario, r.usuario_id,
         p.usuario, p.nombre as usuario_nombre, r.fecha, r.resumen, r.datos, r.imagen_path, r.creado_en,
         p.rango as usuario_rango, r.folio_v2 as folio, p.visible as usuario_visible
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

-- ---------- Reporte de Fin de Día · Patrullaje PM ----------
insert into public.formularios (id, titulo, descripcion, ruta, icono, orden) values
('patrullaje','Reporte de Fin de Día · Patrullaje PM','Cierre del día de patrullaje: una página por patrullaje con horario, integrantes, novedades, código de reporte y evidencia de salida y regreso.','reportes/patrullaje/','🚔',30)
on conflict (id) do nothing;

-- Visibilidad de usuarios en los desplegables de los formularios (los inactivos nunca aparecen)
alter table public.perfiles add column if not exists visible boolean not null default true;

-- Desplegables con búsqueda del formulario de patrullaje (cualquier usuario activo)
create or replace function public.listar_integrantes()
returns table(usuario text, nombre text, rango text)
language sql security definer stable set search_path=public as $$
  select p.usuario, p.nombre, p.rango from public.perfiles p
  where p.activo and p.visible and coalesce(public.mi_perfil_activo(), false)
  order by p.rango nulls last, p.nombre;
$$;
revoke all on function public.listar_integrantes() from public;
grant execute on function public.listar_integrantes() to authenticated;

create or replace function public.buscar_folios(q text default '')
returns table(folio text, formulario text, fecha date, usuario_nombre text, resumen text)
language sql security definer stable set search_path=public as $$
  select r.folio_v2, f.titulo, r.fecha, coalesce(p.nombre,p.usuario), r.resumen
  from public.reportes r
  left join public.formularios f on f.id=r.formulario_id
  left join public.perfiles p on p.id=r.usuario_id
  where coalesce(public.mi_perfil_activo(), false)
    and (q = '' or r.folio_v2 ilike '%'||q||'%' or r.resumen ilike '%'||q||'%')
  order by r.id desc limit 30;
$$;
revoke all on function public.buscar_folios(text) from public;
grant execute on function public.buscar_folios(text) to authenticated;
