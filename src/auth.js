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
  const { data: p } = await sb.from('perfiles').select('id,usuario,nombre,rango,activo,rol_id').eq('id', session.user.id).maybeSingle();
  if(!p) return null;
  let rol = null;
  if(p.rol_id){ const { data: r } = await sb.from('roles').select('id,nombre,permisos,formularios,rango_pm,protegido').eq('id', p.rol_id).maybeSingle(); rol = r; }
  return { ...p, rol: rol || { id:null, nombre:'Sin rol', permisos:{}, formularios:[], rango_pm:null } };
}
export const tiene = (yo, permiso) => !!(yo && yo.rol && yo.rol.permisos && yo.rol.permisos[permiso]);
export const puedeFormulario = (yo, id) => !!(yo && yo.rol && (yo.rol.formularios.includes('*') || yo.rol.formularios.includes(id)));
export const esSuperadmin = yo => !!(yo && yo.rol && yo.rol.protegido);
export const esAdminDeAlgo = yo => ['usuarios','asignar_roles','reset_password','crear_roles','crear_reportes','gestion_reportes','historial','eliminar_historial','auditoria'].some(p => tiene(yo,p));

// Exige sesión activa; opcionalmente un permiso o un formulario. Redirige a login si no cumple.
export async function requerir({ permiso=null, formulario=null } = {}){
  if(!configurado){ document.body.innerHTML = aviso('Falta configurar <code>config.js</code> con la URL y la clave pública de Supabase.'); throw new Error('sin config'); }
  const yo = await cargarYo();
  if(!yo || !yo.activo){ location.replace(RAIZ + 'login.html?next=' + encodeURIComponent(location.href)); throw new Error('sin sesión'); }
  vigilarInactividad();
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
  if(!document.getElementById('barraCss')){
    const s = document.createElement('style'); s.id = 'barraCss';
    s.textContent = `
.barra{display:flex;gap:14px;align-items:center;padding:8px 20px;background:#07100f;border-bottom:1px solid #1c272c;font:13px "Roboto Condensed",Arial,sans-serif;color:#9aa7ad;position:relative;z-index:50}
.barra a{color:#9aa7ad;text-decoration:none}
.barra a.oro{color:#f0c24d}
.barra .inicio{margin-right:auto}
.barra .menu{display:flex;gap:14px;align-items:center}
.barra .yo{color:#9aa7ad}.barra .yo b{color:#f3f3f3}
.barra .btn{display:none;background:#121f26;border:1px solid #2b3a40;color:#f3f3f3;border-radius:7px;padding:6px 10px;font:inherit;cursor:pointer;align-items:center;gap:8px;max-width:60vw}
.barra .btn span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (max-width:720px){
  .barra{padding:8px 14px}
  .barra .btn{display:flex}
  .barra .menu{display:none;position:absolute;right:10px;top:calc(100% + 6px);flex-direction:column;align-items:stretch;gap:0;background:#0f1a20;border:1px solid #2b3a40;border-radius:10px;min-width:220px;box-shadow:0 10px 30px rgba(0,0,0,.5);overflow:hidden}
  .barra.abierta .menu{display:flex}
  .barra .menu a,.barra .menu .yo{padding:12px 16px;border-bottom:1px solid #1c272c;font-size:15px}
  .barra .menu .yo{background:#121f26}
  .barra .menu a:last-child{border-bottom:0}
}`;
    document.head.append(s);
  }
  const b = document.createElement('div'); b.className = 'barra';
  b.innerHTML = `<a class="inicio" href="${RAIZ}">Inicio</a>
    <button class="btn" type="button" aria-label="Menú" aria-expanded="false"><span>👤 ${esc(nombreCompleto(yo))}</span> ☰</button>
    <nav class="menu">
      <span class="yo">👤 <b>${esc(nombreCompleto(yo))}</b> · ${esc(yo.rol.nombre)}</span>
      ${esAdminDeAlgo(yo) ? `<a class="oro" href="${RAIZ}admin/">Administración</a>` : ''}
      <a href="${RAIZ}reglamento.html">Reglamento</a>
      <a href="${RAIZ}cuenta.html">Mi cuenta</a>
      <a href="${RAIZ}privacidad.html" style="font-size:12px">Privacidad</a>
      <a href="#" id="btnSalir">Salir</a>
    </nav>`;
  const btn = b.querySelector('.btn');
  btn.onclick = e => { e.stopPropagation(); const ab = b.classList.toggle('abierta'); btn.setAttribute('aria-expanded', ab); };
  document.addEventListener('click', e => { if(!b.contains(e.target)){ b.classList.remove('abierta'); btn.setAttribute('aria-expanded','false'); } });
  b.querySelector('#btnSalir').onclick = e => { e.preventDefault(); cerrarSesion(); };
  document.body.prepend(b);
}

// Paso 1: registra el reporte (el servidor sella identidad, rango y Rango PM y asigna el folio).
export async function crearReporte({ formularioId, fecha, resumen, datos }){
  const { data, error } = await sb.from('reportes')
    .insert({ formulario_id: formularioId, usuario_id: (await sb.auth.getUser()).data.user.id, fecha: fecha || null, resumen, datos })
    .select('id, folio_v2, datos').single();
  if(error) throw new Error('No se pudo registrar el reporte: ' + error.message);
  return { id: data.id, folio: data.folio_v2, datos: data.datos };
}
// Paso 2: sube la imagen con el folio estampado y la adjunta al registro (solo una vez).
export async function adjuntarImagen({ yo, id, formularioId, pngBlob }){
  const path = `${yo.id}/${formularioId}-${id}.png`;
  const { error: e1 } = await sb.storage.from('reportes').upload(path, pngBlob, { contentType:'image/png', upsert:false });
  if(e1) throw new Error('No se pudo subir la imagen: ' + e1.message);
  const { error: e2 } = await sb.from('reportes').update({ imagen_path: path }).eq('id', id);
  if(e2) throw new Error('No se pudo adjuntar la imagen: ' + e2.message);
  return path;
}
// Publica el reporte en Discord si el formulario tiene webhook (lo hace el servidor; nunca falla el exportado por esto).
// Devuelve: 'ok' | 'sin_webhook' | 'error: …'
export async function notificarDiscord(reporteId){
  try{ const { data, error } = await sb.functions.invoke('notificar-discord', { body:{ reporte_id: reporteId } });
    if(error) return 'error: ' + (error.message||'sin respuesta');
    if(data && data.ok) return 'ok'; if(data && data.motivo==='sin_webhook') return 'sin_webhook'; return 'error: ' + ((data&&data.error)||'desconocido'); }
  catch(e){ return 'error: ' + e.message; }
}
export const textoDiscord = r => r==='ok' ? ' Publicado en Discord.' : r && r.startsWith('error') ? ` (No se pudo publicar en Discord: ${r.slice(7)})` : '';
// Compatibilidad: flujo completo en una llamada (sin folio en la imagen)
export async function guardarReporte({ yo, formularioId, fecha, resumen, datos, pngBlob }){
  const r = await crearReporte({ formularioId, fecha, resumen, datos });
  await adjuntarImagen({ yo, id: r.id, formularioId, pngBlob });
  return r.id;
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
    const b=document.createElement('div'); b.style.cssText='background:#2a1f10;border:1px solid #6b5420;border-radius:8px;padding:10px 14px;margin:0 0 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:14px;color:#f3f3f3';
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
  .pm-flot{display:none;position:fixed;left:0;right:0;bottom:0;z-index:40;background:#07100fee;border-top:1px solid #c9a43a;padding:8px 12px;gap:8px;backdrop-filter:blur(4px)}
  .pm-flot button{flex:1;padding:10px 8px;font-size:14px}
  .pm-cam{margin-left:6px;padding:6px 10px;font-size:12px;background:#243239;color:#f3f3f3;border:0;border-radius:6px;cursor:pointer;font-family:inherit;font-weight:700;text-transform:uppercase}
  @media (max-width:1000px){ .pm-flot{display:flex} body{padding-bottom:64px} }`;
  document.head.appendChild(s);
  const exportar=document.getElementById('btnExport'), preview=document.querySelector('.preview');
  if(exportar && preview){
    const bar=document.createElement('div'); bar.className='pm-flot';
    bar.innerHTML='<button type="button" class="secondary">👁 Vista previa</button><button type="button" class="primary">⬇ Exportar</button>';
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
