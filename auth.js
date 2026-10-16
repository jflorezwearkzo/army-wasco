// Módulo compartido de autenticación y permisos.
// Uso en una página:  import { requerir, barraUsuario } from '<ruta>/auth.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, DOMINIO_USUARIOS } from './config.js';

export const configurado = !SUPABASE_URL.includes('TU-PROYECTO') && SUPABASE_ANON_KEY !== 'TU_ANON_KEY';
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

// Raíz del sitio (funciona en GitHub Pages /army-wasco/ y en local)
export const RAIZ = new URL('./', import.meta.url).href;
export const RANGOS = ['Sargento Primero','Sargento Mayor','Teniente','Capitán','Mayor','Coronel','Mayor General','Teniente General','Coronel General','FG Adjunto','FG'];
// "Capitán Javier Flórez": rango + nombre (o el usuario si no hay nombre)
export const nombreCompleto = p => [p.rango, p.nombre || p.usuario].filter(Boolean).join(' ');
export const emailDe = usuario => `${usuario.trim().toLowerCase()}@${DOMINIO_USUARIOS}`;

export async function iniciarSesion(usuario, password){
  const { error } = await sb.auth.signInWithPassword({ email: emailDe(usuario), password });
  if(error) throw new Error(traducir(error.message));
  const yo = await cargarYo();
  if(!yo || !yo.activo){ await sb.auth.signOut(); throw new Error('Tu cuenta aún no está activa. Pide al administrador que la active.'); }
  return yo;
}
export async function cerrarSesion(){ await sb.auth.signOut(); location.href = RAIZ + 'login.html'; }

// Devuelve {id, usuario, nombre, activo, rol:{id,nombre,permisos,formularios}} o null
export async function cargarYo(){
  const { data:{ session } } = await sb.auth.getSession();
  if(!session) return null;
  const { data: p } = await sb.from('perfiles').select('id,usuario,nombre,rango,activo,rol_id').eq('id', session.user.id).maybeSingle();
  if(!p) return null;
  let rol = null;
  if(p.rol_id){ const { data: r } = await sb.from('roles').select('id,nombre,permisos,formularios,rango_pm,protegido').eq('id', p.rol_id).maybeSingle(); rol = r; }
  return { ...p, rol: rol || { id:null, nombre:'Sin rol', permisos:{}, formularios:[], rango_pm:null } };
}
export const tiene = (yo, permiso) => !!(yo && yo.rol && yo.rol.permisos && yo.rol.permisos[permiso]);
export const puedeFormulario = (yo, id) => !!(yo && yo.rol && (yo.rol.formularios.includes('*') || yo.rol.formularios.includes(id)));
export const esSuperadmin = yo => !!(yo && yo.rol && yo.rol.protegido);
export const esAdminDeAlgo = yo => ['usuarios','asignar_roles','reset_password','crear_roles','crear_reportes','gestion_reportes','historial'].some(p => tiene(yo,p));

// Exige sesión activa; opcionalmente un permiso o un formulario. Redirige a login si no cumple.
export async function requerir({ permiso=null, formulario=null } = {}){
  if(!configurado){ document.body.innerHTML = aviso('Falta configurar <code>config.js</code> con la URL y la clave pública de Supabase.'); throw new Error('sin config'); }
  const yo = await cargarYo();
  if(!yo || !yo.activo){ location.replace(RAIZ + 'login.html?next=' + encodeURIComponent(location.href)); throw new Error('sin sesión'); }
  if(permiso && !tiene(yo, permiso)){ document.body.innerHTML = aviso('No tienes permiso para ver esta sección.'); throw new Error('sin permiso'); }
  if(formulario && !puedeFormulario(yo, formulario)){ document.body.innerHTML = aviso('Tu rol no tiene acceso a este formulario.'); throw new Error('sin acceso'); }
  return yo;
}
function aviso(html){
  return `<div style="font-family:Arial,sans-serif;color:#f3f3f3;background:#0b1216;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;text-align:center">
    <div><p style="font-size:18px">${html}</p><a href="${RAIZ}" style="color:#f0c24d">Volver al inicio</a></div></div>`;
}

// Barra superior con usuario, rol, enlaces y salir. Se inserta al inicio de <body>.
export function barraUsuario(yo){
  const b = document.createElement('div');
  b.style.cssText = 'display:flex;gap:14px;align-items:center;justify-content:flex-end;padding:8px 20px;background:#07100f;border-bottom:1px solid #1c272c;font:13px "Roboto Condensed",Arial,sans-serif;color:#9aa7ad';
  b.innerHTML = `<span style="margin-right:auto"><a href="${RAIZ}" style="color:#9aa7ad;text-decoration:none">Inicio</a></span>
    <span>👤 <b style="color:#f3f3f3">${esc(nombreCompleto(yo))}</b> · ${esc(yo.rol.nombre)}</span>
    ${esAdminDeAlgo(yo) ? `<a href="${RAIZ}admin/" style="color:#f0c24d;text-decoration:none">Administración</a>` : ''}
    <a href="${RAIZ}cuenta.html" style="color:#9aa7ad;text-decoration:none">Mi cuenta</a>
    <a href="#" id="btnSalir" style="color:#9aa7ad;text-decoration:none">Salir</a>`;
  b.querySelector('#btnSalir').onclick = e => { e.preventDefault(); cerrarSesion(); };
  document.body.prepend(b);
}

// Guarda un reporte exportado (datos + PNG) en el historial. Devuelve el id o lanza error.
export async function guardarReporte({ yo, formularioId, fecha, resumen, datos, pngBlob }){
  const path = `${yo.id}/${formularioId}-${Date.now()}.png`;
  const { error: e1 } = await sb.storage.from('reportes').upload(path, pngBlob, { contentType:'image/png', upsert:false });
  if(e1) throw new Error('No se pudo subir la imagen: ' + e1.message);
  const { data, error: e2 } = await sb.from('reportes')
    .insert({ formulario_id: formularioId, usuario_id: yo.id, fecha: fecha || null, resumen, datos, imagen_path: path })
    .select('id').single();
  if(e2) throw new Error('No se pudo guardar el registro: ' + e2.message);
  return data.id;
}
export async function urlImagen(path){
  const { data, error } = await sb.storage.from('reportes').createSignedUrl(path, 3600);
  if(error) throw new Error(error.message);
  return data.signedUrl;
}

// Favicon dinámico: un emoji como icono de pestaña
export function faviconEmoji(emoji){
  if(!emoji) return;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b1216"/><rect x="2" y="2" width="60" height="60" rx="12" fill="none" stroke="#c9a43a" stroke-width="2"/><text x="32" y="44" text-anchor="middle" font-size="36">${emoji}</text></svg>`;
  let l=document.querySelector('link[rel="icon"]'); if(!l){ l=document.createElement('link'); l.rel='icon'; document.head.appendChild(l); }
  l.type='image/svg+xml'; l.href='data:image/svg+xml,'+encodeURIComponent(svg);
}
export function hoyISO(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function traducir(m){
  if(/invalid login credentials/i.test(m)) return 'Usuario o contraseña incorrectos.';
  if(/rate limit/i.test(m)) return 'Demasiados intentos. Espera un momento.';
  return m;
}
