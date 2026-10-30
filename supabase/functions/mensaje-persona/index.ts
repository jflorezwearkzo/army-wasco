// Manda un mensaje a UNA persona, de dos maneras:
//   { usuario_id, texto, modo: "mencion", canal } -> publica en ese canal con <@id> delante.
//       No es privado: lo lee quien entre al canal, pero le llega la notificación y no hace falta bot.
//   { usuario_id, texto, modo: "privado" }        -> mensaje directo, con el bot de Discord.
//       Necesita DISCORD_BOT_TOKEN en los secretos. El bot solo puede escribir a quien comparta
//       servidor con él, y Discord deja que cada quien bloquee los privados de miembros del servidor:
//       en ese caso Discord responde 403 y aquí se devuelve "privados_cerrados".
// Quien llama necesita el permiso de usuarios o el de anuncios. Nunca se devuelve el token ni el webhook.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const API = "https://discord.com/api/v10";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Método no permitido" });
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "Sin sesión" });

  let body: { usuario_id?: string; texto?: string; modo?: string; canal?: string; titulo?: string };
  try { body = await req.json(); } catch { return json(400, { error: "Cuerpo inválido" }); }
  const modo = body.modo === "privado" ? "privado" : "mencion";
  const texto = String(body.texto ?? "").trim().slice(0, 1800);
  if (!texto) return json(400, { error: "El mensaje está vacío" });
  if (!body.usuario_id) return json(400, { error: "Falta la persona" });

  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!,
        service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const caller = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: me } = await caller.auth.getUser();
  if (!me?.user) return json(401, { error: "Sesión inválida" });

  let permitido = false;
  for (const p of ["usuarios", "anuncios"]) {
    const { data } = await caller.rpc("tengo_permiso", { p });
    if (data) { permitido = true; break; }
  }
  if (!permitido) return json(403, { error: "Sin permiso para escribir a los integrantes" });

  // La persona debe ser de una organización del que llama, y tener su Discord puesto
  const { data: miOrg } = await caller.rpc("mi_org");
  const org = String(miOrg ?? "pm");
  const { data: destino } = await admin.from("perfiles").select("id, usuario, nombre, rango, discord_id")
    .eq("id", body.usuario_id).maybeSingle();
  if (!destino) return json(404, { error: "Esa persona no existe" });
  const { data: memb } = await admin.from("membresias").select("usuario_id")
    .eq("usuario_id", destino.id).eq("org_id", org).maybeSingle();
  if (!memb) return json(403, { error: "Esa persona no pertenece a tu unidad" });
  if (!destino.discord_id) return json(200, { ok: false, motivo: "sin_discord" });

  // El nombre de quien escribe va siempre en el mensaje: nadie recibe un aviso anónimo
  const { data: yo } = await admin.from("perfiles").select("usuario, nombre, rango").eq("id", me.user.id).maybeSingle();
  const firma = [yo?.rango, yo?.nombre].filter(Boolean).join(" ") || yo?.usuario || "el liderazgo";
  const { data: orgRow } = await admin.from("organizaciones").select("nombre").eq("id", org).maybeSingle();
  const nombreOrg = orgRow?.nombre ?? "Policía Militar";

  const embed = {
    color: 0xf0c24d,
    title: body.titulo ? String(body.titulo).slice(0, 240) : `✉️ Mensaje de ${nombreOrg}`,
    description: texto,
    footer: { text: `Enviado por ${firma} · Army de Wasco` },
  };

  const auditar = (accion: string, detalle: Record<string, unknown>) =>
    admin.rpc("auditar_evento", {
      p_usuario_id: me.user.id, p_accion: accion, p_tabla: "perfiles",
      p_registro: destino.usuario, p_detalle: detalle,
    }).then(() => {}, () => {});

  // ---------- Opción A: mención en un canal ----------
  if (modo === "mencion") {
    const canal = String(body.canal ?? "").trim();
    if (!canal) return json(400, { error: "Falta el canal" });
    const { data: cfg } = await admin.from("discord_canales").select("webhook, activo, hilo, nombre")
      .eq("clave", canal).eq("org_id", org).maybeSingle();
    if (!cfg) return json(404, { error: "Canal desconocido" });
    if (!cfg.webhook || !cfg.activo) return json(200, { ok: false, motivo: "sin_webhook" });
    const u = new URL(cfg.webhook);
    if (cfg.hilo) u.searchParams.set("thread_id", cfg.hilo);
    const r = await fetch(u.toString(), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `${nombreOrg} · Army de Wasco`,
        content: `<@${destino.discord_id}>`,
        embeds: [embed],
        allowed_mentions: { users: [destino.discord_id] },
      }),
    });
    if (!r.ok) return json(502, { error: `Discord respondió ${r.status}: ${(await r.text()).slice(0, 200)}` });
    await auditar("mensaje_mencion", { canal, titulo: embed.title });
    return json(200, { ok: true, modo: "mencion", canal: cfg.nombre });
  }

  // ---------- Opción B: mensaje privado con el bot ----------
  const token = Deno.env.get("DISCORD_BOT_TOKEN");
  if (!token) return json(200, { ok: false, motivo: "sin_bot" });
  const cab = { "Authorization": `Bot ${token}`, "Content-Type": "application/json" };

  const abrir = await fetch(`${API}/users/@me/channels`, {
    method: "POST", headers: cab, body: JSON.stringify({ recipient_id: destino.discord_id }),
  });
  if (abrir.status === 403) return json(200, { ok: false, motivo: "privados_cerrados" });
  if (abrir.status === 429) return json(200, { ok: false, motivo: "demasiado_rapido" });
  if (!abrir.ok) return json(200, { ok: false, motivo: `discord_${abrir.status}` });
  let canalDm: string | null = null;
  try { canalDm = (await abrir.json())?.id ?? null; } catch { /* sin id */ }
  if (!canalDm) return json(200, { ok: false, motivo: "sin_canal_privado" });

  const env = await fetch(`${API}/channels/${canalDm}/messages`, {
    method: "POST", headers: cab,
    body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
  });
  if (env.status === 403) return json(200, { ok: false, motivo: "privados_cerrados" });
  if (!env.ok) return json(200, { ok: false, motivo: `discord_${env.status}` });
  await auditar("mensaje_privado", { titulo: embed.title });
  return json(200, { ok: true, modo: "privado" });
});
