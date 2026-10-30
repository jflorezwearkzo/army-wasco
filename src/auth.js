// Módulo compartido de autenticación y permisos.
// Uso en una página:  import { requerir, barraUsuario } from '<ruta>/auth.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, DOMINIO_USUARIOS, TURNSTILE_SITE_KEY } from './config.js';
export { TURNSTILE_SITE_KEY };

export const configurado = !SUPABASE_URL.includes('TU-PROYECTO') && SUPABASE_ANON_KEY !== 'TU_ANON_KEY';
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

// Raíz del sitio (funciona en GitHub Pages /army-wasco/ y en local)
export const RAIZ = new URL('../', import.meta.url).href;   // auth.js vive en js/
export const RANGOS = ['Sargento Primero','Sargento Mayor','Teniente','Capitán','Mayor','Coronel','Mayor General','Teniente General','Coronel General','FG Adjunto','FG'];
// "Capitán Javier Flórez": rango + nombre (o el usuario si no hay nombre)
export const nombreCompleto = p => [p.rango, p.nombre || p.usuario].filter(Boolean).join(' ');
export const emailDe = usuario => `${usuario.trim().toLowerCase()}@${DOMINIO_USUARIOS}`;

export async function iniciarSesion(usuario, password, captchaToken){
  const opciones = captchaToken ? { captchaToken } : undefined;
  const { error } = await sb.auth.signInWithPassword({ email: emailDe(usuario), password, options: opciones });
  if(error) throw new Error(traducir(error.message));
  const yo = await cargarYo();
  if(!yo || !yo.activo){ try{ await sb.rpc('registrar_intento_inactivo'); }catch(e){} await sb.auth.signOut(); throw new Error('Tu cuenta aún no está activa. Pide al administrador que la active.'); }
  marcarActividad(); return yo;
}
export async function cerrarSesion(todas=false){ try{ localStorage.removeItem(K_ACT); }catch(e){} await sb.auth.signOut(todas ? { scope:'global' } : undefined); location.href = RAIZ + 'login.html' + (todas ? '?motivo=todas' : ''); }
// ---------- Cierre de sesión por inactividad ----------
export const INACTIVIDAD_MIN = 120;                 // minutos sin actividad -> cierra sesión
const K_ACT = 'pm_ultima_actividad';
export function marcarActividad(){ try{ localStorage.setItem(K_ACT, String(Date.now())); }catch(e){} }
function vigilarInactividad(){
  const limite = INACTIVIDAD_MIN*60*1000;
  const revisar = async () => { let t=0; try{ t=+localStorage.getItem(K_ACT)||0; }catch(e){} if(t && Date.now()-t > limite){ try{ localStorage.removeItem(K_ACT); }catch(e){} await sb.auth.signOut(); location.replace(RAIZ + 'login.html?motivo=inactividad&next=' + encodeURIComponent(location.href)); } };
  let ultimo=0; const act=()=>{ const n=Date.now(); if(n-ultimo>30000){ ultimo=n; marcarActividad(); } };
  ['pointerdown','keydown','scroll','touchstart','input'].forEach(ev => document.addEventListener(ev, act, { passive:true }));
  if(!localStorage.getItem(K_ACT)) marcarActividad();
  revisar(); setInterval(revisar, 60000); document.addEventListener('visibilitychange', () => { if(!document.hidden) revisar(); });
}

// Devuelve {id, usuario, nombre, activo, rol:{id,nombre,permisos,formularios}} o null
export async function cargarYo(){
  const { data:{ session } } = await sb.auth.getSession();
  if(!session) return null;
  const { data: p } = await sb.from('perfiles').select('id,usuario,nombre,rango,activo,rol_id,permisos_extra,permisos_negados,formularios_extra,avatar_path').eq('id', session.user.id).maybeSingle();
  if(!p) return null;
  // El rol, el rango y el estado son propios de la organización en la que estoy trabajando
  const { data: ses } = await sb.rpc('mi_sesion');
  if(ses){ p.rol_id = ses.rol_id; p.rango = ses.rango; p.activo = ses.activo; }
  let rol = null;
  if(p.rol_id){ const { data: r } = await sb.from('roles').select('id,nombre,permisos,formularios,rango_pm,protegido').eq('id', p.rol_id).maybeSingle(); rol = r; }
  // Quien manda en todas las organizaciones entra a cualquiera aunque no tenga rol propio en ella
  if(!rol && ses && ses.global) rol = { id:null, nombre:'Administrador general', permisos:{}, formularios:['*'], rango_pm:null, protegido:true };
  const yo = armarYo(p, rol, await permisosEfectivos(p.id));
  yo.org = (ses && ses.org) || null; yo.orgs = (ses && ses.orgs) || [];
  yo.ruta = (ses && ses.ruta) || { activa:false, puedo_activar:false, nivel:0 };
  return yo;
}
// Permisos efectivos = (rol ∪ extra del usuario) − negados; los calcula el servidor (permisos_efectivos)
async function permisosEfectivos(id){ try{ const { data } = await sb.rpc('permisos_efectivos', { p_usuario: id }); return data || null; }catch(e){ return null; } }
function armarYo(p, rol, efectivos){
  rol = rol || { id:null, nombre:'Sin rol', permisos:{}, formularios:[], rango_pm:null };
  const permisos = efectivos || { ...(rol.permisos||{}), ...(p.permisos_extra||{}) };
  const formularios = [...new Set([...(rol.formularios||[]), ...(p.formularios_extra||[])])];
  return { ...p, rol: { ...rol, permisos_rol: rol.permisos||{}, formularios_rol: rol.formularios||[], permisos, formularios } };
}
export const tiene = (yo, permiso) => !!(yo && yo.rol && yo.rol.permisos && yo.rol.permisos[permiso]);
// "Ver todo" es de solo lectura por definición: el servidor descarta cualquier permiso de escritura
// que el rol tuviera marcado, así que basta con mirar si está presente.
export const soloLectura = yo => tiene(yo,'ver_todo');

// Con el modo solo lectura activo, el cliente ni siquiera intenta escribir: la base ya lo impide,
// esto evita además que la página muestre errores confusos o deje botones que no harán nada.
let LECTURA = false;
export function blindarSoloLectura(yo){
  if(LECTURA || !soloLectura(yo)) return; LECTURA = true;
  const no = () => Promise.resolve({ data: null, error: { message: 'Tu acceso es de solo lectura.' } });
  const from = sb.from.bind(sb);
  sb.from = tabla => { const q = from(tabla);
    for(const m of ['insert','update','upsert','delete']) q[m] = no;
    return q; };
  const st = sb.storage.from.bind(sb.storage);
  sb.storage.from = cubo => { const b = st(cubo);
    for(const m of ['upload','remove','move','copy','createSignedUploadUrl']) b[m] = no;
    return b; };
  const rpc = sb.rpc.bind(sb);
  const LECTURAS = ['permisos_efectivos','mi_sesion','mis_orgs','tengo_permiso','ficha_usuario','expediente','ranking_mes',
    'ranking_calc','insignias_lista','listar_integrantes','buscar_folios','turnos_lista','datos_ascensos','actividad_usuarios',
    'puedo_usar_formulario','canales_discord'];
  sb.rpc = (fn, args) => (LECTURAS.includes(fn) ? rpc(fn, args) : no());
  sb.functions.invoke = () => no();   // todas escriben o publican en Discord
  document.documentElement.dataset.soloLectura = '1';
}
export const puedeFormulario = (yo, id) => !!(yo && yo.rol && (yo.rol.formularios.includes('*') || yo.rol.formularios.includes(id)));
export const esSuperadmin = yo => !!(yo && yo.rol && yo.rol.protegido);
// Cambia la organización activa (se guarda en el servidor, así todo queda filtrado solo)
export async function cambiarOrg(id){ const { data, error } = await sb.rpc('cambiar_org', { p_org: id }); if(error) throw new Error(error.message); return data; }
export const esAdminDeAlgo = yo => ['ver_todo','usuarios','asignar_roles','reset_password','crear_roles','crear_reportes','gestion_reportes','disenar_formularios','historial','eliminar_historial','auditoria','aprobar_reportes','sanciones','turnos','ver_turnos','anuncios','ver_anuncios'].some(p => tiene(yo,p));

// Exige sesión activa; opcionalmente un permiso o un formulario. Redirige a login si no cumple.
export async function requerir({ permiso=null, formulario=null } = {}){
  if(!configurado){ document.body.innerHTML = aviso('Falta configurar <code>config.js</code> con la URL y la clave pública de Supabase.'); throw new Error('sin config'); }
  let yo = await cargarYo();
  if(!yo || !yo.activo){ location.replace(RAIZ + 'login.html?next=' + encodeURIComponent(location.href)); throw new Error('sin sesión'); }
  vigilarInactividad();
  if(await faltaSegundoPaso()){ location.replace(RAIZ + 'login.html?mfa=1&next=' + encodeURIComponent(location.href)); throw new Error('falta 2FA'); }
  yo = await aplicarVerComo(yo);
  if(permiso && !tiene(yo, permiso)){ document.body.innerHTML = aviso('No tienes permiso para ver esta sección.'); throw new Error('sin permiso'); }
  if(formulario && !puedeFormulario(yo, formulario)){ document.body.innerHTML = aviso('Tu rol no tiene acceso a este formulario.'); throw new Error('sin acceso'); }
  return yo;
}
// ¿La sesión tiene 2FA configurado pero aún no verificó el código en este inicio de sesión?
export async function faltaSegundoPaso(){
  try{ if(!sb.auth.mfa) return false; const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel(); return !!(data && data.nextLevel==='aal2' && data.currentLevel==='aal1'); }catch(e){ return false; }
}
// Verifica un código TOTP contra el primer factor verificado del usuario
export async function verificarCodigo2FA(codigo){
  const { data: f, error: e1 } = await sb.auth.mfa.listFactors(); if(e1) throw new Error(traducirAuth(e1.message));
  const factor = (f.totp||[]).find(x => x.status==='verified') || (f.all||[]).find(x => x.status==='verified'); if(!factor) throw new Error('No tienes un factor de verificación activo.');
  const { data: ch, error: e2 } = await sb.auth.mfa.challenge({ factorId: factor.id }); if(e2) throw new Error(traducirAuth(e2.message));
  const { error: e3 } = await sb.auth.mfa.verify({ factorId: factor.id, challengeId: ch.id, code: String(codigo).replace(/\s+/g,'') }); if(e3) throw new Error(/invalid|incorrect|expired/i.test(e3.message) ? 'Código incorrecto o vencido. Revisa la hora del celular y vuelve a intentarlo.' : traducirAuth(e3.message));
  return true;
}
function aviso(html){
  return `<div style="font-family:Arial,sans-serif;color:var(--text);background:var(--bg);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;text-align:center">
    <div><p style="font-size:18px">${html}</p><a href="${RAIZ}" style="color:var(--gold)">Volver al inicio</a></div></div>`;
}

// ---------- "Ver como": el admin ve la página tal como la vería otro usuario (solo lectura) ----------
const K_VC = 'pm_ver_como';
export const enVerComo = yo => !!(yo && yo._verComo);
const ERR_VC = 'No disponible en modo "Ver como": estás viendo la página como otro usuario y no puedes hacer cambios.';
const BLOQ = new Proxy(function(){}, { get:(t,k)=> k==='then' ? (res,rej)=>{ rej(new Error(ERR_VC)); } : ()=>BLOQ, apply:()=>BLOQ });
const RPC_LECTURA = ['listar_integrantes','buscar_folios','ver_como'];
function activarSoloLectura(){
  const of = sb.from.bind(sb);
  sb.from = t => { const b = of(t); for(const m of ['insert','update','upsert','delete']) b[m] = () => BLOQ; return b; };
  const orpc = sb.rpc.bind(sb);
  sb.rpc = (n, a, o) => RPC_LECTURA.includes(n) ? orpc(n, a, o) : BLOQ;
  const osf = sb.storage.from.bind(sb.storage);
  sb.storage.from = b => { const o = osf(b); for(const m of ['upload','update','remove','move','copy']) o[m] = () => BLOQ; return o; };
  if(sb.functions) sb.functions.invoke = () => BLOQ;
  sb.auth.updateUser = () => BLOQ;
  if(sb.auth.mfa){ sb.auth.mfa.enroll = () => BLOQ; sb.auth.mfa.unenroll = () => BLOQ; }
}
async function aplicarVerComo(yoReal){
  let id = null; try{ id = sessionStorage.getItem(K_VC); }catch(e){}
  if(!id) return yoReal;
  if(!tiene(yoReal, 'ver_como') || id === yoReal.id){ try{ sessionStorage.removeItem(K_VC); }catch(e){} return yoReal; }
  const { data, error } = await sb.rpc('ver_como', { p_usuario: id });
  if(error || !data || !data.perfil){ try{ sessionStorage.removeItem(K_VC); }catch(e){} return yoReal; }
  const yo = { ...armarYo(data.perfil, data.rol, await permisosEfectivos(data.perfil.id)), _verComo:true, _real:yoReal };
  activarSoloLectura();
  const pintar = () => {
    if(!document.body) return;
    const s = document.createElement('style'); s.textContent = `
.pm-vc{position:fixed;left:0;right:0;bottom:0;z-index:200;display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;justify-content:center;padding:10px 14px;background:var(--gold);color:var(--gold-text);font:600 13px "Roboto Condensed",Arial,sans-serif;border-top:2px solid #a8831f;box-shadow:0 -6px 20px rgba(0,0,0,.35)}
body.pm-modo-vc{padding-bottom:var(--vc-h,56px)}
.pm-vc b{font-weight:800}.pm-vc .rl{opacity:.75;font-weight:500}
.pm-vc button{background:var(--gold-text);color:var(--gold);border:0;border-radius:6px;padding:5px 10px;font:inherit;cursor:pointer}
body.pm-modo-vc #btnExport,body.pm-modo-vc button[type=submit]{opacity:.5;cursor:not-allowed}`;
    document.head.append(s);
    const d = document.createElement('div'); d.className = 'pm-vc';
    d.innerHTML = `👁 Estás viendo como <b>${esc(nombreCompleto(yo))}</b> <span class="rl">(${esc(yo.rol.nombre)}${yo.activo?'':' · inactivo'})</span> · solo lectura <button type="button" id="btnSalirVC">Salir de Ver como</button>`;
    d.querySelector('#btnSalirVC').onclick = () => salirVerComo(yo.id);
    document.body.prepend(d); document.body.classList.add('pm-modo-vc');
    // La barra superior se pega justo debajo de este aviso, así que publica su altura aquí
    // mismo: si se midiera solo al crear la barra, el aviso podría no existir todavía.
    const medirVC = () => document.documentElement.style.setProperty('--vc-h', d.offsetHeight + 'px');
    medirVC();
    if(window.ResizeObserver) new ResizeObserver(medirVC).observe(d);
    window.addEventListener('resize', medirVC);
    document.addEventListener('click', e => { const b = e.target.closest('#btnExport,button[type=submit]'); if(b){ e.preventDefault(); e.stopImmediatePropagation(); alert(ERR_VC); } }, true);
  };
  if(document.body) pintar(); else document.addEventListener('DOMContentLoaded', pintar);
  return yo;
}
export async function entrarVerComo(usuarioId){
  const { error } = await sb.rpc('ver_como', { p_usuario: usuarioId, p_evento: 'inicio' });
  if(error) throw new Error(error.message);
  try{ sessionStorage.setItem(K_VC, usuarioId); }catch(e){ throw new Error('Tu navegador no permite guardar el modo Ver como.'); }
  location.href = RAIZ;
}
export async function salirVerComo(usuarioId){
  try{ await sb.rpc('ver_como', { p_usuario: usuarioId, p_evento: 'fin' }); }catch(e){}
  try{ sessionStorage.removeItem(K_VC); }catch(e){}
  location.href = RAIZ + 'admin/#usuarios';
}

// Publica un aviso en un canal general de Discord (avisos, anuncios, ranking, resumen, recordatorios). Nunca lanza error.
// origen {tabla,id} registra el mensaje para poder editarlo/borrarlo después; accion 'editar'|'borrar' + mensaje_id actúan sobre uno enviado.
export async function avisoDiscord(canal, { texto=null, embed=null, origen=null, accion=null, mensaje_id=null } = {}){
  try{ const { data, error } = await sb.functions.invoke('notificar-general', { body:{ canal, texto, embed, origen, accion, mensaje_id } });
    if(error){ let msg = error.message || 'sin respuesta'; try{ const j = await error.context.json(); if(j && j.error) msg = j.error; }catch(e){} return 'error: '+msg; }
    return (data&&data.ok) ? 'ok' : (data&&data.motivo) || 'error'; }catch(x){ return 'error: '+(x.message||x); }
}
// Mensajes de Discord registrados para un origen (p. ej. 'anuncios', id). Resuelve antes los envíos asíncronos pendientes.
export async function mensajesDiscord(tabla, id=null){
  try{ await sb.rpc('discord_resolver'); }catch(e){}
  let q = sb.from('discord_mensajes').select('*').eq('origen_tabla', tabla).order('id', { ascending:false }); if(id!==null) q = q.eq('origen_id', String(id));
  const { data } = await q; return data || [];
}

// Barra superior con usuario, rol, enlaces y salir. Se inserta al inicio de <body>.
// Pone el nombre de la organización activa donde corresponde (cabeceras y título de la pestaña).
// La ruta de aprendizaje solo sale en el menú cuando está encendida; mientras no lo esté, la ve
// únicamente quien puede encenderla.
export const rutaVisible = yo => !!(yo && yo.ruta && (yo.ruta.activa || yo.ruta.puedo_activar));

export function marcaOrg(yo){
  const o = yo && yo.org; if(!o) return;
  document.querySelectorAll('[data-org-nombre]').forEach(e => {
    if(e.firstChild && e.firstChild.nodeType === 3) e.firstChild.nodeValue = o.nombre; else e.prepend(o.nombre);
  });
  document.querySelectorAll('[data-org-corto]').forEach(e => { e.textContent = o.nombre_corto || o.nombre; });
  // Lo que es propio de una organización desaparece en las demás
  document.querySelectorAll('[data-solo-org]').forEach(e => {
    if(e.dataset.soloOrg !== o.id){ e.hidden = true; e.style.display = 'none'; }
  });
  if(document.title.includes('Policía Militar')) document.title = document.title.replace('Policía Militar', o.nombre);
}

export function barraUsuario(yo){
  marcaOrg(yo); blindarSoloLectura(yo);
  // Después de que el formulario termine de armarse
  if(location.search.includes('corregir=')) setTimeout(() => modoCorreccion(yo).catch(() => {}), 0);
  else if(location.search.includes('repetir=')) setTimeout(() => modoRepetir(yo).catch(() => {}), 0);
  if(!document.getElementById('barraCss')){
    const s = document.createElement('style'); s.id = 'barraCss';
    s.textContent = `
/* Pegada arriba en todas las páginas: siempre se puede volver al inicio o abrir el menú.
   El aviso de "Ver como" ya no estorba: vive abajo, fijo. */
.barra{display:flex;gap:14px;align-items:center;padding:8px 20px;background:var(--barra);border-bottom:1px solid var(--line3);font:13px "Roboto Condensed",Arial,sans-serif;color:var(--muted);position:sticky;top:0;z-index:150}
.barra a{color:var(--muted);text-decoration:none}
.barra a.oro{color:var(--gold)}
.barra .inicio{margin-right:auto}
.barra:has(#selOrg) .inicio{margin-right:0}
.barra #selOrg{flex:0 0 auto;width:auto;max-width:170px;background:var(--panel3);color:var(--gold);border:1px solid var(--avisoline);border-radius:7px;padding:4px 8px;font:inherit;font-weight:700;cursor:pointer;margin-right:auto;margin-left:-4px}
.barra .menu{display:flex;gap:14px;align-items:center}
.barra .yo{color:var(--muted)}.barra .yo b{color:var(--text)}
.barra .slec{background:var(--avisobg);color:var(--gold);border:1px solid var(--avisoline);border-radius:8px;padding:1px 7px;font-size:11px;letter-spacing:1px;margin-left:6px}
[data-solo-lectura] button.primary,[data-solo-lectura] button.peligro,[data-solo-lectura] [data-bulk],
[data-solo-lectura] .menu-acc button.peligro{display:none !important}
[data-solo-lectura] form input,[data-solo-lectura] form select,[data-solo-lectura] form textarea{pointer-events:none;opacity:.7}
.barra .btn{display:none;background:var(--panel3);border:1px solid var(--line2);color:var(--text);border-radius:7px;padding:6px 10px;font:inherit;cursor:pointer;align-items:center;gap:8px;max-width:60vw}
.barra .btn span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (max-width:720px){
  .barra{padding:8px 14px}
  .barra .btn{display:flex}
  .barra .menu{display:none;position:absolute;right:10px;top:calc(100% + 6px);flex-direction:column;align-items:stretch;gap:0;background:var(--panel);border:1px solid var(--line2);border-radius:10px;min-width:220px;box-shadow:0 10px 30px rgba(0,0,0,.5);overflow:hidden}
  .barra.abierta .menu{display:flex}
  .barra .menu a,.barra .menu .yo{padding:12px 16px;border-bottom:1px solid var(--line3);font-size:15px}
  .barra .menu .yo{background:var(--panel3)}
  .barra .menu a:last-child{border-bottom:0}
}`;
    document.head.append(s);
  }
  const b = document.createElement('div'); b.className = 'barra';
  // Selector de organización: solo aparece si perteneces a más de una
  const orgs = yo.orgs || [];
  const selOrg = orgs.length > 1
    ? `<select id="selOrg" title="Organización en la que estás trabajando" aria-label="Organización">${orgs.map(o => `<option value="${esc(o.id)}" ${yo.org && o.id===yo.org.id ? 'selected' : ''}>${esc(o.nombre_corto || o.nombre)}</option>`).join('')}</select>`
    : '';
  b.innerHTML = `<a class="inicio" href="${RAIZ}">Inicio</a>${selOrg}
    <button class="btn" type="button" aria-label="Menú" aria-expanded="false"><span>👤 ${esc(nombreCompleto(yo))}</span> ☰</button>
    <nav class="menu">
      <span class="yo">👤 <b>${esc(nombreCompleto(yo))}</b> · ${esc(yo.rol.nombre)}${soloLectura(yo) ? ' <span class="slec" title="Puedes ver todo, pero no cambiar nada">👁 Solo lectura</span>' : ''}</span>
      ${esAdminDeAlgo(yo) ? `<a class="oro" href="${RAIZ}admin/">Administración</a>` : ''}
      <a href="${RAIZ}reglamento.html">Reglamento</a>
      <a href="${RAIZ}manuales.html">Manuales</a>
      <a href="${RAIZ}cuenta.html">Mi cuenta</a>
      <a href="${RAIZ}expediente.html">Mi expediente</a>
      <a href="${RAIZ}ranking.html">Ranking</a>
      <a href="${RAIZ}calendario.html">Eventos del día</a>
      ${rutaVisible(yo) ? `<a href="${RAIZ}ruta.html">Ruta de aprendizaje</a>` : ''}
      <a href="#" id="btnTema" title="Cambiar entre tema oscuro y claro">🌗 Tema</a>
      <a href="${RAIZ}privacidad.html" style="font-size:12px">Privacidad</a>
      <a href="#" id="btnSalir">Salir</a>
    </nav>`;
  const btn = b.querySelector('.btn');
  btn.onclick = e => { e.stopPropagation(); const ab = b.classList.toggle('abierta'); btn.setAttribute('aria-expanded', ab); };
  document.addEventListener('click', e => { if(!b.contains(e.target)){ b.classList.remove('abierta'); btn.setAttribute('aria-expanded','false'); } });
  const so = b.querySelector('#selOrg');
  if(so) so.onchange = async () => { so.disabled = true; try{ await cambiarOrg(so.value); location.reload(); }catch(x){ so.disabled = false; alert('No se pudo cambiar de organización: ' + x.message); } };
  b.querySelector('#btnTema').onclick = e => { e.preventDefault(); if(window.pmTema) window.pmTema.alternar(); };
  b.querySelector('#btnSalir').onclick = e => { e.preventDefault(); try{ sessionStorage.removeItem(K_VC); }catch(x){} cerrarSesion(); };
  document.body.prepend(b);
  // Las páginas que tienen cosas pegadas debajo (menú del panel, selector de sección)
  // necesitan saber cuánto ocupa la barra; cambia al rotar el móvil o al plegarse el menú.
  const medir = () => document.documentElement.style.setProperty('--barra-h', b.offsetHeight + 'px');
  medir();
  if(window.ResizeObserver) new ResizeObserver(medir).observe(b);
  window.addEventListener('resize', medir);
}

// Paso 1: registra el reporte (el servidor sella identidad, rango y Rango PM y asigna el folio).
// ---- Corrección de un reporte devuelto ----
// Toda la mecánica vive aquí: los formularios no cambian. Si la página se abre con ?corregir=<id>,
// se precargan los datos, y al exportar se reemplaza ese reporte en vez de crear uno nuevo.
let CORRIGIENDO = null;
export const corrigiendo = () => CORRIGIENDO;

export async function modoCorreccion(yo){
  const id = new URLSearchParams(location.search).get('corregir');
  if(!id || CORRIGIENDO) return null;
  const form = document.querySelector('form'); if(!form) return null;
  const { data: r } = await sb.from('reportes_vista')
    .select('id,folio,estado,datos,comentario_revision,revisor,formulario_id').eq('id', id).maybeSingle();
  if(!r) return null;
  if(r.estado !== 'devuelto'){
    avisoCorreccion(form, `Ese reporte ya no está devuelto para corrección (está <b>${esc(r.estado)}</b>).`, true);
    return null;
  }
  CORRIGIENDO = { id: r.id, folio: r.folio };
  const puestos = precargarCampos(form, r.datos);
  avisoCorreccion(form,
    `✏️ Estás corrigiendo el reporte <b>${esc(r.folio)}</b>.` +
    (r.comentario_revision ? `<br><span style="color:var(--muted)">Motivo (${esc(r.revisor||'revisor')}): ${esc(r.comentario_revision)}</span>` : '') +
    `<br><span style="color:var(--muted)">${puestos ? 'Recuperamos lo que se pudo; r' : 'R'}evisa todo, vuelve a adjuntar las fotos y expórtalo: al terminar reemplaza el reporte y vuelve a revisión.</span>`);
  return CORRIGIENDO;
}
// Copia los valores sencillos de un reporte a los campos del formulario (las listas y las fotos se rehacen)
function precargarCampos(form, datos){
  let puestos = 0;
  for(const [k, v] of Object.entries(datos || {})){
    if(v == null || typeof v === 'object') continue;
    const el = form.querySelector('#' + (window.CSS && CSS.escape ? CSS.escape(k) : k));
    if(!el || el.type === 'file' || el.readOnly) continue;
    if(el.type === 'checkbox') el.checked = !!v; else el.value = v;
    el.dispatchEvent(new Event('change', { bubbles:true })); el.dispatchEvent(new Event('input', { bubbles:true }));
    puestos++;
  }
  return puestos;
}

// Repetir el último reporte: mismos datos, reporte nuevo. No toca el anterior.
export async function modoRepetir(yo){
  const id = new URLSearchParams(location.search).get('repetir');
  if(!id) return null;
  const form = document.querySelector('form'); if(!form) return null;
  const { data: r } = await sb.from('reportes_vista').select('id,folio,datos,fecha').eq('id', id).maybeSingle();
  if(!r) return null;
  const datos = { ...(r.datos || {}) };
  delete datos.fecha;                       // la fecha es la de hoy, no la de la vez pasada
  const puestos = precargarCampos(form, datos);
  if(puestos) avisoCorreccion(form,
    `↻ Copiamos los datos de tu último reporte (<b>${esc(r.folio)}</b>). Revísalos, cambia lo que toque y adjunta las fotos de hoy.`);
  return { desde: r.id };
}

function avisoCorreccion(form, html, error=false){
  const b = document.createElement('div');
  b.style.cssText = `background:var(--${error?'errbg':'avisobg'});border:1px solid var(--${error?'err2':'avisoline'});border-radius:8px;padding:10px 14px;margin:0 0 14px;font-size:14px;color:var(--text);line-height:1.5`;
  b.innerHTML = html;
  form.parentNode.insertBefore(b, form);
}

export async function crearReporte({ formularioId, fecha, resumen, datos }){
  if(CORRIGIENDO){
    const { data, error } = await sb.from('reportes')
      .update({ fecha: fecha || null, resumen, datos }).eq('id', CORRIGIENDO.id)
      .select('id, folio_v2, datos, estado').single();
    if(error) throw new Error('No se pudo guardar la corrección: ' + error.message);
    const f = Array.isArray(data) ? data[0] : data;
    if(!f) throw new Error('No se pudo guardar la corrección: el reporte ya no está disponible.');
    return { id: f.id, folio: f.folio_v2, datos: f.datos, estado: f.estado, correccion: true };
  }
  const { data, error } = await sb.from('reportes')
    .insert({ formulario_id: formularioId, usuario_id: (await sb.auth.getUser()).data.user.id, fecha: fecha || null, resumen, datos })
    .select('id, folio_v2, datos, estado').single();
  if(error) throw new Error('No se pudo registrar el reporte: ' + error.message);
  return { id: data.id, folio: data.folio_v2, datos: data.datos, estado: data.estado || 'aprobado' };
}
// Paso 2: sube la imagen con el folio estampado y la adjunta al registro (solo una vez).
// Carga una foto del usuario reducida a un tamaño razonable (máx. 1600 px por lado): menos memoria en el celular y
// exportación más rápida. Devuelve un <img> listo para dibujar.
export function cargarFoto(f, max=1600){
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(f); const i = new Image();
    i.onload = () => {
      URL.revokeObjectURL(u);
      const w = i.naturalWidth || i.width, h = i.naturalHeight || i.height, k = Math.min(1, max / Math.max(w, h));
      if(k >= 1) return res(i);
      const c = document.createElement('canvas'); c.width = Math.round(w*k); c.height = Math.round(h*k);
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(i, 0, 0, c.width, c.height);
      const o = new Image(); o.onload = () => res(o); o.onerror = () => res(i); o.src = c.toDataURL('image/jpeg', 0.9);
    };
    i.onerror = rej; i.src = u;
  });
}
// Convierte el PNG exportado a WebP (≈60-70 % más liviano) para guardarlo en el historial; si el navegador no sabe
// generar WebP (Safari), se guarda el PNG tal cual.
export async function blobParaHistorial(pngBlob){
  try{
    const bmp = await createImageBitmap(pngBlob); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0); bmp.close && bmp.close();
    const webp = await new Promise(r => c.toBlob(r, 'image/webp', 0.92));
    if(webp && webp.type === 'image/webp' && webp.size < pngBlob.size) return { blob: webp, ext: 'webp' };
  }catch(e){}
  return { blob: pngBlob, ext: 'png' };
}
export async function adjuntarImagen({ yo, id, formularioId, pngBlob }){
  const { blob, ext } = await blobParaHistorial(pngBlob);
  const path = `${yo.id}/${formularioId}-${id}.${ext}`;
  const corr = CORRIGIENDO && String(CORRIGIENDO.id) === String(id);
  const { error: e1 } = await sb.storage.from('reportes').upload(path, blob, { contentType:'image/'+ext, upsert: !!corr });
  if(e1) throw new Error('No se pudo subir la imagen: ' + e1.message);
  const { error: e2 } = await sb.from('reportes').update({ imagen_path: path }).eq('id', id);
  if(e2) throw new Error('No se pudo adjuntar la imagen: ' + e2.message);
  if(corr){
    const { error: e3 } = await sb.rpc('reenviar_a_revision', { p_id: id });
    if(e3) throw new Error('La imagen quedó guardada, pero no se pudo reenviar a revisión: ' + e3.message);
    CORRIGIENDO = null;
  }
  return path;
}
// Publica el reporte en Discord si el formulario tiene webhook (lo hace el servidor; nunca falla el exportado por esto).
// Devuelve: 'ok' | 'sin_webhook' | 'error: …'
export async function notificarDiscord(reporteId, estado='aprobado'){
  // Se publica siempre, también si queda pendiente de revisión (la revisión solo afecta al ranking y las estadísticas).
  try{ const { data, error } = await sb.functions.invoke('notificar-discord', { body:{ reporte_id: reporteId } });
    if(error) return 'error: ' + (error.message||'sin respuesta');
    if(data && data.ok) return 'ok'; if(data && data.motivo==='sin_webhook') return 'sin_webhook'; return 'error: ' + ((data&&data.error)||'desconocido'); }
  catch(e){ return 'error: ' + e.message; }
}
// Vuelve a publicar un reporte ya enviado. El servidor lee el webhook del momento, no el de la vez pasada.
export async function reenviarDiscord(reporteId){
  try{ const { data, error } = await sb.functions.invoke('notificar-discord', { body:{ reporte_id: reporteId, reenviar: true } });
    if(error) return 'error: ' + (error.message||'sin respuesta');
    if(data && data.ok) return 'ok'; if(data && data.motivo==='sin_webhook') return 'sin_webhook';
    return 'error: ' + ((data&&data.error)||'desconocido'); }
  catch(e){ return 'error: ' + e.message; }
}
export const textoDiscord = (r, estado=null) => (r==='ok' ? ' Publicado en Discord.' : r && r.startsWith('error') ? ` (No se pudo publicar en Discord: ${r.slice(7)})` : '') + (estado==='pendiente' ? ' Queda pendiente de revisión: un revisor debe aprobarlo para que cuente en el ranking y las estadísticas.' : '');
// Compatibilidad: flujo completo en una llamada (sin folio en la imagen)
export async function guardarReporte({ yo, formularioId, fecha, resumen, datos, pngBlob }){
  const r = await crearReporte({ formularioId, fecha, resumen, datos });
  await adjuntarImagen({ yo, id: r.id, formularioId, pngBlob });
  return r.id;
}
// ---- Auditoría con IA (análisis de la imagen del reporte; lo hace el servidor con Gemini) ----
// Pide el análisis de un reporte. forzar=true reanaliza (solo revisores). Devuelve { ok, auditoria } o { ok:false, error }.
export async function auditarReporte(id, forzar=false){
  try{ const { data, error } = await sb.functions.invoke('auditar-reporte', { body:{ reporte_id: id, forzar } });
    if(error){ let msg = error.message || 'sin respuesta'; try{ const j = await error.context.json(); if(j && j.error) msg = j.error; }catch(e){} return { ok:false, error: msg }; }
    if(data && data.ok) return { ok:true, auditoria: data.auditoria }; return { ok:false, error: (data && (data.error || data.motivo)) || 'sin respuesta' }; }
  catch(e){ return { ok:false, error: e.message }; }
}
// Etiqueta compacta (semáforo) para tablas y tarjetas. r = fila de reportes_vista (o { auditoria_ia, imagen_path, creado_en }).
export function badgeIA(r){
  const a = r && r.auditoria_ia;
  if(!a){ if(!r || !r.imagen_path) return ''; const reciente = r.creado_en && (Date.now() - new Date(r.creado_en).getTime()) < 5*60e3; return `<span class="ia ia-na" title="${reciente ? 'La IA está analizando la imagen' : 'Sin análisis de IA'}">${reciente ? '⏳ Analizando' : '— Sin análisis'}</span>`; }
  if(a.error) return `<span class="ia ia-err" title="${esc(a.error)}">⚠ Análisis fallido</span>`;
  const k = a.riesgo || 'medio', t = { bajo:'🟢 Riesgo bajo', medio:'🟡 Riesgo medio', alto:'🔴 Riesgo alto' }[k] || k;
  return `<span class="ia ia-${esc(k)}" title="${esc(a.resumen||'')}">${t}${typeof a.puntaje==='number' ? ` · ${a.puntaje}` : ''}</span>`;
}
// Detalle desplegable del análisis (resumen, hallazgos y texto leído).
export function detalleIA(a){
  if(!a || a.error) return '';
  const g = { grave:'🔴', aviso:'🟡', info:'🟢' };
  return `<details class="ia-det"><summary>Análisis de la IA <span class="muted">(${esc(a.modelo||'')} · ${a.en ? new Date(a.en).toLocaleString('es-CO') : ''}${(a.modelos_fallidos||[]).length ? ` · <span title="${esc(a.modelos_fallidos.join(' | '))}">${a.modelos_fallidos.length} modelo(s) no respondieron</span>` : ''})</span></summary>
    <p>${esc(a.resumen||'')}</p>${a.es_captura_del_juego===false ? '<p class="ia-alto">La IA considera que la imagen NO parece una captura del juego.</p>' : ''}
    ${(a.reglas||[]).length ? `<p class="ia-alto" style="background:var(--errbg)">Riesgo elevado por regla: ${a.reglas.map(esc).join('; ')}.</p>` : ''}
    ${a.verificaciones ? (v => { const ok = s => s==='si' ? '✅' : s==='no' ? '❌' : '❔'; return `<ul class="ia-chk">
      <li>${ok(v.autor_en_pantalla)} <b>Autor en pantalla</b>: quien actúa en el chat → ${esc((v.actores_en_chat||[]).join(', ')||'no legible')}</li>
      <li>${(v.nombres_declarados_no_vistos||[]).length ? '❌' : '✅'} <b>Nombres declarados</b>: vistos ${esc((v.nombres_declarados_vistos||[]).join(', ')||'—')}${(v.nombres_declarados_no_vistos||[]).length ? ` · <span class="ia-alto">no vistos: ${esc(v.nombres_declarados_no_vistos.join(', '))}</span>` : ''}${(v.nombres_vistos_no_declarados||[]).length ? ` · sin declarar: ${esc(v.nombres_vistos_no_declarados.join(', '))}` : ''}</li>
      <li>${ok(v.fecha_coherente)} <b>Hora del servidor</b>: ${esc((v.horas_servidor||[]).join(' · ')||'no legible')}</li>
      <li>${v.capturas_reutilizadas ? '❌' : '✅'} <b>Capturas reutilizadas</b>: ${v.capturas_reutilizadas ? 'sí' : 'no'}</li>
      ${v.hud_visible ? `<li>${v.hud_visible==='si' ? '✅' : v.hud_visible==='parcial' ? '⚠️' : '❌'} <b>HUD y chat visibles</b>: ${v.hud_visible==='si' ? 'sí (pantallazo válido)' : v.hud_visible==='parcial' ? 'solo en algunas capturas' : 'no (parece foto de la cámara del juego)'}</li>` : ''}</ul>`; })(a.verificaciones) : ''}
    <ul>${(a.hallazgos||[]).map(h => `<li>${g[h.gravedad]||'•'} <b>${esc(h.tipo)}</b>: ${esc(h.detalle)}</li>`).join('') || '<li class="muted">Sin hallazgos.</li>'}</ul>
    ${(a.texto_leido||[]).length ? `<p class="muted" style="font-size:12px"><b>Texto leído en las capturas:</b> ${a.texto_leido.map(esc).join(' · ')}</p>` : ''}
    <p class="muted" style="font-size:11px">La IA solo orienta; la decisión de aprobar o rechazar es siempre del revisor.</p></details>`;
}
// Descarga la imagen generada solo si el formulario lo tiene habilitado (formularios.descarga_imagen; por defecto sí).
// La imagen siempre se guarda en el historial; esto solo decide si además baja al dispositivo.
const DESCARGA = {};
export async function descargaHabilitada(formularioId){
  if(DESCARGA[formularioId] !== undefined) return DESCARGA[formularioId];
  try{ const { data } = await sb.from('formularios').select('descarga_imagen').eq('id', formularioId).maybeSingle(); DESCARGA[formularioId] = !data || data.descarga_imagen !== false; }
  catch(e){ DESCARGA[formularioId] = true; }
  return DESCARGA[formularioId];
}
export async function descargarSiProcede(formularioId, blob, nombre){
  if(!(await descargaHabilitada(formularioId))) return false;
  const a = document.createElement('a'); a.download = nombre; a.href = URL.createObjectURL(blob); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); return true;
}
export async function urlImagen(path){
  const { data, error } = await sb.storage.from('reportes').createSignedUrl(path, 3600);
  if(error) throw new Error(error.message);
  return data.signedUrl;
}

// Favicon dinámico: un emoji como icono de pestaña
export function faviconEmoji(emoji){
  if(!emoji) return;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="var(--bg)"/><rect x="2" y="2" width="60" height="60" rx="12" fill="none" stroke="var(--line)" stroke-width="2"/><text x="32" y="44" text-anchor="middle" font-size="36">${emoji}</text></svg>`;
  let l=document.querySelector('link[rel="icon"]'); if(!l){ l=document.createElement('link'); l.rel='icon'; document.head.appendChild(l); }
  l.type='image/svg+xml'; l.href='data:image/svg+xml,'+encodeURIComponent(svg);
}
export function hoyISO(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
// Regla de contraseñas (debe coincidir con Supabase → Auth → Email): mín. 8, mayúscula, minúscula, dígito y símbolo
export const REGLA_PASSWORD = 'Mínimo 8 caracteres, con mayúscula, minúscula, número y símbolo.';
export function validarPassword(p){
  if(!p || p.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if(!/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/[0-9]/.test(p) || !/[^A-Za-z0-9]/.test(p)) return 'La contraseña debe incluir mayúscula, minúscula, número y símbolo.';
  return '';
}
export function traducirAuth(m){
  m = String(m||'');
  if(/invalid login credentials/i.test(m)) return 'Usuario o contraseña incorrectos.';
  if(/weak.?password|should contain|password.*(length|characters)/i.test(m)) return 'Contraseña débil: ' + REGLA_PASSWORD;
  if(/incorrect.*current password|current password/i.test(m)) return 'La contraseña actual no es correcta.';
  if(/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera un momento.';
  if(/same.*password|different from the old/i.test(m)) return 'La contraseña nueva debe ser distinta de la actual.';
  return m;
}
export function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const traducir = traducirAuth;

// ---------- Borradores (se guardan en el navegador; las fotos no) ----------
// uso: const borr = borrador({ clave:'bajas', yo, form:document.getElementById('form'), antes(v){...}, despues(){ draw(); } });
//      al exportar con éxito: borr.limpiar()
export function borrador({ clave, yo, form, antes=null, despues=null, dias=7 }){
  const K = `borrador:${clave}:${yo.id}`;
  const claveEl = el => { if(el.id) return '#'+el.id; const cont=el.closest('[data-i],[data-id],.campo,.veh'); let base=''; if(cont){ base = cont.dataset.i!=null ? 'i'+cont.dataset.i : cont.dataset.id ? 'd'+cont.dataset.id : cont.classList.contains('veh') ? 'v'+[...form.querySelectorAll('.veh')].indexOf(cont) : ''; }
    const cls=(el.className||'').split(' ')[0]; const sel=el.tagName+(cls?'.'+cls:''); const sibs=[...(cont||form).querySelectorAll(sel)]; return `${base}|${sel}|${sibs.indexOf(el)}`; };
  const elementos = () => [...form.querySelectorAll('input,select,textarea')].filter(e => e.type!=='file' && e.type!=='button' && e.type!=='submit');
  let timer=null, pausado=false;
  const guardar = () => { if(pausado) return; clearTimeout(timer); timer=setTimeout(()=>{ const v={}; let hay=false; for(const e of elementos()){ const k=claveEl(e); const val = e.type==='checkbox' ? e.checked : e.value; v[k]=val; if(!e.readOnly && !e.disabled && (e.type==='checkbox' ? e.checked : String(val||'').trim())) hay=true; }
    try{ if(hay) localStorage.setItem(K, JSON.stringify({ t:Date.now(), v })); }catch(e){} }, 600); };
  form.addEventListener('input',guardar); form.addEventListener('change',guardar);
  const limpiar = () => { pausado=true; clearTimeout(timer); try{ localStorage.removeItem(K); }catch(e){} setTimeout(()=>{ pausado=false; }, 1500); };
  const aplicar = v => { for(let pasada=0; pasada<4; pasada++){ let cambios=0;
      for(const e of elementos()){ const k=claveEl(e); if(!(k in v)) continue; const val=v[k];
        if(e.type==='checkbox'){ if(e.checked!==!!val){ e.checked=!!val; cambios++; e.dispatchEvent(new Event('change',{bubbles:true})); } }
        else if(String(e.value)!==String(val)){ e.value=val; cambios++; if(e.tagName==='SELECT'||e.type==='number'||e.type==='date') e.dispatchEvent(new Event('change',{bubbles:true})); e.dispatchEvent(new Event('input',{bubbles:true})); } }
      if(!cambios) break; } };
  // Banner
  let guardado=null; try{ const raw=localStorage.getItem(K); if(raw){ guardado=JSON.parse(raw); if(Date.now()-guardado.t > dias*864e5){ guardado=null; localStorage.removeItem(K); } } }catch(e){}
  if(guardado && guardado.v){
    const b=document.createElement('div'); b.style.cssText='background:var(--avisobg);border:1px solid var(--avisoline);border-radius:8px;padding:10px 14px;margin:0 0 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:14px;color:var(--text)';
    b.innerHTML=`<span>📝 Tienes un borrador sin exportar del <b>${new Date(guardado.t).toLocaleString('es-CO')}</b> (las fotos hay que adjuntarlas de nuevo).</span><button type="button" class="primary" style="padding:6px 12px;font-size:13px">Continuar</button><button type="button" class="ghost" style="padding:6px 10px;font-size:12px">Descartar</button>`;
    const [bc, bd] = b.querySelectorAll('button');
    bc.onclick = () => { pausado=true; try{ if(antes) antes(guardado.v); aplicar(guardado.v); }finally{ pausado=false; } if(despues) despues(); b.remove(); };
    bd.onclick = () => { limpiar(); b.remove(); };
    form.prepend(b);
  }
  return { limpiar, guardar };
}

// ---------- Mejoras para móvil en los formularios ----------
// Barra flotante (Vista previa / Exportar) en pantallas angostas y botón de cámara junto a cada selector de fotos.
export function mejorasMovil(){
  if(document.getElementById('pmMovilCss')) return;
  const s=document.createElement('style'); s.id='pmMovilCss';
  s.textContent=`
  .pm-flot{display:none;position:fixed;left:0;right:0;bottom:0;z-index:40;background:rgba(7,16,15,.93);border-top:1px solid var(--line);padding:8px 12px;gap:8px;backdrop-filter:blur(4px)}
  .pm-flot button{flex:1;padding:10px 8px;font-size:14px}
  .pm-cam{margin-left:6px;padding:6px 10px;font-size:12px;background:var(--panel2);color:var(--text);border:0;border-radius:6px;cursor:pointer;font-family:inherit;font-weight:700;text-transform:uppercase}
  @media (max-width:1000px){ .pm-flot{display:flex} body{padding-bottom:64px} }`;
  document.head.appendChild(s);
  const exportar=document.getElementById('btnExport'), preview=document.querySelector('.preview');
  if(exportar && preview){
    const bar=document.createElement('div'); bar.className='pm-flot';
    bar.innerHTML='<button type="button" class="secondary">👁 Vista previa</button><button type="button" class="primary">📤 Enviar</button>';
    const [bp,be]=bar.querySelectorAll('button');
    bp.onclick=()=>{ const b=document.getElementById('btnPreview'); if(b) b.click(); preview.scrollIntoView({behavior:'smooth',block:'start'}); };
    be.onclick=()=>{ exportar.click(); setTimeout(()=>{ const e=document.getElementById('err'); if(e && e.textContent.trim()) e.scrollIntoView({behavior:'smooth',block:'center'}); },400); };
    document.body.appendChild(bar);
  }
  const decorar=inp=>{ if(inp.dataset.cam || inp.type!=='file' || !/image/.test(inp.accept||'')) return; inp.dataset.cam='1';
    const b=document.createElement('button'); b.type='button'; b.className='pm-cam'; b.textContent='📷 Cámara'; b.title='Tomar la foto con la cámara';
    b.onclick=()=>{ const t=document.createElement('input'); t.type='file'; t.accept='image/*'; t.capture='environment'; t.style.display='none'; document.body.appendChild(t);
      t.onchange=()=>{ if(t.files.length){ const dt=new DataTransfer(); for(const f of t.files) dt.items.add(f); inp.files=dt.files; inp.dispatchEvent(new Event('change',{bubbles:true})); } t.remove(); }; t.click(); };
    inp.insertAdjacentElement('afterend', b); };
  document.querySelectorAll('input[type=file]').forEach(decorar);
  new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{ if(n.nodeType!==1) return; if(n.matches && n.matches('input[type=file]')) decorar(n); n.querySelectorAll && n.querySelectorAll('input[type=file]').forEach(decorar); }))).observe(document.body,{childList:true,subtree:true});
}

// ---------- PWA: registro del service worker e instalación ----------
export function registrarPWA(){
  if(!('serviceWorker' in navigator)) return;
  try{ navigator.serviceWorker.register(RAIZ + 'sw.js', { scope: new URL(RAIZ).pathname }).catch(()=>{}); }catch(e){}
}
let promptInstalar=null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptInstalar=e; document.dispatchEvent(new Event('pm-instalable')); });
export const puedeInstalar = () => !!promptInstalar;
export const esStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export async function instalarPWA(){ if(!promptInstalar) return false; promptInstalar.prompt(); const { outcome } = await promptInstalar.userChoice; promptInstalar=null; return outcome==='accepted'; }
registrarPWA();

// ---------- Pantalla bloqueada durante la exportación ----------
// const ov = bloquearPantalla('Registrando…'); ov.texto('Exportando…'); ov.exito('Reporte PM-000012 exportado', alCerrar) | ov.quitar()
export function bloquearPantalla(texto='Procesando…'){
  if(!document.getElementById('pmOvCss')){ const s=document.createElement('style'); s.id='pmOvCss'; s.textContent=`
  .pm-ov{position:fixed;inset:0;z-index:1000;background:rgba(7,16,15,.9);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px);font-family:"Roboto Condensed",Arial,sans-serif}
  .pm-ov .c{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:26px 30px;max-width:420px;width:100%;text-align:center;color:var(--text)}
  .pm-ov .sp{width:54px;height:54px;border-radius:50%;border:5px solid var(--panel2);border-top-color:var(--gold);margin:0 auto 16px;animation:pmgira .9s linear infinite}
  .pm-ov .ok{font-size:54px;margin-bottom:8px}
  .pm-ov h3{margin:0 0 6px;color:var(--gold);font-size:20px;text-transform:uppercase;letter-spacing:1px}
  .pm-ov p{margin:0;color:var(--muted);font-size:14px;white-space:pre-line}
  .pm-ov button{margin-top:16px;background:var(--gold);color:var(--gold-text);border:0;border-radius:6px;padding:10px 18px;font-family:inherit;font-weight:700;font-size:14px;text-transform:uppercase;cursor:pointer}
  @keyframes pmgira{to{transform:rotate(360deg)}}`; document.head.appendChild(s); }
  const ov=document.createElement('div'); ov.className='pm-ov'; ov.setAttribute('role','alert'); ov.setAttribute('aria-live','assertive');
  ov.innerHTML=`<div class="c"><div class="sp"></div><h3>Exportando reporte</h3><p></p><p style="margin-top:10px;font-size:12px">No cierres ni recargues la página.</p></div>`;
  const p=ov.querySelector('p'); p.textContent=texto; document.body.appendChild(ov);
  const bloquearTeclas=e=>{ if(e.key==='Escape'||e.key==='Enter'||e.key==='Tab'||e.key==='F5'||(e.ctrlKey&&e.key==='r')) e.preventDefault(); };
  const avisoSalir=e=>{ e.preventDefault(); e.returnValue=''; };
  document.addEventListener('keydown',bloquearTeclas,true); window.addEventListener('beforeunload',avisoSalir);
  const quitar=()=>{ document.removeEventListener('keydown',bloquearTeclas,true); window.removeEventListener('beforeunload',avisoSalir); ov.remove(); };
  return {
    texto:t=>{ p.textContent=t; },
    quitar,
    exito:(mensaje, alCerrar=null, segundos=8, titulo='Reporte enviado', nota='El formulario se limpió para el siguiente reporte.')=>{ document.removeEventListener('keydown',bloquearTeclas,true); window.removeEventListener('beforeunload',avisoSalir);
      ov.querySelector('.c').innerHTML=`<div class="ok">✅</div><h3>${titulo}</h3><p>${mensaje.replace(/[<>]/g,'')}</p>${nota?`<p style="margin-top:10px;font-size:12px">${nota}</p>`:''}<button type="button">Aceptar</button>`;
      let t=null; const cerrar=()=>{ clearTimeout(t); ov.remove(); if(alCerrar) alCerrar(); }; ov.querySelector('button').onclick=cerrar; t=setTimeout(cerrar, segundos*1000); }
  };
}
