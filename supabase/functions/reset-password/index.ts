// Restablece la contraseña de OTRO usuario.
// Seguridad: la decisión la toma la base de datos (public.puedo_resetear) con la sesión de quien llama;
// solo si responde true se usa la clave de servicio para cambiar la contraseña.
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

  let body: { usuario_id?: string; password?: string };
  try { body = await req.json(); } catch { return json(400, { error: "Cuerpo inválido" }); }
  const { usuario_id, password } = body;
  if (!usuario_id || !password) return json(400, { error: "Faltan datos" });
  if (password.length < 8) return json(400, { error: "La contraseña debe tener al menos 8 caracteres" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1) ¿Quién llama y tiene derecho? (se evalúa con SU sesión, no con la de servicio)
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const caller = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: me } = await caller.auth.getUser();
  const callerId = me?.user?.id ?? null;
  const { data: ok, error: e1 } = await caller.rpc("puedo_resetear", { objetivo: usuario_id });
  if (e1) return json(401, { error: "Sesión inválida: " + e1.message });
  if (!ok) {
    await admin.rpc("auditar_evento", { p_usuario_id: callerId, p_accion: "reset_password_denegado", p_tabla: "auth", p_registro: usuario_id, p_detalle: {} });
    return json(403, { error: "No tienes permiso para restablecer la contraseña de este usuario" });
  }

  // 2) Cambio de contraseña con la clave de servicio (queda en auditoría)
  const { error: e2 } = await admin.auth.admin.updateUserById(usuario_id, { password });
  if (e2) return json(500, { error: e2.message });
  await admin.rpc("auditar_evento", { p_usuario_id: callerId, p_accion: "reset_password", p_tabla: "auth", p_registro: usuario_id, p_detalle: {} });
  return json(200, { ok: true });
});
