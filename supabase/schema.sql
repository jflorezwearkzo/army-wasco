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

-- ---------- Reporte de Operaciones · Toma de Territorio (AK) ----------
insert into public.formularios (id, titulo, descripcion, ruta, icono, orden) values
('toma-territorio','Reporte de Operaciones · Toma de Territorio (AK)','Resultado de la toma de los tres territorios AK (Almacén, Paseo de la Fama, Torre de Control), integrantes del convoy, vehículos, firmas y anexo fotográfico.','reportes/toma-territorio/','🛡️',40)
on conflict (id) do nothing;

-- ---------- Diseñador de formularios (plantillas personalizables) ----------
alter table public.formularios add column if not exists definicion jsonb;      -- definición JSON (fondo, campos, anexo)
alter table public.formularios add column if not exists version integer not null default 1;
insert into storage.buckets (id, name, public) values ('plantillas','plantillas', true) on conflict (id) do nothing;
-- Bucket público: la lectura por URL no pasa por RLS; el SELECT solo habilita remove/upsert y se restringe para impedir el listado.
create policy plantillas_read   on storage.objects for select using (bucket_id='plantillas' and coalesce(public.tengo_permiso('disenar_formularios'), false));
create policy plantillas_insert on storage.objects for insert with check (bucket_id='plantillas' and (public.tengo_permiso('crear_reportes') or public.tengo_permiso('gestion_reportes')));
create policy plantillas_update on storage.objects for update using (bucket_id='plantillas' and public.tengo_permiso('gestion_reportes'));
create policy plantillas_delete on storage.objects for delete using (bucket_id='plantillas' and public.tengo_permiso('gestion_reportes'));

-- Permiso "disenar_formularios": crear/editar plantillas en el diseñador y subir fondos
alter policy formularios_insert on public.formularios with check (public.tengo_permiso('crear_reportes') or public.tengo_permiso('disenar_formularios'));
alter policy formularios_select on public.formularios using (public.mi_perfil_activo() and (activo or public.tengo_permiso('gestion_reportes') or public.tengo_permiso('crear_reportes') or public.tengo_permiso('disenar_formularios')));
alter policy formularios_write on public.formularios using (public.tengo_permiso('gestion_reportes') or (public.tengo_permiso('disenar_formularios') and definicion is not null)) with check (public.tengo_permiso('gestion_reportes') or public.tengo_permiso('crear_reportes') or public.tengo_permiso('disenar_formularios'));
alter policy plantillas_insert on storage.objects with check (bucket_id='plantillas' and public.tengo_permiso('disenar_formularios'));
alter policy plantillas_update on storage.objects using (bucket_id='plantillas' and public.tengo_permiso('disenar_formularios'));
alter policy plantillas_delete on storage.objects using (bucket_id='plantillas' and public.tengo_permiso('disenar_formularios'));

-- ---------- Discord: publicación automática de reportes ----------
create table if not exists public.formularios_discord (
  formulario_id text primary key references public.formularios(id) on delete cascade,
  webhook text not null, activo boolean not null default true, actualizado_en timestamptz not null default now());
alter table public.formularios_discord enable row level security;
create policy fd_select on public.formularios_discord for select using (public.tengo_permiso('gestion_reportes'));
create policy fd_write  on public.formularios_discord for all using (public.tengo_permiso('gestion_reportes')) with check (public.tengo_permiso('gestion_reportes'));
alter table public.reportes add column if not exists discord_enviado_en timestamptz;
-- validar_update_reporte: el rol de servicio (auth.uid() is null) solo puede escribir discord_enviado_en (ver función en producción)
-- Edge Function: supabase/functions/notificar-discord (verify_jwt=false; valida la sesión del llamante)

-- ---------- Intentos de acceso con cuenta inactiva (quedan en auditoría como login_inactivo) ----------
create or replace function public.registrar_intento_inactivo() returns void language plpgsql security definer set search_path=public as $$
declare u text;
begin
  if auth.uid() is null then return; end if;
  select usuario into u from public.perfiles where id=auth.uid();
  if exists (select 1 from public.perfiles where id=auth.uid() and activo) then return; end if;
  if exists (select 1 from public.auditoria where usuario_id=auth.uid() and accion='login_inactivo' and en > now() - interval '1 minute') then return; end if;
  insert into public.auditoria (usuario_id, usuario, accion, tabla, registro, detalle) values (auth.uid(), coalesce(u,'(sin perfil)'), 'login_inactivo', 'perfiles', auth.uid()::text, jsonb_build_object('motivo','intento de acceso con cuenta inactiva'));
end $$;
revoke all on function public.registrar_intento_inactivo() from public;
grant execute on function public.registrar_intento_inactivo() to authenticated;

-- ---------- "Ver como" (solo rol Administrador) ----------
-- Devuelve perfil + rol de otro usuario para que el admin vea la página como él (solo lectura en el cliente).
-- Con p_evento 'inicio'/'fin' deja rastro en auditoría.
create or replace function public.ver_como(p_usuario uuid, p_evento text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_yo uuid := auth.uid(); v_p record; v_r record; v_out jsonb;
begin
  if not coalesce(public.mi_perfil_activo(), false) or not coalesce(public.tengo_permiso('ver_como'), false) then
    raise exception 'No tienes permiso para ver la página como otro usuario';
  end if;
  if p_usuario = v_yo then raise exception 'No puedes verte como tú mismo'; end if;
  select id, usuario, nombre, rango, activo, rol_id, visible into v_p from public.perfiles where id = p_usuario;
  if not found then raise exception 'Usuario no encontrado'; end if;
  select id, nombre, permisos, formularios, rango_pm, protegido into v_r from public.roles where id = v_p.rol_id;
  v_out := jsonb_build_object('perfil', to_jsonb(v_p), 'rol', case when v_r.id is null then null else to_jsonb(v_r) end);
  if p_evento in ('inicio','fin') then
    insert into public.auditoria (usuario_id, usuario, accion, tabla, registro, detalle)
    select v_yo, (select usuario from public.perfiles where id = v_yo), 'ver_como_' || p_evento, 'perfiles', v_p.usuario,
           jsonb_build_object('como_usuario', v_p.usuario, 'como_nombre', v_p.nombre, 'como_id', v_p.id);
  end if;
  return v_out;
end $$;
revoke execute on function public.ver_como(uuid, text) from anon, public;
grant execute on function public.ver_como(uuid, text) to authenticated;
-- El permiso vive solo en el rol protegido (Administrador)
alter table public.roles disable trigger roles_validar_protegido;
update public.roles set permisos = permisos || '{"ver_como": true}'::jsonb where protegido = true;
alter table public.roles enable trigger roles_validar_protegido;

-- ---------- Actividad por usuario (para la lista de Usuarios del panel) ----------
create or replace function public.actividad_usuarios()
returns table(usuario_id uuid, reportes bigint, ultimo date)
language sql stable security definer set search_path = public as $$
  select r.usuario_id, count(*), max(r.fecha)
  from public.reportes r
  where coalesce(public.mi_perfil_activo(), false)
    and (public.tengo_permiso('usuarios') or public.tengo_permiso('asignar_roles') or public.tengo_permiso('historial'))
  group by r.usuario_id;
$$;
revoke execute on function public.actividad_usuarios() from anon, public;
grant execute on function public.actividad_usuarios() to authenticated;

-- Solo el rol protegido puede tener "ver_como"
create or replace function public.roles_ver_como_solo_admin() returns trigger language plpgsql as $$
begin
  if not coalesce(new.protegido,false) and coalesce((new.permisos->>'ver_como')::boolean,false) then
    raise exception 'El permiso "Ver como" es exclusivo del rol Administrador';
  end if;
  return new;
end $$;
create or replace trigger roles_ver_como_solo_admin before insert or update on public.roles for each row execute function public.roles_ver_como_solo_admin();

-- ---------- Configuración general y canales de Discord ----------
create table if not exists public.configuracion (clave text primary key, valor jsonb not null default '{}'::jsonb, actualizado_en timestamptz not null default now(), actualizado_por uuid);
alter table public.configuracion enable row level security;
create policy configuracion_select on public.configuracion for select using (coalesce(public.mi_perfil_activo(), false));
create policy configuracion_write on public.configuracion for all
  using (public.tengo_permiso('gestion_reportes') or public.tengo_permiso('crear_roles')) with check (public.tengo_permiso('gestion_reportes') or public.tengo_permiso('crear_roles'));
-- Canales generales (los de cada formulario viven en formularios_discord). Edge Function: notificar-general
create table if not exists public.discord_canales (clave text primary key, nombre text not null, webhook text, activo boolean not null default true, actualizado_en timestamptz not null default now());
alter table public.discord_canales enable row level security;
create policy discord_canales_rw on public.discord_canales for all using (public.tengo_permiso('gestion_reportes')) with check (public.tengo_permiso('gestion_reportes'));
insert into public.discord_canales (clave, nombre) values
  ('avisos','Avisos generales (sanciones, ascensos, seguridad)'),('anuncios','Tablón de anuncios'),('ranking','Ranking mensual'),
  ('resumen','Resumen semanal y cierre diario'),('recordatorios','Recordatorios de turnos y reportes') on conflict (clave) do nothing;

-- ---------- Revisión y aprobación de reportes ----------
alter table public.formularios add column if not exists requiere_aprobacion boolean not null default false;
alter table public.reportes add column if not exists estado text not null default 'aprobado' check (estado in ('pendiente','aprobado','rechazado'));
alter table public.reportes add column if not exists revisado_por uuid;
alter table public.reportes add column if not exists revisado_en timestamptz;
alter table public.reportes add column if not exists comentario_revision text;
create index if not exists reportes_estado_idx on public.reportes (estado) where estado <> 'aprobado';
-- Al crear: pendiente si el formulario exige aprobación
create or replace function public.reportes_estado_inicial() returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.estado := case when (select coalesce(requiere_aprobacion,false) from public.formularios where id = new.formulario_id) then 'pendiente' else 'aprobado' end;
  new.revisado_por := null; new.revisado_en := null; new.comentario_revision := null;
  return new;
end $$;
create or replace trigger reportes_estado_inicial before insert on public.reportes for each row execute function public.reportes_estado_inicial();
-- validar_update_reporte (producción): si current_setting('pm.revision') = '1' solo cambian estado/revisado_*; el rol de servicio solo discord_enviado_en;
-- el autor solo adjunta la imagen una vez. La revisión entra únicamente por este RPC:
create or replace function public.revisar_reporte(p_id bigint, p_estado text, p_comentario text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r record; v_yo uuid := auth.uid();
begin
  if not coalesce(public.mi_perfil_activo(),false) or not coalesce(public.tengo_permiso('aprobar_reportes'),false) then raise exception 'No tienes permiso para revisar reportes'; end if;
  if p_estado not in ('aprobado','rechazado','pendiente') then raise exception 'Estado inválido'; end if;
  select * into r from public.reportes where id = p_id; if not found then raise exception 'Reporte no encontrado'; end if;
  if r.usuario_id = v_yo and not public.soy_superadmin() then raise exception 'No puedes revisar tus propios reportes'; end if;
  if p_estado = 'rechazado' and coalesce(trim(p_comentario),'') = '' then raise exception 'Indica el motivo del rechazo'; end if;
  perform set_config('pm.revision','1',true);
  update public.reportes set estado = p_estado, revisado_por = v_yo, revisado_en = now(), comentario_revision = nullif(trim(p_comentario),'') where id = p_id;
  perform set_config('pm.revision','0',true);
  insert into public.auditoria (usuario_id, usuario, accion, tabla, registro, detalle)
    select v_yo, (select usuario from public.perfiles where id = v_yo), 'revision_'||p_estado, 'reportes', r.folio_v2, jsonb_build_object('reporte_id', p_id, 'autor', (select usuario from public.perfiles where id = r.usuario_id), 'comentario', p_comentario);
  return jsonb_build_object('id', p_id, 'estado', p_estado, 'folio', r.folio_v2, 'usuario_id', r.usuario_id, 'formulario_id', r.formulario_id);
end $$;
revoke execute on function public.revisar_reporte(bigint, text, text) from anon, public;
grant execute on function public.revisar_reporte(bigint, text, text) to authenticated;
create policy reportes_select_revisor on public.reportes for select using (public.tengo_permiso('aprobar_reportes'));
create policy reportes_storage_select_revisor on storage.objects for select using (bucket_id = 'reportes' and public.tengo_permiso('aprobar_reportes'));
-- reportes_vista añade: estado, revisado_en, comentario_revision, revisor (usuario), discord_enviado_en, requiere_aprobacion
-- actividad_usuarios() cuenta solo reportes aprobados. El rol Administrador tiene aprobar_reportes.

-- ---------- Sanciones y advertencias ----------
create table if not exists public.sanciones (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  tipo text not null check (tipo in ('advertencia','sancion','suspension','expulsion')),
  motivo text not null, detalle text, fecha date not null default current_date, impuesta_por uuid,
  activa boolean not null default true, anulada_por uuid, anulada_en timestamptz, motivo_anulacion text,
  creado_en timestamptz not null default now()
);
create index if not exists sanciones_usuario_idx on public.sanciones (usuario_id, activa);
alter table public.sanciones enable row level security;
create policy sanciones_select on public.sanciones for select using (coalesce(public.mi_perfil_activo(),false) and (usuario_id = auth.uid() or public.tengo_permiso('sanciones') or public.tengo_permiso('historial') or public.tengo_permiso('usuarios')));
-- Escritura solo por RPC (permiso "sanciones"; auditan sancion_<tipo> y sancion_anulada):
--   registrar_sancion(p_usuario, p_tipo, p_motivo, p_detalle, p_fecha) -> {id, advertencias_activas, usuario}
--   anular_sancion(p_id, p_motivo) -> {id, advertencias_activas}
-- (definiciones completas en producción; ver app-admin.js / app-expediente.js para su uso)

-- ---------- Ascensos ----------
create table if not exists public.ascensos (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  rango_anterior text, rango_nuevo text, motivo text, otorgado_por uuid,
  fecha date not null default current_date, creado_en timestamptz not null default now()
);
create index if not exists ascensos_usuario_idx on public.ascensos (usuario_id, creado_en desc);
alter table public.ascensos enable row level security;
create policy ascensos_select on public.ascensos for select using (coalesce(public.mi_perfil_activo(),false) and (usuario_id = auth.uid() or public.tengo_permiso('usuarios') or public.tengo_permiso('historial') or public.tengo_permiso('sanciones')));
-- Todo cambio de perfiles.rango queda registrado (trigger perfiles_registrar_ascenso; motivo vía set_config('pm.motivo_ascenso'))
create or replace function public.perfiles_registrar_ascenso() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.rango is distinct from old.rango then
    insert into public.ascensos (usuario_id, rango_anterior, rango_nuevo, motivo, otorgado_por)
    values (new.id, old.rango, new.rango, nullif(current_setting('pm.motivo_ascenso', true),''), auth.uid());
  end if;
  return new;
end $$;
create or replace trigger perfiles_registrar_ascenso after update of rango on public.perfiles for each row execute function public.perfiles_registrar_ascenso();
-- RPC cambiar_rango(p_usuario, p_rango, p_motivo) (permiso usuarios) -> {usuario, rango_anterior, rango_nuevo}
create table if not exists public.requisitos_ascenso (rango text primary key, dias_minimos int not null default 0, reportes_minimos int not null default 0, nota text);
alter table public.requisitos_ascenso enable row level security;
create policy requisitos_select on public.requisitos_ascenso for select using (coalesce(public.mi_perfil_activo(),false));
create policy requisitos_write on public.requisitos_ascenso for all using (public.tengo_permiso('usuarios')) with check (public.tengo_permiso('usuarios'));
-- RPC datos_ascensos() (permiso usuarios): usuario_id, usuario, nombre, rango, desde, reportes (aprobados desde el último ascenso), advertencias activas
-- RPC expediente(p_usuario) (propio, o permisos historial/usuarios/sanciones): perfil, rol, stats, por_formulario, participaciones,
--   advertencias_activas, sanciones, ascensos, en_rango_desde, reportes_recientes
-- El rol Administrador tiene "sanciones".

-- ---------- Turnos, anuncios, insignias y tareas programadas ----------
create table if not exists public.turnos (id bigint generated always as identity primary key, fecha date not null, hora_inicio time not null, hora_fin time,
  usuario_id uuid not null references public.perfiles(id) on delete cascade, notas text, asignado_por uuid, creado_en timestamptz not null default now());
create index if not exists turnos_fecha_idx on public.turnos (fecha, usuario_id);
alter table public.turnos enable row level security;
create policy turnos_select on public.turnos for select using (coalesce(public.mi_perfil_activo(),false));
create policy turnos_write on public.turnos for all using (public.tengo_permiso('turnos')) with check (public.tengo_permiso('turnos'));
-- RPC turnos_lista(p_desde, p_hasta): agenda con nombres y bandera "reporte" (ya envió patrullaje ese día); para todos los activos
create table if not exists public.anuncios (id bigint generated always as identity primary key, titulo text not null, cuerpo text not null default '', autor_id uuid,
  fijado boolean not null default false, activo boolean not null default true, publicado_en timestamptz not null default now(), expira_en timestamptz,
  creado_en timestamptz not null default now(), actualizado_en timestamptz not null default now());
alter table public.anuncios enable row level security;
create policy anuncios_select on public.anuncios for select using (coalesce(public.mi_perfil_activo(),false) and (public.tengo_permiso('anuncios') or (activo and publicado_en <= now() and (expira_en is null or expira_en > now()))));
create policy anuncios_write on public.anuncios for all using (public.tengo_permiso('anuncios')) with check (public.tengo_permiso('anuncios'));
create table if not exists public.anuncios_vistos (anuncio_id bigint not null references public.anuncios(id) on delete cascade, usuario_id uuid not null references public.perfiles(id) on delete cascade, visto_en timestamptz not null default now(), primary key (anuncio_id, usuario_id));
alter table public.anuncios_vistos enable row level security;
create policy vistos_select on public.anuncios_vistos for select using (usuario_id = auth.uid() or public.tengo_permiso('anuncios'));
create policy vistos_insert on public.anuncios_vistos for insert with check (usuario_id = auth.uid() and coalesce(public.mi_perfil_activo(),false));
create table if not exists public.insignias (id bigint generated always as identity primary key, usuario_id uuid not null references public.perfiles(id) on delete cascade, mes date not null, tipo text not null, valor int not null default 0, creado_en timestamptz not null default now(), unique (usuario_id, mes, tipo));
alter table public.insignias enable row level security;
create policy insignias_select on public.insignias for select using (coalesce(public.mi_perfil_activo(),false));
-- RPCs: ranking_calc(mes) (interno) / ranking_mes(mes) (activos) / insignias_lista()
-- Tareas programadas: todo en Postgres (pg_cron + pg_net), sin Edge Function ni secretos:
--   discord_enviar(canal, payload) -> net.http_post al webhook de discord_canales
--   ejecutar_programada(accion, fecha) -> recordatorio_turnos | cierre_diario | resumen_semanal | ranking_mensual (otorga insignias); audita programada_<accion>
--   programar(clave, activo, hora, minuto, dia) -> cron.schedule('pm_<clave>', ...) en UTC (hora Bogotá +5); guarda configuracion.programadas
create extension if not exists pg_net with schema extensions;
-- El rol Administrador tiene "turnos" y "anuncios".

-- ---------- Búsqueda de texto completo, respaldo ----------
alter table public.reportes add column if not exists busqueda tsvector generated always as (to_tsvector('spanish', coalesce(resumen,'') || ' ' || coalesce(datos::text,''))) stored;
create index if not exists reportes_busqueda_idx on public.reportes using gin (busqueda);
-- reportes_vista expone "busqueda" (Historial: .textSearch('busqueda', q, {type:'websearch', config:'spanish'}))
create or replace function public.auditar_respaldo(p_detalle jsonb default '{}'::jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
  if not coalesce(public.soy_superadmin(),false) then raise exception 'Solo el Administrador'; end if;
  insert into public.auditoria (usuario_id, usuario, accion, tabla, registro, detalle) values (auth.uid(), (select usuario from public.perfiles where id=auth.uid()), 'respaldo', 'sistema', 'zip', coalesce(p_detalle,'{}'::jsonb));
end $$;
revoke execute on function public.auditar_respaldo(jsonb) from anon, public;
grant execute on function public.auditar_respaldo(jsonb) to authenticated;
-- 2FA (TOTP): lo gestiona Supabase Auth (Authentication → Multi-Factor → TOTP habilitado). El cliente exige aal2 en requerir() cuando el usuario tiene factor.

-- ---------- Avatar (foto del personaje de RP, no real) y permisos de solo lectura ----------
alter table public.perfiles add column if not exists avatar_path text;
insert into storage.buckets (id, name, public) values ('avatares','avatares', true) on conflict (id) do nothing;
create policy avatares_select on storage.objects for select using (bucket_id = 'avatares' and coalesce(public.mi_perfil_activo(), false)
  and ((storage.foldername(name))[1] = auth.uid()::text or coalesce(public.tengo_permiso('usuarios'), false)));
create policy avatares_write on storage.objects for all
  using (bucket_id = 'avatares' and coalesce(public.mi_perfil_activo(),false) and ((storage.foldername(name))[1] = auth.uid()::text or public.tengo_permiso('usuarios')))
  with check (bucket_id = 'avatares' and coalesce(public.mi_perfil_activo(),false) and ((storage.foldername(name))[1] = auth.uid()::text or public.tengo_permiso('usuarios')));
-- RPC fijar_avatar(p_usuario, p_path): el propio usuario o permiso "usuarios"; audita "avatar". expediente() devuelve perfil.avatar_path.
-- Permisos de solo lectura: ver_turnos (ve la agenda en el panel sin editar) y ver_anuncios (ve el tablón y quién lo leyó).
-- anuncios_select / vistos_select incluyen ver_anuncios. El rol Administrador tiene ambos.

-- Bajas reales de un reporte (el formulario guarda las 10 filas, vacías incluidas): solo cuentan las filas con nombre
create or replace function public.bajas_de(d jsonb) returns int language sql immutable as $$
  select case when jsonb_typeof(d->'rows')='array' then (select count(*)::int from jsonb_array_elements(d->'rows') e where coalesce(trim(e->>'nombre'),'') <> '') else 0 end
$$;
-- expediente(), ranking_calc() y ejecutar_programada() usan public.bajas_de(datos).
-- Anuncios con imagen (1): bucket público "anuncios", columna anuncios.imagen_path; escriben quienes tienen permiso "anuncios"
alter table public.anuncios add column if not exists imagen_path text;
insert into storage.buckets (id, name, public) values ('anuncios','anuncios', true) on conflict (id) do nothing;
create policy anuncios_img_select on storage.objects for select using (bucket_id = 'anuncios' and coalesce(public.tengo_permiso('anuncios'), false));
create policy anuncios_img_write on storage.objects for all using (bucket_id = 'anuncios' and public.tengo_permiso('anuncios')) with check (bucket_id = 'anuncios' and public.tengo_permiso('anuncios'));
-- Auditoría genérica (registrar_auditoria) también en: turnos, anuncios, requisitos_ascenso, discord_canales, formularios_discord, configuracion, insignias.
-- Los webhooks se guardan como "(oculto)" en el detalle; se excluyen busqueda/actualizado_en. Sanciones, ascensos, revisión, ver_como, avatar y respaldo auditan desde sus RPC.

-- ---------- Permisos granulares por usuario y ficha de usuario ----------
alter table public.perfiles add column if not exists permisos_extra jsonb not null default '{}'::jsonb;    -- se otorgan aunque el rol no los tenga (nunca ver_como)
alter table public.perfiles add column if not exists permisos_negados jsonb not null default '{}'::jsonb;  -- se quitan aunque el rol los tenga
alter table public.perfiles add column if not exists formularios_extra text[] not null default '{}';
alter table public.perfiles add column if not exists notas_admin text;
-- permisos_efectivos(uuid) = (rol ∪ extra) − negados. tengo_permiso(), puedo_usar_formulario() y dentro_de_mis_permisos() ya los usan.
-- RPC fijar_permisos_usuario(p_usuario, p_extra, p_negados, p_formularios, p_notas): permiso "permisos_granulares" (por defecto solo Administrador);
--   solo se otorgan permisos/formularios que el llamante tiene; no sobre uno mismo; a un Administrador solo otro Administrador. Audita "permisos_granulares".
-- RPC ficha_usuario(p_usuario): cuenta (correo, último acceso, factores 2FA), actividad, efectivos y últimos 40 registros de auditoría relacionados.

-- ---------- Auditoría con IA de reportes (Gemini, Edge Function auditar-reporte) ----------
-- Secretos del servidor: RLS sin políticas; solo la clave de servicio los lee (GEMINI_API_KEY y el token interno AUDITORIA_INTERNO).
-- La Edge Function prefiere la variable de entorno GEMINI_API_KEY si existe.
create table if not exists public.secretos (clave text primary key, valor text not null, actualizado_en timestamptz not null default now());
alter table public.secretos enable row level security;
revoke all on public.secretos from anon, authenticated;
-- insert into public.secretos (clave, valor) values ('GEMINI_API_KEY', '<clave de Google AI Studio>');
insert into public.secretos (clave, valor) values ('AUDITORIA_INTERNO', encode(gen_random_bytes(32), 'hex')) on conflict (clave) do nothing;
-- Resultado del análisis (riesgo bajo/medio/alto, puntaje, resumen, hallazgos, texto_leido, huella, es_captura_del_juego, verificaciones{actores_en_chat, autor_en_pantalla,
--   nombres_declarados_vistos/no_vistos, nombres_vistos_no_declarados, horas_servidor, fecha_coherente, capturas_reutilizadas, hud_visible}, reglas[], modelo, en, version; o {error}) y hash SHA-256 del archivo.
alter table public.reportes add column if not exists auditoria_ia jsonb, add column if not exists imagen_hash text;
create index if not exists reportes_imagen_hash_idx on public.reportes (imagen_hash) where imagen_hash is not null;
insert into public.configuracion (clave, valor) values ('auditoria_ia', '{"activo": true, "modelo": "gemini-3.8-flash"}'::jsonb) on conflict (clave) do nothing;
-- validar_update_reporte(): conserva auditoria_ia e imagen_hash en cualquier update con sesión o en revisión (solo los escribe el servidor).
-- registrar_auditoria(): excluye auditoria_ia/imagen_hash del detalle; la función deja su propio evento "auditoria_ia" {riesgo, puntaje, modelo, origen}.
-- reportes_vista: añade auditoria_ia e imagen_hash. expediente(): reportes_recientes incluye auditoria_ia resumido (riesgo, puntaje, resumen, error).
-- Disparo automático: al recibir imagen, el trigger llama a la Edge Function por pg_net con el token interno (asíncrono; nunca bloquea el reporte).
create or replace function public.reportes_auditar_ia() returns trigger language plpgsql security definer set search_path = public as $$
declare tok text; cfg jsonb;
begin
  if new.imagen_path is null or old.imagen_path is not null then return new; end if;
  select valor into cfg from public.configuracion where clave = 'auditoria_ia';
  if coalesce((cfg->>'activo')::boolean, true) = false then return new; end if;
  select valor into tok from public.secretos where clave = 'AUDITORIA_INTERNO';
  if tok is null then return new; end if;
  perform net.http_post(url := 'https://rvwvnrqwlaudjgzvrzgf.supabase.co/functions/v1/auditar-reporte',
    body := jsonb_build_object('reporte_id', new.id), headers := jsonb_build_object('Content-Type', 'application/json', 'x-pm-interno', tok), timeout_milliseconds := 120000);
  return new;
exception when others then return new;
end $$;
revoke all on function public.reportes_auditar_ia() from public, anon, authenticated;
create or replace trigger reportes_auditar_ia after update of imagen_path on public.reportes for each row execute function public.reportes_auditar_ia();
-- Reanálisis manual (botón en Revisión): la función se llama con la sesión del revisor (permiso aprobar_reportes) y { forzar: true }.
