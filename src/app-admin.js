import { dibujarResumen, dibujarActividad, resumenPNG, resumenPDF, descargar } from './resumen-export.js';
import { dibujarEmbed, textoEmbed } from './embed-export.js';
import { respaldoCompleto } from './respaldo.js';
import { requerir, barraUsuario, tiene, sb, esc, notificarDiscord, avisoDiscord, hoyISO, cargarFoto, entrarVerComo, enVerComo, urlImagen, emailDe, RANGOS, nombreCompleto, esSuperadmin, validarPassword, traducirAuth, auditarReporte, badgeIA, detalleIA, mensajesDiscord, reenviarDiscord, RAIZ } from './auth.js';

const yo = await requerir(); barraUsuario(yo);
const $ = s => document.querySelector(s);
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => document.getElementById(b.dataset.close).close());
const PERMS = ['usuarios','asignar_roles','reset_password','crear_roles','crear_reportes','gestion_reportes','disenar_formularios','historial','eliminar_historial','auditoria','aprobar_reportes','sanciones','turnos','ver_turnos','anuncios','ver_anuncios','permisos_granulares','ver_como','organizaciones','ver_todo'];
const NOMBRE_PERM = { usuarios:'Gestión de usuarios', asignar_roles:'Asignación de roles', reset_password:'Restablecer contraseñas',
  crear_roles:'Creación de roles', crear_reportes:'Creación de reportes', gestion_reportes:'Gestión de reportes', disenar_formularios:'Creación de formularios (diseñador)', historial:'Ver historial', eliminar_historial:'Eliminar historial', auditoria:'Ver auditoría', aprobar_reportes:'Revisar y aprobar reportes', sanciones:'Sanciones y advertencias', turnos:'Turnos: asignar y editar', ver_turnos:'Turnos: solo ver la agenda', anuncios:'Anuncios: publicar y editar', ver_anuncios:'Anuncios: solo ver el tablón y quién lo leyó', permisos_granulares:'Permisos granulares por usuario (ficha de usuario)', ver_como:'Ver la página como otro usuario (solo lectura)', organizaciones:'Control de TODAS las organizaciones', ver_todo:'Ver todo (solo lectura)' };
const TABS = [
  ['usuarios',    'Usuarios',    ['usuarios','asignar_roles','reset_password','permisos_granulares'], 'Identidad', '👤'],
  ['roles',       'Roles y permisos', ['crear_roles'], 'Identidad', '🛡️'],
  ['formularios', 'Formularios', ['crear_reportes','gestion_reportes','disenar_formularios'], 'Reportes', '📋'],
  ['revision',    'Revisión',    ['aprobar_reportes'], 'Reportes', '✅'],
  ['historial',   'Historial',   ['historial','eliminar_historial'], 'Reportes', '🗂️'],
  ['resumen',     'Resumen',     ['historial'], 'Reportes', '📊'],
  ['actividad',   'Actividad',   ['historial'], 'Reportes', '📈'],
  ['disciplina',  'Disciplina',  ['sanciones'], 'Personal', '⚠️'],
  ['ascensos',    'Ascensos',    ['usuarios'], 'Personal', '🎖️'],
  ['turnos',      'Turnos',      ['turnos','ver_turnos'], 'Personal', '🚔'],
  ['anuncios',    'Anuncios',    ['anuncios','ver_anuncios'], 'Personal', '📣'],
  ['agenda',      'Agenda',      ['anuncios'], 'Personal', '📅'],
  ['automatizacion','Automatización',['gestion_reportes'], 'Sistema', '⏰'],
  ['auditoria',   'Auditoría',   ['auditoria'], 'Sistema', '🔎'],
  ['organizaciones','Organizaciones',['organizaciones','*superadmin'], 'Sistema', '🏛️'],
];
let roles = [], formularios = [], rangosPM = [], MEMB = {}, ORGS_TODAS = [];
const VER_ORGS = esSuperadmin(yo);   // la columna de organizaciones es solo para quien manda en todas
let ACT = [], ACT_CFG = { dia_inicio:2, min_semanal:2, min_mensual:8 }, ACT_MODO = 'semana';
let AG_CANALES = [], AG_DESTINOS = [], AG_IMG = null, AG_IMG_QUITAR = false;
const PUEDE_AGENDA = tiene(yo, 'anuncios');
let U_ORD='usuario', U_DESC=false, USUARIOS=[], ACTIV={}, SEL=new Set(), SANC=[], REQ={}, T_INICIO=null, T_VISTA='semana', ANUN=[], ANUN_IMG=null, ANUN_IMG_QUITAR=false;

// ---------- Pestañas según permisos ----------
// "Ver todo" abre todas las secciones en modo lectura, menos la de organizaciones
const tabs = TABS.filter(([id,,ps]) => ps.some(p => p==='*superadmin' ? esSuperadmin(yo) : tiene(yo,p))
  || (tiene(yo,'ver_todo') && id!=='organizaciones')).map(([id]) => id);
if(!tabs.length){ document.body.innerHTML = '<p style="padding:40px;text-align:center">No tienes permisos de administración.</p>'; throw new Error('sin permisos'); }
$('#rPermisos').innerHTML = PERMS.filter(p => p!=='ver_como' && p!=='organizaciones').map(p => `<label><input type="checkbox" class="rp" value="${p}"> ${NOMBRE_PERM[p]}</label>`).join('') + `<p class="muted" style="margin:6px 0 0;font-size:12px">👁 "Ver la página como otro usuario" y 🏛️ "Control de todas las organizaciones" son exclusivos del rol Administrador y se otorgan desde la ficha de cada usuario.</p>`;
{ let g = null; $('#tabs').innerHTML = TABS.filter(([id]) => tabs.includes(id)).map(([id,nombre,,grupo,ic]) => (g!==grupo ? (g=grupo, `<div class="grp">${grupo}</div>`) : '') + `<button data-t="${id}"><span class="ic">${ic}</span><span class="tx">${nombre}</span></button>`).join('');
}
// En móvil el menú lateral vive en un cajón que se desliza: es la misma lista de siempre,
// con sus grupos e iconos, así no hay dos menús que mantener ni un desplegable que se recorte.
const esMovil = () => window.matchMedia('(max-width:900px)').matches;
function nav(abierto){
  $('#navCaja').classList.toggle('on', abierto);
  $('#navFondo').hidden = !abierto;
  $('#abrirNav').setAttribute('aria-expanded', abierto ? 'true' : 'false');
  document.body.style.overflow = abierto ? 'hidden' : '';
  if(abierto){ const act = document.querySelector('nav#tabs button.on'); if(act) act.scrollIntoView({block:'nearest'}); }
}
$('#abrirNav').onclick = () => nav(!$('#navCaja').classList.contains('on'));
$('#cerrarNav').onclick = () => nav(false);
$('#navFondo').onclick = () => nav(false);
document.addEventListener('keydown', e => { if(e.key==='Escape' && $('#navCaja').classList.contains('on')) nav(false); });
window.addEventListener('resize', () => { if(!esMovil() && $('#navCaja').classList.contains('on')) nav(false); });
let TAB_ACTUAL = null;
function abrir(t, sub=''){
  if(!tabs.includes(t)) t = tabs[0];
  const nuevo = t!==TAB_ACTUAL; TAB_ACTUAL = t;
  document.querySelectorAll('nav#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t===t));
  document.querySelectorAll('section').forEach(s => s.classList.toggle('on', s.id==='t-'+t));
  const def = TABS.find(x => x[0]===t);
  $('#navActual').textContent = def ? `${def[4]} ${def[1]}` : t;
  $('#migas').innerHTML = `Administración › <b>${def ? def[3] : ''}</b> › <b>${def ? def[1] : t}</b>`;
  const h = '#' + t + (sub ? '/' + sub : ''); if(location.hash !== h) history.replaceState(null, '', h);
  if(nuevo || !sub) return ({usuarios:cargarUsuarios, roles:cargarRoles, formularios:cargarForms, historial:cargarHist, resumen:cargarResumen, actividad:cargarActividad, auditoria:cargarAud, automatizacion:cargarAutomatizacion, agenda:cargarAgenda, revision:cargarRevision, disciplina:cargarDisciplina, ascensos:cargarAscensos, turnos:cargarTurnos, anuncios:cargarAnuncios, organizaciones:cargarOrgs})[t]();
}
document.querySelectorAll('nav#tabs button').forEach(b => b.onclick = () => { cerrarDialogos(); nav(false); abrir(b.dataset.t); });
// Las tablas anchas se envuelven para que en pantallas pequeñas se deslicen de lado
document.querySelectorAll('section table').forEach(t => {
  if(t.parentElement && t.parentElement.classList.contains('tscroll')) return;
  const d = document.createElement('div'); d.className = 'tscroll';
  // El ancho mínimo depende de cuántas columnas tenga: las tablas cortas no necesitan deslizarse
  d.style.setProperty('--cols', t.querySelectorAll('thead th').length || 1);
  t.parentNode.insertBefore(d, t); d.appendChild(t);
});
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
async function contarPendientes(){ if(!tiene(yo,'aprobar_reportes')) return; const { count } = await sb.from('reportes').select('id', { count:'exact', head:true }).eq('estado','pendiente'); const b = document.querySelector('nav#tabs button[data-t="revision"]'); if(b) b.innerHTML = '<span class="ic">✅</span><span class="tx">Revisión</span>' + (count ? ` <span class="tag pend">${count}</span>` : ''); }
contarPendientes(); setInterval(contarPendientes, 120000);

async function cargarCatalogos(){
  // Los roles son propios de cada organización: los de una no se ofrecen ni se ven en la otra
  roles = ((await sb.from('roles').select('*').order('nombre')).data || []).filter(r => !yo.org || !r.org_id || r.org_id === yo.org.id);
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
  if(error){ $('#tbUsuarios').innerHTML = `<tr><td colspan=${VER_ORGS?9:8} class="err">${esc(error.message)}</td></tr>`; return; }
  const orgActual = yo.org ? yo.org.id : null;
  const [{ data: mem }, { data: orgs }] = await Promise.all([
    sb.from('membresias').select('usuario_id,org_id,rol_id,rango,activo,visible,permisos_extra,permisos_negados,formularios_extra'),
    VER_ORGS ? sb.from('organizaciones').select('id,nombre,nombre_corto,orden').order('orden') : Promise.resolve({ data: [] })
  ]);
  ORGS_TODAS = orgs || []; MEMB = {};
  (mem||[]).forEach(m => { (MEMB[m.usuario_id] = MEMB[m.usuario_id] || []).push(m); });
  // Si no se pueden leer las membresías, se muestra lo del perfil en vez de marcar a todos "sin acceso"
  const sinMembresias = !mem || !mem.length;
  // El rol, el rango y el estado que se muestran son los de la organización en la que estoy
  USUARIOS = (data || []).map(u => { const mias = MEMB[u.id] || []; const m = sinMembresias ? u : mias.find(x => x.org_id === orgActual);
    return m ? { ...u, rol_id:m.rol_id, activo:m.activo, visible:m.visible,
                 permisos_extra:m.permisos_extra, permisos_negados:m.permisos_negados, formularios_extra:m.formularios_extra,
                 _orgs: mias.map(x => x.org_id) }
             : { ...u, rol_id:null, activo:false, visible:true, _orgs: mias.map(x => x.org_id), _fuera:true }; });
  SEL = new Set([...SEL].filter(id => USUARIOS.some(u => u.id===id)));
  document.querySelectorAll('th.colorgs').forEach(th => th.hidden = !VER_ORGS);
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
  const claveOrd = u => { const r = roles.find(x => x.id===u.rol_id); const a = ACTIV[u.id]; switch(U_ORD){
    case 'nombre': return [u.rango||'', u.nombre||u.usuario].join(' ').toLowerCase();
    case 'rol': return r ? r.nombre.toLowerCase() : '\uffff';
    case 'estado': return u.activo ? 0 : 1;
    case 'visible': return (u.activo && u.visible!==false) ? 0 : 1;
    case 'ultimo': return a ? (a.ultimo||'') + ' ' + String(a.reportes).padStart(6,'0') : '';
    default: return (u.usuario||'').toLowerCase(); } };
  lista.sort((a,b) => { const x = claveOrd(a), y = claveOrd(b); const c = typeof x==='number' ? x-y : String(x).localeCompare(String(y), 'es'); return U_DESC ? -c : c; });
  document.querySelectorAll('table.usuarios th[data-ord]').forEach(th => { th.classList.toggle('on', th.dataset.ord===U_ORD); th.classList.toggle('desc', th.dataset.ord===U_ORD && U_DESC); });
  $('#uContador').textContent = lista.length===USUARIOS.length ? `${USUARIOS.length} usuario(s)` : `Mostrando ${lista.length} de ${USUARIOS.length}`;
  $('#tbUsuarios').innerHTML = lista.map(u => {
    const r = roles.find(x => x.id===u.rol_id); const a = ACTIV[u.id];
    return `<tr class="urow ${SEL.has(u.id)?'sel':''}" data-id="${u.id}">
      <td class="chk"><input type="checkbox" data-sel="${u.id}" ${SEL.has(u.id)?'checked':''} ${puedoTocar(u)?'':'disabled title="'+motivoNoTocar(u)+'"'}></td>
      <td class="u"><b>${esc(u.usuario)}</b>${u.id===yo.id?' <span class="muted" style="font-size:11px">(tú)</span>':''}</td>
      <td class="nom">${esc(nombreCompleto(u))}</td><td>${esc(r ? r.nombre : 'Sin rol')}${(u.permisos_extra && Object.keys(u.permisos_extra).length) || (u.permisos_negados && Object.keys(u.permisos_negados).length) || (u.formularios_extra && u.formularios_extra.length) ? ' <span class="tag" style="background:var(--avisobg);color:#e0a92a" title="Tiene permisos granulares propios">+granular</span>' : ''}</td>
      ${VER_ORGS ? `<td>${(u._orgs||[]).map(id => { const o = ORGS_TODAS.find(x => x.id===id); return `<span class="tag" style="background:var(--avisobg);color:var(--gold);margin-right:3px" title="${esc(o?o.nombre:id)}">${esc(o ? (o.nombre_corto||o.nombre) : id)}</span>`; }).join('') || '<span class="muted">—</span>'}</td>` : ''}
      <td>${u._fuera ? '<span class="tag off" title="No pertenece a esta organización">Sin acceso</span>' : `<span class="tag ${u.activo?'on':'off'}">${u.activo?'Activo':'Inactivo'}</span>`}</td>
      <td><span class="tag ${(u.activo&&u.visible!==false)?'on':'off'}" title="${u.activo?'':'Los usuarios inactivos nunca aparecen en los formularios'}">${u.visible===false?'Oculto':'Visible'}</span></td>
      <td class="ult muted">${a ? `${fFecha(a.ultimo)} <span style="font-size:11px">(${a.reportes})</span>` : '—'}</td>
      <td class="acc"><button type="button" class="btn-acc" data-menu="${u.id}" title="Acciones" aria-label="Acciones">⋯</button></td></tr>`;
  }).join('') || `<tr><td colspan=${VER_ORGS?9:8} class="muted">Sin usuarios que coincidan</td></tr>`;
  const todos = $('#uTodos'); const sel = lista.filter(u=>puedoTocar(u));
  todos.checked = sel.length>0 && sel.every(u=>SEL.has(u.id)); todos.indeterminate = !todos.checked && sel.some(u=>SEL.has(u.id));
  document.querySelectorAll('[data-sel]').forEach(c => c.onchange = () => { c.checked ? SEL.add(c.dataset.sel) : SEL.delete(c.dataset.sel); pintarUsuarios(); });
  document.querySelectorAll('[data-menu]').forEach(b => b.onclick = e => { e.stopPropagation(); abrirMenuUsuario(b, USUARIOS.find(u=>u.id===b.dataset.menu)); });
  document.querySelectorAll('tr.urow').forEach(tr => tr.onclick = e => { if(e.target.closest('input,button,a')) return; location.href = 'usuario.html?id=' + encodeURIComponent(tr.dataset.id); });
  const n = [...SEL].filter(id => vis.has(id)).length; $('#uBulkN').textContent = SEL.size; $('#uBulk').classList.toggle('on', SEL.size>0);
  if(RESALTAR){ const id = RESALTAR; if(!vis.has(id)){ $('#uBuscar').value=''; $('#uFiltro').value=''; $('#uFiltroRol').value=''; pintarUsuarios(); return; } resaltar($('#tbUsuarios'), id); setTimeout(()=>{ if(RESALTAR===id) RESALTAR=null; }, 2600); }
}
$('#uNuevo').onclick = () => nuevoUsuario();
['#uBuscar','#uFiltro','#uFiltroRol'].forEach(s => $(s).addEventListener('input', pintarUsuarios));
document.querySelectorAll('table.usuarios th[data-ord]').forEach(th => th.onclick = () => { if(U_ORD===th.dataset.ord) U_DESC = !U_DESC; else { U_ORD = th.dataset.ord; U_DESC = false; } pintarUsuarios(); });
$('#uTodos').onchange = () => { const lista = usuariosFiltrados().filter(puedoTocar); if($('#uTodos').checked) lista.forEach(u=>SEL.add(u.id)); else lista.forEach(u=>SEL.delete(u.id)); pintarUsuarios(); };

// Menú ⋯ por usuario
function abrirMenuUsuario(btn, u){
  const r = roles.find(x => x.id===u.rol_id); const ok = puedoTocar(u); const ops = [];
  ops.push(['ficha','🪪 Abrir ficha del usuario']);
  if(ok && (tiene(yo,'usuarios')||tiene(yo,'asignar_roles'))) ops.push(['editar','✏️ Editar']);
  if(tiene(yo,'ver_como') && !enVerComo(yo) && u.id!==yo.id) ops.push(['vercomo','👁 Ver la página como este usuario']);
  ops.push(['expediente','📁 Expediente (sanciones, ascensos, reportes)']);
  ops.push(['ruta','🧭 Ruta de aprendizaje']);
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
    else if(op==='ficha') location.href = 'usuario.html?id=' + encodeURIComponent(u.id);
    else if(op==='expediente') location.href = '../expediente.html?id=' + encodeURIComponent(u.id);
    else if(op==='ruta') location.href = '../ruta.html?u=' + encodeURIComponent(u.id);
    else if(op==='vercomo'){ if(!confirm(`Vas a ver la página como "${nombreCompleto(u)}" (solo lectura). Verás una franja amarilla arriba para salir del modo. Esta acción queda en la auditoría.\n\n¿Continuar?`)) return; await entrarVerComo(u.id); }
    else if(op==='reportes'){ abrir('historial'); $('#hUsuario').value = u.usuario; $('#hForm').value=''; $('#hDesde').value=''; $('#hHasta').value=''; buscarHist(); window.scrollTo({top:0,behavior:'smooth'}); }
    else if(op==='password') resetearPassword(u.id, u.usuario);
    else if(op==='mfa') await quitarMfa(u);
    else if(op==='visible'){ await actualizarPerfiles([u], { visible: u.visible===false }); }
    else if(op==='activar'){ await actualizarPerfiles([u], { activo:true }); }
    else if(op==='desactivar'){ if(!confirm(`¿Desactivar la cuenta de "${u.usuario}"? No podrá iniciar sesión ni aparecerá en los formularios.`)) return; await actualizarPerfiles([u], { activo:false }); }
  }catch(x){ alert(x.message||String(x)); }
}
// Estado, visibilidad y rol son de la organización en la que estamos; el nombre y el rango son generales.
// Por eso todo pasa por guardar_miembro y no por un update directo a perfiles.
async function actualizarPerfiles(lista, cambios){
  const errores = [];
  const args = { p_org: (yo.org && yo.org.id) || null,
    p_nombre: 'nombre' in cambios ? cambios.nombre : null,
    p_rango:  'rango'  in cambios ? (cambios.rango || null) : null,
    p_activo: 'activo' in cambios ? cambios.activo : null,
    p_visible:'visible' in cambios ? cambios.visible : null };
  for(const u of lista){
    const rol = 'rol_id' in cambios ? cambios.rol_id : (u.rol_id || null);
    const { error } = await sb.rpc('guardar_miembro', { ...args, p_usuario: u.id, p_rol_id: rol });
    if(error) errores.push(`${u.usuario}: ${error.message}`); }
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
    + (tiene(yo,'historial') ? `<a data-ctx="reportes">📋 Sus reportes</a>` : '') + `<a data-ctx="expediente">📁 Expediente</a><a data-ctx="ficha">🪪 Ficha</a>`;
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
      const prev = (USUARIOS.find(u => u.id === id) || {});
      const args = { p_usuario: id, p_org: (yo.org && yo.org.id) || null, p_rol_id: prev.rol_id || null,
                     p_nombre: null, p_rango: null, p_activo: null, p_visible: null };
      if(tiene(yo,'usuarios')) Object.assign(args, { p_nombre: nombre, p_rango: rango, p_activo: activo, p_visible: visible });
      if(tiene(yo,'asignar_roles')) args.p_rol_id = rol || null;
      const { error } = await sb.rpc('guardar_miembro', args); if(error) throw error;
          } else {
      if(!tiene(yo,'usuarios')) throw new Error('No tienes permiso para crear usuarios.');
      const pass=$('#uPass').value; { const v=validarPassword(pass); if(v) throw new Error('Contraseña inicial: '+v); }
      // Alta por función de servidor (clave de servicio: no pasa por captcha ni por el registro público)
      const { data, error } = await sb.functions.invoke('crear-usuario', { body:{ usuario, nombre, password: pass } });
      if(error){ let m=error.message; try{ const j=await error.context.json(); if(j.error) m=j.error; }catch{} throw new Error(m); }
      if(!data || !data.id) throw new Error((data && data.error) || 'No se pudo crear el usuario.');
      data.user = { id: data.id };
      // El trigger creó el perfil inactivo con rol "usuario"; ahora lo ajustamos
      // La membresía se da de alta en la organización en la que está el administrador (p_crear)
      const args = { p_usuario: data.user.id, p_org: (yo.org && yo.org.id) || null, p_crear: true,
                     p_nombre: nombre, p_rango: rango, p_activo: activo, p_visible: visible,
                     p_rol_id: tiene(yo,'asignar_roles') ? (rol || null) : null };
      // pequeño reintento: el trigger que crea el perfil puede tardar unos ms
      let ok=false, ultimo=''; for(let i=0;i<5 && !ok;i++){ const r = await sb.rpc('guardar_miembro', args); ok = !r.error; if(!ok){ ultimo = r.error.message; await new Promise(r=>setTimeout(r,400)); } }
      if(!ok) throw new Error('El usuario se creó pero no se pudo activar' + (ultimo ? ' ('+ultimo+')' : '') + '; edítalo desde la lista.');
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
    <td>${esc(r.rango_pm||'—')}</td><td class="muted">${['—','Auxiliar','Co-Líder','Líder'][r.nivel_firma||0]}</td><td>${esc(permisosTexto(r))}</td><td>${esc(formsTexto(r))}</td>
    <td class="acc" style="text-align:right">${botonMenu(r.id, 'data-k="rol"')}</td></tr>`).join('');
  document.querySelectorAll('#tbRoles tr[data-id]').forEach(tr => { tr.style.cursor='pointer'; tr.onclick = e => { if(e.target.closest('input,button,a')) return; location.href = 'rol.html?id=' + encodeURIComponent(tr.dataset.id); }; });
  if(RESALTAR){ resaltar($('#tbRoles'), RESALTAR); RESALTAR=null; }
  document.querySelectorAll('#tbRoles [data-menu]').forEach(b => b.onclick = e => { e.stopPropagation(); const r = roles.find(x => x.id===b.dataset.menu); const ok = rolAsignable(r);
    const ops = [['ficha','🪪 Abrir ficha del rol']]; if(ok){ ops.push(['editar','✏️ Editar']); if(!r.protegido) ops.push(['eliminar','🗑 Eliminar rol', true]); }
    abrirMenu(b, 'rol:'+r.id, `<b style="color:var(--text)">${esc(r.nombre)}</b>${ok?'':` · <span style="color:var(--err2)">${r.protegido?'Solo Administrador':'Fuera de tus permisos'}</span>`}`, ops, async op => {
      if(op==='ficha') location.href = 'rol.html?id=' + encodeURIComponent(r.id);
      if(op==='editar') editarRol(r);
      if(op==='eliminar'){ if(!confirm(`¿Eliminar el rol "${r.nombre}"? Los usuarios que lo tengan quedarán sin rol.`)) return; const { error } = await sb.from('roles').delete().eq('id', r.id); if(error) alert(error.message); cargarRoles(); }
    }); });
}
function nuevoRol(){ limpiarRol(); abrirDialogo('roles', 'nuevo'); }
$('#rNuevo').onclick = () => nuevoRol();
function editarRol(r){
  $('#tituloRol').textContent='Editar rol · '+r.nombre; $('#rGuardar').textContent='Guardar';
  $('#rId').value=r.id; $('#rId').disabled=true; $('#rNombre').value=r.nombre; $('#rDesc').value=r.descripcion||''; $('#rRangoPM').value=r.rango_pm||''; $('#rNivel').value=String(r.nivel_firma||0);
  document.querySelectorAll('.rp').forEach(c => c.checked = !!(r.permisos||{})[c.value]);
  $('#rTodos').checked = r.formularios.includes('*'); $('#rTodos').onchange();
  document.querySelectorAll('.rf').forEach(c => c.checked = r.formularios.includes(c.value)); msg('r','');
  abrirDialogo('roles', 'editar/'+r.id);
}
function limpiarRol(){ $('#fRol').reset(); $('#tituloRol').textContent='Nuevo rol'; $('#rGuardar').textContent='Crear'; $('#rId').disabled=false; $('#rTodos').onchange(); msg('r',''); }
$('#rCancelar').onclick = () => $('#dlgRol').close();
$('#fRol').onsubmit = async e => {
  e.preventDefault(); msg('r','');
  const rol = { id:$('#rId').value.trim().toLowerCase(), nombre:$('#rNombre').value.trim(), descripcion:$('#rDesc').value.trim(), rango_pm:$('#rRangoPM').value||null, nivel_firma:+$('#rNivel').value||0,
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
  document.querySelectorAll('#tbForms tr[data-id]').forEach(tr => { tr.style.cursor='pointer'; tr.onclick = e => { if(e.target.closest('input,button,a')) return; location.href = 'formulario.html?id=' + encodeURIComponent(tr.dataset.id); }; });
  if(RESALTAR){ resaltar($('#tbForms'), RESALTAR); RESALTAR=null; }
  document.querySelectorAll('#tbForms [data-menu]').forEach(b => b.onclick = e => { e.stopPropagation(); const f = formularios.find(x => x.id===b.dataset.menu);
    const ops = [['ficha','🪪 Abrir ficha del formulario'], ['abrir','↗ Abrir el formulario']];
    if(f.definicion && tiene(yo,'disenar_formularios')) ops.push(['disenar','🎨 Diseñar plantilla']);
    if(tiene(yo,'gestion_reportes')){ ops.push(['editar','✏️ Editar'], ['activo', f.activo ? '🙈 Ocultar del inicio' : '👁 Mostrar en el inicio'], ['eliminar','🗑 Eliminar del catálogo', true]); }
    abrirMenu(b, 'form:'+f.id, `<b style="color:var(--text)">${esc(f.titulo)}</b>${tiene(yo,'gestion_reportes')?'':' · solo lectura'}`, ops, async op => {
      if(op==='ficha') location.href = 'formulario.html?id=' + encodeURIComponent(f.id);
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
  $('#fOrden').value=f.orden; $('#fRuta').value=f.ruta; $('#fActivo').checked=f.activo; $('#fAprob').checked=!!f.requiere_aprobacion; $('#fDescarga').checked=f.descarga_imagen!==false; msg('f','');
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
    orden:parseInt($('#fOrden').value)||100, ruta:$('#fRuta').value.trim(), activo:$('#fActivo').checked, requiere_aprobacion:$('#fAprob').checked, descarga_imagen:$('#fDescarga').checked };
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
    <td>${etiquetaEstado(r)}${r.imagen_path ? `<br>${badgeIA(r)}` : ''}</td>
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
const ACCION = { insert:'Creó', update:'Modificó', delete:'Eliminó', reset_password:'Restableció contraseña', reset_password_denegado:'Intento de reset denegado', ver_como_inicio:'Empezó a ver como', ver_como_fin:'Dejó de ver como', revision_aprobado:'Aprobó', revision_rechazado:'Rechazó', revision_pendiente:'Devolvió a pendiente', sancion_advertencia:'Advertencia a', sancion_sancion:'Sanción a', sancion_suspension:'Suspensión a', sancion_expulsion:'Expulsión de', sancion_anulada:'Anuló sanción de', discord_aviso:'Aviso Discord', avatar:'Cambió la foto de', respaldo:'Copia de seguridad', mfa_reset:'Quitó la verificación en dos pasos de', permisos_granulares:'Cambió permisos granulares de', programada_config:'Configuró tarea', programada_recordatorio_turnos:'Recordatorio de turnos', programada_cierre_diario:'Cierre diario', programada_resumen_semanal:'Resumen semanal', programada_ranking_mensual:'Ranking mensual' };
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
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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
  const pf={}, pfId={}; R.forEach(r=>{ const k=r.formulario||r.formulario_id; pf[k]=(pf[k]||0)+1; pfId[k]=r.formulario_id||k; });
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
    porForm:Object.entries(pf).sort((a,b)=>b[1]-a[1]).map(([k,n])=>[k,n,Math.round(n/Math.max(1,R.length)*100)+'%',pfId[k]]),
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
    const pags=await dibujarResumen(RES, { periodo:`Periodo ${fd(RES.desde)} a ${fd(RES.hasta)} · ${RES.total} reporte(s)`, generado:`Generado por ${nombreCompleto(yo)} · ${new Date().toLocaleString('es-CO')}` });
    const nombre=`resumen-pm-${RES.desde}_${RES.hasta}`;
    if(fmt==='pdf') descargar(resumenPDF(pags), nombre+'.pdf'); else descargar(await resumenPNG(pags), nombre+'.png');
  }catch(x){ alert('No se pudo exportar: '+x.message); }
  btn.disabled=false; btn.textContent=txt;
};

// ====================== ORGANIZACIONES ======================
let ORGS = [], ORG_SEL = null;
async function cargarOrgs(){
  $('#oErr').textContent = '';
  const [{ data: o, error }, { data: ms }] = await Promise.all([
    sb.from('organizaciones').select('*').order('orden'),
    sb.from('membresias').select('org_id, usuario_id, activo')
  ]);
  if(error){ $('#oErr').textContent = error.message; return; }
  ORGS = o || []; const cuenta = {}; (ms||[]).forEach(m => { cuenta[m.org_id] = (cuenta[m.org_id]||0) + (m.activo?1:0); });
  $('#tbOrgs').innerHTML = ORGS.map(x => `<tr${ORG_SEL===x.id?' style="background:var(--avisobg)"':''}>
    <td><b>${esc(x.nombre)}</b><br><span class="muted" style="font-size:12px">${esc(x.id)}</span></td>
    <td>${esc(x.nombre_corto||'')}</td><td class="muted">${esc(x.prefijo)}-000001</td>
    <td>${cuenta[x.id]||0}</td><td>${x.activa?'<span class="tag on">Sí</span>':'<span class="tag off">No</span>'}</td>
    <td style="white-space:nowrap"><button class="ghost sm" data-om="${esc(x.id)}">👥 Miembros</button> <button class="ghost sm" data-oe="${esc(x.id)}">Editar</button></td></tr>`).join('')
    || '<tr><td colspan=6 class="muted">Sin organizaciones</td></tr>';
  document.querySelectorAll('[data-oe]').forEach(b => b.onclick = () => editarOrg(ORGS.find(x => x.id===b.dataset.oe)));
  document.querySelectorAll('[data-om]').forEach(b => b.onclick = () => { ORG_SEL = b.dataset.om; cargarOrgs(); cargarMiembros(); });
  if(ORG_SEL) cargarMiembros();
}
async function cargarMiembros(){
  const org = ORGS.find(x => x.id===ORG_SEL); if(!org) return;
  $('#cajaMiembros').hidden = false; $('#oNombre').textContent = org.nombre; $('#omErr').textContent = '';
  const [{ data: ms }, { data: rs }, { data: ps }] = await Promise.all([
    sb.from('membresias').select('usuario_id, rol_id, rango, activo').eq('org_id', ORG_SEL),
    sb.from('roles').select('id, nombre, org_id'),
    sb.from('perfiles').select('id, usuario, nombre').order('usuario')
  ]);
  const quien = {}; (ps||[]).forEach(p => quien[p.id] = p);
  const rolesOrg = (rs||[]).filter(r => r.org_id === ORG_SEL);
  const nomRol = {}; (rs||[]).forEach(r => nomRol[r.id] = r.nombre);
  $('#tbMiembros').innerHTML = (ms||[]).map(m => { const p = quien[m.usuario_id] || {};
    return `<tr><td><b>${esc(p.usuario||m.usuario_id)}</b> <span class="muted">${esc(p.nombre||'')}</span></td>
      <td>${esc(nomRol[m.rol_id] || '—')}</td><td class="muted">${esc(m.rango||'—')}</td>
      <td>${m.activo?'<span class="tag on">Sí</span>':'<span class="tag off">No</span>'}</td>
      <td style="white-space:nowrap"><button class="ghost sm" data-mt="${esc(m.usuario_id)}" data-a="${m.activo?1:0}">${m.activo?'Desactivar':'Activar'}</button>
        <button class="ghost sm" data-mq="${esc(m.usuario_id)}">Quitar</button></td></tr>`; }).join('')
    || '<tr><td colspan=5 class="muted">Nadie todavía</td></tr>';
  const yaSon = new Set((ms||[]).map(m => m.usuario_id));
  $('#oPersona').innerHTML = (ps||[]).filter(p => !yaSon.has(p.id)).map(p => `<option value="${esc(p.id)}">${esc(p.usuario)} · ${esc(p.nombre||'')}</option>`).join('') || '<option value="">Ya están todos</option>';
  $('#oRol').innerHTML = '<option value="">Sin rol</option>' + rolesOrg.map(r => `<option value="${esc(r.id)}">${esc(r.nombre)}</option>`).join('');
  document.querySelectorAll('[data-mt]').forEach(b => b.onclick = async () => {
    const { error } = await sb.from('membresias').update({ activo: b.dataset.a!=='1' }).eq('org_id', ORG_SEL).eq('usuario_id', b.dataset.mt);
    if(error){ $('#omErr').textContent = error.message; return; } cargarMiembros(); cargarOrgs(); });
  document.querySelectorAll('[data-mq]').forEach(b => b.onclick = async () => {
    if(!confirm('¿Quitar a esta persona de la organización? Sus reportes se quedan donde están.')) return;
    const { error } = await sb.from('membresias').delete().eq('org_id', ORG_SEL).eq('usuario_id', b.dataset.mq);
    if(error){ $('#omErr').textContent = error.message; return; } cargarMiembros(); cargarOrgs(); });
}
$('#oAgregar').onclick = async () => {
  const u = $('#oPersona').value; if(!u) return;
  const { error } = await sb.from('membresias').insert({ usuario_id: u, org_id: ORG_SEL, rol_id: $('#oRol').value || null, activo: true });
  if(error){ $('#omErr').textContent = error.message; return; }
  toast('Agregado a la organización.'); cargarMiembros(); cargarOrgs();
};
$('#oNueva').onclick = () => { $('#fOrg').reset(); $('#oId').value=''; $('#oSlug').disabled=false; $('#oActiva').checked=true;
  $('#tituloOrg').textContent='Nueva organización'; $('#ofErr').textContent=''; $('#dlgOrg').showModal(); };
function editarOrg(x){ if(!x) return; $('#fOrg').reset(); $('#oId').value=x.id; $('#oSlug').value=x.id; $('#oSlug').disabled=true;
  $('#oNom').value=x.nombre; $('#oCorto').value=x.nombre_corto||''; $('#oPref').value=x.prefijo; $('#oEsc').value=x.escudo||'';
  $('#oColor').value=x.color||''; $('#oActiva').checked=!!x.activa;
  $('#tituloOrg').textContent='Editar organización'; $('#ofErr').textContent=''; $('#dlgOrg').showModal(); }
$('#fOrg').onsubmit = async e => {
  e.preventDefault();
  const fila = { nombre: $('#oNom').value.trim(), nombre_corto: $('#oCorto').value.trim(), prefijo: $('#oPref').value.trim().toUpperCase(),
                 escudo: $('#oEsc').value.trim() || null, color: $('#oColor').value.trim() || '#f0c24d', activa: $('#oActiva').checked };
  const id = $('#oId').value;
  const { error } = id ? await sb.from('organizaciones').update(fila).eq('id', id)
                       : await sb.from('organizaciones').insert({ ...fila, id: $('#oSlug').value.trim().toLowerCase(), orden: (ORGS.length+1)*10 });
  if(error){ $('#ofErr').textContent = error.message; return; }
  $('#dlgOrg').close(); toast(id ? 'Organización actualizada.' : 'Organización creada.'); cargarOrgs();
};

// ====================== AUTOMATIZACIÓN: canales de Discord ======================
async function cargarAutomatizacion(){
  // El servidor decide qué se manda: a quien solo puede mirar no le llega la URL, le llega tapada.
  const { data: dc, error } = await sb.rpc('canales_discord');
  if(error){ $('#cErr').textContent = error.message; return; }
  $('#cErr').textContent='';
  const EDITA = !!(dc && dc.puede_editar), data = (dc && dc.canales) || [];
  const campoWh = (attr, clave, valor, tiene) => EDITA
    ? `<input type="url" data-${attr}="${esc(clave)}" value="${esc(valor||'')}" placeholder="https://discord.com/api/webhooks/…" style="min-width:260px">`
    : `<span class="muted" title="No tienes permiso para ver los enlaces">${tiene ? '🔒 ••••••••••••••••••••  <span style="font-size:11px">(configurado)</span>' : '— sin webhook'}</span>`;
  // Hilo opcional dentro del canal del webhook. Va aparte del enlace para que editar y borrar
  // los mensajes siga funcionando (esas llamadas arman la dirección de otra manera).
  const campoHilo = (attr, clave, valor) => EDITA
    ? `<input type="text" inputmode="numeric" data-${attr}="${esc(clave)}" value="${esc(valor||'')}" placeholder="Canal" title="Id del hilo. Vacío = el canal directamente. Modo desarrollador → clic derecho en el hilo → Copiar ID." style="width:150px">`
    : `<span class="muted" style="font-size:12px">${valor ? 'hilo '+esc(valor) : 'canal'}</span>`;
  // Si pegan el enlace con ?thread_id=…, se separa solo: el id al campo de hilo y el enlace limpio
  const separarHilo = (campoW, campoH) => {
    const w = campoW.value.trim(); const i = w.indexOf('?'); if(i < 0) return;
    let id = null;
    try{ const p = new URLSearchParams(w.slice(i+1)); id = p.get('thread_id'); }catch(x){ return; }
    if(!id || !/^[0-9]{5,25}$/.test(id)) return;
    campoW.value = w.slice(0, i); if(!campoH.value.trim()) campoH.value = id;
  };
  // El canal de solicitudes lleva además el enlace público que se le pasa a quien no tiene cuenta
  const ORG_ID = (yo.org && yo.org.id) || 'pm';
  const PAGINA_PUBLICA = { solicitudes:'acceso.html', recuperacion:'recuperar.html' };
  const enlacePublico = c => { const pg = PAGINA_PUBLICA[c.clave]; if(!pg) return '';
    const url = `${RAIZ}${pg}?u=${ORG_ID}`;
    return `<br><span class="muted" style="font-size:12px">Enlace público: <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></span>`; };
  $('#tbCanales').innerHTML = (data||[]).map(c => `<tr data-id="${esc(c.clave)}"><td><b>${esc(c.nombre)}</b><br><span class="muted" style="font-size:12px">${esc(c.clave)}</span>${enlacePublico(c)}</td>
    <td>${campoWh('wh', c.clave, c.webhook, c.tiene_webhook)}</td>
    <td>${campoHilo('hilo', c.clave, c.hilo)}</td>
    <td><input type="checkbox" data-on="${esc(c.clave)}" ${c.activo?'checked':''} ${EDITA?'':'disabled'}></td>
    <td style="white-space:nowrap">${EDITA ? `<button class="ghost sm" data-cg="${esc(c.clave)}">Guardar</button> <button class="ghost sm" data-cp="${esc(c.clave)}" title="Envía un mensaje de prueba al canal">Probar</button>` : ''} <span class="muted" data-cm="${esc(c.clave)}" style="font-size:12px"></span></td></tr>`).join('');
  const guardar = async clave => {
    const cw = $(`[data-wh="${clave}"]`), ch = $(`[data-hilo="${clave}"]`), m = $(`[data-cm="${clave}"]`);
    separarHilo(cw, ch);
    const w = cw.value.trim(), h = ch.value.trim();
    if(w && !/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(w)){ m.textContent='El webhook debe ser un enlace de Discord.'; return false; }
    if(h && !/^[0-9]{5,25}$/.test(h)){ m.textContent='El hilo es solo el id (números). Modo desarrollador → clic derecho en el hilo → Copiar ID.'; return false; }
    const { error } = await sb.from('discord_canales').update({ webhook: w || null, hilo: h || null, activo: $(`[data-on="${clave}"]`).checked, actualizado_en: new Date().toISOString() }).eq('clave', clave).eq('org_id', ORG_ID);
    m.textContent = error ? 'Error: '+error.message : 'Guardado.'; return !error;
  };
  document.querySelectorAll('[data-cg]').forEach(b => b.onclick = () => guardar(b.dataset.cg));
  document.querySelectorAll('[data-cp]').forEach(b => b.onclick = async () => {
    const clave = b.dataset.cp, m = $(`[data-cm="${clave}"]`); if(!(await guardar(clave))) return; m.textContent='Enviando…';
    const { data, error } = await sb.functions.invoke('notificar-general', { body:{ canal: clave, prueba: true } });
    m.textContent = error ? 'Error: '+error.message : (data&&data.ok) ? '✅ Prueba enviada.' : 'Error: '+((data&&(data.error||data.motivo))||'sin respuesta');
  });
  if(typeof cargarProgramadas === 'function') cargarProgramadas();
  if(typeof cargarEventos === 'function') cargarEventos();
  cargarConfigIA();
  $('#cajaRespaldo').hidden = !esSuperadmin(yo);
  // Canales por formulario (formularios_discord)
  const mapa = {}; ((dc && dc.formularios) || []).forEach(x => mapa[x.formulario_id] = x);
  $('#tbCanalesForm').innerHTML = formularios.map(f => { const c = mapa[f.id] || {}; return `<tr><td><b>${esc(f.icono||'')} ${esc(f.titulo)}</b><br><span class="muted" style="font-size:12px">${esc(f.id)}${f.requiere_aprobacion?' · se publica al aprobar':''}</span></td>
    <td>${campoWh('fwh', f.id, c.webhook, c.tiene_webhook)}</td>
    <td>${campoHilo('fhilo', f.id, c.hilo)}</td>
    <td><input type="checkbox" data-fon="${esc(f.id)}" ${c.activo!==false?'checked':''} ${EDITA?'':'disabled'}></td>
    <td style="white-space:nowrap">${EDITA ? `<button class="ghost sm" data-fg="${esc(f.id)}">Guardar</button> <button class="ghost sm" data-fp="${esc(f.id)}">Probar</button>` : ''} <span class="muted" data-fm="${esc(f.id)}" style="font-size:12px"></span></td></tr>`; }).join('');
  const guardarF = async id => { const cw = $(`[data-fwh="${id}"]`), ch = $(`[data-fhilo="${id}"]`), m = $(`[data-fm="${id}"]`);
    separarHilo(cw, ch);
    const w = cw.value.trim(), h = ch.value.trim();
    if(!w){ await sb.from('formularios_discord').delete().eq('formulario_id', id); m.textContent='Sin webhook.'; return true; }
    if(!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(w)){ m.textContent='El webhook debe ser un enlace de Discord.'; return false; }
    if(h && !/^[0-9]{5,25}$/.test(h)){ m.textContent='El hilo es solo el id (números). Modo desarrollador → clic derecho en el hilo → Copiar ID.'; return false; }
    const { error } = await sb.from('formularios_discord').upsert({ formulario_id: id, webhook: w, hilo: h || null, activo: $(`[data-fon="${id}"]`).checked, actualizado_en: new Date().toISOString() }); m.textContent = error ? 'Error: '+error.message : 'Guardado.'; return !error; };
  document.querySelectorAll('[data-fg]').forEach(b => b.onclick = () => guardarF(b.dataset.fg));
  document.querySelectorAll('[data-fp]').forEach(b => b.onclick = async () => { const id = b.dataset.fp, m = $(`[data-fm="${id}"]`); if(!(await guardarF(id))) return; m.textContent='Enviando…';
    const { data, error } = await sb.functions.invoke('notificar-discord', { body:{ formulario_id: id, prueba: true } }); m.textContent = error ? 'Error: '+error.message : (data&&data.ok) ? '✅ Prueba enviada.' : 'Error: '+((data&&data.error)||'sin respuesta'); });
}
// Auditoría con IA: interruptor y modelo (configuracion.auditoria_ia); la clave vive en el servidor.
async function cargarConfigIA(){
  const { data } = await sb.from('configuracion').select('valor').eq('clave', 'auditoria_ia').maybeSingle();
  const v = (data && data.valor) || {}; $('#iaActivo').checked = v.activo !== false; if(v.modelo && [...$('#iaModelo').options].some(o => o.value === v.modelo)) $('#iaModelo').value = v.modelo;
  const puede = tiene(yo,'gestion_reportes'); ['#iaActivo','#iaModelo'].forEach(s => $(s).disabled = !puede); $('#iaGuardar').style.display = puede ? '' : 'none';
  try{ const hace30 = new Date(Date.now()-30*864e5).toISOString();
    const { data: rs } = await sb.from('reportes_vista').select('auditoria_ia,imagen_path').gte('creado_en', hace30).limit(1000);
    const L = (rs||[]).filter(r => r.imagen_path), con = L.filter(r => r.auditoria_ia && !r.auditoria_ia.error), n = k => con.filter(r => r.auditoria_ia.riesgo===k).length;
    $('#iaStats').textContent = L.length ? `Últimos 30 días: ${con.length} de ${L.length} reportes con imagen analizados · 🟢 ${n('bajo')} bajo · 🟡 ${n('medio')} medio · 🔴 ${n('alto')} alto · ${L.filter(r => r.auditoria_ia && r.auditoria_ia.error).length} con error.` : 'Sin reportes con imagen en los últimos 30 días.'; }catch(e){}
}
$('#iaGuardar').onclick = async () => {
  const valor = { activo: $('#iaActivo').checked, modelo: $('#iaModelo').value };
  const { error } = await sb.from('configuracion').upsert({ clave: 'auditoria_ia', valor, actualizado_en: new Date().toISOString(), actualizado_por: yo.id });
  $('#iaMsg').textContent = error ? 'Error: ' + error.message : (valor.activo ? 'Guardado: se analizará cada reporte nuevo.' : 'Guardado: análisis automático desactivado (se puede analizar a mano en Revisión).');
};
$('#bRespaldo').onclick = async () => {
  if(!confirm('Se descargará un ZIP con todos los datos' + ($('#bImg').checked ? ' e imágenes' : '') + '. Puede tardar varios minutos. ¿Continuar?')) return;
  $('#bMsg').textContent = '';
  try{ const r = await respaldoCompleto({ imagenes: $('#bImg').checked }); $('#bMsg').textContent = `Última copia: ${new Date().toLocaleString('es-CO')} · ${r.imagenes} imágenes`;
    await sb.rpc('auditar_respaldo', { p_detalle: r }).then(()=>{}, ()=>{}); }
  catch(x){ $('#bMsg').textContent = 'No se pudo generar: ' + (x.message||x); }
};

// ====================== REVISIÓN DE REPORTES ======================
let SEL_RV = new Set();
function pintarBulkRV(lista){
  const n = SEL_RV.size; const bar = $('#rvBulk');
  bar.hidden = !n; if(!n){ $('#rvTodos').checked = false; return; }
  const sel = lista.filter(r => SEL_RV.has(r.id));
  const altos = sel.filter(r => r.auditoria_ia && r.auditoria_ia.riesgo === 'alto').length;
  $('#rvSelN').innerHTML = `<b>${n}</b> seleccionado(s)` + (altos ? ` · <span style="color:var(--err2)">${altos} con riesgo alto según la IA</span>` : '');
  $('#rvTodos').checked = n === lista.length;
  $('#rvProgreso').textContent = '';
}
// Revisa en bloque: un reporte a la vez, para que cada aviso de Discord salga en orden y nada se pierda a medias.
async function revisarEnBloque(estado, lista){
  const sel = lista.filter(r => SEL_RV.has(r.id)); if(!sel.length) return;
  let comentario = null;
  if(estado === 'rechazado'){ comentario = prompt(`Motivo del rechazo de ${sel.length} reporte(s) (lo verán los autores):`); if(comentario===null) return; if(!comentario.trim()){ alert('Indica el motivo.'); return; } }
  else if(estado === 'devuelto'){ comentario = prompt(`¿Qué deben corregir estos ${sel.length} reporte(s)?`); if(comentario===null) return; if(!comentario.trim()){ alert('Indica qué deben corregir.'); return; } }
  else {
    const altos = sel.filter(r => r.auditoria_ia && r.auditoria_ia.riesgo === 'alto');
    const aviso = altos.length ? `\n\n⚠️ ${altos.length} de ellos están marcados con RIESGO ALTO por la IA:\n` + altos.map(r => '· ' + (r.folio||r.id)).join('\n') : '';
    if(!confirm(`¿Aprobar ${sel.length} reporte(s)?${aviso}`)) return;
  }
  document.querySelectorAll('[data-rvb], #rvCancelar').forEach(b => b.disabled = true);
  let ok = 0; const fallos = [];
  for(const [i, r] of sel.entries()){
    $('#rvProgreso').textContent = `${estado === 'aprobado' ? 'Aprobando' : estado === 'devuelto' ? 'Devolviendo' : 'Rechazando'} ${i+1} de ${sel.length}…`;
    const { error } = await sb.rpc('revisar_reporte', { p_id: r.id, p_estado: estado, p_comentario: comentario || null });
    if(error) fallos.push(`${r.folio||r.id}: ${error.message}`); else ok++;
  }
  document.querySelectorAll('[data-rvb], #rvCancelar').forEach(b => b.disabled = false);
  SEL_RV.clear();
  toast(fallos.length ? `${ok} listo(s), ${fallos.length} con error: ${fallos[0]}` : `${ok} reporte(s) ${estado === 'aprobado' ? 'aprobados' : estado === 'devuelto' ? 'devueltos para corregir' : 'rechazados'}.`, fallos.length > 0);
  cargarRevision(); contarPendientes();
}

const etiquetaEstado = r => { const e = r.estado || 'aprobado'; const t = e==='pendiente' ? '<span class="tag pend">Pendiente</span>' : e==='devuelto' ? '<span class="tag" style="background:var(--avisobg);color:var(--gold)">Devuelto para corregir</span>' : e==='rechazado' ? '<span class="tag off">Rechazado</span>' : (r.requiere_aprobacion ? '<span class="tag on">Aprobado</span>' : '<span class="tag on" title="Formulario sin revisión">Aprobado</span>');
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
  SEL_RV = new Set([...SEL_RV].filter(id => lista.some(r => r.id === id)));
  $('#rvLista').innerHTML = lista.map(r => `<div class="rv${SEL_RV.has(r.id)?' sel':''}" data-id="${r.id}">
      <label class="pick" title="Seleccionar para revisar en bloque"><input type="checkbox" data-rvs="${r.id}" ${SEL_RV.has(r.id)?'checked':''}></label>
      <div class="img" data-rvimg="${esc(r.imagen_path||'')}" data-n="reporte-${esc(r.folio||r.id)}.${(r.imagen_path||'png').split('.').pop()}"><span class="cargar">${r.imagen_path ? '🔍 Ver imagen' : 'Sin imagen'}</span></div>
      <div class="cuerpo">
        <div><b>${esc(r.folio||r.id)}</b> · ${esc(r.formulario||r.formulario_id)} · ${fmt(r.fecha)}</div>
        <div>${esc([r.usuario_rango, r.usuario_nombre||r.usuario].filter(Boolean).join(' '))} <span class="muted">(${esc(r.usuario||'')})</span></div>
        <div class="muted">${esc(r.resumen||'')}</div>
        <div class="muted" style="font-size:11px">Registrado ${new Date(r.creado_en).toLocaleString('es-CO')}${r.revisado_en ? ` · Revisado ${new Date(r.revisado_en).toLocaleString('es-CO')} por ${esc(r.revisor||'')}` : ''}${r.comentario_revision ? `<br>Motivo: ${esc(r.comentario_revision)}` : ''}</div>
        <div style="margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">${badgeIA(r)}${r.imagen_path ? `<button type="button" class="ghost sm" data-ia="${r.id}" title="Pedir a la IA que analice la imagen de nuevo">${r.auditoria_ia && !r.auditoria_ia.error ? '🔎 Reanalizar' : '🔎 Analizar'}</button>` : ''}<span class="muted" style="font-size:11px" data-iam="${r.id}"></span></div>
        ${detalleIA(r.auditoria_ia)}
        <div class="acciones">
          ${est!=='aprobado' ? `<button type="button" class="sm aprobar" data-rv="aprobado" data-id="${r.id}">✅ Aprobar</button>` : ''}
          ${est!=='devuelto' ? `<button type="button" class="sm devolver" data-rv="devuelto" data-id="${r.id}" title="Vuelve al autor para que lo corrija y lo reenvíe; el folio se conserva">✏️ Devolver para corregir</button>` : ''}
          ${est!=='rechazado' ? `<button type="button" class="sm rechazar" data-rv="rechazado" data-id="${r.id}">⛔ Rechazar</button>` : ''}
          ${est!=='pendiente' ? `<button type="button" class="ghost sm" data-rv="pendiente" data-id="${r.id}">↩ Volver a pendiente</button>` : ''}
          ${r.imagen_path ? `<button type="button" class="ghost sm" data-redis="${r.id}" title="Vuelve a publicarlo en el canal de Discord que esté configurado ahora para este formulario">📨 Enviar de nuevo</button>` : ''}
        </div>
      </div></div>`).join('') || `<p class="muted">No hay reportes ${est==='pendiente'?'pendientes de revisión':est+'s'}.</p>`;
  // ---- Selección múltiple ----
  document.querySelectorAll('[data-rvs]').forEach(c => c.onchange = () => {
    const id = +c.dataset.rvs; c.checked ? SEL_RV.add(id) : SEL_RV.delete(id);
    c.closest('.rv').classList.toggle('sel', c.checked); pintarBulkRV(lista);
  });
  $('#rvTodos').onchange = () => { const marcar = $('#rvTodos').checked;
    document.querySelectorAll('[data-rvs]').forEach(c => { c.checked = marcar; marcar ? SEL_RV.add(+c.dataset.rvs) : SEL_RV.delete(+c.dataset.rvs);
      c.closest('.rv').classList.toggle('sel', marcar); });
    pintarBulkRV(lista); };
  $('#rvCancelar').onclick = () => { SEL_RV.clear(); document.querySelectorAll('[data-rvs]').forEach(c => { c.checked = false; c.closest('.rv').classList.remove('sel'); }); pintarBulkRV(lista); };
  document.querySelectorAll('[data-rvb]').forEach(b => b.onclick = () => revisarEnBloque(b.dataset.rvb, lista));
  pintarBulkRV(lista);

  document.querySelectorAll('[data-rvimg]').forEach(d => d.onclick = async () => { if(!d.dataset.rvimg) return;
    if(!d.querySelector('img')){ try{ const u = await urlImagen(d.dataset.rvimg); d.innerHTML = `<img src="${u}" alt="">`; d.dataset.u = u; }catch(x){ alert(x.message); return; } }
    else { $('#dlgImg').src = d.dataset.u; $('#dlgDl').href = d.dataset.u; $('#dlgDl').download = d.dataset.n; $('#dlg').showModal(); } });
  document.querySelectorAll('[data-ia]').forEach(b => b.onclick = async () => {
    const id = +b.dataset.ia, m = $(`[data-iam="${id}"]`); b.disabled = true; m.textContent = 'Analizando la imagen… (10-30 s)';
    const res = await auditarReporte(id, true); b.disabled = false;
    if(!res.ok){ m.textContent = 'No se pudo analizar: ' + res.error; return; }
    m.textContent = ''; toast(`Análisis listo: riesgo ${res.auditoria.riesgo}.`); cargarRevision();
  });
  document.querySelectorAll('[data-redis]').forEach(b => b.onclick = async () => {
    const id = b.dataset.redis, txt = b.textContent;
    b.disabled = true; b.textContent = 'Enviando…';
    const r = await reenviarDiscord(id);
    b.disabled = false; b.textContent = txt;
    toast(r==='ok' ? 'Reenviado al canal de Discord actual.'
        : r==='sin_webhook' ? 'Ese formulario no tiene webhook activo (Automatización).'
        : 'No se pudo reenviar: ' + r.replace('error: ',''), r!=='ok');
    if(r==='ok') cargarRevision();
  });
  document.querySelectorAll('[data-rv]').forEach(b => b.onclick = async () => {
    const id = +b.dataset.id, est2 = b.dataset.rv, r = lista.find(x => x.id===id); let comentario = null;
    if(est2==='rechazado'){ comentario = prompt(`Motivo del rechazo de ${r.folio||id} (lo verá el autor):`); if(comentario===null) return; if(!comentario.trim()){ alert('Indica el motivo.'); return; } }
    else if(est2==='devuelto'){ comentario = prompt(`¿Qué debe corregir en ${r.folio||id}? (lo verá el autor y podrá reenviarlo)`); if(comentario===null) return; if(!comentario.trim()){ alert('Indica qué debe corregir.'); return; } }
    else if(est2==='aprobado'){ comentario = prompt(`Aprobar ${r.folio||id}. Comentario opcional para el autor:`, ''); if(comentario===null) return; }
    else if(!confirm(`¿Devolver ${r.folio||id} a pendiente?`)) return;
    b.disabled = true;
    const { data: res, error } = await sb.rpc('revisar_reporte', { p_id: id, p_estado: est2, p_comentario: comentario||null });
    if(error){ alert(error.message); b.disabled=false; return; }
    let extra = '';
    if(est2==='aprobado'){ const dc = await notificarDiscord(id, 'aprobado'); if(dc==='ok') extra = ' Publicado en Discord.'; else if(dc && dc.startsWith('error')) extra = ' (No se pudo publicar en Discord: '+dc.slice(7)+')'; }  // normalmente ya se publicó al enviarse; esto solo cubre el caso en que falló
    toast(est2==='devuelto' ? `${r.folio||id}: devuelto a ${res && res.autor ? res.autor : 'su autor'} para corregir.` : `${r.folio||id}: ${est2}.${extra}`, false);
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
  const [{ data, error }, { data: vis }, msgs] = await Promise.all([sb.from('anuncios').select('*').order('fijado',{ascending:false}).order('publicado_en',{ascending:false}).limit(200), sb.from('anuncios_vistos').select('anuncio_id'), mensajesDiscord('anuncios')]);
  const DMSG = {}; (msgs||[]).forEach(m => { if(m.mensaje_id && !DMSG[m.origen_id]) DMSG[m.origen_id] = m; });
  if(error){ $('#nErr').textContent = error.message; return; } $('#nErr').textContent=''; ANUN = data || [];
  const vistos = {}; (vis||[]).forEach(v => vistos[v.anuncio_id] = (vistos[v.anuncio_id]||0)+1);
  const activos = USUARIOS.length ? USUARIOS.filter(u => u.activo).length : null; const editaA = tiene(yo,'anuncios');
  $('#nNuevo').style.display = editaA ? '' : 'none';
  $('#tbAnun').innerHTML = ANUN.map(a => { const cad = a.expira_en && new Date(a.expira_en) < new Date(); return `<tr data-id="${a.id}" style="${a.activo && !cad ? '' : 'opacity:.6'}"><td><b>${a.fijado?'📌 ':''}${esc(a.titulo)}</b><br><span class="muted" style="font-size:12px">${esc((a.cuerpo||'').slice(0,120))}${(a.cuerpo||'').length>120?'…':''}</span></td>
    <td class="muted" style="white-space:nowrap">${a.imagen_path ? `<img src="${esc(urlAnuncio(a.imagen_path))}" alt="" style="height:40px;border-radius:4px;border:1px solid var(--line2);display:block;margin-bottom:3px">` : ''}${fFecha(a.publicado_en)}</td><td class="muted">${a.expira_en ? fFecha(a.expira_en) : '—'}</td><td>${vistos[a.id]||0}${activos?` <span class="muted">/ ${activos}</span>`:''}</td>
    <td>${cad ? '<span class="tag off">Caducado</span>' : a.activo ? '<span class="tag on">Visible</span>' : '<span class="tag off">Oculto</span>'}</td><td class="acc" style="text-align:right">${editaA ? botonMenu(a.id) : ''}</td></tr>`; }).join('') || '<tr><td colspan=6 class="muted">Sin anuncios</td></tr>';
  document.querySelectorAll('#tbAnun [data-menu]').forEach(b => b.onclick = e => { e.stopPropagation(); const a = ANUN.find(x => x.id==b.dataset.menu);
    const dm = DMSG[String(a.id)]; abrirMenu(b, 'anun:'+a.id, `<b style="color:var(--text)">${esc(a.titulo)}</b>${dm ? '<br><span class="muted" style="font-size:11px">Publicado en Discord</span>' : ''}`, [['editar','✏️ Editar'], dm ? ['discord_editar','🔄 Actualizar en Discord'] : ['discord','📣 Publicar en Discord'], ...(dm ? [['discord_reenviar','📤 Reenviar al canal (lo mueve abajo)'], ['discord_borrar','🧹 Borrar de Discord']] : []), [a.activo?'ocultar':'mostrar', a.activo?'🙈 Ocultar':'👁 Mostrar'], [a.fijado?'desfijar':'fijar', a.fijado?'Quitar fijado':'📌 Fijar arriba'], ['eliminar','🗑 Eliminar', true]], async op => {
      if(op==='editar') editarAnuncio(a);
      if(op==='discord_editar'){ const r = await avisoDiscord('anuncios', { accion:'editar', mensaje_id: dm.mensaje_id, embed: embedAnuncio(a) }); toast(r==='ok' ? 'Mensaje de Discord actualizado.' : 'No se pudo actualizar: '+r, r!=='ok'); }
      if(op==='discord_reenviar'){ if(!confirm('¿Reenviar este anuncio al canal?\n\nSe borra el mensaje de antes y se publica uno nuevo al final, así que vuelve a quedar visible. Los que lo hayan marcado como leído en el tablón no cambian.')) return;
        const r = await avisoDiscord('anuncios', { accion:'republicar', mensaje_id: dm.mensaje_id, embed: embedAnuncio(a), origen: { tabla:'anuncios', id: a.id } });
        toast(r==='ok' ? 'Reenviado: el anuncio quedó al final del canal.' : 'No se pudo reenviar: '+r, r!=='ok'); cargarAnuncios(); }
      if(op==='discord_borrar'){ if(!confirm('¿Borrar el mensaje de este anuncio en Discord? El anuncio sigue en el tablón.')) return; const r = await avisoDiscord('anuncios', { accion:'borrar', mensaje_id: dm.mensaje_id }); toast(r==='ok' ? 'Mensaje borrado de Discord.' : 'No se pudo borrar: '+r, r!=='ok'); cargarAnuncios(); }
      if(op==='discord'){ const r = await avisoDiscord('anuncios', { embed: embedAnuncio(a), origen: { tabla:'anuncios', id: a.id } }); if(r==='ok') cargarAnuncios(); toast(r==='ok' ? 'Publicado en Discord.' : r==='sin_webhook' ? 'El canal de anuncios no tiene webhook (Automatización).' : 'No se pudo publicar: '+r, r!=='ok'); }
      if(op==='ocultar' || op==='mostrar'){ await sb.from('anuncios').update({ activo: op==='mostrar', actualizado_en: new Date().toISOString() }).eq('id', a.id); cargarAnuncios(); }
      if(op==='fijar' || op==='desfijar'){ await sb.from('anuncios').update({ fijado: op==='fijar', actualizado_en: new Date().toISOString() }).eq('id', a.id); cargarAnuncios(); }
      if(op==='eliminar'){ if(!confirm(`¿Eliminar el anuncio "${a.titulo}"?${dm ? ' También se borrará su mensaje en Discord.' : ''}`)) return; if(dm) await avisoDiscord('anuncios', { accion:'borrar', mensaje_id: dm.mensaje_id }); const { error } = await sb.from('anuncios').delete().eq('id', a.id); if(error) alert(error.message); cargarAnuncios(); }
    }); });
  if(editaA) document.querySelectorAll('#tbAnun tr[data-id]').forEach(tr => tr.onclick = e => { if(e.target.closest('button,a,input')) return; const a = ANUN.find(x => x.id==tr.dataset.id); if(a) editarAnuncio(a); });
}
const urlAnuncio = p => /^https?:\/\//.test(p) ? p : sb.storage.from('anuncios').getPublicUrl(p).data.publicUrl;
const embedAnuncio = a => ({ title: `📣 ${a.titulo}`, description: a.cuerpo||'', ...(a.imagen_path ? { image: { url: urlAnuncio(a.imagen_path) } } : {}) });
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
  if(id) r = await sb.from('anuncios').update(fila).eq('id', +id).select('id').single(); else r = await sb.from('anuncios').insert({ ...fila, autor_id: yo.id }).select('id').single();
  if(r.error){ $('#nfErr').textContent = r.error.message; return; }
  if(previo && (ANUN_IMG || ANUN_IMG_QUITAR)) sb.storage.from('anuncios').remove([previo]).then(()=>{}, ()=>{});
  $('#dlgAnuncio').close(); let extra = ''; const imgUrl = fila.imagen_path ? urlAnuncio(fila.imagen_path) : (previo && !ANUN_IMG_QUITAR ? urlAnuncio(previo) : null);
  if($('#nDiscord').checked && fila.activo){ const nid = (r.data && r.data.id) || +id; const embed = { title: `📣 ${fila.titulo}`, description: fila.cuerpo, ...(imgUrl ? { image: { url: imgUrl } } : {}) };
    const previos = id ? await mensajesDiscord('anuncios', nid) : []; const dm = previos.find(m => m.mensaje_id);
    const d = dm ? await avisoDiscord('anuncios', { accion:'editar', mensaje_id: dm.mensaje_id, embed }) : await avisoDiscord('anuncios', { embed, origen: { tabla:'anuncios', id: nid } });
    extra = d==='ok' ? (dm ? ' Mensaje de Discord actualizado.' : ' Publicado en Discord.') : d==='sin_webhook' ? ' (Discord: canal de anuncios sin webhook)' : ' (Discord: '+d+')'; }
  toast('Anuncio guardado.'+extra); cargarAnuncios();
};

// ====================== TAREAS PROGRAMADAS ======================
var PROGRAMADAS = [
  ['recordatorio_turnos','Recordatorio de turnos de hoy','recordatorios','Lista los turnos del día y quién no ha enviado su reporte de patrullaje', 20, 0, null],
  ['cierre_diario','Cierre del día','resumen','Reportes aprobados del día por formulario y quiénes reportaron', 23, 55, null],
  ['resumen_semanal','Resumen semanal','resumen','KPIs de los últimos 7 días y los 5 más activos', 8, 0, 1],
  ['ranking_semanal','Ranking parcial (semanal)','ranking','Cómo va el ranking del mes en curso; no otorga insignias', 19, 0, 0],
  ['ranking_mensual','Ranking mensual','ranking','Top 3 del mes anterior por categoría; otorga las insignias', 9, 0, null],
  ['actividad_semanal','Reporte de actividad semanal','resumen','Quién cumplió el mínimo de reportes de la semana que cerró y quién no', 9, 30, 2],
];
const PUEDE_TAREAS = tiene(yo,'gestion_reportes');
async function cargarProgramadas(){
  const { data } = await sb.from('configuracion').select('valor').eq('clave','programadas').maybeSingle(); const cfg = (data && data.valor) || {};
  const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  $('#tbProg').innerHTML = PROGRAMADAS.map(([k, n, canal, desc, h, m, dia]) => { const c = cfg[k] || {}; return `<tr data-p="${k}"><td><b>${esc(n)}</b><br><span class="muted" style="font-size:12px">${esc(desc)}</span></td><td class="muted">${esc(canal)}</td>
    <td><input type="checkbox" data-pa ${c.activo?'checked':''} ${PUEDE_TAREAS?'':'disabled'}></td>
    <td style="white-space:nowrap">${(k==='resumen_semanal'||k==='ranking_semanal'||k==='actividad_semanal') ? `<select data-pd style="width:auto;display:inline-block;padding:4px 6px;margin-right:4px" ${PUEDE_TAREAS?'':'disabled'}>${DIAS.map((d,i)=>`<option value="${i}" ${(c.dia??dia)==i?'selected':''}>${d}</option>`).join('')}</select>` : k==='ranking_mensual' ? '<span class="muted">día 1 · </span>' : ''}<input type="time" data-ph value="${String(c.hora??h).padStart(2,'0')}:${String(c.minuto??m).padStart(2,'0')}" style="width:auto;display:inline-block;padding:4px 6px" ${PUEDE_TAREAS?'':'disabled'}></td>
    <td>${PUEDE_TAREAS ? `<button class="ghost sm" data-pg="${k}">Guardar</button>` : ''}</td><td>${PUEDE_TAREAS ? `<button class="ghost sm" data-pv="${k}" data-pn="${esc(n)}" title="Genera el mensaje con los datos de hoy sin enviarlo">👁 Vista previa</button>` : ''}</td><td>${PUEDE_TAREAS ? `<button class="ghost sm" data-px="${k}" title="Ejecuta la tarea ahora mismo con los datos de hoy">▶ Ejecutar ahora</button>` : ''}</td></tr>`; }).join('');
  document.querySelectorAll('[data-pg]').forEach(b => b.onclick = async () => { const tr = b.closest('tr'); const [hh, mm] = tr.querySelector('[data-ph]').value.split(':').map(Number); const dsel = tr.querySelector('[data-pd]');
    const { data: r, error } = await sb.rpc('programar', { p_clave: b.dataset.pg, p_activo: tr.querySelector('[data-pa]').checked, p_hora: hh, p_minuto: mm, p_dia: dsel ? +dsel.value : 1 });
    if(error){ $('#pErr').textContent = error.message; return; } $('#pErr').textContent=''; toast(r.activo ? `Programada (${r.cron} UTC).` : 'Tarea desactivada.'); });
  document.querySelectorAll('[data-pv]').forEach(b => b.onclick = async () => { b.disabled = true; await vistaPrevia(b.dataset.pv, b.dataset.pn); b.disabled = false; });
  document.querySelectorAll('[data-px]').forEach(b => b.onclick = async () => { b.disabled = true; const { data: r, error } = await sb.rpc('ejecutar_programada', { p_accion: b.dataset.px }); b.disabled = false;
    if(error){ $('#pErr').textContent = error.message; return; } $('#pErr').textContent='';
    toast(r.enviado ? 'Enviado a Discord.' : r.motivo==='sin_webhook' ? 'Generado, pero el canal no tiene webhook configurado.' : 'Sin nada que enviar: '+(r.motivo||''), !r.enviado); });
}

// Genera el mensaje de una tarea sin enviarlo y lo muestra tal como se verá en Discord, con opción de exportarlo.
async function vistaPrevia(clave, nombre){
  $('#pErr').textContent = '';
  const { data: r, error } = await sb.rpc('ejecutar_programada', { p_accion: clave, p_fecha: null, p_enviar: false });
  if(error){ $('#pErr').textContent = error.message; return; }
  if(!r || !r.embed){ $('#pErr').textContent = `Esa tarea no generaría mensaje hoy (${(r&&r.motivo)||'sin datos'}).`; return; }
  const cab = { tarea: nombre, generado: `Generado por ${nombreCompleto(yo)} · ${new Date().toLocaleString('es-CO')}` };
  $('#tituloPrevia').textContent = 'Vista previa · ' + nombre;
  $('#pvErr').textContent = '';
  const caja = $('#previaLienzo'); caja.innerHTML = '<p class="muted" style="padding:14px">Generando…</p>';
  $('#dlgPrevia').showModal();
  await (document.fonts ? document.fonts.ready : Promise.resolve());
  const cv = await dibujarEmbed(r.embed, cab);
  cv.style.cssText = 'display:block;width:100%;height:auto';
  caja.innerHTML = ''; caja.appendChild(cv);
  const base = `${clave}-${hoyISO()}`;
  $('#pvPng').onclick = () => cv.toBlob(b => descargar(b, base + '.png'), 'image/png');
  $('#pvTxt').onclick = () => descargar(new Blob([textoEmbed(r.embed, cab)], { type:'text/plain;charset=utf-8' }), base + '.txt');
  $('#pvCopiar').onclick = async () => { try{ await navigator.clipboard.writeText(textoEmbed(r.embed, cab)); toast('Texto copiado.'); }catch(e){ $('#pvErr').textContent = 'No se pudo copiar: '+e.message; } };
  $('#pvEnviar').onclick = async () => {
    const b = $('#pvEnviar'); b.disabled = true;
    const { data: e2, error: er } = await sb.rpc('ejecutar_programada', { p_accion: clave, p_fecha: null, p_enviar: true }); b.disabled = false;
    if(er){ $('#pvErr').textContent = er.message; return; }
    $('#dlgPrevia').close();
    toast(e2.enviado ? 'Enviado a Discord.' : e2.motivo==='sin_webhook' ? 'El canal no tiene webhook configurado.' : 'No se envió: '+(e2.motivo||''), !e2.enviado);
  };
}

// ====================== ACTIVIDAD ======================
// Mide la actividad de cada integrante en un rango. Cuentan los reportes aprobados y pendientes:
// quien mandó el suyo hizo el trabajo aunque el revisor no haya pasado todavía.
const isoF = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const dLoc = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const fmtF = s => s ? s.split('-').reverse().join('-') : '—';

// Inicio de la semana que contiene a 'd', según el día elegido (0 domingo … 6 sábado)
function inicioSemana(d, dia){ const x = new Date(d); const delta = (x.getDay() - dia + 7) % 7; x.setDate(x.getDate() - delta); return x; }
function periodo(modo, refIso){
  const ref = refIso ? dLoc(refIso) : new Date();
  if(modo === 'mes'){ const a = new Date(ref.getFullYear(), ref.getMonth(), 1), b = new Date(ref.getFullYear(), ref.getMonth()+1, 0); return [isoF(a), isoF(b)]; }
  const a = inicioSemana(ref, +ACT_CFG.dia_inicio); const b = new Date(a); b.setDate(b.getDate()+6);
  return [isoF(a), isoF(b)];
}
const minimoActual = () => ACT_MODO === 'mes' ? +ACT_CFG.min_mensual : +ACT_CFG.min_semanal;

async function cargarActividad(){
  if(!ACT.cfgLeida){
    const { data } = await sb.from('configuracion').select('valor').eq('clave','actividad').maybeSingle();
    if(data && data.valor) ACT_CFG = { ...ACT_CFG, ...data.valor };
    ACT.cfgLeida = true;
    $('#aDiaIni').value = String(ACT_CFG.dia_inicio); $('#aMin').value = minimoActual();
    const puedeCfg = tiene(yo,'gestion_reportes') || tiene(yo,'crear_roles');
    ['#aDiaIni','#aMin','#aGuardarCfg'].forEach(x => $(x).disabled = !puedeCfg);
    $('#aDiscord').style.display = tiene(yo,'anuncios') || tiene(yo,'gestion_reportes') ? '' : 'none';
  }
  if(!$('#aDesde').value){ const [a,b] = periodo(ACT_MODO); $('#aDesde').value = a; $('#aHasta').value = b; }
  document.querySelectorAll('[data-ap]').forEach(b => b.classList.toggle('on', b.dataset.ap === ACT_MODO));
  const desde = $('#aDesde').value, hasta = $('#aHasta').value;
  if(!desde || !hasta) return;
  $('#aNota').textContent = 'Cargando…';
  const { data, error } = await sb.rpc('actividad', { p_desde: desde, p_hasta: hasta });
  if(error){ $('#aNota').textContent = error.message; return; }
  ACT = data || []; ACT.cfgLeida = true;
  pintarActividad();
}

function clasificar(r, min){ return r.reportes === 0 ? 'inactivo' : (min > 0 && r.reportes < min ? 'bajo' : 'ok'); }

function pintarActividad(){
  const desde = $('#aDesde').value, hasta = $('#aHasta').value, min = minimoActual();
  const dias = Math.round((dLoc(hasta) - dLoc(desde))/864e5) + 1;
  const nAct = ACT.filter(r => clasificar(r,min)==='ok').length,
        nBajo = ACT.filter(r => clasificar(r,min)==='bajo').length,
        nIna = ACT.filter(r => clasificar(r,min)==='inactivo').length;
  const total = ACT.reduce((a,r) => a + r.reportes, 0);
  $('#aRango').innerHTML = `Del <b>${fmtF(desde)}</b> al <b>${fmtF(hasta)}</b> · ${dias} día(s)` +
    (min > 0 ? ` · mínimo esperado: <b>${min}</b> reporte(s) por integrante` : '');
  $('#aKpis').innerHTML = [[ACT.length,'Integrantes'],[nAct,'Al día'],[nBajo,'Bajo el mínimo'],[nIna,'Sin reportar'],
      [total,'Reportes'],[ACT.length?(total/ACT.length).toFixed(1):'0','Promedio']]
    .map(([v,l]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join('');
  $('#tbAct').innerHTML = ACT.map(r => {
    const c = clasificar(r, min);
    const etiqueta = c==='ok' ? '<b style="color:#5fd38d">Al día</b>' : c==='bajo' ? '<b style="color:var(--gold)">Bajo el mínimo</b>' : '<b style="color:var(--err2)">Sin reportar</b>';
    return `<tr class="${c==='ok'?'':c}"><td><b>${esc([r.rango, r.nombre || r.usuario].filter(Boolean).join(' '))}</b><br><span class="muted" style="font-size:12px">@${esc(r.usuario)}</span></td>
      <td class="muted">${esc(r.rol||'—')}</td>
      <td><b>${r.reportes}</b>${r.pendientes?` <span class="muted" style="font-size:11px">(${r.pendientes} pend.)</span>`:''}</td>
      <td>${r.dias_activos}</td><td>${r.bajas}</td><td>${r.patrullajes}</td><td>${r.reclutamientos}</td><td>${r.aks}</td><td>${r.participaciones}</td>
      <td class="muted">${r.devueltos||r.rechazados ? `${r.devueltos} / ${r.rechazados}` : '—'}</td>
      <td class="muted">${fmtF(r.ultimo)}</td><td class="est">${etiqueta}</td></tr>`;
  }).join('') || '<tr><td colspan=12 class="muted">No hay integrantes activos en esta organización.</td></tr>';
  $('#aNota').textContent = 'Devueltos / rechazados no cuentan como actividad. El último reporte es el más reciente dentro del periodo.';
}

// ---- Controles ----
document.querySelectorAll('[data-ap]').forEach(b => b.onclick = () => {
  ACT_MODO = b.dataset.ap;
  if(ACT_MODO !== 'libre'){ const [a,h] = periodo(ACT_MODO, $('#aDesde').value); $('#aDesde').value = a; $('#aHasta').value = h; }
  $('#aMin').value = minimoActual(); cargarActividad();
});
$('#aHoy').onclick = () => { if(ACT_MODO === 'libre') ACT_MODO = 'semana'; const [a,h] = periodo(ACT_MODO); $('#aDesde').value = a; $('#aHasta').value = h; cargarActividad(); };
function mover(signo){
  if(ACT_MODO === 'mes'){ const d = dLoc($('#aDesde').value); d.setMonth(d.getMonth() + signo); const [a,h] = periodo('mes', isoF(d)); $('#aDesde').value = a; $('#aHasta').value = h; }
  else { const paso = Math.round((dLoc($('#aHasta').value) - dLoc($('#aDesde').value))/864e5) + 1;
    const a = dLoc($('#aDesde').value), h = dLoc($('#aHasta').value);
    a.setDate(a.getDate() + signo*paso); h.setDate(h.getDate() + signo*paso);
    $('#aDesde').value = isoF(a); $('#aHasta').value = isoF(h); }
  cargarActividad();
}
$('#aAnt').onclick = () => mover(-1);
$('#aSig').onclick = () => mover(1);
$('#aDesde').onchange = $('#aHasta').onchange = () => { ACT_MODO = 'libre'; cargarActividad(); };
$('#aDiaIni').onchange = () => { ACT_CFG.dia_inicio = +$('#aDiaIni').value; if(ACT_MODO === 'semana'){ const [a,h] = periodo('semana', $('#aDesde').value); $('#aDesde').value = a; $('#aHasta').value = h; } cargarActividad(); };
$('#aMin').onchange = () => { if(ACT_MODO === 'mes') ACT_CFG.min_mensual = +$('#aMin').value||0; else ACT_CFG.min_semanal = +$('#aMin').value||0; pintarActividad(); };
$('#aGuardarCfg').onclick = async () => {
  const { error } = await sb.from('configuracion').update({ valor: { dia_inicio:+ACT_CFG.dia_inicio, min_semanal:+ACT_CFG.min_semanal, min_mensual:+ACT_CFG.min_mensual }, actualizado_en: new Date().toISOString(), actualizado_por: yo.id }).eq('clave','actividad');
  toast(error ? 'No se pudo guardar: '+error.message : 'Ajustes guardados para toda la unidad.', !!error);
};
$('#aCsv').onclick = () => {
  const cab = ['Usuario','Nombre','Rango','Rol','Reportes','Aprobados','Pendientes','Devueltos','Rechazados','Dias activos','Bajas','Patrullajes','Reclutamientos','AKs','Participaciones','Ultimo','Estado'];
  const min = minimoActual();
  const filas = ACT.map(r => [r.usuario, r.nombre||'', r.rango||'', r.rol||'', r.reportes, r.aprobados, r.pendientes, r.devueltos, r.rechazados, r.dias_activos, r.bajas, r.patrullajes, r.reclutamientos, r.aks, r.participaciones, r.ultimo||'', {ok:'Al dia',bajo:'Bajo el minimo',inactivo:'Sin reportar'}[clasificar(r,min)]]);
  const csv = [cab, ...filas].map(f => f.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  descargar(new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8' }), `actividad-${$('#aDesde').value}_${$('#aHasta').value}.csv`);
};
// ---- Exportar y publicar ----
function cabActividad(){
  const d = $('#aDesde').value, h = $('#aHasta').value;
  return { unidad: (yo.org && yo.org.nombre) || 'Policía Militar',
           titulo: 'REPORTE DE ACTIVIDAD',
           periodo: `${fmtF(d)} — ${fmtF(h)}`,
           generado: `Generado el ${new Date().toLocaleString('es-CO')} por ${nombreCompleto(yo)}`,
           minimo: minimoActual() };
}
$('#aExportar').onclick = async () => {
  const b = $('#aExportar'); b.disabled = true; const antes = b.textContent; b.textContent = 'Generando…';
  try{
    const pags = await dibujarActividad(ACT, cabActividad());
    const nombre = `actividad-${$('#aDesde').value}_${$('#aHasta').value}`;
    if($('#aFormato').value === 'png') descargar(await resumenPNG(pags), nombre + '.png');
    else descargar(resumenPDF(pags), nombre + '.pdf');
  }catch(x){ toast('No se pudo exportar: ' + (x.message || x), true); }
  b.disabled = false; b.textContent = antes;
};
// Al canal de Discord va el resumen en texto, no la tabla entera: lo que importa es quién falta.
$('#aDiscord').onclick = async () => {
  const min = minimoActual(), d = $('#aDesde').value, h = $('#aHasta').value;
  const flojos = ACT.filter(r => clasificar(r,min) !== 'ok');
  const top = [...ACT].sort((a,b) => b.reportes - a.reportes).filter(r => r.reportes > 0).slice(0,5);
  const quien = r => [r.rango, r.nombre || r.usuario].filter(Boolean).join(' ');
  if(!confirm(`¿Publicar el reporte de actividad del ${fmtF(d)} al ${fmtF(h)} en el canal?`)) return;
  const campos = [
    { name:'Integrantes', value:String(ACT.length), inline:true },
    { name:'Al día', value:String(ACT.length - flojos.length), inline:true },
    { name:'Por debajo o sin reportar', value:String(flojos.length), inline:true },
  ];
  if(top.length) campos.push({ name:'Más activos', value: top.map(r => `• ${quien(r)}: ${r.reportes}`).join('\n'), inline:false });
  if(flojos.length) campos.push({ name:'Pendientes de ponerse al día',
    value: flojos.slice(0,15).map(r => `• ${quien(r)}: ${r.reportes}`).join('\n') + (flojos.length>15 ? `\n…y ${flojos.length-15} más` : ''), inline:false });
  const r = await avisoDiscord('resumen', { embed: {
    title: `📈 Actividad · ${fmtF(d)} al ${fmtF(h)}`,
    description: min > 0 ? `Mínimo esperado: **${min}** reporte(s) por integrante. Cuentan los aprobados y los pendientes.` : 'Cuentan los reportes aprobados y los pendientes.',
    fields: campos }, origen: { tabla:'actividad', id: d + '_' + h } });
  toast(r === 'ok' ? 'Publicado en el canal.' : 'No se pudo publicar: ' + r, r !== 'ok');
};

// ====================== AVISO DE EVENTOS DEL DÍA ======================
// Avisa en Discord X minutos antes de cada horario del calendario. El trabajo corre cada minuto
// en el servidor y lleva memoria de lo ya avisado, así que no repite.
let EV_ACTS = [];
async function cargarEventos(){
  $('#cajaEventos').hidden = !PUEDE_TAREAS && !tiene(yo,'ver_todo');
  $('#evNuevo').hidden = !PUEDE_TAREAS;
  const [{ data: avisos, error }, { data: acts }] = await Promise.all([
    sb.from('eventos_avisos').select('id,nombre,canal,minutos,actividades,activo,mencion').order('id'),
    sb.from('actividades').select('id,nombre,icono').eq('activo', true).order('orden'),
  ]);
  if(error){ $('#evErr').textContent = error.message; return; }
  $('#evErr').textContent = ''; EV_ACTS = acts || [];
  if(!EV_ACTS.length){ $('#evLista').innerHTML = '<p class="muted" style="font-size:13px">No hay actividades en el calendario, así que todavía no hay nada que avisar.</p>'; return; }
  $('#evLista').innerHTML = (avisos || []).map(a => filaAviso(a)).join('')
    || '<p class="muted" style="font-size:13px">Todavía no hay ningún aviso. Crea el primero con ＋ Nuevo aviso.</p>';
  document.querySelectorAll('#evLista [data-ev-guardar]').forEach(b => b.onclick = () => guardarAviso(b.dataset.evGuardar));
  document.querySelectorAll('#evLista [data-ev-borrar]').forEach(b => b.onclick = () => borrarAviso(b.dataset.evBorrar, b.dataset.nombre));
  document.querySelectorAll('#evLista [data-ev-todas]').forEach(b => b.onclick = () => {
    const caja = b.closest('[data-aviso]'); const marcar = caja.querySelectorAll('.eva:checked').length !== EV_ACTS.length;
    caja.querySelectorAll('.eva').forEach(c => c.checked = marcar);
  });
  $('#evLista').querySelectorAll('input,button,select').forEach(e => { if(!PUEDE_TAREAS) e.disabled = true; });
  const activos = (avisos || []).filter(a => a.activo).length;
  const conMencion = (avisos || []).filter(a => a.activo && a.mencion && a.mencion !== 'ninguna').length;
  $('#evNota').textContent = activos
    ? `${activos} aviso(s) encendido(s)${conMencion ? `, ${conMencion} con mención general` : ''}. El servidor revisa cada minuto y no repite un horario ya avisado.`
    : 'Ningún aviso encendido: no se envía nada.';
}
// Una tarjeta por aviso: nombre, canal, antelación y qué actividades entran
function filaAviso(a){
  const sel = Array.isArray(a.actividades) ? a.actividades.map(Number) : null;
  const nuevo = a.id == null;
  return `<div class="caja" data-aviso="${nuevo ? '' : a.id}" style="background:var(--bg2);margin-bottom:10px">
    <div class="barra-act">
      <span class="gr"><label style="margin:0;white-space:nowrap"><input type="checkbox" class="ev-activo" ${a.activo ? 'checked' : ''}> Activo</label></span>
      <span class="gr"><label style="margin:0">Nombre</label><input type="text" class="ev-nombre" maxlength="60" value="${esc(a.nombre || '')}" placeholder="Ej.: Solo arsenal" style="width:200px"></span>
      <span class="gr"><label style="margin:0">Avisar</label><input type="number" class="ev-min" min="1" max="240" value="${a.minutos || 15}" style="width:80px"><span class="muted">minutos antes</span></span>
      <span class="gr"><label style="margin:0;white-space:nowrap">Mención</label>
        <select class="ev-men" style="width:auto" title="Pone un aviso general al principio del mensaje">
          <option value="ninguna" ${(a.mencion||'ninguna')==='ninguna' ? 'selected' : ''}>Ninguna</option>
          <option value="everyone" ${a.mencion==='everyone' ? 'selected' : ''}>@everyone</option>
          <option value="here" ${a.mencion==='here' ? 'selected' : ''}>@here</option>
        </select></span>
      <span class="gr"><button type="button" class="ghost sm" data-ev-guardar="${nuevo ? 'nuevo' : a.id}">Guardar</button>
        ${nuevo ? '' : `<button type="button" class="ghost sm" data-ev-borrar="${a.id}" data-nombre="${esc(a.nombre || '')}" title="Borra el aviso y su canal">🗑 Borrar</button>`}</span>
    </div>
    <div style="margin-top:10px">
      <span class="muted" style="font-size:13px">Actividades que entran en este aviso:</span>
      <button type="button" class="ghost sm" data-ev-todas="1" style="margin-left:8px">Marcar / desmarcar todas</button><br>
      ${EV_ACTS.map(x => `<label style="display:inline-flex;align-items:center;gap:6px;margin:6px 14px 0 0;font-size:14px;white-space:nowrap">
        <input type="checkbox" class="eva" value="${x.id}" ${(!sel || sel.includes(x.id)) ? 'checked' : ''}> ${esc(x.icono || '')} ${esc(x.nombre)}</label>`).join('')}
    </div>
    <p class="muted" style="margin:8px 0 0;font-size:12px">${nuevo
      ? 'Al guardar se crea su canal en la lista de arriba; pégale allí el webhook.'
      : `Publica en el canal <b>${esc(a.canal)}</b> (arriba, en la lista de canales, va su webhook).`}</p>
  </div>`;
}
$('#evNuevo').onclick = () => {
  if($('#evLista').querySelector('[data-aviso=""]')) return;   // solo una tarjeta nueva a la vez
  $('#evLista').insertAdjacentHTML('beforeend', filaAviso({ id:null, nombre:'', minutos:15, actividades:null, activo:true, mencion:'ninguna' }));
  const caja = $('#evLista').lastElementChild;
  caja.querySelector('[data-ev-guardar]').onclick = () => guardarAviso('nuevo');
  caja.querySelector('[data-ev-todas]').onclick = () => {
    const marcar = caja.querySelectorAll('.eva:checked').length !== EV_ACTS.length;
    caja.querySelectorAll('.eva').forEach(c => c.checked = marcar);
  };
  caja.querySelector('.ev-nombre').focus();
};
async function guardarAviso(id){
  const caja = id === 'nuevo' ? $('#evLista [data-aviso=""]') : $(`#evLista [data-aviso="${id}"]`);
  if(!caja) return;
  const todas = [...caja.querySelectorAll('.eva')], marcadas = todas.filter(c => c.checked).map(c => +c.value);
  const activo = caja.querySelector('.ev-activo').checked;
  if(!caja.querySelector('.ev-nombre').value.trim()){ $('#evErr').textContent = 'Ponle un nombre al aviso.'; return; }
  if(!marcadas.length && activo){ $('#evErr').textContent = 'Marca al menos una actividad.'; return; }
  // marcarlas todas equivale a "sin filtro": si mañana añades una actividad, también se avisa
  const lista = marcadas.length === todas.length ? null : marcadas;
  const { error } = await sb.rpc('guardar_aviso_evento', {
    p_id: id === 'nuevo' ? null : +id, p_nombre: caja.querySelector('.ev-nombre').value.trim(),
    p_minutos: +caja.querySelector('.ev-min').value || 15, p_actividades: lista, p_activo: activo,
    p_mencion: caja.querySelector('.ev-men').value });
  $('#evErr').textContent = error ? error.message : '';
  if(!error){ toast(id === 'nuevo' ? 'Aviso creado. Ponle el webhook a su canal.' : 'Aviso guardado.'); cargarAutomatizacion(); }
}
$('#evPrueba').onclick = async () => {
  const { data, error } = await sb.rpc('avisar_eventos', { p_enviar: false });
  if(error){ $('#evErr').textContent = error.message; return; }
  $('#evErr').textContent = '';
  const avisos = (data && data.avisos) || [];
  $('#evNota').textContent = avisos.length
    ? 'Ahora mismo saldría — ' + avisos.map(a => {
        const e = a.embed || a;   // por si quedara algún formato viejo
        return `[${a.aviso || 'aviso'}] ${e.title || ''} · ${String(e.description || '').replace(/\*\*/g,'').replace(/\n/g,' · ')}`;
      }).join('  |  ')
    : 'Ahora mismo no hay ningún horario dentro de la ventana de aviso. Es lo normal: solo coincide en el minuto exacto.';
};
async function borrarAviso(id, nombre){
  if(!confirm(`¿Borrar el aviso "${nombre}"? También se borra su canal de Discord de la lista.`)) return;
  const { error } = await sb.rpc('borrar_aviso_evento', { p_id: +id });
  $('#evErr').textContent = error ? error.message : '';
  if(!error){ toast('Aviso borrado.'); cargarAutomatizacion(); }
}

// ====================== AGENDA DE EVENTOS ======================
// Citas puntuales con fecha, hora y lugar. La fecha se escribe en hora del servidor (UTC)
// para que todo el mundo hable del mismo instante; debajo del campo se muestra la hora local.
const utcLocal = v => {                       // "2026-11-01T20:00" (UTC) -> Date real
  if(!v) return null;
  const [f, h] = v.split('T'); const [Y,M,D] = f.split('-').map(Number); const [hh,mm] = h.split(':').map(Number);
  return new Date(Date.UTC(Y, M-1, D, hh, mm));
};
const aCampoUTC = iso => {                    // Date -> valor del input, en UTC
  const d = new Date(iso); const p = n => String(n).padStart(2,'0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};
async function cargarAgenda(){
  $('#agNuevo').style.display = PUEDE_AGENDA ? '' : 'none';
  const [{ data: evs, error }, { data: dc }, { data: dest }] = await Promise.all([
    sb.from('agenda_eventos').select('id,titulo,lugar,inicia_en,duracion_min,canales,minutos_antes,recordar,recordado_en,cancelado,descripcion,imagen_path,rangos').order('inicia_en', { ascending:false }).limit(60),
    sb.rpc('canales_discord'),
    sb.from('agenda_canales').select('id,nombre,canal').order('id'),
  ]);
  AG_DESTINOS = dest || [];
  // Los Rangos PM se cargan con la pestaña de Roles; aquí puede que aún no estén
  if(!rangosPM.length) rangosPM = (await sb.from('rangos_pm').select('*').order('orden')).data || [];
  if(error){ $('#agErr').textContent = error.message; return; }
  $('#agErr').textContent = '';
  AG_CANALES = (dc && dc.canales) || [];
  const ids = (evs || []).map(e => e.id);
  const { data: asis } = ids.length ? await sb.from('agenda_asistencia').select('evento_id,respuesta').in('evento_id', ids) : { data: [] };
  const cu = {}; (asis || []).forEach(r => { cu[r.evento_id] = cu[r.evento_id] || { si:0, no:0 }; cu[r.evento_id][r.respuesta]++; });
  const ahora = Date.now();
  $('#tbAgenda').innerHTML = (evs || []).map(e => {
    const d = new Date(e.inicia_en), pasado = d.getTime() < ahora, c = cu[e.id] || { si:0, no:0 };
    const suyos = (e.canales || []).map(c => (AG_CANALES.find(x => x.clave === c) || { nombre:c }).nombre);
    return `<tr${e.cancelado ? ' style="opacity:.55"' : ''}>
      <td>${e.imagen_path ? `<img src="${esc(urlAnuncio(e.imagen_path))}" alt="" style="height:34px;border-radius:4px;border:1px solid var(--line2);display:block;margin-bottom:3px">` : ''}<b>${esc(e.titulo)}</b>${e.cancelado ? ' <span class="tag">Cancelado</span>' : pasado ? ' <span class="muted" style="font-size:12px">(ya pasó)</span>' : ''}
        ${e.descripcion ? `<br><span class="muted" style="font-size:12px">${esc(e.descripcion.slice(0,80))}${e.descripcion.length>80?'…':''}</span>` : ''}</td>
      <td style="white-space:nowrap">${esc(new Date(e.inicia_en).toLocaleString('es-CO', { dateStyle:'medium', timeStyle:'short' }))}<br><span class="muted" style="font-size:12px">${aCampoUTC(e.inicia_en).replace('T',' ')} UTC</span></td>
      <td>${esc(e.lugar || '—')}</td>
      <td>${(e.rangos || []).length ? (e.rangos).map(esc).join('<br>') : '<span class="muted">toda la unidad</span>'}</td>
      <td>${suyos.length ? suyos.map(esc).join('<br>') : '<span class="muted">sin destino</span>'}</td>
      <td>${e.recordar ? `${e.minutos_antes} min antes${e.recordado_en ? ' · <span class="muted">enviado</span>' : ''}` : '<span class="muted">no</span>'}</td>
      <td>${c.si} sí · ${c.no} no</td>
      <td class="acc" style="text-align:right">${PUEDE_AGENDA ? botonMenu(e.id) : ''}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" class="muted">Todavía no hay eventos en la agenda.</td></tr>';
  document.querySelectorAll('#tbAgenda [data-menu]').forEach(b => b.onclick = ev2 => {
    ev2.stopPropagation(); const e = (evs || []).find(x => x.id == b.dataset.menu);
    abrirMenu(b, 'agenda:' + e.id, `<b style="color:var(--text)">${esc(e.titulo)}</b>`,
      [['editar','✏️ Editar'], ['publicar','📣 Publicar en Discord'],
       ...(e.cancelado ? [] : [['cancelar','🚫 Marcar como cancelado']]), ['borrar','🗑 Eliminar', true]],
      op => accionAgenda(op, e.id, evs));
  });
}
function accionAgenda(op, id, evs){
  const e = (evs || []).find(x => x.id === +id);
  if(op === 'editar') return abrirEvento(e);
  if(op === 'publicar') return publicarEvento(+id, e);
  if(op === 'cancelar' || op === 'borrar'){
    const borrar = op === 'borrar';
    if(!confirm(borrar ? `¿Eliminar «${e.titulo}»? Se pierden también las confirmaciones.` : `¿Marcar «${e.titulo}» como cancelado? Sigue a la vista, tachado.`)) return;
    sb.rpc('agenda_cancelar', { p_id: +id, p_borrar: borrar }).then(({ error }) => {
      $('#agErr').textContent = error ? error.message : '';
      if(!error){ toast(borrar ? 'Evento eliminado.' : 'Evento cancelado.'); cargarAgenda(); }
    });
  }
}
async function publicarEvento(id, e){
  const mencion = confirm(`¿Avisar con @everyone al publicar «${e.titulo}»?\n\nAceptar = con @everyone · Cancelar = sin mención`);
  const { data, error } = await sb.rpc('agenda_publicar', { p_id: id, p_mencion: mencion });
  if(error){ $('#agErr').textContent = error.message; return; }
  if(data && data.ok) toast(`Publicado en ${data.enviados} canal(es).`);
  else toast(data && data.motivo === 'sin_canal' ? 'Ese evento no tiene ningún destino marcado.' : 'No se pudo publicar en ningún canal.', true);
}
function abrirEvento(e){
  const nuevo = !e;
  $('#agTitulo').textContent = nuevo ? 'Nuevo evento' : 'Editar evento';
  $('#agId').value = nuevo ? '' : e.id;
  $('#agNombre').value = nuevo ? '' : e.titulo;
  $('#agDesc').value = nuevo ? '' : (e.descripcion || '');
  $('#agLugar').value = nuevo ? '' : (e.lugar || '');
  $('#agFecha').value = nuevo ? '' : aCampoUTC(e.inicia_en);
  $('#agDur').value = nuevo ? '' : (e.duracion_min || '');
  $('#agMin').value = nuevo ? 60 : e.minutos_antes;
  $('#agRecordar').checked = nuevo ? true : e.recordar;
  $('#agMencion').checked = false;
  pintarDestinos(nuevo ? [] : (e.canales || []));
  pintarRangos(nuevo ? [] : (e.rangos || []));
  AG_IMG = null; AG_IMG_QUITAR = false; $('#agImagen').value = '';
  agImgPrev(nuevo || !e.imagen_path ? null : urlAnuncio(e.imagen_path));
  $('#agErr2').textContent = '';
  mostrarHoraLocal();
  $('#dlgEvento').showModal();
  $('#agNombre').focus();
}
function mostrarHoraLocal(){
  const d = utcLocal($('#agFecha').value);
  $('#agLocal').textContent = d
    ? `Eso es ${d.toLocaleString('es-CO', { weekday:'long', day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' })} en tu hora. En Discord cada quien lo verá en la suya.`
    : 'La hora se escribe en la del servidor (UTC), igual que los horarios del calendario.';
}
$('#agFecha').oninput = mostrarHoraLocal;
$('#agNuevo').onclick = () => abrirEvento(null);
async function guardarEvento(publicar){
  const d = utcLocal($('#agFecha').value);
  if(!$('#agNombre').value.trim()){ $('#agErr2').textContent = 'Ponle un título.'; return; }
  if(!d){ $('#agErr2').textContent = 'Falta la fecha y la hora.'; return; }
  const id = $('#agId').value ? +$('#agId').value : null;
  const canales = [...document.querySelectorAll('#agCanales .agc:checked')].map(x => x.value);
  let ruta = null;
  if(AG_IMG){
    ruta = `agenda/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${AG_IMG.type==='image/webp'?'webp':'jpg'}`;
    const up = await sb.storage.from('anuncios').upload(ruta, AG_IMG, { contentType: AG_IMG.type });
    if(up.error){ $('#agErr2').textContent = 'No se pudo subir la imagen: ' + up.error.message; return; }
  }
  const { data, error } = await sb.rpc('agenda_guardar', {
    p_id: id, p_titulo: $('#agNombre').value.trim(), p_descripcion: $('#agDesc').value.trim() || null,
    p_lugar: $('#agLugar').value.trim() || null, p_inicia_en: d.toISOString(),
    p_duracion: +$('#agDur').value || null, p_canales: canales,
    p_minutos: +$('#agMin').value || 60, p_recordar: $('#agRecordar').checked,
    p_imagen: ruta, p_quitar_imagen: AG_IMG_QUITAR,
    p_rangos: [...document.querySelectorAll('#agRangos .agr:checked')].map(x => x.value) });
  if(error){ $('#agErr2').textContent = error.message; return; }
  if(publicar && canales.length){
    const { data: pub } = await sb.rpc('agenda_publicar', { p_id: data.id, p_mencion: $('#agMencion').checked });
    toast(pub && pub.ok ? `Evento guardado y publicado en ${pub.enviados} canal(es).` : 'Evento guardado, pero no se pudo publicar en ningún canal.', !(pub && pub.ok));
  } else toast('Evento guardado.');
  $('#dlgEvento').close();
  cargarAgenda();
}
$('#agGuardar').onclick = () => guardarEvento(true);
$('#agSoloGuardar').onclick = () => guardarEvento(false);

// --- Destinos de la agenda: se marcan varios y se pueden crear los que hagan falta ---
function pintarDestinos(marcados){
  const esDeAgenda = c => AG_DESTINOS.some(d => d.canal === c.clave);
  const fila = c => `<label class="chip" style="display:inline-flex;align-items:center;gap:6px">
    <input type="checkbox" class="agc" value="${esc(c.clave)}" ${marcados.includes(c.clave) ? 'checked' : ''}>
    ${esc(c.nombre)}${c.tiene_webhook ? '' : ' <span class="muted" style="font-size:11px">(sin webhook)</span>'}
    ${esDeAgenda(c) ? `<button type="button" class="ghost sm" data-borrar-dest="${esc(c.clave)}" title="Borrar este destino" style="padding:0 6px;line-height:1.4">✕</button>` : ''}
  </label>`;
  const propios = AG_CANALES.filter(esDeAgenda), generales = AG_CANALES.filter(c => !esDeAgenda(c));
  $('#agCanales').innerHTML = (propios.length ? propios.map(fila).join('') : '')
    + (generales.length ? `<span class="muted" style="width:100%;font-size:12px;margin-top:6px">Otros canales ya configurados:</span>` + generales.map(fila).join('') : '');
  document.querySelectorAll('#agCanales [data-borrar-dest]').forEach(b => b.onclick = async ev2 => {
    ev2.preventDefault(); ev2.stopPropagation();
    const d = AG_DESTINOS.find(x => x.canal === b.dataset.borrarDest); if(!d) return;
    if(!confirm(`¿Borrar el destino "${d.nombre}"? También se quita su canal de la lista de Automatización.`)) return;
    const { error } = await sb.rpc('agenda_canal_borrar', { p_id: d.id });
    if(error){ $('#agErr2').textContent = error.message; return; }
    const marcados = [...document.querySelectorAll('#agCanales .agc:checked')].map(x => x.value);
    await recargarCanales(); pintarDestinos(marcados.filter(x => x !== b.dataset.borrarDest));
  });
}
async function recargarCanales(){
  const [{ data: dc }, { data: dest }] = await Promise.all([sb.rpc('canales_discord'), sb.from('agenda_canales').select('id,nombre,canal').order('id')]);
  AG_CANALES = (dc && dc.canales) || []; AG_DESTINOS = dest || [];
}
$('#agNuevoCanal').onclick = async () => {
  const nombre = prompt('Nombre del destino (por ejemplo: Eventos oficiales, Avisos de tropa):');
  if(!nombre || !nombre.trim()) return;
  const { error } = await sb.rpc('agenda_canal_guardar', { p_id: null, p_nombre: nombre.trim() });
  if(error){ $('#agErr2').textContent = error.message; return; }
  const marcados = [...document.querySelectorAll('#agCanales .agc:checked')].map(x => x.value);
  await recargarCanales();
  const nuevoCanal = AG_DESTINOS[AG_DESTINOS.length - 1];
  pintarDestinos(marcados.concat(nuevoCanal ? [nuevoCanal.canal] : []));
  toast('Destino creado. Pégale el webhook en Automatización → Canales.');
};
function agImgPrev(url){
  $('#agImgPrev').innerHTML = url
    ? `<img src="${esc(url)}" alt="" style="max-height:140px;border-radius:8px;border:1px solid var(--line2);display:block">
       <button type="button" class="ghost sm" id="agImgQuitar" style="margin-top:6px">Quitar imagen</button>`
    : '';
  const q = $('#agImgQuitar');
  if(q) q.onclick = () => { AG_IMG = null; AG_IMG_QUITAR = true; $('#agImagen').value = ''; agImgPrev(null); };
}
$('#agImagen').onchange = async e => {
  const f = e.target.files[0]; if(!f) return;
  try{
    const img = await cargarFoto(f, 1600);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    let b = await new Promise(r => c.toBlob(r, 'image/webp', 0.9));
    if(!b || b.type !== 'image/webp') b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    AG_IMG = b; AG_IMG_QUITAR = false; agImgPrev(URL.createObjectURL(b));
  }catch(x){ $('#agErr2').textContent = 'No se pudo leer la imagen.'; }
};

// --- Rangos PM convocados: sin marcar nada, el evento es para toda la unidad ---
function pintarRangos(marcados){
  $('#agRangos').innerHTML = rangosPM.map(r => `<label class="chip">
    <input type="checkbox" class="agr" value="${esc(r.nombre)}" ${marcados.includes(r.nombre) ? 'checked' : ''}> ${esc(r.nombre)}</label>`).join('')
    || '<span class="muted" style="font-size:13px">No hay Rangos PM definidos (Roles y permisos → Rangos PM).</span>';
}
$('#agRangosNinguno').onclick = () => document.querySelectorAll('#agRangos .agr').forEach(c => c.checked = false);

// --- Bot de Discord: registrar los comandos (el token vive en el servidor) ---
$('#botRegistrar').onclick = async () => {
  const guild = $('#botGuild').value.trim();
  if(guild && !/^[0-9]{17,20}$/.test(guild)){ $('#botErr').textContent = 'El id del servidor son solo números (17 a 20 dígitos).'; return; }
  $('#botErr').textContent = ''; $('#botRegistrar').disabled = true;
  const { data, error } = await sb.functions.invoke('mensaje-persona', { body: { accion:'registrar_comandos', guild_id: guild || null } });
  $('#botRegistrar').disabled = false;
  if(error){ $('#botErr').textContent = error.message; return; }
  if(data && data.ok){
    $('#botNota').textContent = `${data.comandos} comando(s) registrados (${data.ambito}). ${data.ambito === 'servidor' ? 'Ya deberían aparecer al escribir "/" en ese servidor.' : 'Discord puede tardar hasta una hora en repartirlos.'}`;
    toast('Comandos registrados.');
  } else if(data && data.motivo === 'sin_bot'){
    $('#botErr').textContent = 'Falta el token del bot. Ponlo en Supabase como DISCORD_BOT_TOKEN y vuelve a intentarlo.';
  } else {
    $('#botErr').textContent = 'Discord no aceptó el registro: ' + ((data && (data.detalle || data.motivo)) || 'sin respuesta');
  }
};
