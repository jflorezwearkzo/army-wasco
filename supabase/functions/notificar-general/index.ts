// Publica un mensaje en uno de los canales generales de Discord (tabla discord_canales: avisos, anuncios, ranking,
// resumen, recordatorios). Los webhooks nunca salen al navegador: se leen aquí con la clave de servicio.
// Cuerpo: { canal, texto?, embed?, prueba?, origen?: { tabla, id } } publica y registra el mensaje en discord_mensajes.
//         { canal, accion: "editar", mensaje_id, texto?, embed? } edita un mensaje enviado antes por la página.
//         { canal, accion: "borrar", mensaje_id } lo borra.
//         { canal, accion: "republicar", mensaje_id, texto?, embed?, origen? } borra el viejo y publica
//           uno nuevo al final del canal: el mensaje "se mueve" y estrena id.
//         Quien llama debe tener alguno de los permisos que publican avisos.
// (sin el import de tipos de jsr: solo aportaba tipados y a veces no responde al compilar)
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
// Arma la dirección del webhook. El hilo va aparte porque al editar o borrar hay que meterlo
// después de /messages/<id>, no pegado al final del enlace que guardó el administrador.
function urlEnviar(base: string, hilo: string | null | undefined, espera = false): string {
  const u = new URL(base);
  if (hilo) u.searchParams.set("thread_id", hilo);
  if (espera) u.searchParams.set("wait", "true");
  return u.toString();
}
function urlMensaje(base: string, hilo: string | null | undefined, mid: string): string {
  const u = new URL(base);
  u.pathname = u.pathname.replace(/\/+$/, "") + "/messages/" + mid;
  if (hilo) u.searchParams.set("thread_id", hilo);
  return u.toString();
}
const PERMISOS = ["gestion_reportes", "sanciones", "anuncios", "turnos", "usuarios", "aprobar_reportes"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Método no permitido" });
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "Sin sesión" });
  let body: { canal?: string; texto?: string; embed?: Record<string, unknown>; prueba?: boolean; origen?: { tabla?: string; id?: string | number }; accion?: string; mensaje_id?: string };
  let republicado: { mensaje_id: string } | null = null;
  try { body = await req.json(); } catch { return json(400, { error: "Cuerpo inválido" }); }
  const canal = String(body.canal ?? "").trim();
  if (!canal) return json(400, { error: "Falta el canal" });

  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const caller = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: me } = await caller.auth.getUser();
  if (!me?.user) return json(401, { error: "Sesión inválida" });

  let permitido = false;
  if (body.prueba) { const { data } = await caller.rpc("tengo_permiso", { p: "gestion_reportes" }); permitido = !!data; }
  else { for (const p of PERMISOS) { const { data } = await caller.rpc("tengo_permiso", { p }); if (data) { permitido = true; break; } } }
  if (!permitido) return json(403, { error: "Sin permiso para publicar avisos" });

  // La clave del canal se repite entre organizaciones: siempre el de la organización de quien llama
  const { data: miOrg } = await caller.rpc("mi_org");
  const org = String(miOrg ?? "pm");
  const { data: cfg } = await admin.from("discord_canales").select("nombre, webhook, activo, hilo").eq("clave", canal).eq("org_id", org).maybeSingle();
  if (!cfg) return json(404, { error: "Canal desconocido" });
  if (!cfg.webhook || (!cfg.activo && !body.prueba)) return json(200, { ok: false, motivo: "sin_webhook" });

  // ---- Editar o borrar un mensaje enviado antes por la página ----
  if (body.accion === "editar" || body.accion === "borrar" || body.accion === "republicar") {
    const mid = String(body.mensaje_id ?? "").trim(); if (!/^\d+$/.test(mid)) return json(400, { error: "Falta mensaje_id" });
    const { data: reg } = await admin.from("discord_mensajes").select("id, origen_tabla, origen_id").eq("canal", canal).eq("mensaje_id", mid).maybeSingle();
    if (!reg) return json(404, { error: "Ese mensaje no fue enviado por la página" });
    const urlMsg = urlMensaje(cfg.webhook, cfg.hilo, mid);
    if (body.accion === "borrar" || body.accion === "republicar") {
      const r = await fetch(urlMsg, { method: "DELETE" });
      if (!r.ok && r.status !== 404) return json(502, { error: `Discord respondió ${r.status}: ${(await r.text()).slice(0, 200)}` });
      await admin.from("discord_mensajes").delete().eq("id", reg.id);
      if (body.accion === "borrar") {
        await admin.rpc("auditar_evento", { p_usuario_id: me.user.id, p_accion: "discord_borrado", p_tabla: "discord_canales", p_registro: canal, p_detalle: { mensaje_id: mid, origen: reg.origen_tabla, origen_id: reg.origen_id } }).then(() => {}, () => {});
        return json(200, { ok: true });
      }
      // Republicar: el viejo ya se fue; abajo se publica uno nuevo con el origen del anterior,
      // así que el anuncio conserva su enlace con el mensaje y estrena id al final del canal.
      body.origen = body.origen ?? { tabla: reg.origen_tabla ?? undefined, id: reg.origen_id ?? undefined };
      republicado = { mensaje_id: mid };
    } else {
    const cambios: Record<string, unknown> = {};
    if (body.texto !== undefined) cambios.content = String(body.texto ?? "").slice(0, 1900);
    if (body.embed && typeof body.embed === "object") cambios.embeds = [{ color: 0xf0c24d, ...body.embed }];
    if (!Object.keys(cambios).length) return json(400, { error: "Nada que cambiar" });
    const r = await fetch(urlMsg, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cambios) });
    if (!r.ok) return json(502, { error: `Discord respondió ${r.status}: ${(await r.text()).slice(0, 200)}` });
    await admin.from("discord_mensajes").update({ titulo: (body.embed as Record<string, unknown> | undefined)?.title ?? reg.origen_tabla }).eq("id", reg.id).then(() => {}, () => {});
    await admin.rpc("auditar_evento", { p_usuario_id: me.user.id, p_accion: "discord_editado", p_tabla: "discord_canales", p_registro: canal, p_detalle: { mensaje_id: mid, origen: reg.origen_tabla, origen_id: reg.origen_id, titulo: (body.embed as Record<string, unknown> | undefined)?.title ?? null } }).then(() => {}, () => {});
    return json(200, { ok: true });
    }
  }

  const { data: orgRow } = await admin.from("organizaciones").select("nombre").eq("id", org).maybeSingle();
  const nombreOrg = orgRow?.nombre ?? "Policía Militar";
  const payload: Record<string, unknown> = { username: `${nombreOrg} · Army de Wasco` };
  if (body.prueba) payload.content = `✅ Prueba de conexión: el canal **${cfg.nombre}** quedó enlazado con la página de ${nombreOrg}.`;
  else {
    if (body.texto) payload.content = String(body.texto).slice(0, 1900);
    if (body.embed && typeof body.embed === "object") payload.embeds = [{ color: 0xf0c24d, ...body.embed }];
    if (!payload.content && !payload.embeds) return json(400, { error: "Nada que publicar" });
  }
  const resp = await fetch(urlEnviar(cfg.webhook, cfg.hilo, true), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!resp.ok) return json(502, { error: `Discord respondió ${resp.status}: ${(await resp.text()).slice(0, 200)}` });
  let mensajeId: string | null = null; try { mensajeId = (await resp.json())?.id ?? null; } catch { /* sin id */ }
  if (!body.prueba) await admin.from("discord_mensajes").insert({ canal, origen_tabla: body.origen?.tabla ?? null, origen_id: body.origen?.id != null ? String(body.origen.id) : null, mensaje_id: mensajeId, titulo: (body.embed as Record<string, unknown> | undefined)?.title ?? String(body.texto ?? "").slice(0, 120) }).then(() => {}, () => {});
  if (republicado) await admin.rpc("auditar_evento", { p_usuario_id: me.user.id, p_accion: "discord_republicado", p_tabla: "discord_canales", p_registro: canal, p_detalle: { antes: republicado.mensaje_id, ahora: mensajeId } }).then(() => {}, () => {});
  if (!body.prueba && !republicado) await admin.rpc("auditar_evento", { p_usuario_id: me.user.id, p_accion: "discord_aviso", p_tabla: "discord_canales", p_registro: canal, p_detalle: { texto: String(body.texto ?? "").slice(0, 200), titulo: (body.embed as Record<string, unknown> | undefined)?.title ?? null } }).then(() => {}, () => {});
  return json(200, { ok: true, mensaje_id: mensajeId });
});
