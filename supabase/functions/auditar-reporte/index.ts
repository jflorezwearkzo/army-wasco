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

const MODELOS_RESPALDO = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite"];

const PISTAS: Record<string, string> = {
  bajas: "Reporte de bajas: `rows` lista las bajas (nombre, rango, motivo); solo cuentan las filas con nombre. Comprueba que las capturas muestren evidencia de esas bajas (kill feed, nombres, cantidad).",
  patrullaje: "Fin de día / patrullaje: `horaIni`/`horaFin`, `integrantes` (nombres), `novedadesN`, fotos de salida y regreso. Comprueba que las capturas correspondan a salida y regreso, que la hora del HUD sea coherente con horaIni/horaFin y que aparezcan los integrantes.",
  reclutamiento: "Reclutamiento: `nombre`/`rango` del reclutado y `ofNombre`/`ofRango` del oficial. Comprueba que la captura muestre al reclutado (nombre en pantalla, uniforme, chat de aceptación).",
  "toma-territorio": "Toma de territorio: `integrantes`, `totalTomados` (AK tomados). Comprueba que las capturas muestren la toma y que la cantidad sea coherente.",
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
  },
  required: ["riesgo", "puntaje", "resumen", "hallazgos", "texto_leido", "huella", "es_captura_del_juego"],
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

async function gemini(clave: string, modelos: string[], partes: unknown[]): Promise<{ modelo: string; salida: Record<string, unknown> }> {
  let ultimo = "";
  for (const modelo of modelos) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": clave },
      body: JSON.stringify({ contents: [{ role: "user", parts: partes }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: ESQUEMA } }),
    });
    if (r.status === 404 || r.status === 429 || r.status === 503 || r.status === 400) { ultimo = `${modelo}: ${r.status} ${(await r.text()).slice(0, 160)}`; continue; }
    if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = await r.json();
    const texto = d?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    if (!texto) throw new Error(`Gemini sin respuesta (${d?.promptFeedback?.blockReason ?? d?.candidates?.[0]?.finishReason ?? "vacío"})`);
    try { return { modelo, salida: JSON.parse(texto) }; } catch { throw new Error("Gemini devolvió un JSON inválido"); }
  }
  throw new Error("Ningún modelo disponible: " + ultimo);
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
  const modelos = [...new Set([cfg.modelo, ...MODELOS_RESPALDO].filter(Boolean))] as string[];

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
  const prompt = `Eres auditor de reportes de un clan de rol (RP) del videojuego One State RP. Los miembros envían reportes con capturas de pantalla del juego como evidencia.
La imagen adjunta es el REPORTE EXPORTADO: una ficha con los datos que escribió el autor y, dentro de ella, las capturas del juego que adjuntó.
Tu tarea: (1) leer el texto legible en las capturas del juego (nombres de jugadores, cifras, horas del HUD, mensajes de chat, kill feed);
(2) comparar esas capturas con los DATOS del formulario y señalar coincidencias e inconsistencias;
(3) detectar indicios de falsedad: imágenes que no son del juego, montajes, texto superpuesto, recortes sospechosos, fotos de otra pantalla, capturas borrosas o ilegibles, o capturas reutilizadas de reportes anteriores;
(4) dar un riesgo global. Sé concreto y prudente: "bajo" si la evidencia respalda el reporte; "medio" si hay dudas o no se puede verificar; "alto" solo con indicios claros de falsedad.
Responde en español, en el JSON indicado.

Formulario: ${r.formulario} (${r.formulario_id}). Folio ${r.folio}. Fecha declarada: ${r.fecha}. Autor: ${[r.usuario_rango, r.usuario_nombre || r.usuario].filter(Boolean).join(" ")}.
${PISTAS[r.formulario_id] ?? "Comprueba que las capturas respalden lo declarado."}
DATOS del formulario (JSON): ${JSON.stringify(datos).slice(0, 6000)}
${huellas.length ? `Huellas de capturas de reportes ANTERIORES del mismo autor (si las capturas actuales parecen las mismas, es reutilización):\n${huellas.join("\n")}` : "No hay reportes anteriores del autor con huella registrada."}
${mismoHash?.length ? `AVISO: el archivo de imagen es idéntico al de ${mismoHash.map((m) => m.folio_v2).join(", ")}.` : ""}`;

  let salida: Record<string, unknown>, modelo: string;
  try { ({ salida, modelo } = await gemini(clave, modelos, [{ text: prompt }, { inlineData: { mimeType: mime, data: b64(bytes) } }])); }
  catch (e) {
    const msg = (e as Error).message;
    await admin.from("reportes").update({ auditoria_ia: { error: msg, en: new Date().toISOString() }, imagen_hash: hash }).eq("id", id);
    return json(502, { error: msg });
  }
  const auditoria = { ...salida, modelo, en: new Date().toISOString(), version: 1, forzado: !!body.forzar };
  const { error: e4 } = await admin.from("reportes").update({ auditoria_ia: auditoria, imagen_hash: hash }).eq("id", id);
  if (e4) return json(500, { error: "No se pudo guardar el análisis: " + e4.message });
  await admin.rpc("auditar_evento", { p_usuario_id: llamante ?? r.usuario_id, p_accion: "auditoria_ia", p_tabla: "reportes", p_registro: r.folio,
    p_detalle: { riesgo: auditoria.riesgo, puntaje: auditoria.puntaje, modelo, origen: interno ? "automatica" : (body.forzar ? "reanalisis" : "manual") } }).then(() => {}, () => {});
  return json(200, { ok: true, auditoria });
});
