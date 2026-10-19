// Auditoría con IA de un reporte: lee la imagen exportada (con las capturas del juego incrustadas), la compara con
// los datos del formulario y devuelve un nivel de riesgo con hallazgos. Usa Gemini (nivel gratuito).
//
// Dos formas de llamarla:
//  - Interna (trigger de la base de datos vía pg_net): cabecera `x-pm-interno` = secretos.AUDITORIA_INTERNO.
//  - Con sesión (botón "Analizar" del panel): Authorization Bearer <jwt>; el reporte debe ser visible para quien llama
//    y, para forzar un reanálisis, hace falta el permiso aprobar_reportes.
// La clave de Gemini se toma de la variable GEMINI_API_KEY o, si no existe, de la tabla `secretos` (solo servicio).
// Nunca bloquea el envío de un reporte: si falla, el reporte queda "sin análisis" y se puede reintentar.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pm-interno",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Orden de respaldo: si uno da 404/429/503 (o tarda más de 45 s) se prueba el siguiente; máximo 3 intentos por análisis.
const MODELOS_RESPALDO = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];

const PISTAS: Record<string, string> = {
  bajas: "Reporte de bajas: `rows` lista las bajas (nombre, rango, motivo); solo cuentan las filas con nombre. El AUTOR debe ser quien actúa: sus macros de rol (/me, /do, '¡Fuego!', '¡Taser!', 'Amenaza confirmada') deben aparecer en el chat con SU nombre. Cada nombre declarado debe verse sobre un cuerpo abatido o en el kill feed.",
  patrullaje: "Fin de día / patrullaje: `horaIni`/`horaFin`, `integrantes` (nombres), `novedadesN`, fotos de salida y regreso. Quien actúa en el chat puede ser el autor o cualquiera de los integrantes declarados. El autor debe escribir horaIni/horaFin tal como aparecen en el HUD (HORA DEL SERVIDOR): la captura de salida debe mostrar una hora cercana a horaIni y la de regreso a horaFin (tolerancia de unos 15 minutos).",
  reclutamiento: "Reclutamiento: `nombre`/`rango` del reclutado y `ofNombre`/`ofRango` del oficial. La captura debe mostrar al reclutado (nombre en pantalla, uniforme, chat de aceptación) y el autor u oficial declarado debe aparecer como quien lo recluta.",
  "toma-territorio": "Toma de territorio: `integrantes`, `totalTomados` (AK tomados). Quien actúa puede ser el autor o cualquiera de los integrantes. La cantidad debe ser coherente con lo visible.",
};

const ESQUEMA = {
  type: "OBJECT",
  properties: {
    riesgo: { type: "STRING", enum: ["bajo", "medio", "alto"] },
    puntaje: { type: "INTEGER", description: "0 = sin indicios de falsedad, 100 = casi seguro falso" },
    resumen: { type: "STRING", description: "Dos frases en español para el revisor" },
    hallazgos: { type: "ARRAY", items: { type: "OBJECT", properties: {
      tipo: { type: "STRING", enum: ["coincidencia", "inconsistencia", "manipulacion", "reutilizacion", "legibilidad", "otro"] },
      gravedad: { type: "STRING", enum: ["info", "aviso", "grave"] },
      detalle: { type: "STRING" },
    }, required: ["tipo", "gravedad", "detalle"] } },
    texto_leido: { type: "ARRAY", items: { type: "STRING" }, description: "Fragmentos de texto legibles en las capturas del juego (nombres, cifras, horas, mensajes)" },
    huella: { type: "STRING", description: "Descripción corta y objetiva de las capturas del juego (escena, nombres visibles, hora del HUD, cifras) para detectar reutilización futura" },
    es_captura_del_juego: { type: "BOOLEAN" },
    verificaciones: { type: "OBJECT", properties: {
      actores_en_chat: { type: "ARRAY", items: { type: "STRING" }, description: "Nombres de los jugadores que envían las macros de rol o mensajes de acción en el chat de las capturas" },
      autor_en_pantalla: { type: "STRING", enum: ["si", "no", "no_determinable"], description: "¿El autor del reporte (o un integrante declarado, si aplica) es quien actúa en el chat?" },
      nombres_declarados_vistos: { type: "ARRAY", items: { type: "STRING" } },
      nombres_declarados_no_vistos: { type: "ARRAY", items: { type: "STRING" } },
      nombres_vistos_no_declarados: { type: "ARRAY", items: { type: "STRING" }, description: "Cuerpos/abatidos visibles que no están en el formulario" },
      horas_servidor: { type: "ARRAY", items: { type: "STRING" }, description: "Cada 'HORA DEL SERVIDOR' legible, tal cual (dd/mm hh:mm:ss)" },
      fecha_coherente: { type: "STRING", enum: ["si", "no", "no_determinable"], description: "¿Las horas del servidor caen en la fecha declarada (±1 día) y son coherentes entre sí?" },
      capturas_reutilizadas: { type: "BOOLEAN" },
      hud_visible: { type: "STRING", enum: ["si", "parcial", "no"], description: "¿Las capturas muestran la interfaz del juego (HUD con HORA DEL SERVIDOR y chat)? 'no' = parecen tomadas con la cámara del juego o están recortadas sin HUD" },
    }, required: ["actores_en_chat", "autor_en_pantalla", "nombres_declarados_vistos", "nombres_declarados_no_vistos", "nombres_vistos_no_declarados", "horas_servidor", "fecha_coherente", "capturas_reutilizadas", "hud_visible"] },
  },
  required: ["riesgo", "puntaje", "resumen", "hallazgos", "texto_leido", "huella", "es_captura_del_juego", "verificaciones"],
};

function b64(bytes: Uint8Array): string {
  let s = ""; const paso = 0x8000;
  for (let i = 0; i < bytes.length; i += paso) s += String.fromCharCode(...bytes.subarray(i, i + paso));
  return btoa(s);
}
async function sha256(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function gemini(clave: string, modelos: string[], partes: unknown[]): Promise<{ modelo: string; salida: Record<string, unknown>; fallidos: string[] }> {
  const errores: string[] = [];
  for (const modelo of modelos) {
    let r: Response;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": clave }, signal: AbortSignal.timeout(45000),
        body: JSON.stringify({ contents: [{ role: "user", parts: partes }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: ESQUEMA } }),
      });
    } catch (e) { errores.push(`${modelo}: ${(e as Error).name === "TimeoutError" ? "sin respuesta en 45 s" : (e as Error).message}`); continue; }
    if (r.status === 404 || r.status === 429 || r.status === 503 || r.status === 400) { errores.push(`${modelo}: ${r.status} ${(await r.text()).replace(/\s+/g, " ").slice(0, 220)}`); continue; }
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = await r.json();
    const texto = d?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    if (!texto) throw new Error(`Gemini sin respuesta (${d?.promptFeedback?.blockReason ?? d?.candidates?.[0]?.finishReason ?? "vacío"})`);
    try { return { modelo, salida: JSON.parse(texto), fallidos: errores }; } catch { throw new Error("Gemini devolvió un JSON inválido"); }
  }
  throw new Error("Ningún modelo disponible · " + errores.join(" · "));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Método no permitido" });
  let body: { reporte_id?: number; forzar?: boolean };
  try { body = await req.json(); } catch { return json(400, { error: "Cuerpo inválido" }); }
  const id = Number(body.reporte_id); if (!id) return json(400, { error: "Falta reporte_id" });

  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: secretos } = await admin.from("secretos").select("clave, valor").in("clave", ["GEMINI_API_KEY", "AUDITORIA_INTERNO"]);
  const sec = Object.fromEntries((secretos ?? []).map((s: { clave: string; valor: string }) => [s.clave, s.valor]));

  // ---- Quién llama ----
  let llamante: string | null = null; let interno = false;
  const tokenInterno = req.headers.get("x-pm-interno");
  if (tokenInterno && sec.AUDITORIA_INTERNO && tokenInterno === sec.AUDITORIA_INTERNO) interno = true;
  else {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json(401, { error: "Sin sesión" });
    const caller = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: me } = await caller.auth.getUser();
    if (!me?.user) return json(401, { error: "Sesión inválida" });
    llamante = me.user.id;
    const { data: visible } = await caller.from("reportes_vista").select("id").eq("id", id).maybeSingle();
    if (!visible) return json(403, { error: "Reporte no accesible" });
    if (body.forzar) { const { data: ok } = await caller.rpc("tengo_permiso", { p: "aprobar_reportes" }); if (!ok) return json(403, { error: "Solo un revisor puede reanalizar" }); }
  }

  // ---- Configuración ----
  const { data: cfgFila } = await admin.from("configuracion").select("valor").eq("clave", "auditoria_ia").maybeSingle();
  const cfg = (cfgFila?.valor ?? {}) as { activo?: boolean; modelo?: string };
  if (cfg.activo === false && !body.forzar) return json(200, { ok: false, motivo: "desactivado" });
  const clave = Deno.env.get("GEMINI_API_KEY") || sec.GEMINI_API_KEY;
  if (!clave) return json(500, { error: "Falta la clave de Gemini (GEMINI_API_KEY)" });
  const modelos = ([...new Set([cfg.modelo, ...MODELOS_RESPALDO].filter(Boolean))] as string[]).slice(0, 3);

  // ---- Reporte ----
  const { data: r } = await admin.from("reportes_vista").select("*").eq("id", id).maybeSingle();
  if (!r) return json(404, { error: "Reporte no encontrado" });
  if (!r.imagen_path) return json(400, { error: "El reporte aún no tiene imagen" });
  if (r.auditoria_ia && !r.auditoria_ia.error && !body.forzar) return json(200, { ok: true, repetido: true, auditoria: r.auditoria_ia });

  const { data: file, error: e3 } = await admin.storage.from("reportes").download(r.imagen_path);
  if (e3 || !file) return json(500, { error: "No se pudo leer la imagen" });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = await sha256(bytes);
  const ext = (r.imagen_path.split(".").pop() || "png").toLowerCase();
  const mime = ext === "webp" ? "image/webp" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";

  // Huellas de reportes anteriores del mismo autor y formulario (para detectar capturas reutilizadas)
  const { data: previos } = await admin.from("reportes").select("id, folio_v2, fecha, auditoria_ia").eq("usuario_id", r.usuario_id).eq("formulario_id", r.formulario_id)
    .neq("id", id).not("auditoria_ia", "is", null).order("id", { ascending: false }).limit(12);
  const huellas = (previos ?? []).filter((p) => p.auditoria_ia?.huella).map((p) => `- ${p.folio_v2} (${p.fecha}): ${String(p.auditoria_ia.huella).slice(0, 300)}`);
  const { data: mismoHash } = await admin.from("reportes").select("folio_v2").eq("imagen_hash", hash).neq("id", id).limit(3);

  const datos = { ...(r.datos ?? {}) };
  delete (datos as Record<string, unknown>).fotos;
  const autorNombre = String(r.usuario_nombre || datos.nombre || r.usuario || "").trim();
  const autorEtiqueta = [datos.rango || r.usuario_rango, autorNombre].filter(Boolean).join(" ");
  const integrantes = Array.isArray(datos.integrantes) ? (datos.integrantes as unknown[]).map(String).filter(Boolean) : [];
  const declarados: string[] = r.formulario_id === "bajas" && Array.isArray(datos.rows) ? (datos.rows as { nombre?: string }[]).map((x) => String(x.nombre || "").trim()).filter(Boolean)
    : r.formulario_id === "reclutamiento" ? [String(datos.nombre || "")].filter(Boolean) : [];
  const enviadoBogota = new Date(r.creado_en).toLocaleString("es-CO", { timeZone: "America/Bogota", hour12: false });
  const prompt = `Eres auditor de reportes de un clan de rol (RP) del videojuego One State RP. Los miembros envían reportes con capturas de pantalla del juego como evidencia.
La imagen adjunta es el REPORTE EXPORTADO: una ficha con los datos que escribió el autor y, dentro de ella, las capturas del juego que adjuntó.
En las capturas suele verse: el HUD con "HORA DEL SERVIDOR: dd/mm hh:mm:ss" y el saldo, el chat con mensajes de rol (macros) precedidos por el nombre del jugador que los envía, y los nombres de los jugadores sobre sus personajes (los abatidos aparecen tendidos con su nombre encima).

COMPROBACIONES OBLIGATORIAS (responde cada una en "verificaciones" y refleja las fallas en "hallazgos"):
1. AUTOR EN PANTALLA. El autor del reporte es "${autorEtiqueta}" (usuario ${r.usuario}). Lista los nombres que envían las macros/mensajes de acción en el chat. ${integrantes.length ? `En este formulario también vale cualquiera de los integrantes declarados: ${integrantes.join(", ")}.` : "En este formulario el autor debe ser quien actúa."} Si quien actúa es otra persona, la evidencia es de otro jugador: autor_en_pantalla = "no" y hallazgo grave de tipo "inconsistencia". Si no hay chat legible, "no_determinable".
2. NOMBRES DECLARADOS. ${declarados.length ? `El formulario declara: ${declarados.join(", ")}. Indica cuáles se ven (sobre un cuerpo o en el kill feed) y cuáles no.` : "Compara los nombres que declara el formulario con los visibles."} Nombres vistos que no fueron declarados también se anotan.
3. HORA DEL SERVIDOR. Transcribe cada "HORA DEL SERVIDOR" legible (dd/mm hh:mm:ss). REGLA DEL CLAN: el autor debe declarar la fecha y las horas TAL COMO aparecen en el HUD de sus capturas, no las de su reloj. La fecha declarada es ${r.fecha} (el reporte se envió el ${enviadoBogota}, hora de Colombia; el envío puede ser horas o incluso un día después de la captura, eso es normal). Es inconsistencia (fecha_coherente = "no" + hallazgo "inconsistencia") si: la fecha del HUD no coincide con la declarada; las capturas de un mismo reporte tienen fechas de servidor distintas; o, en patrullaje, horaIni/horaFin se alejan más de ~15 minutos de las horas del HUD de salida y regreso. Si no hay hora legible, "no_determinable".
4. REUTILIZACIÓN. Compara con las huellas de reportes anteriores: mismas horas de servidor, mismos saldos o misma escena = capturas_reutilizadas = true y hallazgo grave de tipo "reutilizacion".
5. AUTENTICIDAD. Imagen que no es del juego, montaje, texto superpuesto, recortes, foto de otra pantalla, borrosa o ilegible: hallazgo de tipo "manipulacion" o "legibilidad".
6. HUD VISIBLE. Las capturas deben ser pantallazos del dispositivo con la interfaz completa del juego (HUD con "HORA DEL SERVIDOR", saldo, minimapa y chat). Una "foto" tomada con la cámara interna del juego muestra solo la escena, sin HUD ni chat, y no sirve como evidencia: hud_visible = "no" y hallazgo de tipo "legibilidad" indicando que debe subir un pantallazo del celular o PC. "parcial" si alguna captura lo muestra y otra no.

Riesgo global: "alto" si falla 1, 4 o hay manipulación clara; "medio" si falla 2, 3 o 6, o si algo no se puede verificar; "bajo" solo si todo se verifica. Sé concreto. Responde en español, en el JSON indicado.

Formulario: ${r.formulario} (${r.formulario_id}). Folio ${r.folio}. Fecha declarada: ${r.fecha}. Autor: ${autorEtiqueta}.
${PISTAS[r.formulario_id] ?? "Comprueba que las capturas respalden lo declarado."}
DATOS del formulario (JSON): ${JSON.stringify(datos).slice(0, 6000)}
${huellas.length ? `Huellas de capturas de reportes ANTERIORES del mismo autor:\n${huellas.join("\n")}` : "No hay reportes anteriores del autor con huella registrada."}
${mismoHash?.length ? `AVISO: el archivo de imagen es idéntico al de ${mismoHash.map((m) => m.folio_v2).join(", ")}.` : ""}`;

  let salida: Record<string, unknown>, modelo: string, fallidos: string[];
  try { ({ salida, modelo, fallidos } = await gemini(clave, modelos, [{ text: prompt }, { inlineData: { mimeType: mime, data: b64(bytes) } }])); }
  catch (e) {
    const msg = (e as Error).message;
    await admin.from("reportes").update({ auditoria_ia: { error: msg, en: new Date().toISOString() }, imagen_hash: hash }).eq("id", id);
    return json(502, { error: msg });
  }
  // Escalado por reglas: las comprobaciones objetivas mandan sobre el veredicto libre del modelo.
  const v = (salida.verificaciones ?? {}) as { autor_en_pantalla?: string; nombres_declarados_no_vistos?: string[]; fecha_coherente?: string; capturas_reutilizadas?: boolean; hud_visible?: string };
  const nivel: Record<string, number> = { bajo: 0, medio: 1, alto: 2 }; const nombre = ["bajo", "medio", "alto"];
  let n = nivel[String(salida.riesgo)] ?? 1; const motivos: string[] = [];
  if (v.autor_en_pantalla === "no") { n = Math.max(n, 2); motivos.push("quien actúa en el chat no es el autor del reporte"); }
  if (v.capturas_reutilizadas === true || (mismoHash?.length ?? 0) > 0) { n = Math.max(n, 2); motivos.push("capturas reutilizadas de otro reporte"); }
  if (salida.es_captura_del_juego === false) { n = Math.max(n, 2); motivos.push("la imagen no parece una captura del juego"); }
  if ((v.nombres_declarados_no_vistos?.length ?? 0) > 0) { n = Math.max(n, 1); motivos.push(`nombres declarados que no se ven: ${v.nombres_declarados_no_vistos!.join(", ")}`); }
  if (v.fecha_coherente === "no") { n = Math.max(n, 1); motivos.push("la hora del servidor no coincide con la fecha declarada"); }
  if (v.hud_visible === "no") { n = Math.max(n, 1); motivos.push("las capturas no muestran el HUD ni el chat (foto de la cámara del juego o recorte): debe subir pantallazos del celular o PC"); }
  if (v.hud_visible === "parcial") { n = Math.max(n, 1); motivos.push("alguna captura no muestra el HUD ni el chat"); }
  if (v.autor_en_pantalla === "no_determinable" || v.fecha_coherente === "no_determinable") { n = Math.max(n, 1); }
  const puntajeMin = [0, 40, 75][n];
  const auditoria = { ...salida, riesgo: nombre[n], puntaje: Math.max(Number(salida.puntaje) || 0, puntajeMin), reglas: motivos, modelo, modelos_fallidos: fallidos, en: new Date().toISOString(), version: 2, forzado: !!body.forzar };
  const { error: e4 } = await admin.from("reportes").update({ auditoria_ia: auditoria, imagen_hash: hash }).eq("id", id);
  if (e4) return json(500, { error: "No se pudo guardar el análisis: " + e4.message });
  await admin.rpc("auditar_evento", { p_usuario_id: llamante ?? r.usuario_id, p_accion: "auditoria_ia", p_tabla: "reportes", p_registro: r.folio,
    p_detalle: { riesgo: auditoria.riesgo, puntaje: auditoria.puntaje, modelo, origen: interno ? "automatica" : (body.forzar ? "reanalisis" : "manual") } }).then(() => {}, () => {});
  return json(200, { ok: true, auditoria });
});
