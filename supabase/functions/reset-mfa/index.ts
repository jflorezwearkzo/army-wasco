// Quita la verificación en dos pasos (todos los factores MFA) de OTRO usuario.
// Seguridad: solo el rol Administrador (public.soy_superadmin con la sesión de quien llama); luego se usa la clave de servicio.
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
  let body: { usuario_id?: string; consultar?: boolean };
  try { body = await req.json(); } catch { return json(400, { error: "Cuerpo inválido" }); }
  const { usuario_id } = body;
  if (!usuario_id) return json(400, { error: "Falta usuario_id" });

  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const caller = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: me } = await caller.auth.getUser();
  if (!me?.user) return json(401, { error: "Sesión inválida" });
  const { data: ok } = await caller.rpc("soy_superadmin");
  if (!ok) return json(403, { error: "Solo el Administrador puede restablecer la verificación en dos pasos" });
  if (usuario_id === me.user.id && !body.consultar) return json(400, { error: "Tu propia verificación la quitas desde Mi cuenta" });

  const { data: lista, error: e1 } = await admin.auth.admin.mfa.listFactors({ userId: usuario_id });
  if (e1) return json(500, { error: "No se pudieron consultar los factores: " + e1.message });
  const factores = lista?.factors ?? [];
  if (body.consultar) return json(200, { ok: true, factores: factores.length, verificados: factores.filter((f) => f.status === "verified").length });
  let quitados = 0;
  for (const f of factores) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: usuario_id });
    if (error) return json(500, { error: "No se pudo quitar un factor: " + error.message, quitados });
    quitados++;
  }
  const { data: perfil } = await admin.from("perfiles").select("usuario").eq("id", usuario_id).maybeSingle();
  await admin.rpc("auditar_evento", { p_usuario_id: me.user.id, p_accion: "mfa_reset", p_tabla: "auth", p_registro: perfil?.usuario ?? usuario_id, p_detalle: { factores_quitados: quitados } }).then(() => {}, () => {});
  return json(200, { ok: true, quitados });
});
