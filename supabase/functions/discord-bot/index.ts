// Punto de entrada de los comandos del bot de Discord (Interactions Endpoint).
// Discord manda aquí cada vez que alguien usa un comando, firmado con Ed25519: si la firma no
// cuadra se responde 401, que es justo lo que Discord comprueba al guardar la URL.
//
// Comandos:
//   /mensaje  usuario texto [asunto]  -> privado a esa persona (pide permiso de usuarios o anuncios)
//   /eventos                          -> horarios fijos del servidor de hoy
//   /agenda                           -> próximos eventos de la agenda a los que estás convocado
//   /quien    usuario                 -> ficha rápida de un integrante
//
// Quien usa un comando se identifica por su id de Discord: tiene que estar puesto en su ficha.
// Las respuestas son efímeras (solo las ve quien escribió el comando), salvo que se diga otra cosa.
import { createClient } from "npm:@supabase/supabase-js@2";

// Son datos públicos de la aplicación de Discord, no secretos; se pueden sobreescribir por entorno.
const APP_ID = Deno.env.get("DISCORD_APP_ID") ?? "1562937253351919627";
const PUBLIC_KEY = Deno.env.get("DISCORD_PUBLIC_KEY") ?? "92ff9cb90fdcdfab94633fe53c80a9796ae2f3fb2eccb58bc46c40c3564c3704";
const API = "https://discord.com/api/v10";

const hex = (s: string) => Uint8Array.from(s.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));

async function firmaValida(body: string, firma: string | null, ts: string | null): Promise<boolean> {
  if (!firma || !ts) return false;
  try {
    const clave = await crypto.subtle.importKey("raw", hex(PUBLIC_KEY), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", clave, hex(firma), new TextEncoder().encode(ts + body));
  } catch { return false; }
}

// 4 = responder ya · 64 = solo lo ve quien escribió el comando
const responder = (texto: string, publico = false) =>
  new Response(JSON.stringify({ type: 4, data: { content: texto, ...(publico ? {} : { flags: 64 }) } }),
    { headers: { "Content-Type": "application/json" } });
const responderEmbed = (embed: Record<string, unknown>, publico = false) =>
  new Response(JSON.stringify({ type: 4, data: { embeds: [embed], ...(publico ? {} : { flags: 64 }) } }),
    { headers: { "Content-Type": "application/json" } });

const opcion = (i: Record<string, any>, nombre: string) =>
  (i.data?.options ?? []).find((o: Record<string, any>) => o.name === nombre)?.value ?? null;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok");
  const cuerpo = await req.text();
  if (!await firmaValida(cuerpo, req.headers.get("x-signature-ed25519"), req.headers.get("x-signature-timestamp"))) {
    return new Response("firma inválida", { status: 401 });
  }
  let i: Record<string, any>;
  try { i = JSON.parse(cuerpo); } catch { return new Response("json inválido", { status: 400 }); }

  if (i.type === 1) return new Response(JSON.stringify({ type: 1 }), { headers: { "Content-Type": "application/json" } });

  // ---- Botones de los mensajes (asistir a un evento de la agenda) ----
  if (i.type === 3) {
    const admin3 = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } });
    const id3 = i.member?.user?.id ?? i.user?.id ?? null;
    const [accion, valor, evento] = String(i.data?.custom_id ?? "").split(":");
    if (accion !== "asistir") return responder("Ese botón ya no hace nada.");
    const { data: r } = await admin3.rpc("agenda_responder_discord",
      { p_discord: id3, p_evento: Number(evento), p_respuesta: valor });
    if (!r?.ok) {
      const motivos: Record<string, string> = {
        sin_enlace: "No te reconozco. Entra en la plataforma, ve a **Mi cuenta → Tu Discord** y pon tu identificador.",
        inactivo: "Tu cuenta del clan está inactiva.",
        no_existe: "Ese evento ya no existe.",
        cancelado: "Ese evento está cancelado.",
        otra_unidad: "Ese evento no es de tu unidad.",
        no_convocado: `Ese evento es solo para ${r?.rangos ?? "otros rangos"}.`,
      };
      return responder(motivos[r?.motivo ?? ""] ?? "No se pudo registrar tu respuesta.");
    }
    return responder(valor === "si"
      ? `✅ Apuntado a **${r.titulo}**. Van ${r.si} confirmados.`
      : `❌ Anotado: no puedes ir a **${r.titulo}**.`);
  }

  if (i.type !== 2) return new Response(JSON.stringify({ type: 4, data: { content: "No sé qué hacer con eso.", flags: 64 } }), { headers: { "Content-Type": "application/json" } });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } });

  // ¿Quién escribe? En un servidor viene en member.user; en un privado, en user.
  const quienId = i.member?.user?.id ?? i.user?.id ?? null;
  const { data: quien } = await admin.rpc("discord_quien", { p_discord: quienId });
  if (!quien) {
    return responder("No te reconozco. Entra en la plataforma, ve a **Mi cuenta → Tu Discord** y pon tu identificador; después vuelve a intentarlo.");
  }
  if (!quien.activo) return responder("Tu cuenta del clan está inactiva, así que no puedo atenderte. Habla con el liderazgo.");
  const permisos = quien.permisos ?? {};
  const puede = (p: string) => permisos[p] === true;
  const nombre = i.data?.name;

  // El panel manda: cada comando se puede apagar y se le puede exigir un permiso concreto.
  const { data: cfg } = await admin.rpc("bot_config", { p_org: quien.org });
  const regla = (cfg ?? {})[nombre] ?? { activo: true, permiso: null };
  if (regla.activo === false) return responder("Ese comando está apagado para tu unidad.");
  if (regla.permiso && !puede(regla.permiso)) {
    return responder("No tienes permiso para usar ese comando. Habla con el liderazgo si crees que deberías tenerlo.");
  }

  const fecha = (f: string) => f ? f.split("-").reverse().join("/") : "—";
  const consulta = async (que: string) => {
    const { data } = await admin.rpc("discord_consulta", { p_discord: quienId, p_que: que });
    return data;
  };

  // ---------------- /eventos ----------------
  if (nombre === "eventos") {
    const { data: evs } = await admin.rpc("discord_eventos_hoy", { p_org: quien.org });
    const lista = (evs ?? []) as Array<Record<string, any>>;
    if (!lista.length) return responder("No hay horarios fijos configurados.");
    const ahora = Math.floor(Date.now() / 1000);
    const sig = lista.find((e) => e.epoch > ahora) ?? lista[0];
    return responderEmbed({
      color: 0xf0c24d,
      title: "🗓️ Eventos del día",
      description: lista.map((e) =>
        `${e.epoch === sig.epoch ? "▶ " : ""}${e.icono ?? "•"} **${e.nombre}**${e.etiqueta ? ` · ${e.etiqueta}` : ""} — ${e.hora} UTC · <t:${e.epoch}:t>`
      ).join("\n"),
      footer: { text: "Las horas en negrita salen en tu propio huso horario" },
    });
  }

  // ---------------- /agenda ----------------
  if (nombre === "agenda") {
    const { data: evs } = await admin.rpc("discord_agenda", { p_org: quien.org, p_rango_pm: quien.rango_pm });
    const lista = (evs ?? []) as Array<Record<string, any>>;
    if (!lista.length) return responder("No tienes ningún evento próximo en la agenda.");
    return responderEmbed({
      color: 0xf0c24d,
      title: "📅 Próximos eventos",
      description: lista.slice(0, 10).map((e) =>
        `**${e.titulo}**\n<t:${e.epoch}:F> · <t:${e.epoch}:R>${e.lugar ? `\n📍 ${e.lugar}` : ""}\n👥 ${e.si} confirmados`
      ).join("\n\n"),
    });
  }

  // ---------------- /quien ----------------
  if (nombre === "quien") {
    const destinoId = String(opcion(i, "usuario") ?? "");
    const { data: otro } = await admin.rpc("discord_quien", { p_discord: destinoId });
    if (!otro) return responder("Esa persona no tiene su Discord enlazado con la plataforma.");
    const p = otro.perfil;
    return responderEmbed({
      color: 0xf0c24d,
      title: `👤 ${[p.rango, p.nombre].filter(Boolean).join(" ") || p.usuario}`,
      description: [
        `**Usuario:** ${p.usuario}`,
        `**Rol:** ${otro.rol ?? "sin rol"}${otro.rango_pm ? ` · ${otro.rango_pm}` : ""}`,
        `**Unidad:** ${otro.org_nombre ?? "—"}`,
        `**Estado:** ${otro.activo ? "activo" : "inactivo"}`,
      ].join("\n"),
    });
  }

  // ---------------- /mensaje ----------------
  if (nombre === "mensaje") {
    const destinoId = String(opcion(i, "usuario") ?? "");
    const texto = String(opcion(i, "texto") ?? "").trim().slice(0, 1800);
    const asunto = opcion(i, "asunto");
    if (!texto) return responder("El mensaje está vacío.");
    const { data: otro } = await admin.rpc("discord_quien", { p_discord: destinoId });
    if (!otro) return responder("Esa persona no tiene su Discord enlazado con la plataforma, así que no sé a quién del clan corresponde.");
    if (otro.org !== quien.org) return responder("Esa persona no es de tu unidad.");

    const token = Deno.env.get("DISCORD_BOT_TOKEN");
    if (!token) return responder("El bot no tiene su token configurado, así que no puedo mandar privados.");
    const cab = { "Authorization": `Bot ${token}`, "Content-Type": "application/json" };
    const firma = [quien.perfil.rango, quien.perfil.nombre].filter(Boolean).join(" ") || quien.perfil.usuario;
    const embed = {
      color: 0xf0c24d,
      title: asunto ? String(asunto).slice(0, 240) : `✉️ Mensaje de ${quien.org_nombre ?? "la unidad"}`,
      description: texto,
      footer: { text: `Enviado por ${firma} · Army de Wasco` },
    };

    const abrir = await fetch(`${API}/users/@me/channels`, {
      method: "POST", headers: cab, body: JSON.stringify({ recipient_id: destinoId }),
    });
    if (abrir.status === 403) return responder("Esa persona tiene cerrados los mensajes privados de miembros del servidor. Tendrás que mencionarla en un canal.");
    if (!abrir.ok) return responder(`Discord no dejó abrir la conversación (${abrir.status}).`);
    let canal: string | null = null;
    try { canal = (await abrir.json())?.id ?? null; } catch { /* sin id */ }
    if (!canal) return responder("Discord no devolvió la conversación privada.");

    const env = await fetch(`${API}/channels/${canal}/messages`, {
      method: "POST", headers: cab, body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
    });
    if (!env.ok) return responder(`No se pudo enviar (${env.status}).`);
    await admin.rpc("auditar_evento", {
      p_usuario_id: quien.perfil.id, p_accion: "mensaje_privado", p_tabla: "perfiles",
      p_registro: otro.perfil.usuario, p_detalle: { origen: "bot", titulo: embed.title },
    }).then(() => {}, () => {});
    return responder(`✅ Mensaje enviado a **${otro.perfil.nombre ?? otro.perfil.usuario}**.`);
  }

  // ---------------- /misreportes ----------------
  if (nombre === "misreportes") {
    const lista = (await consulta("misreportes") ?? []) as Array<Record<string, any>>;
    if (!lista.length) return responder("Todavía no has enviado ningún reporte.");
    const icono: Record<string, string> = { aprobado: "✅", pendiente: "⏳", devuelto: "↩️", rechazado: "❌" };
    return responderEmbed({
      color: 0xf0c24d, title: "📋 Tus últimos reportes",
      description: lista.map((r) =>
        `${icono[r.estado] ?? "•"} **${r.folio}** · ${r.formulario} · ${fecha(r.fecha)}` +
        (r.comentario && (r.estado === "devuelto" || r.estado === "rechazado") ? `\n   ↳ _${String(r.comentario).slice(0, 150)}_` : "")
      ).join("\n"),
      footer: { text: "Los devueltos se corrigen desde Mi cuenta → Mis reportes" },
    });
  }

  // ---------------- /pendientes ----------------
  if (nombre === "pendientes") {
    const lista = (await consulta("pendientes") ?? []) as Array<Record<string, any>>;
    if (!lista.length) return responder("No hay nada pendiente de revisar. 👏");
    return responderEmbed({
      color: 0xf0c24d, title: `⏳ Pendientes de revisión (${lista.length})`,
      description: lista.map((r) => `**${r.folio}** · ${r.formulario} · ${r.usuario} · ${fecha(r.fecha)}`).join("\n"),
    });
  }

  // ---------------- /turnos ----------------
  if (nombre === "turnos") {
    const lista = (await consulta("turnos") ?? []) as Array<Record<string, any>>;
    if (!lista.length) return responder("No hay turnos asignados esta semana.");
    return responderEmbed({
      color: 0xf0c24d, title: "🚔 Turnos de los próximos 7 días",
      description: lista.map((t) =>
        `${t.mio ? "**→ " : ""}${fecha(t.fecha)} · ${t.nombre ?? t.usuario}${t.mio ? " (tú)**" : ""}`).join("\n"),
    });
  }

  // ---------------- /ranking ----------------
  if (nombre === "ranking") {
    const lista = (await consulta("ranking") ?? []) as Array<Record<string, any>>;
    if (!lista.length) return responder("Todavía no hay datos para el ranking de este mes.");
    const medalla = ["🥇", "🥈", "🥉"];
    return responderEmbed({
      color: 0xf0c24d, title: "🏅 Ranking del mes en curso",
      description: lista.map((r, n2) =>
        `${medalla[n2] ?? `${n2 + 1}.`} **${r.nombre ?? r.usuario}** — ${r.reportes} reporte(s)` +
        (r.bajas ? ` · ${r.bajas} bajas` : "") + (r.patrullajes ? ` · ${r.patrullajes} patrullajes` : "")
      ).join("\n"),
      footer: { text: "Va del día 1 hasta hoy; las insignias se reparten al cerrar el mes" },
    });
  }

  // ---------------- /ruta ----------------
  if (nombre === "ruta") {
    const r = (await consulta("ruta") ?? {}) as Record<string, any>;
    if (!r || r.activa === false) return responder("La ruta de aprendizaje no está activa para ti.");
    const marcas = (r.marcas ?? {}) as Record<string, unknown>;
    const hechos = Object.values(marcas).filter(Boolean).length;
    return responderEmbed({
      color: 0xf0c24d, title: "🧭 Tu ruta de aprendizaje",
      description: [
        `**Pasos marcados:** ${hechos}`,
        `**Reportes:** ${r.reportes ?? 0} · aprobados ${r.aprobados ?? 0}`,
        `**Turnos cumplidos:** ${r.turnos_cumplidos ?? 0} de ${r.turnos_asignados ?? 0}`,
        r.firma ? "**Última etapa:** firmada ✅" : "**Última etapa:** pendiente de firma del liderazgo",
      ].join("\n"),
      footer: { text: "El detalle completo está en la página Ruta de aprendizaje" },
    });
  }

  // ---------------- /convocar ----------------
  if (nombre === "convocar") {
    const titulo = String(opcion(i, "titulo") ?? "").trim();
    const cuando = String(opcion(i, "cuando") ?? "").trim();   // AAAA-MM-DD HH:MM en hora del servidor
    const lugar = opcion(i, "lugar");
    const m = cuando.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
    if (!m) return responder("La fecha va así: `2026-11-01 20:00` (hora del servidor, UTC).");
    const inicia = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
    if (isNaN(inicia.getTime())) return responder("Esa fecha no existe. Compruébala.");
    if (inicia.getTime() < Date.now()) return responder("Esa fecha ya pasó.");
    const { data: r, error } = await admin.rpc("agenda_guardar_discord", {
      p_discord: quienId, p_titulo: titulo, p_lugar: lugar ? String(lugar) : null,
      p_inicia_en: inicia.toISOString(),
    });
    if (error) return responder(`No se pudo crear: ${error.message}`);
    if (!r?.ok) return responder("No se pudo crear el evento.");
    return responder(`📅 Evento **${titulo}** creado para <t:${Math.floor(inicia.getTime() / 1000)}:F>.\nEntra en la plataforma para elegir canales, convocados y publicarlo.`);
  }

  // ---------------- /anuncio ----------------
  if (nombre === "anuncio") {
    const titulo = String(opcion(i, "titulo") ?? "").trim();
    const texto = String(opcion(i, "texto") ?? "").trim();
    if (!titulo || !texto) return responder("Hacen falta el título y el texto.");
    const { data: r, error } = await admin.rpc("anuncio_guardar_discord",
      { p_discord: quienId, p_titulo: titulo, p_cuerpo: texto });
    if (error) return responder(`No se pudo publicar: ${error.message}`);
    if (!r?.ok) return responder("No se pudo publicar el anuncio.");
    return responder(`📣 Anuncio **${titulo}** publicado en el tablón${r.discord ? " y en Discord" : ""}.`);
  }

  return responder("Ese comando todavía no hace nada.");
});
