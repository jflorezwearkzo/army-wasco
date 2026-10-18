import { dibujarResumen, resumenPNG, resumenPDF, descargar } from './resumen-export.js';
import { requerir, barraUsuario, tiene, sb, esc, entrarVerComo, enVerComo, urlImagen, emailDe, RANGOS, nombreCompleto, esSuperadmin, validarPassword, traducirAuth } from './auth.js';

const yo = await requerir(); barraUsuario(yo);
const $ = s => document.querySelector(s);
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => document.getElementById(b.dataset.close).close());
const PERMS = ['usuarios','asignar_roles','reset_password','crear_roles','crear_reportes','gestion_reportes','disenar_formularios','historial','eliminar_historial','auditoria','ver_como'];
const NOMBRE_PERM = { usuarios:'Gestión de usuarios', asignar_roles:'Asignación de roles', reset_password:'Restablecer contraseñas',
  crear_roles:'Creación de roles', crear_reportes:'Creación de reportes', gestion_reportes:'Gestión de reportes', disenar_formularios:'Creación de formularios (diseñador)', historial:'Ver historial', eliminar_historial:'Eliminar historial', auditoria:'Ver auditoría', ver_como:'Ver la página como otro usuario (solo lectura)' };
const TABS = [
  ['usuarios',    'Usuarios',    ['usuarios','asignar_roles','reset_password']],
  ['roles',       'Roles',       ['crear_roles']],
  ['formularios', 'Formularios', ['crear_reportes','gestion_reportes']],
  ['historial',   'Historial',   ['historial','eliminar_historial']],
  ['resumen',     'Resumen',     ['historial']],
  ['auditoria',   'Auditoría',   ['auditoria']],
];
let roles = [], formularios = [], rangosPM = [];

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
  if(nuevo || !sub) return ({usuarios:cargarUsuarios, roles:cargarRoles, formularios:cargarForms, historial:cargarHist, resumen:cargarResumen, auditoria:cargarAud})[t]();
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
let USUARIOS=[], ACTIV={}, SEL=new Set();
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
  if(tiene(yo,'historial')) ops.push(['reportes','📋 Ver sus reportes']);
  if(ok && tiene(yo,'reset_password') && u.id!==yo.id) ops.push(['password','🔑 Restablecer contraseña']);
  if(ok && tiene(yo,'usuarios')){ ops.push(['visible', u.visible===false ? '👁 Mostrar en formularios' : '🙈 Ocultar en formularios']); if(u.id!==yo.id) ops.push([u.activo?'desactivar':'activar', u.activo ? '⛔ Desactivar cuenta' : '✅ Activar cuenta']); }
  abrirMenu(btn, u.id, `<b style="color:var(--text)">${esc(u.usuario)}</b> · ${esc(r?r.nombre:'Sin rol')}${ok?'':` · <span style="color:#ff9f9f">${motivoNoTocar(u)}</span>`}`, ops.map(([k,t]) => [k, t, k==='desactivar']), op => accionUsuario(op, u));
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
    else if(op==='vercomo'){ if(!confirm(`Vas a ver la página como "${nombreCompleto(u)}" (solo lectura). Verás una franja amarilla arriba para salir del modo. Esta acción queda en la auditoría.\n\n¿Continuar?`)) return; await entrarVerComo(u.id); }
    else if(op==='reportes'){ abrir('historial'); $('#hUsuario').value = u.usuario; $('#hForm').value=''; $('#hDesde').value=''; $('#hHasta').value=''; buscarHist(); window.scrollTo({top:0,behavior:'smooth'}); }
    else if(op==='password') resetearPassword(u.id, u.usuario);
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
    + (tiene(yo,'historial') ? `<a data-ctx="reportes">📋 Sus reportes</a>` : '');
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
    abrirMenu(b, 'rol:'+r.id, `<b style="color:var(--text)">${esc(r.nombre)}</b>${ok?'':` · <span style="color:#ff9f9f">${r.protegido?'Solo Administrador':'Fuera de tus permisos'}</span>`}`, ops, async op => {
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
    <td><span class="tag ${f.activo?'on':'off'}">${f.activo?'Visible':'Oculto'}</span>${f.definicion ? ` <span class="tag" title="Creado con el diseñador">Plantilla v${f.version||1}</span>` : ''}</td>
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
  $('#fOrden').value=f.orden; $('#fRuta').value=f.ruta; $('#fActivo').checked=f.activo; msg('f','');
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
    orden:parseInt($('#fOrden').value)||100, ruta:$('#fRuta').value.trim(), activo:$('#fActivo').checked };
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
$('#hCsv').onclick = () => descargarCsv('historial', [['Folio','folio'],['Fecha','fecha'],['Formulario','formulario'],['Usuario','usuario'],['Nombre',r=>[r.usuario_rango,r.usuario_nombre].filter(Boolean).join(' ')],['Resumen','resumen'],['Registrado',r=>r.creado_en?new Date(r.creado_en).toLocaleString('es-CO'):''],['Imagen','imagen_path'],['Datos','datos']], HIST_DATA);
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
$('#hForm').onchange = buscarHist;
['#hDesde','#hHasta'].forEach(s => $(s).onchange = () => { ajustarFechas(); buscarHist(); });
['#hDesde','#hHasta'].forEach(s => $(s).onclick = () => { try{ $(s).showPicker(); }catch(e){} });
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
$('#hLimpiar').onclick = () => { $('#hForm').value=''; $('#hUsuario').value=''; $('#hDesde').value=''; $('#hHasta').value=''; ajustarFechas(); buscarHist(); };
async function buscarHist(){
  let q = sb.from('reportes_vista').select('*').order('creado_en', { ascending:false }).limit(300);
  if($('#hForm').value) q = q.eq('formulario_id', $('#hForm').value);
  if($('#hUsuario').value.trim()) q = q.ilike('usuario', `%${$('#hUsuario').value.trim()}%`);
  if($('#hDesde').value) q = q.gte('fecha', $('#hDesde').value);
  if($('#hHasta').value) q = q.lte('fecha', $('#hHasta').value);
  const { data, error } = await q;
  if(error){ $('#hErr').textContent = error.message; return; }
  $('#hErr').textContent=''; HIST_DATA = data;
  const fmt = iso => iso ? iso.slice(0,10).split('-').reverse().join('-') : '—';
  $('#tbHist').innerHTML = data.map(r => `<tr><td><b>${esc(r.folio||r.id)}</b></td><td>${fmt(r.fecha)}</td><td>${esc(r.formulario||r.formulario_id||'—')}</td>
    <td>${esc(r.usuario||'—')}<br><span class="muted">${esc([r.usuario_rango, r.usuario_nombre].filter(Boolean).join(' '))}</span></td><td>${esc(r.resumen||'')}</td>
    <td class="muted">${new Date(r.creado_en).toLocaleString('es-CO')}</td>
    <td>${r.imagen_path ? `<button class="ghost sm" data-hv="${esc(r.imagen_path)}" data-n="reporte-${esc(r.folio||r.id)}.png">Ver</button>` : '—'}</td>
    <td>${tiene(yo,'eliminar_historial') ? `<button class="ghost sm" data-hd="${r.id}" data-p="${esc(r.imagen_path||'')}">Eliminar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan=8 class="muted">Sin reportes</td></tr>';
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
const ACCION = { insert:'Creó', update:'Modificó', delete:'Eliminó', reset_password:'Restableció contraseña', reset_password_denegado:'Intento de reset denegado', ver_como_inicio:'👁 Empezó a ver como', ver_como_fin:'👁 Dejó de ver como' };
const TABLA = { perfiles:'usuario', roles:'rol', formularios:'formulario', reportes:'reporte', rangos_pm:'Rango PM', auth:'cuenta' };
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
  const fmtV = v => v===null||v===undefined ? '—' : (typeof v==='object' ? JSON.stringify(v) : String(v)).slice(0,60);
  $('#tbAud').innerHTML = data.map(r => `<tr><td class="muted" style="white-space:nowrap">${new Date(r.en).toLocaleString('es-CO')}</td>
    <td><b>${esc(r.usuario||'sistema')}</b></td><td>${esc(ACCION[r.accion]||r.accion)} ${esc(TABLA[r.tabla]||r.tabla)}</td>
    <td>${esc(r.registro||'')}</td><td class="muted" style="font-size:12px">${esc(resumen(r))}</td></tr>`).join('') || '<tr><td colspan=5 class="muted">Sin eventos</td></tr>';
}

// ====================== RESUMEN ======================
const iso = d => d.toISOString().slice(0,10);
let RES=null;
async function cargarResumen(){
  if(!$('#rDesde').value){ const h=new Date(); $('#rHasta').value=iso(h); $('#rDesde').value=iso(new Date(h.getTime()-29*864e5)); }
  const desde=$('#rDesde').value, hasta=$('#rHasta').value;
  const { data, error } = await sb.from('reportes_vista').select('id,fecha,formulario,formulario_id,usuario,usuario_nombre,usuario_rango,datos,creado_en').gte('fecha',desde).lte('fecha',hasta).order('fecha').limit(3000);
  if(error){ $('#rNota').textContent=error.message; return; }
  const R=data||[]; const quien=r=>[r.usuario_rango,r.usuario_nombre||r.usuario].filter(Boolean).join(' ');
  // KPIs
  const bajas=R.filter(r=>r.formulario_id==='bajas').reduce((a,r)=>a+((r.datos&&Array.isArray(r.datos.rows))?r.datos.rows.length:0),0);
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
