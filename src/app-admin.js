import { requerir, barraUsuario, tiene, sb, esc, urlImagen, emailDe, RANGOS, nombreCompleto, esSuperadmin, validarPassword, traducirAuth } from './auth.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const yo = await requerir(); barraUsuario(yo);
const $ = s => document.querySelector(s);
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => document.getElementById(b.dataset.close).close());
const PERMS = ['usuarios','asignar_roles','reset_password','crear_roles','crear_reportes','gestion_reportes','historial','eliminar_historial','auditoria'];
const NOMBRE_PERM = { usuarios:'Gestión de usuarios', asignar_roles:'Asignación de roles', reset_password:'Restablecer contraseñas',
  crear_roles:'Creación de roles', crear_reportes:'Creación de reportes', gestion_reportes:'Gestión de reportes', historial:'Ver historial', eliminar_historial:'Eliminar historial', auditoria:'Ver auditoría' };
const TABS = [
  ['usuarios',    'Usuarios',    ['usuarios','asignar_roles','reset_password']],
  ['roles',       'Roles',       ['crear_roles']],
  ['formularios', 'Formularios', ['crear_reportes','gestion_reportes']],
  ['historial',   'Historial',   ['historial','eliminar_historial']],
  ['auditoria',   'Auditoría',   ['auditoria']],
];
let roles = [], formularios = [], rangosPM = [];

// ---------- Pestañas según permisos ----------
const tabs = TABS.filter(([,,ps]) => ps.some(p => tiene(yo,p))).map(([id]) => id);
if(!tabs.length){ document.body.innerHTML = '<p style="padding:40px;text-align:center">No tienes permisos de administración.</p>'; throw new Error('sin permisos'); }
$('#rPermisos').innerHTML = PERMS.map(p => `<label><input type="checkbox" class="rp" value="${p}"> ${NOMBRE_PERM[p]}</label>`).join('');
$('#tabs').innerHTML = TABS.filter(([id]) => tabs.includes(id)).map(([id,nombre]) => `<button data-t="${id}">${nombre}</button>`).join('');
function abrir(t){
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.t===t));
  document.querySelectorAll('section').forEach(s => s.classList.toggle('on', s.id==='t-'+t));
  ({usuarios:cargarUsuarios, roles:cargarRoles, formularios:cargarForms, historial:cargarHist, auditoria:cargarAud})[t]();
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => abrir(b.dataset.t));
await cargarCatalogos();
abrir(tabs[0]);

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
async function cargarUsuarios(){
  const { data, error } = await sb.from('perfiles').select('*').order('usuario');
  if(error){ $('#tbUsuarios').innerHTML = `<tr><td colspan=5 class="err">${esc(error.message)}</td></tr>`; return; }
  $('#uRango').innerHTML = '<option value="">— Sin rango —</option>' + RANGOS.map(r => `<option>${esc(r)}</option>`).join('');
  const rolesAsignables = roles.filter(rolAsignable);
  $('#uRol').innerHTML = '<option value="">— Sin rol —</option>' + rolesAsignables.map(r => `<option value="${esc(r.id)}">${esc(r.nombre)}</option>`).join('');
  $('#uRol').disabled = !tiene(yo,'asignar_roles'); $('#uRol').title = tiene(yo,'asignar_roles') ? '' : 'Necesitas el permiso de asignación de roles';
  ['#uNombre','#uRango','#uActivo'].forEach(s => $(s).disabled = !tiene(yo,'usuarios'));
  $('#uGuardar').style.display = (tiene(yo,'usuarios') || tiene(yo,'asignar_roles')) ? '' : 'none';
  $('#tbUsuarios').innerHTML = data.map(u => {
    const r = roles.find(x => x.id===u.rol_id);
    return `<tr><td><b>${esc(u.usuario)}</b></td><td>${esc(nombreCompleto(u))}</td><td>${esc(r ? r.nombre : 'Sin rol')}</td>
      <td><span class="tag ${u.activo?'on':'off'}">${u.activo?'Activo':'Inactivo'}</span></td>
      <td style="white-space:nowrap">${(r && !rolAsignable(r) && u.id!==yo.id) ? `<span class="muted">${r.protegido?'Solo Administrador':'Fuera de tus permisos'}</span>` : `${(tiene(yo,'usuarios')||tiene(yo,'asignar_roles')) ? `<button class="ghost sm" data-e="${u.id}">Editar</button>` : ''}
      ${tiene(yo,'usuarios') ? `<button class="ghost sm" data-a="${u.id}" data-v="${u.activo?0:1}">${u.activo?'Desactivar':'Activar'}</button>` : ''}
      ${(tiene(yo,'reset_password') && u.id!==yo.id) ? `<button class="ghost sm" data-rp="${u.id}" data-u="${esc(u.usuario)}">Contraseña</button>` : ''}`}</td></tr>`;
  }).join('') || '<tr><td colspan=5 class="muted">Sin usuarios</td></tr>';
  document.querySelectorAll('[data-e]').forEach(b => b.onclick = () => editarUsuario(data.find(u => u.id===b.dataset.e)));
  document.querySelectorAll('[data-rp]').forEach(b => b.onclick = () => resetearPassword(b.dataset.rp, b.dataset.u));
  document.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
    if(b.dataset.a===yo.id && b.dataset.v==='0'){ alert('No puedes desactivar tu propia cuenta.'); return; }
    const { error } = await sb.from('perfiles').update({ activo: b.dataset.v==='1' }).eq('id', b.dataset.a);
    if(error) alert(error.message); cargarUsuarios();
  });
}
function editarUsuario(u){
  $('#tituloUsuario').textContent = 'Editar usuario'; $('#uGuardar').textContent = 'Guardar';
  $('#uId').value = u.id; $('#uUsuario').value = u.usuario; $('#uUsuario').disabled = true; $('#uNombre').value = u.nombre; $('#uRango').value = u.rango || '';
  $('#uPass').value=''; $('#uPass').disabled = true; $('#uPass').placeholder = 'Solo el propio usuario cambia su contraseña';
  $('#uRol').value = u.rol_id || ''; $('#uActivo').checked = u.activo; msg('u','');
}
function limpiarUsuario(){
  $('#fUsuario').reset(); $('#tituloUsuario').textContent = 'Nuevo usuario'; $('#uGuardar').textContent = 'Crear';
  $('#uId').value=''; $('#uUsuario').disabled=false; $('#uPass').disabled=false; $('#uPass').placeholder=''; $('#uActivo').checked=true; msg('u','');
}
$('#uCancelar').onclick = limpiarUsuario;
$('#fUsuario').onsubmit = async e => {
  e.preventDefault(); msg('u','');
  const id=$('#uId').value, usuario=$('#uUsuario').value.trim().toLowerCase(), nombre=$('#uNombre').value.trim(), rango=$('#uRango').value||null, rol=$('#uRol').value, activo=$('#uActivo').checked;
  try{
    if(id){
      const cambios = {}; if(tiene(yo,'usuarios')) Object.assign(cambios, { nombre, rango, activo }); if(tiene(yo,'asignar_roles')) cambios.rol_id = rol || null;
      const { error } = await sb.from('perfiles').update(cambios).eq('id', id); if(error) throw error;
          } else {
      if(!tiene(yo,'usuarios')) throw new Error('No tienes permiso para crear usuarios.');
      const pass=$('#uPass').value; { const v=validarPassword(pass); if(v) throw new Error('Contraseña inicial: '+v); }
      // Cliente secundario para no reemplazar la sesión del administrador
      const tmp = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth:{ persistSession:false, autoRefreshToken:false } });
      const { data, error } = await tmp.auth.signUp({ email: emailDe(usuario), password: pass, options:{ data:{ usuario, nombre } } });
      if(error) throw new Error(traducirAuth(error.message));
      await tmp.auth.signOut().catch(()=>{});
      if(!data.user) throw new Error('Supabase no devolvió el usuario. ¿Está desactivado "Confirm email"?');
      // El trigger creó el perfil inactivo con rol "usuario"; ahora lo ajustamos
      const cambios = { nombre, rango, activo }; if(tiene(yo,'asignar_roles')) cambios.rol_id = rol || null;
      // pequeño reintento: el trigger puede tardar unos ms
      let ok=false; for(let i=0;i<5 && !ok;i++){ const r = await sb.from('perfiles').update(cambios).eq('id', data.user.id).select('id'); ok = !r.error && r.data && r.data.length; if(!ok) await new Promise(r=>setTimeout(r,400)); }
      if(!ok) throw new Error('El usuario se creó pero no se pudo activar; edítalo desde la lista.');
      limpiarUsuario(); msg('u',`Usuario "${usuario}" creado.`, true); cargarUsuarios(); return;
    }
    limpiarUsuario(); msg('u','Usuario actualizado.', true); cargarUsuarios();
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
    $('#dlgPass').close(); msg('u','Contraseña restablecida.', true);
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
  $('#tbRoles').innerHTML = roles.map(r => `<tr><td><b>${esc(r.nombre)}</b><br><span class="muted">${esc(r.id)} · ${esc(r.descripcion||'')}</span></td>
    <td>${esc(r.rango_pm||'—')}</td><td>${esc(permisosTexto(r))}</td><td>${esc(formsTexto(r))}</td>
    <td style="white-space:nowrap">${(!rolAsignable(r)) ? `<span class="muted">${r.protegido?'Solo Administrador':'Fuera de tus permisos'}</span>` : `<button class="ghost sm" data-re="${r.id}">Editar</button>${r.protegido?'':`<button class="ghost sm" data-rd="${r.id}">Eliminar</button>`}`}</td></tr>`).join('');
  document.querySelectorAll('[data-re]').forEach(b => b.onclick = () => editarRol(roles.find(r => r.id===b.dataset.re)));
  document.querySelectorAll('[data-rd]').forEach(b => b.onclick = async () => {
    if(!confirm('¿Eliminar este rol? Los usuarios que lo tengan quedarán sin rol.')) return;
    const { error } = await sb.from('roles').delete().eq('id', b.dataset.rd); if(error) alert(error.message); cargarRoles();
  });
}
function editarRol(r){
  $('#tituloRol').textContent='Editar rol'; $('#rGuardar').textContent='Guardar';
  $('#rId').value=r.id; $('#rId').disabled=true; $('#rNombre').value=r.nombre; $('#rDesc').value=r.descripcion||''; $('#rRangoPM').value=r.rango_pm||'';
  document.querySelectorAll('.rp').forEach(c => c.checked = !!(r.permisos||{})[c.value]);
  $('#rTodos').checked = r.formularios.includes('*'); $('#rTodos').onchange();
  document.querySelectorAll('.rf').forEach(c => c.checked = r.formularios.includes(c.value)); msg('r','');
}
function limpiarRol(){ $('#fRol').reset(); $('#tituloRol').textContent='Nuevo rol'; $('#rGuardar').textContent='Crear'; $('#rId').disabled=false; $('#rTodos').onchange(); msg('r',''); }
$('#rCancelar').onclick = limpiarRol;
$('#fRol').onsubmit = async e => {
  e.preventDefault(); msg('r','');
  const rol = { id:$('#rId').value.trim().toLowerCase(), nombre:$('#rNombre').value.trim(), descripcion:$('#rDesc').value.trim(), rango_pm:$('#rRangoPM').value||null,
    permisos: Object.fromEntries([...document.querySelectorAll('.rp')].map(c => [c.value, c.checked])),
    formularios: $('#rTodos').checked ? ['*'] : [...document.querySelectorAll('.rf:checked')].map(c => c.value) };
  if(rol.id==='admin' && !(rol.permisos.crear_roles && rol.permisos.asignar_roles && rol.permisos.auditoria)){ msg('r','El rol admin debe conservar los permisos de roles.'); return; }
  const { error } = await sb.from('roles').upsert(rol); if(error){ msg('r', error.message); return; }
  limpiarRol(); msg('r','Rol guardado.', true); cargarRoles();
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
  $('#fForm').parentElement.style.display = (tiene(yo,'crear_reportes')||tiene(yo,'gestion_reportes')) ? '' : 'none';
  $('#tbForms').innerHTML = formularios.map(f => `<tr><td style="font-size:22px">${esc(f.icono||'')}</td><td><b>${esc(f.titulo)}</b><br><span class="muted">${esc(f.id)}</span></td>
    <td><a href="../${esc(f.ruta)}" target="_blank">${esc(f.ruta)}</a></td><td>${f.orden}</td>
    <td><span class="tag ${f.activo?'on':'off'}">${f.activo?'Visible':'Oculto'}</span></td>
    <td style="white-space:nowrap">${tiene(yo,'gestion_reportes') ? `<button class="ghost sm" data-fe="${f.id}">Editar</button>
    <button class="ghost sm" data-fa="${f.id}" data-v="${f.activo?0:1}">${f.activo?'Ocultar':'Mostrar'}</button>
    <button class="ghost sm" data-fd="${f.id}">Eliminar</button>` : '<span class="muted">Solo lectura</span>'}</td></tr>`).join('') || '<tr><td colspan=6 class="muted">Sin formularios</td></tr>';
  document.querySelectorAll('[data-fe]').forEach(b => b.onclick = () => editarForm(formularios.find(f => f.id===b.dataset.fe)));
  document.querySelectorAll('[data-fa]').forEach(b => b.onclick = async () => { const { error } = await sb.from('formularios').update({ activo: b.dataset.v==='1' }).eq('id', b.dataset.fa); if(error) alert(error.message); cargarForms(); });
  document.querySelectorAll('[data-fd]').forEach(b => b.onclick = async () => {
    if(!confirm('¿Eliminar este formulario del catálogo? Los reportes del historial se conservan.')) return;
    const { error } = await sb.from('formularios').delete().eq('id', b.dataset.fd); if(error) alert(error.message); cargarForms();
  });
}
function editarForm(f){
  $('#tituloForm').textContent='Editar formulario'; $('#fGuardar').textContent='Guardar';
  $('#fId').value=f.id; $('#fId').disabled=true; $('#fTitulo').value=f.titulo; $('#fDesc').value=f.descripcion||''; $('#fIcono').value=f.icono||'';
  $('#fOrden').value=f.orden; $('#fRuta').value=f.ruta; $('#fActivo').checked=f.activo; msg('f','');
}
function limpiarForm(){ $('#fForm').reset(); $('#tituloForm').textContent='Nuevo formulario'; $('#fGuardar').textContent='Crear'; $('#fId').disabled=false; $('#fIcono').value='📋'; $('#fOrden').value=100; msg('f',''); }
$('#fCancelar').onclick = limpiarForm;
$('#fForm').onsubmit = async e => {
  e.preventDefault(); msg('f','');
  if($('#fId').disabled ? !tiene(yo,'gestion_reportes') : !tiene(yo,'crear_reportes')){ msg('f', $('#fId').disabled ? 'No tienes permiso de gestión de reportes.' : 'No tienes permiso de creación de reportes.'); return; }
  const f = { id:$('#fId').value.trim().toLowerCase(), titulo:$('#fTitulo').value.trim(), descripcion:$('#fDesc').value.trim(), icono:$('#fIcono').value.trim(),
    orden:parseInt($('#fOrden').value)||100, ruta:$('#fRuta').value.trim(), activo:$('#fActivo').checked };
  const { error } = await sb.from('formularios').upsert(f); if(error){ msg('f', error.message); return; }
  limpiarForm(); msg('f','Formulario guardado.', true); cargarForms();
};

// ====================== HISTORIAL ======================
async function cargarHist(){
  await cargarCatalogos();
  $('#hForm').innerHTML = '<option value="">Todos</option>' + formularios.map(f => `<option value="${esc(f.id)}">${esc(f.titulo)}</option>`).join('');
  // Rango de fechas y lista de usuarios a partir de lo que existe en el historial
  const { data } = await sb.from('reportes_vista').select('fecha,usuario,usuario_nombre,usuario_rango').limit(2000);
  const fechas = (data||[]).map(r => r.fecha).filter(Boolean).sort();
  rangoHist = { min: fechas[0] || '', max: fechas[fechas.length-1] || '' };
  ['#hDesde','#hHasta'].forEach(s => { $(s).min = rangoHist.min; $(s).max = rangoHist.max; });
  ajustarFechas();
  const seen = {}; (data||[]).forEach(r => { if(r.usuario && !seen[r.usuario]) seen[r.usuario] = [r.usuario_rango, r.usuario_nombre].filter(Boolean).join(' '); });
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
  $('#hErr').textContent='';
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
const ACCION = { insert:'Creó', update:'Modificó', delete:'Eliminó', reset_password:'Restableció contraseña', reset_password_denegado:'Intento de reset denegado' };
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
  $('#aErr').textContent = '';
  const resumen = r => {
    if(r.accion==='update') return Object.entries(r.detalle||{}).map(([k,v]) => `${k}: ${fmtV(v.antes)} → ${fmtV(v.despues)}`).join(' · ');
    const d = r.detalle||{}; return Object.entries(d).filter(([k]) => !['id','creado_en','sellado_en'].includes(k)).slice(0,6).map(([k,v]) => `${k}: ${fmtV(v)}`).join(' · ');
  };
  const fmtV = v => v===null||v===undefined ? '—' : (typeof v==='object' ? JSON.stringify(v) : String(v)).slice(0,60);
  $('#tbAud').innerHTML = data.map(r => `<tr><td class="muted" style="white-space:nowrap">${new Date(r.en).toLocaleString('es-CO')}</td>
    <td><b>${esc(r.usuario||'sistema')}</b></td><td>${esc(ACCION[r.accion]||r.accion)} ${esc(TABLA[r.tabla]||r.tabla)}</td>
    <td>${esc(r.registro||'')}</td><td class="muted" style="font-size:12px">${esc(resumen(r))}</td></tr>`).join('') || '<tr><td colspan=5 class="muted">Sin eventos</td></tr>';
}
