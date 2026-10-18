import { dibujarResumen, resumenPNG, resumenPDF, descargar } from './resumen-export.js';
import { respaldoCompleto } from './respaldo.js';
import { requerir, barraUsuario, tiene, sb, esc, notificarDiscord, avisoDiscord, hoyISO, cargarFoto, entrarVerComo, enVerComo, urlImagen, emailDe, RANGOS, nombreCompleto, esSuperadmin, validarPassword, traducirAuth } from './auth.js';

const yo = await requerir(); barraUsuario(yo);
const $ = s => document.querySelector(s);
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => document.getElementById(b.dataset.close).close());
const PERMS = ['usuarios','asignar_roles','reset_password','crear_roles','crear_reportes','gestion_reportes','disenar_formularios','historial','eliminar_historial','auditoria','aprobar_reportes','sanciones','turnos','ver_turnos','anuncios','ver_anuncios','ver_como'];
const NOMBRE_PERM = { usuarios:'Gestión de usuarios', asignar_roles:'Asignación de roles', reset_password:'Restablecer contraseñas',
  crear_roles:'Creación de roles', crear_reportes:'Creación de reportes', gestion_reportes:'Gestión de reportes', disenar_formularios:'Creación de formularios (diseñador)', historial:'Ver historial', eliminar_historial:'Eliminar historial', auditoria:'Ver auditoría', aprobar_reportes:'Revisar y aprobar reportes', sanciones:'Sanciones y advertencias', turnos:'Turnos: asignar y editar', ver_turnos:'Turnos: solo ver la agenda', anuncios:'Anuncios: publicar y editar', ver_anuncios:'Anuncios: solo ver el tablón y quién lo leyó', ver_como:'Ver la página como otro usuario (solo lectura)' };
const TABS = [
  ['usuarios',    'Usuarios',    ['usuarios','asignar_roles','reset_password']],
  ['roles',       'Roles',       ['crear_roles']],
  ['formularios', 'Formularios', ['crear_reportes','gestion_reportes']],
  ['revision',    'Revisión',    ['aprobar_reportes']],
  ['disciplina',  'Disciplina',  ['sanciones']],
  ['ascensos',    'Ascensos',    ['usuarios']],
  ['turnos',      'Turnos',      ['turnos','ver_turnos']],
  ['anuncios',    'Anuncios',    ['anuncios','ver_anuncios']],
  ['historial',   'Historial',   ['historial','eliminar_historial']],
  ['resumen',     'Resumen',     ['historial']],
  ['automatizacion','Automatización',['gestion_reportes']],
  ['auditoria',   'Auditoría',   ['auditoria']],
];
let roles = [], formularios = [], rangosPM = [];
let USUARIOS=[], ACTIV={}, SEL=new Set(), SANC=[], REQ={}, T_INICIO=null, T_VISTA='semana', ANUN=[], ANUN_IMG=null, ANUN_IMG_QUITAR=false;

// ---------- Pestañas según permisos ----------
const tabs = TABS.filter(([,,ps]) => ps.some(p => tiene(yo,p))).map(([id]) => id);
if(!tabs.length){ document.body.innerHTML = '<p style="padding:40px;text-align:center">No tienes permisos de administración.</p>'; throw new Error('sin permisos'); }
$('#rPermisos').innerHTML = PERMS.filter(p => p!=='ver_como').map(p => `<label><input type="checkbox" class="rp" value="${p}"> ${NOMBRE_PERM[p]}</label>`).join('') + `<p class="muted" style="margin:6px 0 0;font-size:12px">👁 "Ver la página como otro usuario" es exclusivo del rol Administrador.</p>`;
$('#tabs').innerHTML = TABS.filter(([id]) => tabs.includes(id)).map(([id,nombre]) => `<button data-t="${id}">${nombre}</button>`).join('');
let TAB_ACTUAL = null;
function abrir(t, sub=''){
  if(!tabs.includes(t)) t = tabs[0];
  const nuevo = t!==TAB_ACTUAL; TAB_ACTUAL = t;
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.t===t));
  document.querySelectorAll('section').forEach(s => s.classList.toggle('on', s.id==='t-'+t));
  const h = '#' + t + (sub ? '/' + sub : ''); if(location.hash !== h) history.replaceState(null, '', h);
  if(nuevo || !sub) return ({usuarios:cargarUsuarios, roles:cargarRoles, formularios:cargarForms, historial:cargarHist, resumen:cargarResumen, auditoria:cargarAud, automatizacion:cargarAutomatizacion, revision:cargarRevision, disciplina:cargarDisciplina, ascensos:cargarAscensos, turnos:cargarTurnos, anuncios:cargarAnuncios})[t]();
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => { cerrarDialogos(); abrir(b.dataset.t); });
// Sub-ventanas (diálogos) de crear/editar, con estado en la URL: #usuarios/nuevo · #usuarios/editar/<id> · #roles/… · #formularios/…
const DLG = { usuarios:'dlgUsuario', roles:'dlgRol', formularios:'dlgForm' };
function abrirDialogo(t, sub){ const d = $('#'+DLG[t]); if(!d.open) d.showModal(); d.scrollTop = 0; abrir(t, sub); const f = d.querySelector('input:not([disabled]):not([type=hidden]),select:not([disabled])'); if(f && window.innerWidth>720) setTimeout(()=>f.focus(), 50); }
function cerrarDialogos(){ Object.values(DLG).forEach(id => { const d = $('#'+id); if(d.open) d.close(); }); }
Object.values(DLG).forEach(id => { const d = $('#'+id); d.addEventListener('close', () => { if(TAB_ACTUAL && location.hash.includes('/')) history.replaceState(null, '', '#'+TAB_ACTUAL); }); d.addEventListener('cancel', e => { e.preventDefault(); d.close(); }); });
async function irAHash(){
  const [t, accion, id] = location.hash.replace(/^#/, '').split('/');
  if(!t || !tabs.includes(t)){ abrir(tabs[0]); return; }
  await abrir(t);
  if(!accion || !DLG[t]) return;
  if(accion==='nuevo'){ ({usuarios:nuevoUsuario, roles:nuevoRol, formularios:nuevoForm})[t](); return; }
  if(accion==='editar' && id){
    if(t==='usuarios'){ if(!USUARIOS.length) await cargarUsuarios(); const u = USUARIOS.find(x => x.id===id); if(u) editarUsuario(u); }
    if(t==='roles'){ const r = roles.find(x => x.id===id); if(r) editarRol(r); }
    if(t==='formularios'){ const f = formularios.find(x => x.id===id); if(f) editarForm(f); }
  }
}
window.addEventListener('hashchange', irAHash);
// Aviso flotante y resaltado de la fila recién guardada
let toastT=null; function toast(texto, err=false){ const t=$('#toast'); t.textContent=texto; t.className='toast on'+(err?' err':''); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('on'), 3200); }
let RESALTAR = null;
function resaltar(tbody, id){ const tr = tbody.querySelector(`tr[data-id="${CSS.escape(id)}"]`); if(!tr) return; tr.classList.add('resalta'); tr.scrollIntoView({ block:'center', behavior:'smooth' }); setTimeout(()=>tr.classList.remove('resalta'), 2600); }
await cargarCatalogos();
irAHash();
// Contador de pendientes en la pestaña Revisión
async function contarPendientes(){ if(!tiene(yo,'aprobar_reportes')) return; const { count } = await sb.from('reportes').select('id', { count:'exact', head:true }).eq('estado','pendiente'); const b = document.querySelector('nav button[data-t="revision"]'); if(b) b.innerHTML = 'Revisión' + (count ? ` <span class="tag pend" style="margin-left:4px">${count}</span>` : ''); }
contarPendientes(); setInterval(contarPendientes, 120000);

async function cargarCatalogos(){
  roles = (await sb.from('roles').select('*').order('nombre')).data || [];
  formularios = (await sb.from('formularios').select('*').order('orden')).data || [];
  rangosPM = (await sb.from('rangos_pm').select('*').order('orden')).data || [];
}
// ¿Puedo otorgar/asignar este conjunto de permisos y formularios? (Administrador: siempre)
function dentroDeMisPermisos(permisos, formularios){
  if(esSuperadmin(yo)) return true;
  const mp = yo.rol.permisos || {}, mf = yo.rol.formularios || [];
  if(PERMS.some(p => (permisos||{})[p] && !mp[p])) return false;
  if(mf.includes('*')) return true;
  if((formularios||[]).includes('*')) return false;
  return (formularios||[]).every(f => mf.includes(f));
}
const rolAsignable = r => !!r && dentroDeMisPermisos(r.permisos, r.formularios) && (!r.protegido || esSuperadmin(yo));
const permisosTexto = r => PERMS.filter(p => r.permisos && r.permisos[p]).map(p => NOMBRE_PERM[p]).join(', ') || '—';
const formsTexto = r => r.formularios.includes('*') ? 'Todos' : (r.formularios.map(id => (formularios.find(f=>f.id===id)||{titulo:id}).titulo).join(', ') || 'Ninguno');
const msg = (id, t, ok=false) => { $('#'+id+'Err').textContent = ok?'':t; $('#'+id+'Ok').textContent = ok?t:''; };

// ====================== USUARIOS ======================
const fFecha = d => d ? d.split('-').reverse().join('-') : '';
const puedoTocar = u => { const r = roles.find(x => x.id===u.rol_id); return u.id===yo.id || !r || rolAsignable(r); };
const motivoNoTocar = u => { const r = roles.find(x => x.id===u.rol_id); return r && r.protegido ? 'Solo Administrador' : 'Fuera de tus permisos'; };
async function cargarUsuarios(){
  if(tiene(yo,'auditoria')){ sb.from('auditoria').select('usuario,en').eq('accion','login_inactivo').gte('en', new Date(Date.now()-7*864e5).toISOString()).order('id',{ascending:false}).limit(50).then(({data})=>{ const av=$('#avisoInactivos'); if(!data||!data.length){ av.style.display='none'; return; } const qu=[...new Set(data.map(r=>r.usuario))]; av.style.display=''; av.innerHTML=`⚠️ <b>${data.length}</b> intento(s) de acceso con cuentas inactivas en los últimos 7 días: ${qu.map(esc).join(', ')}. <span class="muted">(Detalle en Auditoría › Usuarios)</span>`; }); }
  const { data, error } = await sb.from('perfiles').select('*').order('usuario');
  if(error){ $('#tbUsuarios').innerHTML = `<tr><td colspan=8 class="err">${esc(error.message)}</td></tr>`; return; }
  USUARIOS = data || []; SEL = new Set([...SEL].filter(id => USUARIOS.some(u => u.id===id)));
  sb.rpc('actividad_usuarios').then(({data}) => { ACTIV={}; (data||[]).forEach(a => ACTIV[a.usuario_id]=a); pintarUsuarios(); });
  $('#uRango').innerHTML = '<option value="">— Sin rango —</option>' + RANGOS.map(r => `<option>${esc(r)}</option>`).join('');
  const rolesAsignables = roles.filter(rolAsignable);
  $('#uRol').innerHTML = '<option value="">— Sin rol —</option>' + rolesAsignables.map(r => `<option value="${esc(r.id)}">${esc(r.nombre)}</option>`).join('');
  $('#uBulkRol').innerHTML = '<option value="">Asignar rol…</option>' + rolesAsignables.map(r => `<option value="${esc(r.id)}">${esc(r.nombre)}</option>`).join('');
  $('#uFiltroRol').innerHTML = '<option value="">Todos los roles</option>' + roles.map(r => `<option value="${esc(r.id)}">${esc(r.nombre)}</option>`).join('');
  $('#uRol').disabled = !tiene(yo,'asignar_roles'); $('#uRol').title = tiene(yo,'asignar_roles') ? '' : 'Necesitas el permiso de asignación de roles';
  ['#uNombre','#uRango','#uActivo','#uVisible'].forEach(s => $(s).disabled = !tiene(yo,'usuarios'));
  $('#uGuardar').style.display = (tiene(yo,'usuarios') || tiene(yo,'asignar_roles')) ? '' : 'none';
  $('#uNuevo').style.display = tiene(yo,'usuarios') ? '' : 'none';
  $('#uBulk').querySelector('.rolw').style.display = tiene(yo,'asignar_roles') ? '' : 'none';
  $('#uBulk').querySelectorAll('[data-bulk]:not([data-bulk=rol]):not([data-bulk=cancelar])').forEach(b => b.style.display = tiene(yo,'usuarios') ? '' : 'none');
  pintarUsuarios();
}
function usuariosFiltrados(){
  const q = ($('#uBuscar').value||'').trim().toLowerCase(), f = $('#uFiltro').value, fr = $('#uFiltroRol').value;
  return USUARIOS.filter(u => {
    const r = roles.find(x => x.id===u.rol_id);
    if(q && ![u.usuario, u.nombre, u.rango, r && r.nombre].filter(Boolean).join(' ').toLowerCase().includes(q)) return false;
    if(f==='activos' && !u.activo) return false; if(f==='inactivos' && u.activo) return false;
    if(f==='ocultos' && u.visible!==false) return false; if(f==='sinrol' && u.rol_id) return false;
    if(fr && u.rol_id!==fr) return false;
    return true;
  });
}
function pintarUsuarios(){
  const lista = usuariosFiltrados(); const vis = new Set(lista.map(u=>u.id));
  $('#uContador').textContent = lista.length===USUARIOS.length ? `${USUARIOS.length} usuario(s)` : `Mostrando ${lista.length} de ${USUARIOS.length}`;
  $('#tbUsuarios').innerHTML = lista.map(u => {
    const r = roles.find(x => x.id===u.rol_id); const a = ACTIV[u.id];
    return `<tr class="urow ${SEL.has(u.id)?'sel':''}" data-id="${u.id}">
      <td class="chk"><input type="checkbox" data-sel="${u.id}" ${SEL.has(u.id)?'checked':''} ${puedoTocar(u)?'':'disabled title="'+motivoNoTocar(u)+'"'}></td>
      <td class="u"><b>${esc(u.usuario)}</b>${u.id===yo.id?' <span class="muted" style="font-size:11px">(tú)</span>':''}</td>
      <td class="nom">${esc(nombreCompleto(u))}</td><td>${esc(r ? r.nombre : 'Sin rol')}</td>
      <td><span class="tag ${u.activo?'on':'off'}">${u.activo?'Activo':'Inactivo'}</span></td>
      <td><span class="tag ${(u.activo&&u.visible!==false)?'on':'off'}" title="${u.activo?'':'Los usuarios inactivos nunca aparecen en los formularios'}">${u.visible===false?'Oculto':'Visible'}</span></td>
      <td class="ult muted">${a ? `${fFecha(a.ultimo)} <span style="font-size:11px">(${a.reportes})</span>` : '—'}</td>
      <td class="acc"><button type="button" class="btn-acc" data-menu="${u.id}" title="Acciones" aria-label="Acciones">⋯</button></td></tr>`;
  }).join('') || '<tr><td colspan=8 class="muted">Sin usuarios que coincidan</td></tr>';
  const todos = $('#uTodos'); const sel = lista.filter(u=>puedoTocar(u));
  todos.checked = sel.length>0 && sel.every(u=>SEL.has(u.id)); todos.indeterminate = !todos.checked && sel.some(u=>SEL.has(u.id));
  document.querySelectorAll('[data-sel]').forEach(c => c.onchange = () => { c.checked ? SEL.add(c.dataset.sel) : SEL.delete(c.dataset.sel); pintarUsuarios(); });
  document.querySelectorAll('[data-menu]').forEach(b => b.onclick = e => { e.stopPropagation(); abrirMenuUsuario(b, USUARIOS.find(u=>u.id===b.dataset.menu)); });
  document.querySelectorAll('tr.urow').forEach(tr => tr.onclick = e => { if(e.target.closest('input,button,a')) return; const u = USUARIOS.find(x=>x.id===tr.dataset.id); if(u && puedoTocar(u) && (tiene(yo,'usuarios')||tiene(yo,'asignar_roles'))) editarUsuario(u); });
  const n = [...SEL].filter(id => vis.has(id)).length; $('#uBulkN').textContent = SEL.size; $('#uBulk').classList.toggle('on', SEL.size>0);
  if(RESALTAR){ const id = RESALTAR; if(!vis.has(id)){ $('#uBuscar').value=''; $('#uFiltro').value=''; $('#uFiltroRol').value=''; pintarUsuarios(); return; } resaltar($('#tbUsuarios'), id); setTimeout(()=>{ if(RESALTAR===id) RESALTAR=null; }, 2600); }
}
$('#uNuevo').onclick = () => nuevoUsuario();
['#uBuscar','#uFiltro','#uFiltroRol'].forEach(s => $(s).addEventListener('input', pintarUsuarios));
$('#uTodos').onchange = () => { const lista = usuariosFiltrados().filter(puedoTocar); if($('#uTodos').checked) lista.forEach(u=>SEL.add(u.id)); else lista.forEach(u=>SEL.delete(u.id)); pintarUsuarios(); };

// Menú ⋯ por usuario
function abrirMenuUsuario(btn, u){
  const r = roles.find(x => x.id===u.rol_id); const ok = puedoTocar(u); const ops = [];
  if(ok && (tiene(yo,'usuarios')||tiene(yo,'asignar_roles'))) ops.push(['editar','✏️ Editar']);
  if(tiene(yo,'ver_como') && !enVerComo(yo) && u.id!==yo.id) ops.push(['vercomo','👁 Ver la página como este usuario']);
  ops.push(['expediente','📁 Expediente (sanciones, ascensos, reportes)']);
  if(tiene(yo,'historial')) ops.push(['reportes','📋 Ver sus reportes']);
  if(ok && tiene(yo,'reset_password') && u.id!==yo.id) ops.push(['password','🔑 Restablecer contraseña']);
  if(esSuperadmin(yo) && u.id!==yo.id) ops.push(['mfa','🔓 Quitar verificación en dos pasos']);
  if(ok && tiene(yo,'usuarios')){ ops.push(['visible', u.visible===false ? '👁 Mostrar en formularios' : '🙈 Ocultar en formularios']); if(u.id!==yo.id) ops.push([u.activo?'desactivar':'activar', u.activo ? '⛔ Desactivar cuenta' : '✅ Activar cuenta']); }
  abrirMenu(btn, u.id, `<b style="color:var(--text)">${esc(u.usuario)}</b> · ${esc(r?r.nombre:'Sin rol')}${ok?'':` · <span style="color:var(--err2)">${motivoNoTocar(u)}</span>`}`, ops.map(([k,t]) => [k, t, k==='desactivar']), op => accionUsuario(op, u));
}
// Menú flotante genérico: ops = [[clave, texto, peligro?]]
function abrirMenu(btn, id, cab, ops, alElegir){
  const m = $('#uMenu'); if(m.parentElement!==document.body) document.body.appendChild(m); if(!m.hidden && m.dataset.id===id){ cerrarMenu(); return; }
  m.innerHTML = `<div class="cab">${cab}</div>` + (ops.map(([k,t,pel]) => `<button type="button" data-op="${k}" class="${pel?'peligro':''}">${t}</button>`).join('') || '<div class="cab" style="border:0">Sin acciones disponibles</div>');
  m.dataset.id = id; m.hidden = false; btn.classList.add('on');
  const rb = btn.getBoundingClientRect(), mw = m.offsetWidth; let x = rb.right - mw + window.scrollX, y = rb.bottom + 4 + window.scrollY; if(x < 8) x = 8;
  if(rb.bottom + m.offsetHeight > window.innerHeight - 8) y = rb.top - m.offsetHeight - 4 + window.scrollY;
  m.style.left = x+'px'; m.style.top = y+'px';
  m.querySelectorAll('[data-op]').forEach(b => b.onclick = () => { cerrarMenu(); alElegir(b.dataset.op); });
}
const botonMenu = (id, extra='') => `<button type="button" class="btn-acc" data-menu="${esc(id)}" ${extra} title="Acciones" aria-label="Acciones">⋯</button>`;
function cerrarMenu(){ const m = $('#uMenu'); m.hidden = true; document.querySelectorAll('.btn-acc.on').forEach(b=>b.classList.remove('on')); }
document.addEventListener('click', e => { if(!e.target.closest('#uMenu')) cerrarMenu(); });
document.addEventListener('keydown', e => { if(e.key==='Escape') cerrarMenu(); });
window.addEventListener('resize', cerrarMenu);
async function accionUsuario(op, u){
  try{
    if(op==='editar') editarUsuario(u);
    else if(op==='expediente') location.href = '../expediente.html?id=' + encodeURIComponent(u.id);
    else if(op==='vercomo'){ if(!confirm(`Vas a ver la página como "${nombreCompleto(u)}" (solo lectura). Verás una franja amarilla arriba para salir del modo. Esta acción queda en la auditoría.\n\n¿Continuar?`)) return; await entrarVerComo(u.id); }
    else if(op==='reportes'){ abrir('historial'); $('#hUsuario').value = u.usuario; $('#hForm').value=''; $('#hDesde').value=''; $('#hHasta').value=''; buscarHist(); window.scrollTo({top:0,behavior:'smooth'}); }
    else if(op==='password') resetearPassword(u.id, u.usuario);
    else if(op==='mfa') await quitarMfa(u);
    else if(op==='visible'){ await actualizarPerfiles([u], { visible: u.visible===false }); }
    else if(op==='activar'){ await actualizarPerfiles([u], { activo:true }); }
    else if(op==='desactivar'){ if(!confirm(`¿Desactivar la cuenta de "${u.usuario}"? No podrá iniciar sesión ni aparecerá en los formularios.`)) return; await actualizarPerfiles([u], { activo:false }); }
  }catch(x){ alert(x.message||String(x)); }
}
async function actualizarPerfiles(lista, cambios){
  const errores = [];
  for(const u of lista){ const { error } = await sb.from('perfiles').update(cambios).eq('id', u.id); if(error) errores.push(`${u.usuario}: ${error.message}`); }
  await cargarUsuarios();
  if(errores.length) throw new Error('Algunos cambios no se aplicaron:\n' + errores.join('\n'));
}

// Acciones en bloque
document.querySelectorAll('[data-bulk]').forEach(b => b.onclick = async () => {
  const op = b.dataset.bulk;
  if(op==='cancelar'){ SEL.clear(); pintarUsuarios(); return; }
  let lista = USUARIOS.filter(u => SEL.has(u.id) && puedoTocar(u));
  if(op==='desactivar') lista = lista.filter(u => u.id!==yo.id);
  if(!lista.length){ alert('No hay usuarios seleccionados sobre los que puedas aplicar esta acción.'); return; }
  const nombres = lista.map(u=>u.usuario).join(', ');
  const cambios = { activar:{activo:true}, desactivar:{activo:false}, mostrar:{visible:true}, ocultar:{visible:false} }[op];
  let texto = { activar:'Activar', desactivar:'Desactivar', mostrar:'Mostrar en formularios', ocultar:'Ocultar en formularios' }[op];
  let c = cambios;
  if(op==='rol'){ const rid = $('#uBulkRol').value; if(!rid){ alert('Elige el rol que quieres asignar.'); return; } const r = roles.find(x=>x.id===rid); c = { rol_id: rid }; texto = `Asignar el rol "${r?r.nombre:rid}"`; }
  if(!confirm(`${texto} a ${lista.length} usuario(s):\n${nombres}\n\n¿Continuar?`)) return;
  try{ await actualizarPerfiles(lista, c); SEL.clear(); pintarUsuarios(); }catch(x){ alert(x.message); }
});
function mostrarPass(on){ const i=$('#uPass'); [i.previousElementSibling, i, i.nextElementSibling].forEach(e => { if(e) e.style.display = on ? '' : 'none'; }); }
function nuevoUsuario(){ limpiarUsuario(); abrirDialogo('usuarios', 'nuevo'); }
function editarUsuario(u){
  $('#tituloUsuario').textContent = 'Editar usuario · ' + u.usuario; $('#uGuardar').textContent = 'Guardar';
  const r = roles.find(x => x.id===u.rol_id), a = ACTIV[u.id], ctx = $('#uCtx'); ctx.style.display='';
  ctx.innerHTML = `<span>Rol: <b style="color:var(--text)">${esc(r?r.nombre:'Sin rol')}</b></span><span>Último reporte: <b style="color:var(--text)">${a ? `${fFecha(a.ultimo)} (${a.reportes})` : '—'}</b></span>`
    + ((tiene(yo,'ver_como') && !enVerComo(yo) && u.id!==yo.id) ? `<a data-ctx="vercomo">👁 Ver como</a>` : '')
    + ((puedoTocar(u) && tiene(yo,'reset_password') && u.id!==yo.id) ? `<a data-ctx="password">🔑 Restablecer contraseña</a>` : '')
    + (tiene(yo,'historial') ? `<a data-ctx="reportes">📋 Sus reportes</a>` : '') + `<a data-ctx="expediente">📁 Expediente</a>`;
  ctx.querySelectorAll('[data-ctx]').forEach(x => x.onclick = () => { if(x.dataset.ctx!=='password') $('#dlgUsuario').close(); accionUsuario(x.dataset.ctx, u); });
  $('#uId').value = u.id; $('#uUsuario').value = u.usuario; $('#uUsuario').disabled = true; $('#uNombre').value = u.nombre; $('#uRango').value = u.rango || '';
  $('#uPass').value=''; $('#uPass').disabled = true; mostrarPass(false);
  $('#uRol').value = u.rol_id || ''; $('#uActivo').checked = u.activo; $('#uVisible').checked = u.visible!==false; msg('u','');
  abrirDialogo('usuarios', 'editar/'+u.id);
}
function limpiarUsuario(){
  $('#fUsuario').reset(); $('#tituloUsuario').textContent = 'Nuevo usuario'; $('#uGuardar').textContent = 'Crear';
  $('#uId').value=''; $('#uUsuario').disabled=false; $('#uPass').disabled=false; mostrarPass(true); $('#uActivo').checked=true; $('#uVisible').checked=true; $('#uCtx').style.display='none'; msg('u','');
}
$('#uCancelar').onclick = () => $('#dlgUsuario').close();
$('#fUsuario').onsubmit = async e => {
  e.preventDefault(); msg('u','');
  const id=$('#uId').value, usuario=$('#uUsuario').value.trim().toLowerCase(), nombre=$('#uNombre').value.trim(), rango=$('#uRango').value||null, rol=$('#uRol').value, activo=$('#uActivo').checked, visible=$('#uVisible').checked;
  try{
    if(id){
      const cambios = {}; if(tiene(yo,'usuarios')) Object.assign(cambios, { nombre, rango, activo, visible }); if(tiene(yo,'asignar_roles')) cambios.rol_id = rol || null;
      const { error } = await sb.from('perfiles').update(cambios).eq('id', id); if(error) throw error;
          } else {
      if(!tiene(yo,'usuarios')) throw new Error('No tienes permiso para crear usuarios.');
      const pass=$('#uPass').value; { const v=validarPassword(pass); if(v) throw new Error('Contraseña inicial: '+v); }
      // Alta por función de servidor (clave de servicio: no pasa por captcha ni por el registro público)
      const { data, error } = await sb.functions.invoke('crear-usuario', { body:{ usuario, nombre, password: pass } });
      if(error){ let m=error.message; try{ const j=await error.context.json(); if(j.error) m=j.error; }catch{} throw new Error(m); }
      if(!data || !data.id) throw new Error((data && data.error) || 'No se pudo crear el usuario.');
      data.user = { id: data.id };
      // El trigger creó el perfil inactivo con rol "usuario"; ahora lo ajustamos
      const cambios = { nombre, rango, activo, visible }; if(tiene(yo,'asignar_roles')) cambios.rol_id = rol || null;
      // pequeño reintento: el trigger puede tardar unos ms
      let ok=false; for(let i=0;i<5 && !ok;i++){ const r = await sb.from('perfiles').update(cambios).eq('id', data.user.id).select('id'); ok = !r.error && r.data && r.data.length; if(!ok) await new Promise(r=>setTimeout(r,400)); }
      if(!ok) throw new Error('El usuario se creó pero no se pudo activar; edítalo desde la lista.');
      RESALTAR = data.user.id; $('#dlgUsuario').close(); limpiarUsuario(); toast(`Usuario "${usuario}" creado.`); cargarUsuarios(); return;
    }
    RESALTAR = id; $('#dlgUsuario').close(); limpiarUsuario(); toast('Usuario actualizado.'); cargarUsuarios();
  }catch(x){ msg('u', x.message || String(x)); }
};

async function quitarMfa(u){
  const { data: q, error: e0 } = await sb.functions.invoke('reset-mfa', { body:{ usuario_id: u.id, consultar: true } });
  if(e0 || !q || q.error){ alert('No se pudo consultar: ' + (e0 ? e0.message : (q && q.error) || 'sin respuesta')); return; }
  if(!q.factores){ alert(`${u.usuario} no tiene verificación en dos pasos activa.`); return; }
  if(!confirm(`${u.usuario} tiene la verificación en dos pasos activa (${q.verificados} factor(es)). ¿Quitarla? Podrá entrar solo con su contraseña y volver a configurarla desde Mi cuenta. Queda en Auditoría.`)) return;
  const { data, error } = await sb.functions.invoke('reset-mfa', { body:{ usuario_id: u.id } });
  if(error || !data || data.error){ alert('No se pudo quitar: ' + (error ? error.message : (data && data.error) || 'sin respuesta')); return; }
  toast(`Verificación en dos pasos de ${u.usuario} eliminada (${data.quitados} factor(es)).`);
}
let rpObjetivo=null;
function resetearPassword(id, usuario){ rpObjetivo=id; $('#rpUsuario').textContent='Usuario: '+usuario; $('#fReset').reset(); $('#rpErr').textContent=''; $('#dlgPass').showModal(); }
$('#fReset').onsubmit = async e => {
  e.preventDefault(); const err=$('#rpErr'); err.textContent='';
  const a=$('#rpPass').value, b=$('#rpPass2').value; if(a!==b){ err.textContent='Las contraseñas no coinciden.'; return; }
  { const v=validarPassword(a); if(v){ err.textContent=v; return; } }
  const btn=$('#rpOk'); btn.disabled=true;
  try{
    const { data, error } = await sb.functions.invoke('reset-password', { body:{ usuario_id: rpObjetivo, password: a } });
    if(error){ let m=error.message; try{ const j=await error.context.json(); if(j.error) m=j.error; }catch{} throw new Error(m); }
    if(data && data.error) throw new Error(data.error);
    $('#dlgPass').close(); toast('Contraseña restablecida.');
  }catch(x){ err.textContent=x.message; }
  btn.disabled=false;
};

// ====================== ROLES ======================
async function cargarRoles(){
  await cargarCatalogos();
  const sel = $('#rRangoPM'), cur = sel.value;
  sel.innerHTML = '<option value="">— Sin Rango PM —</option>' + rangosPM.map(r => `<option>${esc(r.nombre)}</option>`).join(''); sel.value = cur;
  $('#cajaRangosPM').style.display = tiene(yo,'crear_roles') ? '' : 'none';
  $('#tbRangosPM').innerHTML = rangosPM.map(r => `<tr><td><b>${esc(r.nombre)}</b></td><td>${r.orden}</td>
    <td class="muted">${esc(roles.filter(x => x.rango_pm===r.nombre).map(x => x.nombre).join(', ') || '—')}</td>
    <td style="white-space:nowrap"><button class="ghost sm" data-pme="${esc(r.nombre)}">Editar</button><button class="ghost sm" data-pmd="${esc(r.nombre)}">Eliminar</button></td></tr>`).join('') || '<tr><td colspan=4 class="muted">Sin rangos PM</td></tr>';
  document.querySelectorAll('[data-pme]').forEach(b => b.onclick = () => { const r = rangosPM.find(x => x.nombre===b.dataset.pme); $('#pmOriginal').value=r.nombre; $('#pmNombre').value=r.nombre; $('#pmOrden').value=r.orden; $('#pmGuardar').textContent='Guardar'; msg('pm',''); });
  document.querySelectorAll('[data-pmd]').forEach(b => b.onclick = async () => {
    const usan = roles.filter(x => x.rango_pm===b.dataset.pmd).length;
    if(!confirm(`¿Eliminar "${b.dataset.pmd}"?${usan ? ` ${usan} rol(es) quedarán sin Rango PM.` : ''}`)) return;
    const { error } = await sb.from('rangos_pm').delete().eq('nombre', b.dataset.pmd); if(error) alert(error.message); cargarRoles();
  });
  $('#rForms').innerHTML = `<label><input type="checkbox" value="*" id="rTodos"> Todos</label>` +
    formularios.map(f => `<label><input type="checkbox" value="${esc(f.id)}" class="rf"> ${esc(f.titulo)}</label>`).join('');
  const mf = yo.rol.formularios || [], mp = yo.rol.permisos || {}, sup = esSuperadmin(yo);
  $('#rTodos').disabled = !sup && !mf.includes('*');
  document.querySelectorAll('.rp').forEach(c => { c.disabled = !sup && !mp[c.value]; c.parentElement.title = c.disabled ? 'No tienes este permiso' : ''; c.parentElement.style.opacity = c.disabled ? '.5' : ''; });
  $('#rTodos').onchange = () => document.querySelectorAll('.rf').forEach(c => { c.disabled = $('#rTodos').checked || (!sup && !mf.includes('*') && !mf.includes(c.value)); });
  $('#rTodos').onchange();
  $('#rNuevo').style.display = tiene(yo,'crear_roles') ? '' : 'none';
  $('#tbRoles').innerHTML = roles.map(r => `<tr data-id="${esc(r.id)}"><td><b>${esc(r.nombre)}</b><br><span class="muted">${esc(r.id)} · ${esc(r.descripcion||'')}</span></td>
    <td>${esc(r.rango_pm||'—')}</td><td>${esc(permisosTexto(r))}</td><td>${esc(formsTexto(r))}</td>
    <td class="acc" style="text-align:right">${botonMenu(r.id, 'data-k="rol"')}</td></tr>`).join('');
  document.querySelectorAll('#tbRoles tr[data-id]').forEach(tr => tr.onclick = e => { if(e.target.closest('input,button,a')) return; const r = roles.find(x => x.id===tr.dataset.id); if(r && rolAsignable(r)) editarRol(r); });
  if(RESALTAR){ resaltar($('#tbRoles'), RESALTAR); RESALTAR=null; }
  document.querySelectorAll('#tbRoles [data-menu]').forEach(b => b.onclick = e => { e.stopPropagation(); const r = roles.find(x => x.id===b.dataset.menu); const ok = rolAsignable(r);
    const ops = []; if(ok){ ops.push(['editar','✏️ Editar']); if(!r.protegido) ops.push(['eliminar','🗑 Eliminar rol', true]); }
    abrirMenu(b, 'rol:'+r.id, `<b style="color:var(--text)">${esc(r.nombre)}</b>${ok?'':` · <span style="color:var(--err2)">${r.protegido?'Solo Administrador':'Fuera de tus permisos'}</span>`}`, ops, async op => {
      if(op==='editar') editarRol(r);
      if(op==='eliminar'){ if(!confirm(`¿Eliminar el rol "${r.nombre}"? Los usuarios que lo tengan quedarán sin rol.`)) return; const { error } = await sb.from('roles').delete().eq('id', r.id); if(error) alert(error.message); cargarRoles(); }
    }); });
}
function nuevoRol(){ limpiarRol(); abrirDialogo('roles', 'nuevo'); }
$('#rNuevo').onclick = () => nuevoRol();
function editarRol(r){
  $('#tituloRol').textContent='Editar rol · '+r.nombre; $('#rGuardar').textContent='Guardar';
  $('#rId').value=r.id; $('#rId').disabled=true; $('#rNombre').value=r.nombre; $('#rDesc').value=r.descripcion||''; $('#rRangoPM').value=r.rango_pm||'';
  document.querySelectorAll('.rp').forEach(c => c.checked = !!(r.permisos||{})[c.value]);
  $('#rTodos').checked = r.formularios.includes('*'); $('#rTodos').onchange();
  document.querySelectorAll('.rf').forEach(c => c.checked = r.formularios.includes(c.value)); msg('r','');
  abrirDialogo('roles', 'editar/'+r.id);
}
function limpiarRol(){ $('#fRol').reset(); $('#tituloRol').textContent='Nuevo rol'; $('#rGuardar').textContent='Crear'; $('#rId').disabled=false; $('#rTodos').onchange(); msg('r',''); }
$('#rCancelar').onclick = () => $('#dlgRol').close();
$('#fRol').onsubmit = async e => {
  e.preventDefault(); msg('r','');
  const rol = { id:$('#rId').value.trim().toLowerCase(), nombre:$('#rNombre').value.trim(), descripcion:$('#rDesc').value.trim(), rango_pm:$('#rRangoPM').value||null,
    permisos: Object.fromEntries([...document.querySelectorAll('.rp')].map(c => [c.value, c.checked])),
    formularios: $('#rTodos').checked ? ['*'] : [...document.querySelectorAll('.rf:checked')].map(c => c.value) };
  if(rol.id==='admin' && !(rol.permisos.crear_roles && rol.permisos.asignar_roles && rol.permisos.auditoria)){ msg('r','El rol admin debe conservar los permisos de roles.'); return; }
  const { error } = await sb.from('roles').upsert(rol); if(error){ msg('r', error.message); return; }
  RESALTAR = rol.id; $('#dlgRol').close(); limpiarRol(); toast('Rol guardado.'); cargarRoles();
};

function limpiarRangoPM(){ $('#fRangoPM').reset(); $('#pmOriginal').value=''; $('#pmOrden').value=100; $('#pmGuardar').textContent='Crear'; msg('pm',''); }
$('#pmCancelar').onclick = limpiarRangoPM;
$('#fRangoPM').onsubmit = async e => {
  e.preventDefault(); msg('pm','');
  const nombre=$('#pmNombre').value.trim(), orden=parseInt($('#pmOrden').value)||100, original=$('#pmOriginal').value;
  if(!nombre) return;
  const { error } = original
    ? await sb.from('rangos_pm').update({ nombre, orden }).eq('nombre', original)
    : await sb.from('rangos_pm').insert({ nombre, orden });
  if(error){ msg('pm', /duplicate|unique/i.test(error.message) ? 'Ya existe un Rango PM con ese nombre.' : error.message); return; }
  limpiarRangoPM(); msg('pm','Rango PM guardado.', true); cargarRoles();
};

// ====================== FORMULARIOS ======================
async function cargarForms(){
  await cargarCatalogos();
  $('#fNuevo').style.display = tiene(yo,'crear_reportes') ? '' : 'none';
  $('#fDiscordW').style.display = tiene(yo,'gestion_reportes') ? '' : 'none';
  const ld=document.getElementById('linkDisenador'); if(ld) ld.style.display = tiene(yo,'disenar_formularios') ? '' : 'none';
  $('#tbForms').innerHTML = formularios.map(f => `<tr data-id="${esc(f.id)}"><td style="font-size:22px">${esc(f.icono||'')}</td><td><b>${esc(f.titulo)}</b><br><span class="muted">${esc(f.id)}</span></td>
    <td><a href="../${esc(f.ruta)}" target="_blank">${esc(f.ruta)}</a></td><td>${f.orden}</td>
    <td><span class="tag ${f.activo?'on':'off'}">${f.activo?'Visible':'Oculto'}</span>${f.requiere_aprobacion ? ` <span class="tag pend" title="Los reportes nuevos quedan pendientes de revisión">Con revisión</span>` : ''}${f.definicion ? ` <span class="tag" title="Creado con el diseñador">Plantilla v${f.version||1}</span>` : ''}</td>
    <td class="acc" style="text-align:right">${botonMenu(f.id)}</td></tr>`).join('') || '<tr><td colspan=6 class="muted">Sin formularios</td></tr>';
  document.querySelectorAll('#tbForms tr[data-id]').forEach(tr => tr.onclick = e => { if(e.target.closest('input,button,a')) return; const f = formularios.find(x => x.id===tr.dataset.id); if(f && tiene(yo,'gestion_reportes')) editarForm(f); });
  if(RESALTAR){ resaltar($('#tbForms'), RESALTAR); RESALTAR=null; }
  document.querySelectorAll('#tbForms [data-menu]').forEach(b => b.onclick = e => { e.stopPropagation(); const f = formularios.find(x => x.id===b.dataset.menu);
    const ops = [['abrir','↗ Abrir el formulario']];
    if(f.definicion && tiene(yo,'disenar_formularios')) ops.push(['disenar','🎨 Diseñar plantilla']);
    if(tiene(yo,'gestion_reportes')){ ops.push(['editar','✏️ Editar'], ['activo', f.activo ? '🙈 Ocultar del inicio' : '👁 Mostrar en el inicio'], ['eliminar','🗑 Eliminar del catálogo', true]); }
    abrirMenu(b, 'form:'+f.id, `<b style="color:var(--text)">${esc(f.titulo)}</b>${tiene(yo,'gestion_reportes')?'':' · solo lectura'}`, ops, async op => {
      if(op==='abrir') window.open('../'+f.ruta, '_blank');
      if(op==='disenar') location.href = 'disenador.html?id='+encodeURIComponent(f.id);
      if(op==='editar') editarForm(f);
      if(op==='activo'){ const { error } = await sb.from('formularios').update({ activo: !f.activo }).eq('id', f.id); if(error) alert(error.message); cargarForms(); }
      if(op==='eliminar'){ if(!confirm(`¿Eliminar "${f.titulo}" del catálogo? Los reportes del historial se conservan.`)) return; const { error } = await sb.from('formularios').delete().eq('id', f.id); if(error) alert(error.message); cargarForms(); }
    }); });
}
function nuevoForm(){ limpiarForm(); abrirDialogo('formularios', 'nuevo'); }
$('#fNuevo').onclick = () => nuevoForm();
function editarForm(f){
  $('#tituloForm').textContent='Editar formulario · '+f.titulo; $('#fGuardar').textContent='Guardar';
  $('#fId').value=f.id; $('#fId').disabled=true; $('#fTitulo').value=f.titulo; $('#fDesc').value=f.descripcion||''; $('#fIcono').value=f.icono||'';
  $('#fOrden').value=f.orden; $('#fRuta').value=f.ruta; $('#fActivo').checked=f.activo; $('#fAprob').checked=!!f.requiere_aprobacion; msg('f','');
  $('#fWebhook').value=''; $('#fWebhookOn').checked=true; $('#fDiscordMsg').textContent='';
  if(tiene(yo,'gestion_reportes')) sb.from('formularios_discord').select('webhook,activo').eq('formulario_id',f.id).maybeSingle().then(({data})=>{ if(data){ $('#fWebhook').value=data.webhook; $('#fWebhookOn').checked=data.activo; } });
  abrirDialogo('formularios', 'editar/'+f.id);
}
$('#fProbar').onclick = async () => {
  const id=$('#fId').value.trim().toLowerCase(); if(!id){ $('#fDiscordMsg').textContent='Guarda primero el formulario.'; return; }
  await guardarDiscord(id); $('#fDiscordMsg').textContent='Enviando…';
  const { data, error } = await sb.functions.invoke('notificar-discord', { body:{ formulario_id:id, prueba:true } });
  $('#fDiscordMsg').textContent = error ? 'Error: '+error.message : (data&&data.ok) ? '✅ Mensaje de prueba enviado al canal.' : 'Error: '+((data&&data.error)||'sin respuesta');
};
async function guardarDiscord(id){
  if(!tiene(yo,'gestion_reportes')) return;
  const w=$('#fWebhook').value.trim();
  if(!w){ await sb.from('formularios_discord').delete().eq('formulario_id',id); return; }
  if(!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(w)){ throw new Error('El webhook debe ser un enlace de Discord (https://discord.com/api/webhooks/…).'); }
  const { error } = await sb.from('formularios_discord').upsert({ formulario_id:id, webhook:w, activo:$('#fWebhookOn').checked, actualizado_en:new Date().toISOString() });
  if(error) throw error;
}
function limpiarForm(){ $('#fForm').reset(); $('#fDiscordMsg').textContent=''; $('#tituloForm').textContent='Nuevo formulario'; $('#fGuardar').textContent='Crear'; $('#fId').disabled=false; $('#fIcono').value='📋'; $('#fOrden').value=100; msg('f',''); }
$('#fCancelar').onclick = () => $('#dlgForm').close();
$('#fForm').onsubmit = async e => {
  e.preventDefault(); msg('f','');
  if($('#fId').disabled ? !tiene(yo,'gestion_reportes') : !tiene(yo,'crear_reportes')){ msg('f', $('#fId').disabled ? 'No tienes permiso de gestión de reportes.' : 'No tienes permiso de creación de reportes.'); return; }
  const f = { id:$('#fId').value.trim().toLowerCase(), titulo:$('#fTitulo').value.trim(), descripcion:$('#fDesc').value.trim(), icono:$('#fIcono').value.trim(),
    orden:parseInt($('#fOrden').value)||100, ruta:$('#fRuta').value.trim(), activo:$('#fActivo').checked, requiere_aprobacion:$('#fAprob').checked };
  const { error } = await sb.from('formularios').upsert(f); if(error){ msg('f', error.message); return; }
  try{ await guardarDiscord(f.id); }catch(x){ msg('f','Formulario guardado, pero el webhook no: '+x.message); cargarForms(); return; }
  RESALTAR = f.id; $('#dlgForm').close(); limpiarForm(); toast('Formulario guardado.'); cargarForms();
};

// ====================== CSV ======================
let HIST_DATA = [], AUD_DATA = [];
function descargarCsv(nombre, columnas, filas){
  const esc_ = v => { const t = v===null||v===undefined ? '' : (typeof v==='object' ? JSON.stringify(v) : String(v)); return /[",\n;]/.test(t) ? '"' + t.replace(/"/g,'""') + '"' : t; };
  const csv = '\ufeff' + [columnas.map(c=>c[0]).join(';'), ...filas.map(r => columnas.map(c => esc_(typeof c[1]==='function' ? c[1](r) : r[c[1]])).join(';'))].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' })); a.download = `${nombre}-${new Date().toISOString().slice(0,10)}.csv`; a.click();
}
$('#hCsv').onclick = () => descargarCsv('historial', [['Folio','folio'],['Fecha','fecha'],['Formulario','formulario'],['Estado','estado'],['Revisor','revisor'],['Comentario revisión','comentario_revision'],['Usuario','usuario'],['Nombre',r=>[r.usuario_rango,r.usuario_nombre].filter(Boolean).join(' ')],['Resumen','resumen'],['Registrado',r=>r.creado_en?new Date(r.creado_en).toLocaleString('es-CO'):''],['Imagen','imagen_path'],['Datos','datos']], HIST_DATA);
$('#aCsv').onclick = () => descargarCsv('auditoria', [['Cuándo',r=>new Date(r.en).toLocaleString('es-CO')],['Quién','usuario'],['Acción','accion'],['Tabla','tabla'],['Registro','registro'],['Detalle','detalle']], AUD_DATA);

// ====================== HISTORIAL ======================
async function cargarHist(){
  await cargarCatalogos();
  $('#hForm').innerHTML = '<option value="">Todos</option>' + formularios.map(f => `<option value="${esc(f.id)}">${esc(f.titulo)}</option>`).join('');
  // Rango de fechas y lista de usuarios a partir de lo que existe en el historial
  const { data } = await sb.from('reportes_vista').select('fecha,usuario,usuario_nombre,usuario_rango,usuario_visible').limit(2000);
  const fechas = (data||[]).map(r => r.fecha).filter(Boolean).sort();
  rangoHist = { min: fechas[0] || '', max: fechas[fechas.length-1] || '' };
  ['#hDesde','#hHasta'].forEach(s => { $(s).min = rangoHist.min; $(s).max = rangoHist.max; });
  ajustarFechas();
  // Sugerencias: todos los usuarios con reportes (activos o no), salvo los marcados como ocultos
  const seen = {}; (data||[]).forEach(r => { if(r.usuario && r.usuario_visible!==false && !seen[r.usuario]) seen[r.usuario] = [r.usuario_rango, r.usuario_nombre].filter(Boolean).join(' '); });
  usuariosHist = Object.entries(seen).map(([u,n]) => ({u,n})).sort((a,b) => a.u.localeCompare(b.u));
  buscarHist();
}
let usuariosHist = [];
let rangoHist = { min:'', max:'' };
// "Hasta" no puede ser anterior a "Desde" (y viceversa): se ajustan los límites del calendario
function ajustarFechas(){
  const de=$('#hDesde'), ha=$('#hHasta');
  ha.min = de.value || rangoHist.min; de.max = ha.value || rangoHist.max;
  if(de.value && ha.value && ha.value < de.value) ha.value = de.value;
}
$('#hForm').onchange = buscarHist; $('#hEstado').onchange = buscarHist;
['#hDesde','#hHasta'].forEach(s => $(s).onchange = () => { ajustarFechas(); buscarHist(); });
document.addEventListener('click', e => { const i = e.target.closest('input[type=date]'); if(i){ try{ i.showPicker(); }catch(x){} } });
let tHist;
function mostrarSugs(){
  const q = $('#hUsuario').value.trim().toLowerCase(), box = $('#hSugs');
  const lista = q ? usuariosHist.filter(x => x.u.toLowerCase().includes(q) || x.n.toLowerCase().includes(q)) : usuariosHist;
  if(!lista.length || document.activeElement !== $('#hUsuario')){ box.style.display='none'; return; }
  box.innerHTML = lista.slice(0,12).map(x => `<div data-u="${esc(x.u)}"><b>${esc(x.u)}</b>${x.n ? `<small>${esc(x.n)}</small>` : ''}</div>`).join('');
  box.style.display='block';
  box.querySelectorAll('div').forEach(el => el.onmousedown = e => { e.preventDefault(); $('#hUsuario').value = el.dataset.u; box.style.display='none'; buscarHist(); });
}
$('#hUsuario').oninput = () => { mostrarSugs(); clearTimeout(tHist); tHist = setTimeout(buscarHist, 250); };
$('#hUsuario').onfocus = mostrarSugs;
$('#hUsuario').onblur = () => setTimeout(() => $('#hSugs').style.display='none', 150);
$('#hUsuario').onkeydown = e => { if(e.key==='Escape') $('#hSugs').style.display='none'; };
$('#hTexto').addEventListener('keydown', e => { if(e.key==='Enter'){ e.preventDefault(); buscarHist(); } });
$('#hTexto').addEventListener('input', () => { if(!$('#hTexto').value.trim()) buscarHist(); });
let HIST_VISTA = 'tabla';
document.querySelectorAll('[data-vista]').forEach(b => b.onclick = () => { HIST_VISTA = b.dataset.vista; document.querySelectorAll('[data-vista]').forEach(x => x.classList.toggle('on', x===b)); $('#hTabla').style.display = HIST_VISTA==='tabla' ? '' : 'none'; $('#hGaleria').style.display = HIST_VISTA==='galeria' ? '' : 'none'; if(HIST_VISTA==='galeria') pintarGaleria(); });
async function pintarGaleria(){
  const lista = (HIST_DATA||[]).filter(r => r.imagen_path).slice(0, 120); const g = $('#hGaleria');
  const fmt = iso => iso ? iso.slice(0,10).split('-').reverse().join('-') : '—';
  g.innerHTML = lista.map(r => `<div class="g" data-gi="${r.id}" data-n="reporte-${esc(r.folio||r.id)}.${(r.imagen_path||'png').split('.').pop()}"><div class="im">Cargando…</div><div class="p"><b>${esc(r.folio||r.id)}</b> · ${fmt(r.fecha)}<br><span class="muted">${esc(r.formulario||r.formulario_id)} · ${esc(r.usuario||'')}</span></div></div>`).join('') || '<p class="muted">Ningún reporte con imagen en el filtro actual.</p>';
  if(!lista.length) return;
  let urls = [];
  try{ const st = sb.storage.from('reportes'); if(st.createSignedUrls){ const { data } = await st.createSignedUrls(lista.map(r => r.imagen_path), 3600); urls = (data||[]).map(x => x.signedUrl); } else { urls = await Promise.all(lista.map(r => urlImagen(r.imagen_path).catch(() => null))); } }catch(e){}
  lista.forEach((r, i) => { const d = g.querySelector(`[data-gi="${r.id}"]`); if(!d) return; const u = urls[i]; if(!u){ d.querySelector('.im').textContent = 'Sin acceso'; return; }
    d.querySelector('.im').innerHTML = `<img src="${u}" alt="" loading="lazy">`; d.onclick = () => { $('#dlgImg').src = u; $('#dlgDl').href = u; $('#dlgDl').download = d.dataset.n; $('#dlg').showModal(); }; });
}
$('#hLimpiar').onclick = () => { $('#hForm').value=''; $('#hUsuario').value=''; $('#hDesde').value=''; $('#hHasta').value=''; $('#hEstado').value=''; $('#hTexto').value=''; ajustarFechas(); buscarHist(); };
async function buscarHist(){
  let q = sb.from('reportes_vista').select('*').order('creado_en', { ascending:false }).limit(300);
  if($('#hForm').value) q = q.eq('formulario_id', $('#hForm').value);
  if($('#hUsuario').value.trim()) q = q.ilike('usuario', `%${$('#hUsuario').value.trim()}%`);
  if($('#hDesde').value) q = q.gte('fecha', $('#hDesde').value);
  if($('#hHasta').value) q = q.lte('fecha', $('#hHasta').value);
  if($('#hEstado').value) q = q.eq('estado', $('#hEstado').value);
  const texto = $('#hTexto').value.trim();
  if(texto){ if(/^pm-?\d+$/i.test(texto)) q = q.ilike('folio', `%${texto.replace(/^pm-?/i,'')}%`); else q = q.textSearch('busqueda', texto, { type:'websearch', config:'spanish' }); }
  const { data, error } = await q;
  if(error){ $('#hErr').textContent = error.message; return; }
  $('#hErr').textContent=''; HIST_DATA = data; $('#hTotal').textContent = `${data.length} reporte(s)${data.length>=300?' (se muestran los 300 más recientes; afina los filtros)':''}`; if(HIST_VISTA==='galeria') pintarGaleria();
  const fmt = iso => iso ? iso.slice(0,10).split('-').reverse().join('-') : '—';
  $('#tbHist').innerHTML = data.map(r => `<tr><td><b>${esc(r.folio||r.id)}</b></td><td>${fmt(r.fecha)}</td><td>${esc(r.formulario||r.formulario_id||'—')}</td>
    <td>${esc(r.usuario||'—')}<br><span class="muted">${esc([r.usuario_rango, r.usuario_nombre].filter(Boolean).join(' '))}</span></td><td>${esc(r.resumen||'')}</td>
    <td>${etiquetaEstado(r)}</td>
    <td class="muted">${new Date(r.creado_en).toLocaleString('es-CO')}</td>
    <td>${r.imagen_path ? `<button class="ghost sm" data-hv="${esc(r.imagen_path)}" data-n="reporte-${esc(r.folio||r.id)}.${(r.imagen_path||'').split('.').pop()||'png'}">Ver</button>` : '—'}</td>
    <td>${tiene(yo,'eliminar_historial') ? `<button class="ghost sm" data-hd="${r.id}" data-p="${esc(r.imagen_path||'')}">Eliminar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan=9 class="muted">Sin reportes</td></tr>';
  document.querySelectorAll('[data-hv]').forEach(b => b.onclick = async () => {
    try{ const u = await urlImagen(b.dataset.hv); $('#dlgImg').src = u; $('#dlgDl').href = u; $('#dlgDl').download = b.dataset.n; $('#dlg').showModal(); }
    catch(x){ alert(x.message); }
  });
  document.querySelectorAll('[data-hd]').forEach(b => b.onclick = async () => {
    if(!confirm('¿Eliminar este reporte del historial?')) return;
    if(b.dataset.p) await sb.storage.from('reportes').remove([b.dataset.p]);
    const { error } = await sb.from('reportes').delete().eq('id', b.dataset.hd); if(error) alert(error.message); buscarHist();
  });
}

// ====================== AUDITORÍA ======================
const ACCION = { insert:'Creó', update:'Modificó', delete:'Eliminó', reset_password:'Restableció contraseña', reset_password_denegado:'Intento de reset denegado', ver_como_inicio:'Empezó a ver como', ver_como_fin:'Dejó de ver como', revision_aprobado:'Aprobó', revision_rechazado:'Rechazó', revision_pendiente:'Devolvió a pendiente', sancion_advertencia:'Advertencia a', sancion_sancion:'Sanción a', sancion_suspension:'Suspensión a', sancion_expulsion:'Expulsión de', sancion_anulada:'Anuló sanción de', discord_aviso:'Aviso Discord', avatar:'Cambió la foto de', respaldo:'Copia de seguridad', mfa_reset:'Quitó la verificación en dos pasos de', programada_config:'Configuró tarea', programada_recordatorio_turnos:'Recordatorio de turnos', programada_cierre_diario:'Cierre diario', programada_resumen_semanal:'Resumen semanal', programada_ranking_mensual:'Ranking mensual' };
const TABLA = { perfiles:'usuario', roles:'rol', formularios:'formulario', reportes:'reporte', rangos_pm:'Rango PM', auth:'cuenta', sanciones:'sanción', turnos:'turno', anuncios:'anuncio', requisitos_ascenso:'requisito de ascenso', discord_canales:'canal de Discord', formularios_discord:'canal del formulario', configuracion:'configuración', insignias:'insignia', sistema:'sistema' };
async function cargarAud(){ buscarAud(); }
$('#aBuscar').onclick = buscarAud; $('#aTabla').onchange = buscarAud;
let tAud; $('#aUsuario').oninput = () => { clearTimeout(tAud); tAud = setTimeout(buscarAud, 250); };
async function buscarAud(){
  let q = sb.from('auditoria').select('*').order('id', { ascending:false }).limit(500);
  if($('#aTabla').value) q = q.eq('tabla', $('#aTabla').value);
  if($('#aUsuario').value.trim()) q = q.ilike('usuario', `%${$('#aUsuario').value.trim()}%`);
  const { data, error } = await q;
  if(error){ $('#aErr').textContent = error.message; return; }
  $('#aErr').textContent = ''; AUD_DATA = data;
  const resumen = r => {
    if(r.accion==='update') return Object.entries(r.detalle||{}).map(([k,v]) => `${k}: ${fmtV(v.antes)} → ${fmtV(v.despues)}`).join(' · ');
    const d = r.detalle||{}; return Object.entries(d).filter(([k]) => !['id','creado_en','sellado_en'].includes(k)).slice(0,6).map(([k,v]) => `${k}: ${fmtV(v)}`).join(' · ');
  };
  const sinEmoji = t => String(t).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu,'').replace(/\s{2,}/g,' ').trim();
  const fmtV = v => v===null||v===undefined ? '—' : sinEmoji((typeof v==='object' ? JSON.stringify(v) : String(v))).slice(0,60);
  $('#tbAud').innerHTML = data.map(r => `<tr><td class="muted" style="white-space:nowrap">${new Date(r.en).toLocaleString('es-CO')}</td>
    <td><b>${esc(r.usuario||'sistema')}</b></td><td>${esc(ACCION[r.accion]||r.accion)} ${esc(TABLA[r.tabla]||r.tabla)}</td>
    <td>${esc(sinEmoji(r.registro||''))}</td><td class="muted" style="font-size:12px">${esc(sinEmoji(resumen(r)))}</td></tr>`).join('') || '<tr><td colspan=5 class="muted">Sin eventos</td></tr>';
}

// ====================== RESUMEN ======================
const iso = d => d.toISOString().slice(0,10);
let RES=null;
async function cargarResumen(){
  if(!$('#rDesde').value){ const h=new Date(); $('#rHasta').value=iso(h); $('#rDesde').value=iso(new Date(h.getTime()-29*864e5)); }
  const desde=$('#rDesde').value, hasta=$('#rHasta').value;
  const { data, error } = await sb.from('reportes_vista').select('id,fecha,formulario,formulario_id,usuario,usuario_nombre,usuario_rango,datos,creado_en').eq('estado','aprobado').gte('fecha',desde).lte('fecha',hasta).order('fecha').limit(3000);
  if(error){ $('#rNota').textContent=error.message; return; }
  const R=data||[]; const quien=r=>[r.usuario_rango,r.usuario_nombre||r.usuario].filter(Boolean).join(' ');
  // KPIs
  const bajas=R.filter(r=>r.formulario_id==='bajas').reduce((a,r)=>a+((r.datos&&Array.isArray(r.datos.rows))?r.datos.rows.filter(x=>x&&String(x.nombre||'').trim()).length:0),0);
  const patr=R.filter(r=>r.formulario_id==='patrullaje').length, tomas=R.filter(r=>r.formulario_id==='toma-territorio'), aks=tomas.reduce((a,r)=>a+(+(r.datos&&r.datos.totalTomados)||0),0);
  const usuarios=new Set(R.map(r=>r.usuario)).size, dias=Math.max(1,Math.round((new Date(hasta)-new Date(desde))/864e5)+1);
  const reclut=R.filter(r=>r.formulario_id==='reclutamiento').length;
  const KP=[[R.length,'Reportes'],[(R.length/dias).toFixed(1),'Por día'],[usuarios,'Usuarios activos'],[bajas,'Bajas reportadas'],[reclut,'Reclutamientos'],[patr,'Patrullajes'],[`${aks}${tomas.length?' / '+tomas.length*3:''}`,'AKs tomados']];
  $('#rKpis').innerHTML=KP.map(([v,l])=>`<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join('');
  // Por día
  const porDia={}; for(let d=new Date(desde); iso(d)<=hasta; d=new Date(d.getTime()+864e5)) porDia[iso(d)]=0; R.forEach(r=>{ if(r.fecha in porDia) porDia[r.fecha]++; });
  const max=Math.max(1,...Object.values(porDia));
  $('#rDias').innerHTML=Object.entries(porDia).map(([d,n])=>`<div style="height:${Math.max(2,Math.round(n/max*100))}%" data-t="${d.split('-').reverse().join('-')}: ${n}" title="${d}: ${n}"></div>`).join('');
  // Por formulario
  const pf={}; R.forEach(r=>{ const k=r.formulario||r.formulario_id; pf[k]=(pf[k]||0)+1; });
  $('#rPorForm').innerHTML=Object.entries(pf).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`<tr><td>${esc(k)}</td><td>${n}</td><td class="muted">${Math.round(n/R.length*100)}%</td></tr>`).join('')||'<tr><td colspan=3 class="muted">Sin reportes en el periodo</td></tr>';
  // Por usuario
  const pu={}; R.forEach(r=>{ const k=r.usuario||'—'; pu[k]=pu[k]||{n:0,nombre:quien(r),ultimo:''}; pu[k].n++; if(r.fecha>pu[k].ultimo) pu[k].ultimo=r.fecha; });
  $('#rUsuarios').innerHTML=Object.entries(pu).sort((a,b)=>b[1].n-a[1].n).map(([u,x])=>`<tr><td><b>${esc(u)}</b> <span class="muted">${esc(x.nombre)}</span></td><td>${x.n}</td><td class="muted">${x.ultimo.split('-').reverse().join('-')}</td></tr>`).join('')||'<tr><td colspan=3 class="muted">—</td></tr>';
  // Integrantes (patrullaje + toma)
  const pi={}; R.forEach(r=>{ if(!['patrullaje','toma-territorio'].includes(r.formulario_id)) return; const l=(r.datos&&Array.isArray(r.datos.integrantes))?r.datos.integrantes:[]; new Set(l.map(x=>String(x).trim()).filter(Boolean)).forEach(n=>{ pi[n]=(pi[n]||0)+1; }); });
  $('#rIntegrantes').innerHTML=Object.entries(pi).sort((a,b)=>b[1]-a[1]).slice(0,30).map(([n,c])=>`<tr><td>${esc(n)}</td><td>${c}</td></tr>`).join('')||'<tr><td colspan=2 class="muted">—</td></tr>';
  // Bajas por persona (quien reporta) y reclutamientos por persona
  const pb={}; R.filter(r=>r.formulario_id==='bajas').forEach(r=>{ const k=r.usuario||'—'; pb[k]=pb[k]||{nombre:quien(r),rep:0,bajas:0}; pb[k].rep++; pb[k].bajas+=(r.datos&&Array.isArray(r.datos.rows))?r.datos.rows.filter(x=>x&&x.nombre).length:0; });
  $('#rBajas').innerHTML=Object.entries(pb).sort((a,b)=>b[1].bajas-a[1].bajas).map(([u,x])=>`<tr><td><b>${esc(u)}</b> <span class="muted">${esc(x.nombre)}</span></td><td>${x.rep}</td><td><b>${x.bajas}</b></td></tr>`).join('')||'<tr><td colspan=3 class="muted">Sin reportes de bajas en el periodo</td></tr>';
  const pr={}; R.filter(r=>r.formulario_id==='reclutamiento').forEach(r=>{ const k=r.usuario||'—'; pr[k]=pr[k]||{nombre:quien(r),n:0,nombres:[]}; pr[k].n++; const d=r.datos||{}; const nom=[d.ofRango,d.ofNombre].filter(Boolean).join(' '); if(nom) pr[k].nombres.push(nom); });
  $('#rReclut').innerHTML=Object.entries(pr).sort((a,b)=>b[1].n-a[1].n).map(([u,x])=>`<tr><td><b>${esc(u)}</b> <span class="muted">${esc(x.nombre)}</span></td><td><b>${x.n}</b></td><td class="muted" style="font-size:12px">${esc(x.nombres.join(', '))}</td></tr>`).join('')||'<tr><td colspan=3 class="muted">Sin reclutamientos en el periodo</td></tr>';
  const fd=d=>d.split('-').reverse().join('-');
  RES={ desde, hasta, total:R.length, kpis:KP, porDia,
    porForm:Object.entries(pf).sort((a,b)=>b[1]-a[1]).map(([k,n])=>[k,n,Math.round(n/R.length*100)+'%']),
    porUsuario:Object.entries(pu).sort((a,b)=>b[1].n-a[1].n).map(([u,x])=>[u,x.nombre,x.n,fd(x.ultimo)]),
    integrantes:Object.entries(pi).sort((a,b)=>b[1]-a[1]).slice(0,30),
    bajas:Object.entries(pb).sort((a,b)=>b[1].bajas-a[1].bajas).map(([u,x])=>[u,x.nombre,x.rep,x.bajas]),
    reclut:Object.entries(pr).sort((a,b)=>b[1].n-a[1].n).map(([u,x])=>[u,x.nombre,x.n,x.nombres.join(', ')]) };
  $('#rExportar').disabled=false;
  $('#rNota').textContent=`Periodo ${desde.split('-').reverse().join('-')} a ${hasta.split('-').reverse().join('-')} · ${R.length} reporte(s)${R.length>=3000?' (límite alcanzado; acota el periodo)':''}.`;
}
$('#rActualizar').onclick=cargarResumen;
$('#rExportar').onclick=async()=>{
  if(!RES) return; const btn=$('#rExportar'); btn.disabled=true; const txt=btn.textContent; btn.textContent='Generando…';
  try{
    await (document.fonts ? document.fonts.ready : Promise.resolve());
    const fmt=$('#rFormato').value; const fd=d=>d.split('-').reverse().join('-');
    const pags=dibujarResumen(RES, { periodo:`Periodo ${fd(RES.desde)} a ${fd(RES.hasta)} · ${RES.total} reporte(s)`, generado:`Generado por ${nombreCompleto(yo)} · ${new Date().toLocaleString('es-CO')}` });
    const nombre=`resumen-pm-${RES.desde}_${RES.hasta}`;
    if(fmt==='pdf') descargar(resumenPDF(pags), nombre+'.pdf'); else descargar(await resumenPNG(pags), nombre+'.png');
  }catch(x){ alert('No se pudo exportar: '+x.message); }
  btn.disabled=false; btn.textContent=txt;
};

// ====================== AUTOMATIZACIÓN: canales de Discord ======================
async function cargarAutomatizacion(){
  const { data, error } = await sb.from('discord_canales').select('*').order('clave');
  if(error){ $('#cErr').textContent = error.message; return; }
  $('#cErr').textContent='';
  $('#tbCanales').innerHTML = (data||[]).map(c => `<tr data-id="${esc(c.clave)}"><td><b>${esc(c.nombre)}</b><br><span class="muted" style="font-size:12px">${esc(c.clave)}</span></td>
    <td><input type="url" data-wh="${esc(c.clave)}" value="${esc(c.webhook||'')}" placeholder="https://discord.com/api/webhooks/…" style="min-width:260px"></td>
    <td><input type="checkbox" data-on="${esc(c.clave)}" ${c.activo?'checked':''}></td>
    <td style="white-space:nowrap"><button class="ghost sm" data-cg="${esc(c.clave)}">Guardar</button> <button class="ghost sm" data-cp="${esc(c.clave)}" title="Envía un mensaje de prueba al canal">Probar</button> <span class="muted" data-cm="${esc(c.clave)}" style="font-size:12px"></span></td></tr>`).join('');
  const guardar = async clave => {
    const w = $(`[data-wh="${clave}"]`).value.trim(); const m = $(`[data-cm="${clave}"]`);
    if(w && !/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(w)){ m.textContent='El webhook debe ser un enlace de Discord.'; return false; }
    const { error } = await sb.from('discord_canales').update({ webhook: w || null, activo: $(`[data-on="${clave}"]`).checked, actualizado_en: new Date().toISOString() }).eq('clave', clave);
    m.textContent = error ? 'Error: '+error.message : 'Guardado.'; return !error;
  };
  document.querySelectorAll('[data-cg]').forEach(b => b.onclick = () => guardar(b.dataset.cg));
  document.querySelectorAll('[data-cp]').forEach(b => b.onclick = async () => {
    const clave = b.dataset.cp, m = $(`[data-cm="${clave}"]`); if(!(await guardar(clave))) return; m.textContent='Enviando…';
    const { data, error } = await sb.functions.invoke('notificar-general', { body:{ canal: clave, prueba: true } });
    m.textContent = error ? 'Error: '+error.message : (data&&data.ok) ? '✅ Prueba enviada.' : 'Error: '+((data&&(data.error||data.motivo))||'sin respuesta');
  });
  if(typeof cargarProgramadas === 'function') cargarProgramadas();
  $('#cajaRespaldo').hidden = !esSuperadmin(yo);
  // Canales por formulario (formularios_discord)
  const { data: fd } = await sb.from('formularios_discord').select('formulario_id,webhook,activo'); const mapa = {}; (fd||[]).forEach(x => mapa[x.formulario_id] = x);
  $('#tbCanalesForm').innerHTML = formularios.map(f => { const c = mapa[f.id] || {}; return `<tr><td><b>${esc(f.icono||'')} ${esc(f.titulo)}</b><br><span class="muted" style="font-size:12px">${esc(f.id)}${f.requiere_aprobacion?' · se publica al aprobar':''}</span></td>
    <td><input type="url" data-fwh="${esc(f.id)}" value="${esc(c.webhook||'')}" placeholder="https://discord.com/api/webhooks/…" style="min-width:260px"></td>
    <td><input type="checkbox" data-fon="${esc(f.id)}" ${c.activo!==false?'checked':''}></td>
    <td style="white-space:nowrap"><button class="ghost sm" data-fg="${esc(f.id)}">Guardar</button> <button class="ghost sm" data-fp="${esc(f.id)}">Probar</button> <span class="muted" data-fm="${esc(f.id)}" style="font-size:12px"></span></td></tr>`; }).join('');
  const guardarF = async id => { const w = $(`[data-fwh="${id}"]`).value.trim(), m = $(`[data-fm="${id}"]`);
    if(!w){ await sb.from('formularios_discord').delete().eq('formulario_id', id); m.textContent='Sin webhook.'; return true; }
    if(!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(w)){ m.textContent='El webhook debe ser un enlace de Discord.'; return false; }
    const { error } = await sb.from('formularios_discord').upsert({ formulario_id: id, webhook: w, activo: $(`[data-fon="${id}"]`).checked, actualizado_en: new Date().toISOString() }); m.textContent = error ? 'Error: '+error.message : 'Guardado.'; return !error; };
  document.querySelectorAll('[data-fg]').forEach(b => b.onclick = () => guardarF(b.dataset.fg));
  document.querySelectorAll('[data-fp]').forEach(b => b.onclick = async () => { const id = b.dataset.fp, m = $(`[data-fm="${id}"]`); if(!(await guardarF(id))) return; m.textContent='Enviando…';
    const { data, error } = await sb.functions.invoke('notificar-discord', { body:{ formulario_id: id, prueba: true } }); m.textContent = error ? 'Error: '+error.message : (data&&data.ok) ? '✅ Prueba enviada.' : 'Error: '+((data&&data.error)||'sin respuesta'); });
}
$('#bRespaldo').onclick = async () => {
  if(!confirm('Se descargará un ZIP con todos los datos' + ($('#bImg').checked ? ' e imágenes' : '') + '. Puede tardar varios minutos. ¿Continuar?')) return;
  $('#bMsg').textContent = '';
  try{ const r = await respaldoCompleto({ imagenes: $('#bImg').checked }); $('#bMsg').textContent = `Última copia: ${new Date().toLocaleString('es-CO')} · ${r.imagenes} imágenes`;
    await sb.rpc('auditar_respaldo', { p_detalle: r }).then(()=>{}, ()=>{}); }
  catch(x){ $('#bMsg').textContent = 'No se pudo generar: ' + (x.message||x); }
};

// ====================== REVISIÓN DE REPORTES ======================
const etiquetaEstado = r => { const e = r.estado || 'aprobado'; const t = e==='pendiente' ? '<span class="tag pend">Pendiente</span>' : e==='rechazado' ? '<span class="tag off">Rechazado</span>' : (r.requiere_aprobacion ? '<span class="tag on">Aprobado</span>' : '<span class="tag on" title="Formulario sin revisión">Aprobado</span>');
  return t + (r.comentario_revision ? `<br><span class="muted" style="font-size:11px" title="${esc(r.comentario_revision)}">${esc(r.revisor||'')}: ${esc(r.comentario_revision.slice(0,60))}${r.comentario_revision.length>60?'…':''}</span>` : (r.revisor ? `<br><span class="muted" style="font-size:11px">${esc(r.revisor)}</span>` : '')); };
async function cargarRevision(){
  $('#rvEstado').onchange = cargarRevision;
  const est = $('#rvEstado').value || 'pendiente';
  let q = sb.from('reportes_vista').select('*').eq('estado', est).order('creado_en', { ascending: est==='pendiente' }).limit(est==='pendiente' ? 200 : 60);
  const { data, error } = await q;
  if(error){ $('#rvErr').textContent = error.message; return; }
  $('#rvErr').textContent=''; const lista = data || [];
  $('#rvContador').textContent = est==='pendiente' ? `${lista.length} pendiente(s)` : `${lista.length} mostrado(s)`;
  const fmt = iso => iso ? iso.slice(0,10).split('-').reverse().join('-') : '—';
  $('#rvLista').innerHTML = lista.map(r => `<div class="rv" data-id="${r.id}">
      <div class="img" data-rvimg="${esc(r.imagen_path||'')}" data-n="reporte-${esc(r.folio||r.id)}.${(r.imagen_path||'png').split('.').pop()}"><span class="cargar">${r.imagen_path ? '🔍 Ver imagen' : 'Sin imagen'}</span></div>
      <div class="cuerpo">
        <div><b>${esc(r.folio||r.id)}</b> · ${esc(r.formulario||r.formulario_id)} · ${fmt(r.fecha)}</div>
        <div>${esc([r.usuario_rango, r.usuario_nombre||r.usuario].filter(Boolean).join(' '))} <span class="muted">(${esc(r.usuario||'')})</span></div>
        <div class="muted">${esc(r.resumen||'')}</div>
        <div class="muted" style="font-size:11px">Registrado ${new Date(r.creado_en).toLocaleString('es-CO')}${r.revisado_en ? ` · Revisado ${new Date(r.revisado_en).toLocaleString('es-CO')} por ${esc(r.revisor||'')}` : ''}${r.comentario_revision ? `<br>Motivo: ${esc(r.comentario_revision)}` : ''}</div>
        <div class="acciones">
          ${est!=='aprobado' ? `<button type="button" class="sm aprobar" data-rv="aprobado" data-id="${r.id}">✅ Aprobar</button>` : ''}
          ${est!=='rechazado' ? `<button type="button" class="sm rechazar" data-rv="rechazado" data-id="${r.id}">⛔ Rechazar</button>` : ''}
          ${est!=='pendiente' ? `<button type="button" class="ghost sm" data-rv="pendiente" data-id="${r.id}">↩ Volver a pendiente</button>` : ''}
        </div>
      </div></div>`).join('') || `<p class="muted">No hay reportes ${est==='pendiente'?'pendientes de revisión':est+'s'}.</p>`;
  document.querySelectorAll('[data-rvimg]').forEach(d => d.onclick = async () => { if(!d.dataset.rvimg) return;
    if(!d.querySelector('img')){ try{ const u = await urlImagen(d.dataset.rvimg); d.innerHTML = `<img src="${u}" alt="">`; d.dataset.u = u; }catch(x){ alert(x.message); return; } }
    else { $('#dlgImg').src = d.dataset.u; $('#dlgDl').href = d.dataset.u; $('#dlgDl').download = d.dataset.n; $('#dlg').showModal(); } });
  document.querySelectorAll('[data-rv]').forEach(b => b.onclick = async () => {
    const id = +b.dataset.id, est2 = b.dataset.rv, r = lista.find(x => x.id===id); let comentario = null;
    if(est2==='rechazado'){ comentario = prompt(`Motivo del rechazo de ${r.folio||id} (lo verá el autor):`); if(comentario===null) return; if(!comentario.trim()){ alert('Indica el motivo.'); return; } }
    else if(est2==='aprobado'){ comentario = prompt(`Aprobar ${r.folio||id}. Comentario opcional para el autor:`, ''); if(comentario===null) return; }
    else if(!confirm(`¿Devolver ${r.folio||id} a pendiente?`)) return;
    b.disabled = true;
    const { data: res, error } = await sb.rpc('revisar_reporte', { p_id: id, p_estado: est2, p_comentario: comentario||null });
    if(error){ alert(error.message); b.disabled=false; return; }
    let extra = '';
    if(est2==='aprobado'){ const dc = await notificarDiscord(id, 'aprobado'); if(dc==='ok') extra = ' Publicado en Discord.'; else if(dc && dc.startsWith('error')) extra = ' (No se pudo publicar en Discord: '+dc.slice(7)+')'; }
    toast(`${r.folio||id}: ${est2}.${extra}`, false);
    cargarRevision(); contarPendientes();
  });
}

// ====================== DISCIPLINA (sanciones) ======================
async function cargarDisciplina(){
  if(!USUARIOS.length){ const { data } = await sb.from('perfiles').select('*').order('usuario'); USUARIOS = data || []; }
  const { data, error } = await sb.from('sanciones').select('*').order('fecha', { ascending:false }).order('id', { ascending:false }).limit(1000);
  if(error){ $('#dErr').textContent = error.message; return; } $('#dErr').textContent=''; SANC = data || [];
  const nombre = id => { const u = USUARIOS.find(x => x.id===id); return u ? nombreCompleto(u) : '—'; };
  const usuarioDe = id => { const u = USUARIOS.find(x => x.id===id); return u ? u.usuario : '—'; };
  const adv = {}; SANC.filter(x => x.activa && x.tipo==='advertencia').forEach(x => adv[x.usuario_id] = (adv[x.usuario_id]||0)+1);
  const tres = Object.entries(adv).filter(([,n]) => n >= 3);
  $('#dAlerta').innerHTML = tres.length ? `<div style="background:var(--errbg);border:1px solid var(--err2);color:var(--err2);border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:13px"><b>⚠️ Con 3 o más advertencias activas:</b> ${tres.map(([id,n]) => `<a href="../expediente.html?id=${esc(id)}" style="color:inherit">${esc(nombre(id))} (${n})</a>`).join(', ')}</div>` : '';
  const pintar = () => {
    const q = ($('#dBuscar').value||'').toLowerCase().trim(), f = $('#dFiltro').value, t = $('#dTipo').value;
    const lista = SANC.filter(x => (f==='todas' || x.activa) && (!t || x.tipo===t) && (!q || [usuarioDe(x.usuario_id), nombre(x.usuario_id), x.motivo, x.detalle].filter(Boolean).join(' ').toLowerCase().includes(q)));
    $('#tbSanc').innerHTML = lista.map(x => `<tr style="${x.activa?'':'opacity:.55'}"><td class="muted" style="white-space:nowrap">${fFecha(x.fecha)}</td>
      <td><a href="../expediente.html?id=${esc(x.usuario_id)}" style="color:var(--text)"><b>${esc(usuarioDe(x.usuario_id))}</b></a><br><span class="muted" style="font-size:12px">${esc(nombre(x.usuario_id))}${adv[x.usuario_id] ? ` · ${adv[x.usuario_id]} adv.` : ''}</span></td>
      <td><span class="tag ${x.tipo==='advertencia'?'pend':'off'}">${esc(x.tipo)}</span>${x.activa?'':'<br><span class="muted" style="font-size:11px">anulada</span>'}</td>
      <td>${esc(x.motivo)}${x.detalle?`<br><span class="muted" style="font-size:12px">${esc(x.detalle)}</span>`:''}${!x.activa && x.motivo_anulacion ? `<br><span class="muted" style="font-size:12px">Anulación: ${esc(x.motivo_anulacion)}</span>`:''}</td>
      <td class="muted">${esc(usuarioDe(x.impuesta_por))}</td>
      <td>${x.activa ? `<button class="ghost sm" data-anular="${x.id}">Anular</button>` : ''}</td></tr>`).join('') || '<tr><td colspan=6 class="muted">Sin sanciones</td></tr>';
    document.querySelectorAll('[data-anular]').forEach(b => b.onclick = async () => { const m = prompt('Motivo de la anulación:'); if(!m || !m.trim()) return; const { error } = await sb.rpc('anular_sancion', { p_id: +b.dataset.anular, p_motivo: m }); if(error) alert(error.message); else toast('Sanción anulada.'); cargarDisciplina(); });
  };
  ['#dBuscar','#dFiltro','#dTipo'].forEach(x => $(x).oninput = pintar); pintar();
}
$('#dNueva').onclick = () => { $('#fSancion').reset(); BUSC_SANCION.fijar(null); $('#sFecha').value = hoyISO(); $('#sErr').textContent=''; $('#dlgSancion').showModal(); };
$('#fSancion').onsubmit = async e => {
  e.preventDefault(); $('#sErr').textContent=''; const uid = $('#sUsuario').value; if(!uid){ $('#sErr').textContent='Elige el usuario de la lista.'; $('#sUsuarioTxt').focus(); return; }
  const tipo = $('#sTipo').value, motivo = $('#sMotivo').value.trim(); $('#sGuardar').disabled = true;
  const { data, error } = await sb.rpc('registrar_sancion', { p_usuario: uid, p_tipo: tipo, p_motivo: motivo, p_detalle: $('#sDetalle').value.trim() || null, p_fecha: $('#sFecha').value || null });
  $('#sGuardar').disabled = false; if(error){ $('#sErr').textContent = error.message; return; }
  $('#dlgSancion').close(); const u = USUARIOS.find(x => x.id===uid); const n = +data.advertencias_activas || 0;
  const titulo = { advertencia:'⚠️ Advertencia', sancion:'⛔ Sanción', suspension:'⏸️ Suspensión', expulsion:'🚫 Expulsión' }[tipo] || tipo;
  avisoDiscord('avisos', { embed: { title: `${titulo} · ${nombreCompleto(u)}`, description: motivo, color: tipo==='advertencia' ? 0xe0a92a : 0xe03a3a, fields: [{ name:'Impuesta por', value: nombreCompleto(yo), inline:true }, ...(tipo==='advertencia' ? [{ name:'Advertencias activas', value:`${n} de 3`, inline:true }] : [])], footer: { text: (tipo==='advertencia' && n>=3) ? 'Ha alcanzado 3 advertencias: corresponde la expulsión según el reglamento.' : 'Policía Militar · Army de Wasco' } } });
  toast(`${titulo} registrada para ${u ? u.usuario : ''}.${(tipo==='advertencia' && n>=3) ? ' ⚠️ Ya tiene 3 advertencias.' : ''}`); cargarDisciplina();
};

// ====================== ASCENSOS ======================
async function cargarAscensos(){
  const [{ data: req }, { data, error }] = await Promise.all([sb.from('requisitos_ascenso').select('*'), sb.rpc('datos_ascensos')]);
  if(error){ $('#aErr').textContent = error.message; return; } $('#aErr').textContent='';
  REQ = {}; (req||[]).forEach(r => REQ[r.rango] = r);
  const filas = (data||[]).map(u => { const i = RANGOS.indexOf(u.rango); const sig = i < 0 ? RANGOS[0] : RANGOS[i+1] || null; const r = sig ? (REQ[sig] || { dias_minimos:0, reportes_minimos:0 }) : null;
    const d = u.desde ? Math.floor((Date.now() - new Date(u.desde+'T00:00:00'))/864e5) : 0;
    const cumple = !!sig && d >= (r.dias_minimos||0) && +u.reportes >= (r.reportes_minimos||0) && +u.advertencias === 0;
    return { ...u, sig, r, d, cumple }; });
  const pintar = () => {
    const q = ($('#aBuscar').value||'').toLowerCase().trim(), f = $('#aFiltro').value;
    const lista = filas.filter(x => (f==='todos' || x.cumple) && (!q || [x.usuario, x.nombre, x.rango].filter(Boolean).join(' ').toLowerCase().includes(q))).sort((a,b) => (b.cumple-a.cumple) || (b.d-a.d));
    $('#tbAsc').innerHTML = lista.map(x => `<tr><td><a href="../expediente.html?id=${esc(x.usuario_id)}" style="color:var(--text)"><b>${esc(x.usuario)}</b></a><br><span class="muted" style="font-size:12px">${esc(x.nombre||'')}</span></td>
      <td>${esc(x.rango||'Sin rango')}</td><td>${x.sig ? esc(x.sig) : '<span class="muted">Rango máximo</span>'}</td>
      <td>${x.d}${x.r ? ` <span class="muted">/ ${x.r.dias_minimos||0}</span>` : ''}</td><td>${x.reportes}${x.r ? ` <span class="muted">/ ${x.r.reportes_minimos||0}</span>` : ''}</td>
      <td>${+x.advertencias ? `<span class="tag off">${x.advertencias}</span>` : '<span class="muted">0</span>'}</td>
      <td>${x.cumple ? '<span class="tag on">Cumple</span>' : x.sig ? '<span class="tag">Aún no</span>' : '—'}</td>
      <td><a class="ghost sm" href="../expediente.html?id=${esc(x.usuario_id)}" style="text-decoration:none;display:inline-block">Expediente</a></td></tr>`).join('') || '<tr><td colspan=8 class="muted">Nadie cumple los requisitos por ahora</td></tr>';
  };
  ['#aBuscar','#aFiltro'].forEach(x => $(x).oninput = pintar); pintar();
  $('#tbReq').innerHTML = RANGOS.map(r => { const q = REQ[r] || {}; return `<tr data-r="${esc(r)}"><td><b>${esc(r)}</b></td><td><input type="number" min="0" data-q="dias" value="${q.dias_minimos||0}" style="width:90px"></td><td><input type="number" min="0" data-q="rep" value="${q.reportes_minimos||0}" style="width:90px"></td><td><input data-q="nota" value="${esc(q.nota||'')}" placeholder="opcional"></td><td><button class="ghost sm" data-qg="${esc(r)}">Guardar</button></td></tr>`; }).join('');
  document.querySelectorAll('[data-qg]').forEach(b => b.onclick = async () => { const tr = b.closest('tr'); const fila = { rango: b.dataset.qg, dias_minimos: +tr.querySelector('[data-q=dias]').value||0, reportes_minimos: +tr.querySelector('[data-q=rep]').value||0, nota: tr.querySelector('[data-q=nota]').value.trim()||null };
    const { error } = await sb.from('requisitos_ascenso').upsert(fila); if(error){ $('#qErr').textContent = error.message; return; } $('#qErr').textContent=''; toast(`Requisitos de ${fila.rango} guardados.`); cargarAscensos(); });
}


// Buscador de integrantes (input de texto + sugerencias) para los diálogos; guarda el id en el hidden
function buscadorPersona(txtId, hidId, sugsId, lista){
  const txt = $('#'+txtId), hid = $('#'+hidId), box = $('#'+sugsId); let act = -1, items = [];
  const etiqueta = u => `${nombreCompleto(u)} (${u.usuario})`;
  const pintar = () => { const q = txt.value.trim().toLowerCase();
    items = lista().filter(u => !q || [u.usuario, u.nombre, u.rango].filter(Boolean).join(' ').toLowerCase().includes(q)).slice(0, 12);
    box.innerHTML = items.map((u,i) => `<div data-i="${i}" class="${i===act?'act':''}">${esc(nombreCompleto(u))}<small>@${esc(u.usuario)}</small></div>`).join('') || '<div class="muted" style="cursor:default">Sin coincidencias</div>';
    box.style.display = 'block'; box.querySelectorAll('[data-i]').forEach(d => d.onmousedown = e => { e.preventDefault(); elegir(+d.dataset.i); }); };
  const elegir = i => { const u = items[i]; if(!u) return; hid.value = u.id; txt.value = etiqueta(u); txt.dataset.elegido = '1'; box.style.display = 'none'; };
  txt.addEventListener('focus', () => { if(txt.dataset.elegido){ txt.select(); } act = -1; pintar(); });
  txt.addEventListener('input', () => { hid.value = ''; delete txt.dataset.elegido; act = -1; pintar(); });
  txt.addEventListener('keydown', e => { if(box.style.display==='none') return; if(e.key==='ArrowDown'){ e.preventDefault(); act = Math.min(items.length-1, act+1); pintar(); } else if(e.key==='ArrowUp'){ e.preventDefault(); act = Math.max(0, act-1); pintar(); } else if(e.key==='Enter'){ if(act>=0){ e.preventDefault(); elegir(act); } else if(items.length===1){ e.preventDefault(); elegir(0); } } else if(e.key==='Escape'){ box.style.display='none'; } });
  txt.addEventListener('blur', () => setTimeout(() => { box.style.display='none'; if(!hid.value) txt.value=''; }, 150));
  return { fijar: u => { if(u){ hid.value = u.id; txt.value = etiqueta(u); txt.dataset.elegido='1'; } else { hid.value=''; txt.value=''; delete txt.dataset.elegido; } } };
}
const BUSC_TURNO = buscadorPersona('tUsuarioTxt','tUsuario','tSugs', () => USUARIOS.filter(u => u.activo));
const BUSC_SANCION = buscadorPersona('sUsuarioTxt','sUsuario','sSugs', () => USUARIOS.filter(u => u.activo && u.id!==yo.id));

// ====================== TURNOS ======================
function isoDe(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function lunesDe(d){ const x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate() - ((x.getDay()+6)%7)); return x; }
async function cargarTurnos(){
  if(!T_INICIO) T_INICIO = lunesDe(new Date());
  if(!USUARIOS.length){ const { data } = await sb.from('perfiles').select('*').order('usuario'); USUARIOS = data || []; }
  const hoy = isoDe(new Date()); const editaT = tiene(yo,'turnos'); $('#tNuevo').style.display = editaT ? '' : 'none';
  document.querySelectorAll('[data-tv]').forEach(b => b.classList.toggle('on', b.dataset.tv===T_VISTA));
  const DIAS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'], MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  // Rango visible según la vista
  let ini, fin, celdas = [];
  if(T_VISTA==='dia'){ ini = new Date(T_INICIO); fin = new Date(T_INICIO); $('#tSemana').textContent = `${DIAS[(ini.getDay()+6)%7]} ${fFecha(isoDe(ini))}`; celdas = [{ d: new Date(ini), etiqueta: `${DIAS[(ini.getDay()+6)%7]} ${isoDe(ini).slice(8,10)}/${isoDe(ini).slice(5,7)}` }]; }
  else if(T_VISTA==='mes'){ const m0 = new Date(T_INICIO.getFullYear(), T_INICIO.getMonth(), 1); ini = lunesDe(m0); const m1 = new Date(m0.getFullYear(), m0.getMonth()+1, 0); fin = new Date(lunesDe(m1)); fin.setDate(fin.getDate()+6);
    $('#tSemana').textContent = `${MESES[m0.getMonth()]} ${m0.getFullYear()}`; for(let d = new Date(ini); d <= fin; d.setDate(d.getDate()+1)) celdas.push({ d: new Date(d), etiqueta: String(d.getDate()), otro: d.getMonth()!==m0.getMonth() }); }
  else { ini = lunesDe(T_INICIO); fin = new Date(ini); fin.setDate(fin.getDate()+6); $('#tSemana').textContent = `${fFecha(isoDe(ini))} → ${fFecha(isoDe(fin))}`; for(let i=0;i<7;i++){ const d = new Date(ini); d.setDate(d.getDate()+i); celdas.push({ d, etiqueta: `${DIAS[i]} ${isoDe(d).slice(8,10)}/${isoDe(d).slice(5,7)}` }); } }
  const { data, error } = await sb.rpc('turnos_lista', { p_desde: isoDe(ini), p_hasta: isoDe(fin) });
  if(error){ $('#tErr').textContent = error.message; return; } $('#tErr').textContent='';
  const g = $('#tGrid'); g.className = 'semana v-' + T_VISTA;
  const tn = (t, iso) => `<div class="tn" data-tid="${t.id}" title="${editaT?'Editar o eliminar':''}${T_VISTA==='mes'?` · ${String(t.hora_inicio).slice(0,5)}`:''}" style="${editaT?'':'cursor:default'}"><b>${iso < hoy ? (t.reporte ? '✅ ' : '⏳ ') : (t.reporte ? '✅ ' : '')}${esc(T_VISTA==='mes' ? (t.nombre||t.usuario) : [t.rango, t.nombre||t.usuario].filter(Boolean).join(' '))}</b>${T_VISTA==='mes' ? '' : `<span class="h">${String(t.hora_inicio).slice(0,5)}${t.hora_fin?'–'+String(t.hora_fin).slice(0,5):''}</span>${t.notas?`<div class="muted">${esc(t.notas)}</div>`:''}`}</div>`;
  g.innerHTML = (T_VISTA==='mes' ? DIAS.map(d => `<div class="cab-dia">${d}</div>`).join('') : '') + celdas.map(c => { const iso = isoDe(c.d); const ts = (data||[]).filter(t => t.fecha===iso); const max = T_VISTA==='mes' ? 3 : 99;
    return `<div class="dia ${iso===hoy?'hoy':''} ${c.otro?'otro':''}" data-dia="${iso}"><h5>${c.etiqueta} ${T_VISTA==='mes' && ts.length ? `<span>${ts.length}</span>` : (T_VISTA!=='mes' ? `<span>${ts.length ? ts.length+' turno(s)' : ''}</span>` : '')}</h5>${ts.slice(0,max).map(t => tn(t, iso)).join('')}${ts.length>max ? `<div class="muted" style="font-size:10px;cursor:pointer" data-verdia="${iso}">+${ts.length-max} más…</div>` : ''}${editaT ? `<div class="mas" data-nuevo="${iso}">＋</div>` : ''}</div>`; }).join('');
  document.querySelectorAll('[data-verdia]').forEach(x => x.onclick = () => { T_INICIO = new Date(x.dataset.verdia+'T00:00:00'); T_VISTA='dia'; cargarTurnos(); });
  if(editaT){ document.querySelectorAll('[data-nuevo]').forEach(x => x.onclick = () => nuevoTurno(x.dataset.nuevo));
    document.querySelectorAll('#tGrid [data-tid]').forEach(x => x.onclick = e => { e.stopPropagation(); editarTurno((data||[]).find(t => t.id==x.dataset.tid)); }); }
  if(T_VISTA==='mes') document.querySelectorAll('#tGrid .dia h5').forEach(x => { x.style.cursor='pointer'; x.title='Ver el día'; x.onclick = () => { T_INICIO = new Date(x.parentElement.dataset.dia+'T00:00:00'); T_VISTA='dia'; cargarTurnos(); }; });
}
document.querySelectorAll('[data-tv]').forEach(b => b.onclick = () => { T_VISTA = b.dataset.tv; cargarTurnos(); });
function moverTurnos(dir){ if(T_VISTA==='dia') T_INICIO.setDate(T_INICIO.getDate()+dir); else if(T_VISTA==='mes'){ T_INICIO = new Date(T_INICIO.getFullYear(), T_INICIO.getMonth()+dir, 1); } else T_INICIO.setDate(T_INICIO.getDate()+7*dir); cargarTurnos(); }
$('#tPrev').onclick = () => moverTurnos(-1);
$('#tNext').onclick = () => moverTurnos(1);
$('#tHoy').onclick = () => { T_INICIO = T_VISTA==='semana' ? lunesDe(new Date()) : new Date(new Date().setHours(0,0,0,0)); cargarTurnos(); };
$('#tNuevo').onclick = () => nuevoTurno(isoDe(new Date()));
function nuevoTurno(fecha){ $('#fTurno').reset(); BUSC_TURNO.fijar(null); $('#tId').value=''; $('#tFecha').value = fecha; $('#tIni').value='20:00'; $('#tFin').value='22:00'; $('#tituloTurno').textContent='Asignar turno'; $('#tfErr').textContent=''; $('#tRepetir').parentElement.style.display=''; $('#dlgTurno').showModal(); }
function editarTurno(t){ $('#fTurno').reset(); $('#tId').value=t.id; BUSC_TURNO.fijar(USUARIOS.find(u => u.id===t.usuario_id)); $('#tFecha').value=t.fecha; $('#tIni').value=String(t.hora_inicio).slice(0,5); $('#tFin').value=t.hora_fin?String(t.hora_fin).slice(0,5):''; $('#tNotas').value=t.notas||''; $('#tituloTurno').textContent='Editar turno'; $('#tfErr').textContent=''; $('#tRepetir').parentElement.style.display='none';
  let del = $('#tEliminar'); if(!del){ del = document.createElement('button'); del.type='button'; del.id='tEliminar'; del.className='ghost'; del.textContent='🗑 Eliminar'; $('#tBotones').appendChild(del); }
  del.style.display=''; del.onclick = async () => { if(!confirm('¿Eliminar este turno?')) return; const { error } = await sb.from('turnos').delete().eq('id', t.id); if(error){ $('#tfErr').textContent=error.message; return; } $('#dlgTurno').close(); toast('Turno eliminado.'); cargarTurnos(); };
  $('#dlgTurno').showModal(); }
$('#fTurno').onsubmit = async e => {
  e.preventDefault(); $('#tfErr').textContent=''; const del = $('#tEliminar'); if(del && !$('#tId').value) del.style.display='none';
  const base = { usuario_id: $('#tUsuario').value, fecha: $('#tFecha').value, hora_inicio: $('#tIni').value, hora_fin: $('#tFin').value || null, notas: $('#tNotas').value.trim() || null, asignado_por: yo.id };
  if(!base.usuario_id){ $('#tfErr').textContent='Elige el integrante de la lista.'; $('#tUsuarioTxt').focus(); return; }
  let r;
  if($('#tId').value) r = await sb.from('turnos').update(base).eq('id', +$('#tId').value);
  else { const filas = [base]; if($('#tRepetir').checked){ const n = Math.max(1, Math.min(12, +$('#tSemanas').value||4)); for(let i=1;i<n;i++){ const d = new Date(base.fecha+'T00:00:00'); d.setDate(d.getDate()+7*i); filas.push({ ...base, fecha: isoDe(d) }); } } r = await sb.from('turnos').insert(filas); }
  if(r.error){ $('#tfErr').textContent = r.error.message; return; }
  $('#dlgTurno').close(); toast('Turno guardado.'); cargarTurnos();
};

// ====================== ANUNCIOS ======================
async function cargarAnuncios(){
  const [{ data, error }, { data: vis }] = await Promise.all([sb.from('anuncios').select('*').order('fijado',{ascending:false}).order('publicado_en',{ascending:false}).limit(200), sb.from('anuncios_vistos').select('anuncio_id')]);
  if(error){ $('#nErr').textContent = error.message; return; } $('#nErr').textContent=''; ANUN = data || [];
  const vistos = {}; (vis||[]).forEach(v => vistos[v.anuncio_id] = (vistos[v.anuncio_id]||0)+1);
  const activos = USUARIOS.length ? USUARIOS.filter(u => u.activo).length : null; const editaA = tiene(yo,'anuncios');
  $('#nNuevo').style.display = editaA ? '' : 'none';
  $('#tbAnun').innerHTML = ANUN.map(a => { const cad = a.expira_en && new Date(a.expira_en) < new Date(); return `<tr data-id="${a.id}" style="${a.activo && !cad ? '' : 'opacity:.6'}"><td><b>${a.fijado?'📌 ':''}${esc(a.titulo)}</b><br><span class="muted" style="font-size:12px">${esc((a.cuerpo||'').slice(0,120))}${(a.cuerpo||'').length>120?'…':''}</span></td>
    <td class="muted" style="white-space:nowrap">${a.imagen_path ? `<img src="${esc(urlAnuncio(a.imagen_path))}" alt="" style="height:40px;border-radius:4px;border:1px solid var(--line2);display:block;margin-bottom:3px">` : ''}${fFecha(a.publicado_en)}</td><td class="muted">${a.expira_en ? fFecha(a.expira_en) : '—'}</td><td>${vistos[a.id]||0}${activos?` <span class="muted">/ ${activos}</span>`:''}</td>
    <td>${cad ? '<span class="tag off">Caducado</span>' : a.activo ? '<span class="tag on">Visible</span>' : '<span class="tag off">Oculto</span>'}</td><td class="acc" style="text-align:right">${editaA ? botonMenu(a.id) : ''}</td></tr>`; }).join('') || '<tr><td colspan=6 class="muted">Sin anuncios</td></tr>';
  document.querySelectorAll('#tbAnun [data-menu]').forEach(b => b.onclick = e => { e.stopPropagation(); const a = ANUN.find(x => x.id==b.dataset.menu);
    abrirMenu(b, 'anun:'+a.id, `<b style="color:var(--text)">${esc(a.titulo)}</b>`, [['editar','✏️ Editar'], ['discord','📣 Publicar en Discord'], [a.activo?'ocultar':'mostrar', a.activo?'🙈 Ocultar':'👁 Mostrar'], [a.fijado?'desfijar':'fijar', a.fijado?'Quitar fijado':'📌 Fijar arriba'], ['eliminar','🗑 Eliminar', true]], async op => {
      if(op==='editar') editarAnuncio(a);
      if(op==='discord'){ const r = await avisoDiscord('anuncios', { embed: { title: `📣 ${a.titulo}`, description: a.cuerpo||'', ...(a.imagen_path ? { image: { url: urlAnuncio(a.imagen_path) } } : {}) } }); toast(r==='ok' ? 'Publicado en Discord.' : r==='sin_webhook' ? 'El canal de anuncios no tiene webhook (Automatización).' : 'No se pudo publicar: '+r, r!=='ok'); }
      if(op==='ocultar' || op==='mostrar'){ await sb.from('anuncios').update({ activo: op==='mostrar', actualizado_en: new Date().toISOString() }).eq('id', a.id); cargarAnuncios(); }
      if(op==='fijar' || op==='desfijar'){ await sb.from('anuncios').update({ fijado: op==='fijar', actualizado_en: new Date().toISOString() }).eq('id', a.id); cargarAnuncios(); }
      if(op==='eliminar'){ if(!confirm(`¿Eliminar el anuncio "${a.titulo}"?`)) return; const { error } = await sb.from('anuncios').delete().eq('id', a.id); if(error) alert(error.message); cargarAnuncios(); }
    }); });
  if(editaA) document.querySelectorAll('#tbAnun tr[data-id]').forEach(tr => tr.onclick = e => { if(e.target.closest('button,a,input')) return; const a = ANUN.find(x => x.id==tr.dataset.id); if(a) editarAnuncio(a); });
}
const urlAnuncio = p => sb.storage.from('anuncios').getPublicUrl(p).data.publicUrl;
function anuncioImgPrev(src){ $('#nImgPrev').style.display = src ? '' : 'none'; if(src) $('#nImgPrevImg').src = src; }
$('#nImagen').onchange = async e => { const f = e.target.files[0]; if(!f) return; try{ const img = await cargarFoto(f, 1600); const c = document.createElement('canvas'); c.width = img.naturalWidth||img.width; c.height = img.naturalHeight||img.height; c.getContext('2d').drawImage(img, 0, 0); let b = await new Promise(r => c.toBlob(r, 'image/webp', 0.9)); if(!b || b.type!=='image/webp') b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9)); ANUN_IMG = b; ANUN_IMG_QUITAR = false; anuncioImgPrev(URL.createObjectURL(b)); }catch(x){ $('#nfErr').textContent='No se pudo leer la imagen.'; } };
$('#nImgQuitar').onclick = () => { ANUN_IMG = null; ANUN_IMG_QUITAR = true; $('#nImagen').value=''; anuncioImgPrev(null); };
$('#nNuevo').onclick = () => { $('#fAnuncio').reset(); ANUN_IMG=null; ANUN_IMG_QUITAR=false; anuncioImgPrev(null); $('#nId').value=''; $('#nActivo').checked=true; $('#nDiscord').checked=true; $('#tituloAnuncio').textContent='Nuevo anuncio'; $('#nGuardar').textContent='Publicar'; $('#nfErr').textContent=''; $('#dlgAnuncio').showModal(); };
function editarAnuncio(a){ $('#fAnuncio').reset(); ANUN_IMG=null; ANUN_IMG_QUITAR=false; anuncioImgPrev(a.imagen_path ? urlAnuncio(a.imagen_path) : null); $('#nId').value=a.id; $('#nTitulo').value=a.titulo; $('#nCuerpo').value=a.cuerpo||''; $('#nExpira').value=a.expira_en?String(a.expira_en).slice(0,10):''; $('#nFijado').checked=!!a.fijado; $('#nActivo').checked=!!a.activo; $('#nDiscord').checked=false; $('#tituloAnuncio').textContent='Editar anuncio'; $('#nGuardar').textContent='Guardar'; $('#nfErr').textContent=''; $('#dlgAnuncio').showModal(); }
$('#fAnuncio').onsubmit = async e => {
  e.preventDefault(); $('#nfErr').textContent='';
  const fila = { titulo: $('#nTitulo').value.trim(), cuerpo: $('#nCuerpo').value.trim(), fijado: $('#nFijado').checked, activo: $('#nActivo').checked, expira_en: $('#nExpira').value ? $('#nExpira').value + 'T23:59:59' : null, actualizado_en: new Date().toISOString() };
  const id = $('#nId').value; let r; const previo = id ? (ANUN.find(x => x.id==id)||{}).imagen_path : null;
  if(ANUN_IMG){ const path = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ANUN_IMG.type==='image/webp'?'webp':'jpg'}`; const up = await sb.storage.from('anuncios').upload(path, ANUN_IMG, { contentType: ANUN_IMG.type }); if(up.error){ $('#nfErr').textContent = 'No se pudo subir la imagen: '+up.error.message; return; } fila.imagen_path = path; }
  else if(ANUN_IMG_QUITAR) fila.imagen_path = null;
  if(id) r = await sb.from('anuncios').update(fila).eq('id', +id); else r = await sb.from('anuncios').insert({ ...fila, autor_id: yo.id });
  if(r.error){ $('#nfErr').textContent = r.error.message; return; }
  if(previo && (ANUN_IMG || ANUN_IMG_QUITAR)) sb.storage.from('anuncios').remove([previo]).then(()=>{}, ()=>{});
  $('#dlgAnuncio').close(); let extra = ''; const imgUrl = fila.imagen_path ? urlAnuncio(fila.imagen_path) : (previo && !ANUN_IMG_QUITAR ? urlAnuncio(previo) : null);
  if($('#nDiscord').checked && fila.activo){ const d = await avisoDiscord('anuncios', { embed: { title: `📣 ${fila.titulo}`, description: fila.cuerpo, ...(imgUrl ? { image: { url: imgUrl } } : {}) } }); extra = d==='ok' ? ' Publicado en Discord.' : d==='sin_webhook' ? ' (Discord: canal de anuncios sin webhook)' : ' (Discord: '+d+')'; }
  toast('Anuncio guardado.'+extra); cargarAnuncios();
};

// ====================== TAREAS PROGRAMADAS ======================
var PROGRAMADAS = [
  ['recordatorio_turnos','Recordatorio de turnos de hoy','recordatorios','Lista los turnos del día y quién no ha enviado su Reporte de Fin de Día', 20, 0, null],
  ['cierre_diario','Cierre del día','resumen','Reportes aprobados del día por formulario y quiénes reportaron', 23, 55, null],
  ['resumen_semanal','Resumen semanal','resumen','KPIs de los últimos 7 días y los 5 más activos', 8, 0, 1],
  ['ranking_mensual','Ranking mensual','ranking','Top 3 del mes anterior por categoría; otorga las insignias', 9, 0, null],
];
async function cargarProgramadas(){
  const { data } = await sb.from('configuracion').select('valor').eq('clave','programadas').maybeSingle(); const cfg = (data && data.valor) || {};
  const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  $('#tbProg').innerHTML = PROGRAMADAS.map(([k, n, canal, desc, h, m, dia]) => { const c = cfg[k] || {}; return `<tr data-p="${k}"><td><b>${esc(n)}</b><br><span class="muted" style="font-size:12px">${esc(desc)}</span></td><td class="muted">${esc(canal)}</td>
    <td><input type="checkbox" data-pa ${c.activo?'checked':''}></td>
    <td style="white-space:nowrap">${k==='resumen_semanal' ? `<select data-pd style="width:auto;display:inline-block;padding:4px 6px;margin-right:4px">${DIAS.map((d,i)=>`<option value="${i}" ${(c.dia??dia)==i?'selected':''}>${d}</option>`).join('')}</select>` : k==='ranking_mensual' ? '<span class="muted">día 1 · </span>' : ''}<input type="time" data-ph value="${String(c.hora??h).padStart(2,'0')}:${String(c.minuto??m).padStart(2,'0')}" style="width:auto;display:inline-block;padding:4px 6px"></td>
    <td><button class="ghost sm" data-pg="${k}">Guardar</button></td><td><button class="ghost sm" data-px="${k}" title="Ejecuta la tarea ahora mismo con los datos de hoy">▶ Ejecutar ahora</button></td></tr>`; }).join('');
  document.querySelectorAll('[data-pg]').forEach(b => b.onclick = async () => { const tr = b.closest('tr'); const [hh, mm] = tr.querySelector('[data-ph]').value.split(':').map(Number); const dsel = tr.querySelector('[data-pd]');
    const { data: r, error } = await sb.rpc('programar', { p_clave: b.dataset.pg, p_activo: tr.querySelector('[data-pa]').checked, p_hora: hh, p_minuto: mm, p_dia: dsel ? +dsel.value : 1 });
    if(error){ $('#pErr').textContent = error.message; return; } $('#pErr').textContent=''; toast(r.activo ? `Programada (${r.cron} UTC).` : 'Tarea desactivada.'); });
  document.querySelectorAll('[data-px]').forEach(b => b.onclick = async () => { b.disabled = true; const { data: r, error } = await sb.rpc('ejecutar_programada', { p_accion: b.dataset.px }); b.disabled = false;
    if(error){ $('#pErr').textContent = error.message; return; } $('#pErr').textContent='';
    toast(r.enviado ? 'Enviado a Discord.' : r.motivo==='sin_webhook' ? 'Generado, pero el canal no tiene webhook configurado.' : 'Sin nada que enviar: '+(r.motivo||''), !r.enviado); });
}
