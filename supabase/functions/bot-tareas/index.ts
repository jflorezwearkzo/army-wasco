// Vacía la cola del bot: manda los privados y publica los mensajes que llevan botones.
// La llama un reloj de la base cada minuto (bot_vaciar_cola), autenticándose con el mismo
// secreto interno que usa la auditoría con IA. Nadie más puede entrar: no hay sesión que valga.
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://discord.com/api/v10";
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Método no permitido" });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } });

  // Solo el reloj de la base, con el secreto interno
  const { data: sec } = await admin.from("secretos").select("valor").eq("clave", "AUDITORIA_INTERNO").maybeSingle();
  if (!sec?.valor || req.headers.get("x-interno") !== sec.valor) return json(401, { error: "No autorizado" });

  const token = Deno.env.get("DISCORD_BOT_TOKEN");
  if (!token) return json(200, { ok: false, motivo: "sin_bot" });
  const cab = { "Authorization": `Bot ${token}`, "Content-Type": "application/json" };

  // De poco en poco: Discord limita el ritmo y el reloj vuelve a pasar en un minuto
  const { data: cola } = await admin.from("bot_cola").select("*")
    .eq("estado", "pendiente").lt("intentos", 3).order("id").limit(15);
  if (!cola?.length) return json(200, { ok: true, enviados: 0 });

  let enviados = 0, fallidos = 0;
  for (const t of cola) {
    let motivo: string | null = null;
    try {
      if (t.tipo === "privado") {
        const { data: p } = await admin.from("perfiles").select("discord_id").eq("id", t.usuario_id).maybeSingle();
        if (!p?.discord_id) motivo = "sin_discord";
        else {
          const abrir = await fetch(`${API}/users/@me/channels`, {
            method: "POST", headers: cab, body: JSON.stringify({ recipient_id: p.discord_id }),
          });
          if (abrir.status === 403) motivo = "privados_cerrados";
          else if (!abrir.ok) motivo = `discord_${abrir.status}`;
          else {
            const canal = (await abrir.json())?.id;
            const r = await fetch(`${API}/channels/${canal}/messages`, {
              method: "POST", headers: cab,
              body: JSON.stringify({
                embeds: [{ color: 0xf0c24d, title: t.titulo ?? "Aviso", description: t.texto ?? "",
                           footer: { text: "Aviso automático · Army de Wasco" } }],
                allowed_mentions: { parse: [] },
              }),
            });
            if (r.status === 403) motivo = "privados_cerrados";
            else if (!r.ok) motivo = `discord_${r.status}`;
          }
        }
      } else if (t.tipo === "publicar") {
        const { data: c } = await admin.from("discord_canales").select("canal_id")
          .eq("clave", t.canal).eq("org_id", t.org_id).maybeSingle();
        if (!c?.canal_id) motivo = "sin_canal_id";
        else {
          const carga = { ...(t.payload ?? {}) } as Record<string, unknown>;
          delete carga.username;   // eso es cosa de los webhooks; el bot escribe con su propio nombre
          const r = await fetch(`${API}/channels/${c.canal_id}/messages`, {
            method: "POST", headers: cab, body: JSON.stringify(carga),
          });
          if (!r.ok) motivo = `discord_${r.status}`;
          else {
            let mid: string | null = null;
            try { mid = (await r.json())?.id ?? null; } catch { /* sin id */ }
            await admin.from("discord_mensajes").insert({
              canal: t.canal, origen_tabla: t.origen_tabla, origen_id: t.origen_id,
              mensaje_id: mid, titulo: t.titulo,
            }).then(() => {}, () => {});
          }
        }
      } else motivo = "tipo_desconocido";
    } catch (e) { motivo = String((e as Error).message ?? e).slice(0, 120); }

    if (motivo) {
      fallidos++;
      await admin.from("bot_cola").update({
        intentos: (t.intentos ?? 0) + 1, motivo,
        estado: (t.intentos ?? 0) + 1 >= 3 ? "fallido" : "pendiente",
      }).eq("id", t.id);
    } else {
      enviados++;
      await admin.from("bot_cola").update({ estado: "enviado", enviado_en: new Date().toISOString(), motivo: null }).eq("id", t.id);
    }
  }
  return json(200, { ok: true, enviados, fallidos });
});
