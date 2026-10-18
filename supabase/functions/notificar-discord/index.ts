// Publica un reporte sellado en el canal de Discord configurado para su formulario.
// Seguridad: quien llama debe ser el autor del reporte (o tener historial) y el reporte debe tener imagen.
// El webhook nunca sale al navegador: se lee aquí con la clave de servicio.
// Modo prueba: { formulario_id, prueba:true } envía un mensaje de verificación (requiere gestion_reportes).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Método no permitido" });
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "Sin sesión" });
  let body: { reporte_id?: number; formulario_id?: string; prueba?: boolean };
  try { body = await req.json(); } catch { return json(400, { error: "Cuerpo inválido" }); }

  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const caller = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: me } = await caller.auth.getUser();
  if (!me?.user) return json(401, { error: "Sesión inválida" });

  // ---- Modo prueba ----
  if (body.prueba) {
    const { data: ok } = await caller.rpc("tengo_permiso", { p: "gestion_reportes" });
    if (!ok) return json(403, { error: "Sin permiso de gestión de reportes" });
    const { data: cfg } = await admin.from("formularios_discord").select("webhook, activo").eq("formulario_id", body.formulario_id ?? "").maybeSingle();
    if (!cfg) return json(404, { error: "Este formulario no tiene webhook configurado" });
    const r = await fetch(cfg.webhook, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "Policía Militar · Reportes", content: `✅ Prueba de conexión: los reportes de **${body.formulario_id}** se publicarán en este canal.` }) });
    if (!r.ok) return json(502, { error: `Discord respondió ${r.status}: ${(await r.text()).slice(0, 200)}` });
    return json(200, { ok: true });
  }

  // ---- Envío real ----
  const id = Number(body.reporte_id); if (!id) return json(400, { error: "Falta reporte_id" });
  // El reporte debe ser visible para quien llama (RLS: autor o permiso de historial)
  const { data: visible } = await caller.from("reportes_vista").select("id").eq("id", id).maybeSingle();
  if (!visible) return json(403, { error: "Reporte no accesible" });
  const { data: r } = await admin.from("reportes_vista").select("*").eq("id", id).maybeSingle();
  if (!r || !r.imagen_path) return json(400, { error: "El reporte aún no tiene imagen" });
  const { data: raw } = await admin.from("reportes").select("discord_enviado_en").eq("id", id).maybeSingle();
  if (raw?.discord_enviado_en) return json(200, { ok: true, repetido: true });
  const { data: cfg } = await admin.from("formularios_discord").select("webhook, activo").eq("formulario_id", r.formulario_id).maybeSingle();
  if (!cfg || !cfg.activo) return json(200, { ok: false, motivo: "sin_webhook" });

  const ext = (r.imagen_path.split(".").pop() || "png").toLowerCase();
  const { data: file, error: e3 } = await admin.storage.from("reportes").download(r.imagen_path);
  if (e3 || !file) return json(500, { error: "No se pudo leer la imagen" });
  const quien = [r.usuario_rango, r.usuario_nombre || r.usuario].filter(Boolean).join(" ");
  const fecha = r.fecha ? String(r.fecha).split("-").reverse().join("-") : "";
  const payload = {
    username: "Policía Militar · Reportes",
    embeds: [{ title: `${r.formulario} · ${r.folio}`, description: r.resumen || "", color: 0xf0c24d,
      fields: [{ name: "Fecha", value: fecha || "—", inline: true }, { name: "Reporta", value: quien || "—", inline: true }],
      image: { url: `attachment://${r.folio}.${ext}` }, footer: { text: `Sellado por el servidor · Army de Wasco` }, timestamp: new Date(r.creado_en).toISOString() }],
  };
  const form = new FormData();
  form.append("payload_json", JSON.stringify(payload));
  form.append("files[0]", file, `${r.folio}.${ext}`);
  const resp = await fetch(cfg.webhook, { method: "POST", body: form });
  if (!resp.ok) return json(502, { error: `Discord respondió ${resp.status}: ${(await resp.text()).slice(0, 200)}` });
  await admin.from("reportes").update({ discord_enviado_en: new Date().toISOString() }).eq("id", id);
  await admin.rpc("auditar_evento", { p_usuario_id: r.usuario_id, p_accion: "discord_publicado", p_tabla: "reportes", p_registro: String(id), p_detalle: { folio: r.folio, formulario: r.formulario_id } }).then(() => {}, () => {});
  return json(200, { ok: true });
});
