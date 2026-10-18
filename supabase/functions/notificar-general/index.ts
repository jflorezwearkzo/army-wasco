// Publica un mensaje en uno de los canales generales de Discord (tabla discord_canales: avisos, anuncios, ranking,
// resumen, recordatorios). Los webhooks nunca salen al navegador: se leen aquí con la clave de servicio.
// Cuerpo: { canal, texto?, embed?, prueba? }. Quien llama debe tener alguno de los permisos que publican avisos.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const PERMISOS = ["gestion_reportes", "sanciones", "anuncios", "turnos", "usuarios", "aprobar_reportes"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Método no permitido" });
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "Sin sesión" });
  let body: { canal?: string; texto?: string; embed?: Record<string, unknown>; prueba?: boolean };
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

  const { data: cfg } = await admin.from("discord_canales").select("nombre, webhook, activo").eq("clave", canal).maybeSingle();
  if (!cfg) return json(404, { error: "Canal desconocido" });
  if (!cfg.webhook || (!cfg.activo && !body.prueba)) return json(200, { ok: false, motivo: "sin_webhook" });

  const payload: Record<string, unknown> = { username: "Policía Militar · Army de Wasco" };
  if (body.prueba) payload.content = `✅ Prueba de conexión: el canal **${cfg.nombre}** quedó enlazado con la página de Policía Militar.`;
  else {
    if (body.texto) payload.content = String(body.texto).slice(0, 1900);
    if (body.embed && typeof body.embed === "object") payload.embeds = [{ color: 0xf0c24d, ...body.embed }];
    if (!payload.content && !payload.embeds) return json(400, { error: "Nada que publicar" });
  }
  const resp = await fetch(cfg.webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!resp.ok) return json(502, { error: `Discord respondió ${resp.status}: ${(await resp.text()).slice(0, 200)}` });
  if (!body.prueba) await admin.rpc("auditar_evento", { p_usuario_id: me.user.id, p_accion: "discord_aviso", p_tabla: "discord_canales", p_registro: canal, p_detalle: { texto: String(body.texto ?? "").slice(0, 200), titulo: (body.embed as Record<string, unknown> | undefined)?.title ?? null } }).then(() => {}, () => {});
  return json(200, { ok: true });
});
