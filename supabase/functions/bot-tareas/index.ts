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
      } else if (t.tipo === "sync_rol") {
        // Pone el rol de Discord que corresponde al Rango PM y quita los demás que gestionamos.
        // Nunca toca roles que no estén en la tabla: lo que el liderazgo reparta a mano se respeta.
        const p = (t.payload ?? {}) as Record<string, any>;
        const { data: mapa } = await admin.from("bot_roles").select("rango_pm, rol_id").eq("org_id", t.org_id);
        const nuestros = (mapa ?? []).map((m) => m.rol_id);
        const toca = (mapa ?? []).find((m) => m.rango_pm === p.rango_pm)?.rol_id ?? null;
        if (!nuestros.length) motivo = "sin_mapa_de_roles";
        else {
          const g = await fetch(`${API}/guilds/${p.guild}/members/${p.discord_id}`, { headers: cab });
          if (g.status === 404) motivo = "no_esta_en_el_servidor";
          else if (!g.ok) motivo = `discord_${g.status}`;
          else {
            const miembro = await g.json();
            const tiene: string[] = miembro?.roles ?? [];
            const quitar = nuestros.filter((r) => tiene.includes(r) && r !== toca);
            const poner = toca && p.activo !== false && !tiene.includes(toca) ? toca : null;
            for (const r of quitar) {
              const d = await fetch(`${API}/guilds/${p.guild}/members/${p.discord_id}/roles/${r}`, { method: "DELETE", headers: cab });
              if (!d.ok && d.status !== 404) motivo = `quitar_${d.status}`;
            }
            if (poner) {
              const a = await fetch(`${API}/guilds/${p.guild}/members/${p.discord_id}/roles/${poner}`, { method: "PUT", headers: cab });
              if (!a.ok) motivo = a.status === 403 ? "rol_del_bot_demasiado_bajo" : `poner_${a.status}`;
            }
            if (!motivo && p.apodo) {
              // El apodo es un extra: si falla (por ejemplo con el dueño del servidor) no se da por fallido
              await fetch(`${API}/guilds/${p.guild}/members/${p.discord_id}`, {
                method: "PATCH", headers: cab, body: JSON.stringify({ nick: String(p.apodo).slice(0, 32) }),
              }).then(() => {}, () => {});
            }
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
