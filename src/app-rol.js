// Ficha de rol: datos, permisos, formularios, miembros e historial. Edición solo si el rol está dentro de mis permisos.
import { requerir, barraUsuario, tiene, sb, esc, nombreCompleto, esSuperadmin } from './auth.js';
const yo = await requerir({ permiso: 'crear_roles' }); barraUsuario(yo);
const $ = s => document.querySelector(s);
const ID = new URLSearchParams(location.search).get('id') || '';
const PERMS = [['usuarios','Gestión de usuarios'],['asignar_roles','Asignación de roles'],['reset_password','Restablecer contraseñas'],['crear_roles','Creación de roles'],['crear_reportes','Creación de reportes'],['gestion_reportes','Gestión de reportes'],['disenar_formularios','Creación de formularios (diseñador)'],['historial','Ver historial'],['eliminar_historial','Eliminar historial'],['auditoria','Ver auditoría'],['aprobar_reportes','Revisar y aprobar reportes'],['sanciones','Sanciones y advertencias'],['turnos','Turnos: asignar y editar'],['ver_turnos','Turnos: solo ver la agenda'],['anuncios','Anuncios: publicar y editar'],['ver_anuncios','Anuncios: solo ver'],['permisos_granulares','Permisos granulares por usuario'],['ver_como','Ver la página como otro usuario (solo Administrador)']];
const fmt = iso => iso ? new Date(iso).toLocaleString('es-CO') : '—';
let toastT=null; const toast = (t, err=false) => { const e=$('#toast'); e.textContent=t; e.className='toast on'+(err?' err':''); clearTimeout(toastT); toastT=setTimeout(()=>e.classList.remove('on'),3200); };
document.querySelectorAll('#pestanas button').forEach(b => b.onclick = () => { document.querySelectorAll('#pestanas button').forEach(x => x.classList.toggle('on', x===b)); document.querySelectorAll('main section').forEach(s => s.classList.toggle('on', s.id==='p-'+b.dataset.p)); });
let R = null, FORMS = [];
const mp = yo.rol.permisos || {}, mf = yo.rol.formularios || [], sup = esSuperadmin(yo);
const dentro = (permisos, formularios) => sup || (!Object.entries(permisos||{}).some(([k,v]) => v && !mp[k]) && (mf.includes('*') || (!(formularios||[]).includes('*') && (formularios||[]).every(f => mf.includes(f)))));

async function cargar(){
  const [{ data: r, error }, { data: forms }, { data: miembros }, { data: rangos }, { data: aud }] = await Promise.all([
    sb.from('roles').select('*').eq('id', ID).maybeSingle(), sb.from('formularios').select('id,titulo,icono,activo').order('orden'),
    sb.from('perfiles').select('id,usuario,nombre,rango,activo,permisos_extra,permisos_negados,formularios_extra').eq('rol_id', ID).order('usuario'),
    sb.from('rangos_pm').select('nombre').order('orden'), sb.from('auditoria').select('en,usuario,accion,detalle').eq('tabla','roles').eq('registro', ID).order('id',{ascending:false}).limit(40)]);
  if(error || !r){ $('#cab').innerHTML = `<p class="err">${esc(error ? error.message : 'Rol no encontrado')}</p>`; return; }
  R = r; FORMS = forms || []; const editable = dentro(r.permisos, r.formularios) && (!r.protegido || sup);
  document.title = `${r.nombre} · Administración`; $('#migaNombre').textContent = r.nombre;
  $('#cab').innerHTML = `<div class="av">🛡️</div><div><h1>${esc(r.nombre)}</h1><div class="sub"><code>${esc(r.id)}</code>${r.descripcion ? ' · ' + esc(r.descripcion) : ''}${r.rango_pm ? ' · Rango PM ' + esc(r.rango_pm) : ''}${r.protegido ? ' <span class="tag" style="background:var(--avisobg);color:#e0a92a">Protegido</span>' : ''} · ${(miembros||[]).length} usuario(s)</div></div>
    <div class="acc">${(editable && !r.protegido) ? `<button type="button" class="ghost sm" id="bEliminar">🗑 Eliminar rol</button>` : ''}<a class="ghost sm" href="./#roles" style="text-decoration:none;display:inline-block">← Roles</a></div>`;
  const be = $('#bEliminar'); if(be) be.onclick = async () => { if(!confirm(`¿Eliminar el rol "${r.nombre}"? Los ${(miembros||[]).length} usuario(s) que lo tienen quedarán sin rol.`)) return; const { error: e } = await sb.from('roles').delete().eq('id', ID); if(e){ toast(e.message, true); return; } location.href = './#roles'; };
  $('#kvRol').innerHTML = [['Identificador', r.id], ['Usuarios', (miembros||[]).length], ['Permisos', Object.values(r.permisos||{}).filter(Boolean).length], ['Formularios', (r.formularios||[]).includes('*') ? 'Todos' : (r.formularios||[]).length], ['Tipo', r.protegido ? 'Protegido (Administrador)' : 'Normal']].map(([k,v]) => `<span>${esc(k)}</span><span>${esc(String(v))}</span>`).join('');
  $('#rNombre').value = r.nombre; $('#rDesc').value = r.descripcion || ''; $('#rRangoPM').innerHTML = '<option value="">— Sin Rango PM —</option>' + (rangos||[]).map(x => `<option ${x.nombre===r.rango_pm?'selected':''}>${esc(x.nombre)}</option>`).join('');
  ['#rNombre','#rDesc','#rRangoPM'].forEach(x => $(x).disabled = !editable); $('#dGuardar').style.display = editable ? '' : 'none';
  $('#permNota').textContent = editable ? '' : (r.protegido ? 'El rol Administrador solo lo modifica otro Administrador.' : 'Solo lectura: este rol tiene permisos que tú no tienes.');
  $('#tbPerm').innerHTML = PERMS.map(([k,n]) => { const on = !!(r.permisos||{})[k]; const puedo = editable && (sup || mp[k]) && (k!=='ver_como' || r.protegido);
    return `<tr><td><b>${esc(n)}</b><br><span class="nota">${esc(k)}</span></td><td><input type="checkbox" data-perm="${k}" ${on?'checked':''} ${puedo ? '' : 'disabled'} title="${puedo ? '' : (k==='ver_como' ? 'Exclusivo del rol Administrador' : 'No puedes otorgar un permiso que tú no tienes')}"></td></tr>`; }).join('');
  $('#pGuardar').style.display = editable ? '' : 'none';
  const todos = (r.formularios||[]).includes('*'); $('#fTodos').checked = todos; $('#fTodos').disabled = !editable || (!sup && !mf.includes('*'));
  const pintarF = () => { const t = $('#fTodos').checked; $('#tbForm').innerHTML = FORMS.map(f => { const on = t || (r.formularios||[]).includes(f.id); const puedo = editable && !t && (sup || mf.includes('*') || mf.includes(f.id));
    return `<tr><td>${esc(f.icono||'')} <b>${esc(f.titulo)}</b>${f.activo?'':' <span class="nota">(oculto)</span>'}<br><span class="nota">${esc(f.id)}</span></td><td><input type="checkbox" data-form="${f.id}" ${on?'checked':''} ${puedo?'':'disabled'}></td></tr>`; }).join('') || '<tr><td colspan=2 class="nota">Sin formularios</td></tr>'; };
  $('#fTodos').onchange = pintarF; pintarF(); $('#fGuardar').style.display = editable ? '' : 'none';
  $('#nMiembros').textContent = `${(miembros||[]).length}`;
  $('#tbMiembros').innerHTML = (miembros||[]).map(u => `<tr><td><a href="usuario.html?id=${esc(u.id)}" style="color:var(--text)"><b>${esc(u.usuario)}</b></a></td><td>${esc(nombreCompleto(u))}</td><td><span class="tag ${u.activo?'on':'off'}">${u.activo?'Activo':'Inactivo'}</span></td><td>${(Object.keys(u.permisos_extra||{}).length || Object.keys(u.permisos_negados||{}).length || (u.formularios_extra||[]).length) ? '<span class="tag" style="background:var(--avisobg);color:#e0a92a">+granular</span>' : '<span class="nota">—</span>'}</td></tr>`).join('') || '<tr><td colspan=4 class="nota">Nadie tiene este rol todavía.</td></tr>';
  const sinEmoji = t => String(t).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu,'');
  $('#actividad').innerHTML = (aud||[]).map(a => `<div class="act"><b>${esc({insert:'Creó',update:'Modificó',delete:'Eliminó'}[a.accion]||a.accion)}</b> — por ${esc(a.usuario||'sistema')}<div class="f">${fmt(a.en)} · ${esc(sinEmoji(JSON.stringify(a.detalle||{})).slice(0,200))}</div></div>`).join('') || '<p class="nota">Sin registros.</p>';
}
await cargar();
async function guardar(cambios){ const { error } = await sb.from('roles').update(cambios).eq('id', ID); if(error) throw new Error(error.message); }
$('#dGuardar').onclick = async () => { try{ await guardar({ nombre: $('#rNombre').value.trim(), descripcion: $('#rDesc').value.trim(), rango_pm: $('#rRangoPM').value || null }); toast('Datos guardados.'); cargar(); }catch(x){ toast(x.message, true); } };
$('#pGuardar').onclick = async () => { $('#pErr').textContent=''; const permisos = { ...(R.permisos||{}) }; document.querySelectorAll('[data-perm]').forEach(c => { if(!c.disabled) permisos[c.dataset.perm] = c.checked; });
  if(R.id==='admin' && !(permisos.crear_roles && permisos.asignar_roles && permisos.auditoria)){ $('#pErr').textContent='El rol admin debe conservar los permisos de roles.'; return; }
  try{ await guardar({ permisos }); toast('Permisos guardados.'); cargar(); }catch(x){ $('#pErr').textContent = x.message; } };
$('#fGuardar').onclick = async () => { $('#fErr').textContent=''; const formularios = $('#fTodos').checked ? ['*'] : [...document.querySelectorAll('[data-form]')].filter(c => c.checked).map(c => c.dataset.form);
  try{ await guardar({ formularios }); toast('Formularios guardados.'); cargar(); }catch(x){ $('#fErr').textContent = x.message; } };
