// Formulario PÚBLICO de solicitud de acceso (acceso.html). Único punto de entrada sin sesión.
//
// Reglas que esta función no rompe nunca:
//   · No guarda la solicitud en ninguna parte: lee los tres campos, los manda a Discord y los olvida.
//   · No toca ninguna tabla del entorno interno. Solo llama a solicitud_permitida(), que decide si
//     esa IP ya gastó su envío del día y devuelve el webhook del canal.
//   · El webhook jamás sale al navegador.
//   · Sin Turnstile verificado contra Cloudflare no se envía nada. Si falta el secreto, no envía nada.
//
// Cuerpo: { org, nombre, rango, unidad, token }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGENES = ["https://pmwasco.zylarion.io"];
const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": ORIGENES.includes(origin ?? "") ? origin! : ORIGENES[0],
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const json = (origin: string | null, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });

// Deja el texto en algo que no puede hacer daño dentro de Discord: sin menciones, sin enlaces,
// sin marcas de formato, sin saltos de línea y con un tope de largo.
const INVISIBLES = new Set([0x00ad, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029, 0x2060, 0xfeff]);
function limpiar(v: unknown, max: number): string {
  let t = "";
  for (const ch of String(v ?? "").normalize("NFC")) {        // fuera caracteres de control e invisibles
    const c = ch.codePointAt(0) as number;
    t += (c < 32 || c === 127 || INVISIBLES.has(c)) ? " " : ch;
  }
  return t
    .replace(/https?:\/\/\S+|www\.\S+|discord\.gg\/\S+/gi, "")   // nada de enlaces
    .replace(/[@<>`*_~|\\]/g, "")                                // ni menciones ni formato
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json(origin, 405, { error: "Método no permitido" });

  // Si existe un widget propio para este formulario se usa ese; si no, el mismo del login.
  const secretoTS = Deno.env.get("TURNSTILE_SECRET_ACCESO") || Deno.env.get("TURNSTILE_SECRET_KEY") || "";
  if (!secretoTS) return json(origin, 503, { error: "El formulario todavía no está habilitado." });

  // Cuerpo pequeño: nada de cargas grandes
  const crudo = await req.text();
  if (crudo.length > 2000) return json(origin, 413, { error: "Solicitud demasiado grande." });
  let body: Record<string, unknown>;
  try { body = JSON.parse(crudo); } catch { return json(origin, 400, { error: "Solicitud inválida." }); }

  const org = String(body.org ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20);
  const nombre = limpiar(body.nombre, 60);
  const rango = limpiar(body.rango, 40);
  const unidad = limpiar(body.unidad, 60);
  const token = String(body.token ?? "").slice(0, 2048);
  if (!org) return json(origin, 400, { error: "Falta la unidad de destino." });
  if (nombre.length < 3 || rango.length < 2 || unidad.length < 2) {
    return json(origin, 400, { error: "Completa los tres campos con datos reales." });
  }
  if (!token) return json(origin, 400, { error: "Confirma que no eres un robot." });

  // ---- Turnstile: lo valida Cloudflare, no nosotros. El token sirve una sola vez. ----
  const ip = req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const form = new FormData();
  form.append("secret", secretoTS);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  // No basta con que el token sea válido: tiene que venir de ESTA página y de ESTE formulario.
  // Así, un token resuelto en el login no sirve aquí aunque el widget sea el mismo.
  let ok = false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const v = r.ok ? await r.json() : null;
    ok = !!v?.success && v.action === "solicitud-acceso" && ORIGENES.includes("https://" + String(v.hostname ?? ""));
  } catch { ok = false; }
  if (!ok) return json(origin, 403, { error: "No pudimos comprobar que eres una persona. Vuelve a intentarlo." });

  // ---- Un envío por día y por IP; el webhook sale de aquí y no se expone ----
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: permiso, error } = await admin.rpc("solicitud_permitida", { p_org: org, p_ip: ip || "sin-ip" });
  if (error) return json(origin, 500, { error: "No se pudo procesar la solicitud." });
  const p = permiso as { ok?: boolean; motivo?: string; webhook?: string; org_nombre?: string };
  if (!p?.ok) {
    if (p?.motivo === "limite") return json(origin, 429, { error: "Ya enviaste una solicitud hoy. Si fue un error, escríbele al liderazgo por Discord." });
    return json(origin, 404, { error: "Esa unidad no está recibiendo solicitudes ahora mismo." });
  }

  const payload = {
    username: `${p.org_nombre} · Solicitudes`,
    allowed_mentions: { parse: [] },                       // ningún @everyone, ninguna mención
    embeds: [{
      title: "✋ Solicitud de acceso a la plataforma",
      description: "Llegó desde el formulario público. Nadie verificó estos datos: confírmalos antes de crear la cuenta.",
      color: 0xf0c24d,
      fields: [
        { name: "Nombre", value: nombre, inline: false },
        { name: "Rango", value: rango, inline: true },
        { name: "Unidad", value: unidad, inline: true },
      ],
      footer: { text: "Formulario público · no se guardó ningún dato" },
      timestamp: new Date().toISOString(),
    }],
  };
  try {
    const r = await fetch(p.webhook!, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!r.ok) return json(origin, 502, { error: "No se pudo entregar la solicitud. Inténtalo más tarde." });
  } catch { return json(origin, 502, { error: "No se pudo entregar la solicitud. Inténtalo más tarde." }); }

  return json(origin, 200, { ok: true });
});
