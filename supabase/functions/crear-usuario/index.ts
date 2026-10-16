// Crea un usuario (cuenta de auth) para el panel de administración.
// Seguridad: exige sesión con permiso "usuarios" (verificado en la base de datos). Usa la clave de servicio,
// por lo que no pasa por captcha ni por el registro público. El perfil lo crea el trigger (inactivo, sin rol);
// el panel lo completa después con nombre, rango, rol y estado según los permisos del gestor.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const DOMINIO = "armywasco.local";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Método no permitido" });
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "Sin sesión" });

  let body: { usuario?: string; nombre?: string; password?: string };
  try { body = await req.json(); } catch { return json(400, { error: "Cuerpo inválido" }); }
  const usuario = String(body.usuario ?? "").trim().toLowerCase();
  const nombre = String(body.nombre ?? "").trim();
  const password = String(body.password ?? "");
  if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) return json(400, { error: "Usuario inválido (3-30 caracteres: minúsculas, números, punto, guion)" });
  if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password))
    return json(400, { error: "La contraseña debe tener mínimo 8 caracteres, con mayúscula, minúscula, número y símbolo" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const caller = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: me } = await caller.auth.getUser();
  if (!me?.user) return json(401, { error: "Sesión inválida" });
  const { data: ok, error: e1 } = await caller.rpc("tengo_permiso", { p: "usuarios" });
  if (e1) return json(401, { error: e1.message });
  if (!ok) return json(403, { error: "No tienes permiso para crear usuarios" });

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.createUser({
    email: `${usuario}@${DOMINIO}`, password, email_confirm: true, user_metadata: { usuario, nombre },
  });
  if (error) {
    const m = /already|exists|registered/i.test(error.message) ? "Ya existe un usuario con ese nombre" : error.message;
    return json(400, { error: m });
  }
  await admin.rpc("auditar_evento", { p_usuario_id: me.user.id, p_accion: "crear_usuario", p_tabla: "auth", p_registro: usuario, p_detalle: { nombre } });
  return json(200, { ok: true, id: data.user.id });
});
