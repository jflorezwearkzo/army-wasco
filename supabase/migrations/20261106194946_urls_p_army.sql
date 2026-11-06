-- Army vive en su propio proyecto de UltimateBase: https://ultimatebase.zylarion.io/p/army
-- (la raíz del host queda para la web de UltimateBase). Se actualizan las URLs escritas en SQL
-- y los enlaces a imágenes públicas guardados en las definiciones de formularios.

CREATE OR REPLACE FUNCTION public.agenda_embed(p_id bigint, p_titulo_msg text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ev record; base text; ts bigint; cuerpo text; si int; no_ int; emb jsonb;
begin
  select * into ev from public.agenda_eventos where id = p_id;
  if ev.id is null then return null; end if;
  base := public.sitio_de(ev.org_id);
  ts := extract(epoch from ev.inicia_en)::bigint;
  select count(*) filter (where respuesta='si'), count(*) filter (where respuesta='no')
    into si, no_ from public.agenda_asistencia where evento_id = p_id;

  cuerpo := coalesce(ev.descripcion || chr(10) || chr(10), '')
         || '🗓️ ' || to_char(ev.inicia_en at time zone 'UTC', 'DD/MM/YYYY') || ' · '
         || to_char(ev.inicia_en at time zone 'UTC', 'HH24:MI') || ' UTC (hora del servidor)' || chr(10)
         || '🌎 <t:' || ts || ':F> en tu hora · <t:' || ts || ':R>' || chr(10)
         || coalesce('📍 ' || ev.lugar || chr(10), '')
         || coalesce('⏳ Duración prevista: ' || ev.duracion_min || ' min' || chr(10), '')
         || case when coalesce(array_length(ev.rangos,1),0) > 0
                 then '👥 Convocados: **' || array_to_string(ev.rangos, ', ') || '**' || chr(10)
                 else '👥 Convocatoria abierta a toda la unidad' || chr(10) end
         || chr(10) || '**¿Vas a asistir?**' || chr(10)
         || '[✅ Asisto](' || base || 'calendario.html?evento=' || ev.id || '&r=si) · '
         || '[❌ No puedo](' || base || 'calendario.html?evento=' || ev.id || '&r=no)' || chr(10)
         || '_Si no tienes la sesión abierta, te pedirá entrar y vuelve solo al evento._';

  emb := jsonb_build_object(
    'title', coalesce(p_titulo_msg, '📅 ') || ev.titulo,
    'description', cuerpo,
    'color', case when ev.cancelado then 10066329 else 15778381 end,
    'footer', jsonb_build_object('text', 'Confirmados: ' || si || ' sí · ' || no_ || ' no'));
  if ev.imagen_path is not null then
    emb := emb || jsonb_build_object('image', jsonb_build_object('url',
             case when ev.imagen_path ~ '^https?://' then ev.imagen_path
                  else 'https://ultimatebase.zylarion.io/p/army/storage/v1/object/public/anuncios/' || ev.imagen_path end));
  end if;
  return emb;
end $function$;

CREATE OR REPLACE FUNCTION public.bot_vaciar_cola()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net'
AS $function$
declare tok text; hay int;
begin
  select count(*) into hay from public.bot_cola where estado = 'pendiente' and intentos < 3;
  if hay = 0 then return; end if;
  select valor into tok from public.secretos where clave = 'AUDITORIA_INTERNO';
  if tok is null then return; end if;
  perform net.http_post(
    url := 'https://ultimatebase.zylarion.io/p/army/functions/v1/bot-tareas',
    body := jsonb_build_object('accion','cola'),
    headers := jsonb_build_object('Content-Type','application/json','x-interno', tok));
end $function$;

CREATE OR REPLACE FUNCTION public.reportes_auditar_ia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare tok text; cfg jsonb;
begin
  if new.imagen_path is null or old.imagen_path is not null then return new; end if;
  select valor into cfg from public.configuracion where clave = 'auditoria_ia';
  if coalesce((cfg->>'activo')::boolean, true) = false then return new; end if;
  select valor into tok from public.secretos where clave = 'AUDITORIA_INTERNO';
  if tok is null then return new; end if;
  perform net.http_post(
    url := 'https://ultimatebase.zylarion.io/p/army/functions/v1/auditar-reporte',
    body := jsonb_build_object('reporte_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-pm-interno', tok),
    timeout_milliseconds := 120000);
  return new;
exception when others then return new;  -- nunca bloquea el reporte
end $function$;

-- Fondos de formularios guardados con la URL vieja de Storage.
UPDATE public.formularios
SET definicion = replace(definicion::text,
      'https://ultimatebase.zylarion.io/storage/v1/',
      'https://ultimatebase.zylarion.io/p/army/storage/v1/')::jsonb
WHERE definicion::text LIKE '%https://ultimatebase.zylarion.io/storage/v1/%';
