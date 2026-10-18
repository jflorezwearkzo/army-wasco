// Ficha de usuario (subpágina de Administración → Usuarios): cuenta, actividad, permisos efectivos con extras/negados
// por usuario, formularios extra, notas del administrador e historial de cambios.
import { requerir, barraUsuario, tiene, sb, esc, nombreCompleto, esSuperadmin, entrarVerComo, enVerComo, validarPassword } from './auth.js';
const yo = await requerir(); barraUsuario(yo);
if(!['usuarios','asignar_roles','reset_password','permisos_granulares'].some(p => tiene(yo,p))){ document.querySelector('main').innerHTML = '<p class="err" style="padding:30px;text-align:center">No tienes permiso para ver fichas de usuario.</p>'; throw new Error('sin permiso'); }
const $ = s => document.querySelector(s);
const ID = new URLSearchParams(location.search).get('id') || '';
const PERMS = [['usuarios','Gestión de usuarios'],['asignar_roles','Asignación de roles'],['reset_password','Restablecer contraseñas'],['crear_roles','Creación de roles'],['crear_reportes','Creación de reportes'],['gestion_reportes','Gestión de reportes'],['disenar_formularios','Creación de formularios (diseñador)'],['historial','Ver historial'],['eliminar_historial','Eliminar historial'],['auditoria','Ver auditoría'],['aprobar_reportes','Revisar y aprobar reportes'],['sanciones','Sanciones y advertencias'],['turnos','Turnos: asignar y editar'],['ver_turnos','Turnos: solo ver la agenda'],['anuncios','Anuncios: publicar y editar'],['ver_anuncios','Anuncios: solo ver'],['permisos_granulares','Permisos granulares por usuario'],['ver_como','Ver la página como otro usuario (solo Administrador)']];
const fmt = iso => iso ? new Date(iso).toLocaleString('es-CO') : '—';
const fmtD = iso => iso ? String(iso).slice(0,10).split('-').reverse().join('-') : '—';
let toastT=null; const toast = (t, err=false) => { const e=$('#toast'); e.textContent=t; e.className='toast on'+(err?' err':''); clearTimeout(toastT); toastT=setTimeout(()=>e.classList.remove('on'),3200); };
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => document.getElementById(b.dataset.close).close());
document.querySelectorAll('#pestanas button').forEach(b => b.onclick = () => { document.querySelectorAll('#pestanas button').forEach(x => x.classList.toggle('on', x===b)); document.querySelectorAll('main section').forEach(s => s.classList.toggle('on', s.id==='p-'+b.dataset.p)); });
let F = null, FORMS = [];
const PUEDE_GRAN = tiene(yo,'permisos_granulares') && !enVerComo(yo);

async function cargar(){
  const [{ data, error }, { data: forms }] = await Promise.all([sb.rpc('ficha_usuario', { p_usuario: ID }), sb.from('formularios').select('id,titulo,icono,activo').order('orden')]);
  if(error){ $('#cab').innerHTML = `<p class="err">${esc(error.message)}</p>`; return; }
  F = data; FORMS = forms || []; const p = F.perfil, rol = F.rol || {}; const propio = p.id === yo.id; const protegido = !!rol.protegido;
  document.title = `${nombreCompleto(p)} · Administración`; $('#migaNombre').textContent = p.usuario;
  const avUrl = p.avatar_path ? sb.storage.from('avatares').getPublicUrl(p.avatar_path).data.publicUrl : null;
  const ini = (p.nombre || p.usuario || '?').trim().split(/\s+/).map(x => x[0]).slice(0,2).join('').toUpperCase();
  const puedoEditar = (tiene(yo,'usuarios') || tiene(yo,'asignar_roles')) && (!protegido || esSuperadmin(yo));
  $('#cab').innerHTML = `<div class="av">${avUrl ? `<img src="${esc(avUrl)}" alt="">` : esc(ini)}</div>
    <div><h1>${esc(nombreCompleto(p))}</h1><div class="sub">@${esc(p.usuario)} · ${esc(rol.nombre || 'Sin rol')}${rol.rango_pm ? ' · ' + esc(rol.rango_pm) : ''} · <span class="tag ${p.activo?'on':'off'}">${p.activo?'Activo':'Inactivo'}</span> <span class="tag ${(p.activo && p.visible!==false)?'on':'off'}">${p.visible===false?'Oculto en formularios':'Visible en formularios'}</span>${protegido ? ' <span class="tag" style="background:var(--avisobg);color:#e0a92a">Administrador</span>' : ''}</div></div>
    <div class="acc">${puedoEditar ? `<a class="ghost sm" href="./#usuarios/editar/${esc(p.id)}" style="text-decoration:none;display:inline-block">✏️ Editar</a>` : ''}<a class="ghost sm" href="../expediente.html?id=${esc(p.id)}" style="text-decoration:none;display:inline-block">📁 Expediente</a>${(tiene(yo,'ver_como') && !enVerComo(yo) && !propio) ? `<button type="button" class="ghost sm" id="bVerComo">👁 Ver como</button>` : ''}${(tiene(yo,'reset_password') && !propio && puedoEditar) ? `<button type="button" class="ghost sm" id="bPass">🔑 Contraseña</button>` : ''}${(esSuperadmin(yo) && !propio && +F.mfa > 0) ? `<button type="button" class="ghost sm" id="bMfa">🔓 Quitar 2FA</button>` : ''}<a class="ghost sm" href="./#usuarios" style="text-decoration:none;display:inline-block">← Usuarios</a></div>`;
  const bv = $('#bVerComo'); if(bv) bv.onclick = async () => { if(!confirm(`Vas a ver la página como "${nombreCompleto(p)}" (solo lectura). Queda en la auditoría. ¿Continuar?`)) return; try{ await entrarVerComo(p.id); }catch(x){ alert(x.message); } };
  const bp = $('#bPass'); if(bp) bp.onclick = () => { $('#fReset').reset(); $('#rpErr').textContent=''; $('#dlgPass').showModal(); };
  const bm = $('#bMfa'); if(bm) bm.onclick = async () => { if(!confirm(`${p.usuario} tiene la verificación en dos pasos activa. ¿Quitarla? Podrá entrar solo con su contraseña. Queda en Auditoría.`)) return; const { data: r, error: e } = await sb.functions.invoke('reset-mfa', { body:{ usuario_id: p.id } }); if(e || !r || r.error){ toast('No se pudo quitar: '+(e ? e.message : (r&&r.error)||''), true); return; } toast('Verificación en dos pasos eliminada.'); cargar(); };
  $('#kvCuenta').innerHTML = [['Usuario', p.usuario], ['Correo de acceso', F.correo || '—'], ['Rol', rol.nombre || 'Sin rol'], ['Rango', p.rango || '—'], ['Rango PM', rol.rango_pm || '—'], ['Último acceso', fmt(F.ultimo_acceso)], ['Verificación 2 pasos', +F.mfa > 0 ? '🔐 Activa' : 'Desactivada'], ['En el Army desde', fmtD(p.creado_en)]].map(([k,v]) => `<span>${esc(k)}</span><span>${esc(String(v))}</span>`).join('');
  $('#kvAct').innerHTML = [['Reportes aprobados', F.reportes], ['Último reporte', fmtD(F.ultimo_reporte)], ['Advertencias activas', F.advertencias], ['Turnos próximos', F.turnos_proximos]].map(([k,v]) => `<span>${esc(k)}</span><span>${esc(String(v ?? 0))}</span>`).join('');
  $('#notas').value = p.notas_admin || ''; $('#notas').disabled = !PUEDE_GRAN || propio; $('#nGuardar').style.display = (PUEDE_GRAN && !propio) ? '' : 'none';
  // Permisos
  const porRol = rol.permisos || {}, extra = p.permisos_extra || {}, neg = p.permisos_negados || {}, efe = F.efectivos || {}, mios = yo.rol.permisos || {};
  const editable = PUEDE_GRAN && !propio && (!protegido || esSuperadmin(yo));
  $('#permNota').textContent = editable ? '' : (propio ? 'No puedes cambiar tus propios permisos.' : PUEDE_GRAN ? 'Solo el Administrador puede modificar a otro Administrador.' : 'Solo lectura: necesitas "Permisos granulares por usuario".');
  $('#tbPerm').innerHTML = PERMS.map(([k, n]) => { const r = !!porRol[k], x = !!extra[k], d = !!neg[k], e = !!efe[k]; const puedoDar = esSuperadmin(yo) || !!mios[k]; const bloqueado = k==='ver_como';
    return `<tr><td><b>${esc(n)}</b><br><span class="nota">${esc(k)}</span></td><td>${r ? '<span class="origen rol">rol</span>' : '<span class="nota">—</span>'}</td>
      <td>${bloqueado ? '<span class="nota">no aplica</span>' : `<input type="checkbox" data-extra="${k}" ${x?'checked':''} ${(editable && puedoDar) ? '' : 'disabled'} title="${puedoDar ? 'Otorgar aunque el rol no lo tenga' : 'No puedes otorgar un permiso que tú no tienes'}">`}</td>
      <td><input type="checkbox" data-neg="${k}" ${d?'checked':''} ${editable ? '' : 'disabled'} title="Quitar aunque el rol lo tenga"></td>
      <td class="efe" data-efe="${k}">${e ? '✅' : '—'}</td></tr>`; }).join('');
  const recalc = () => PERMS.forEach(([k]) => { const r = !!porRol[k], x = $(`[data-extra="${k}"]`)?.checked, d = $(`[data-neg="${k}"]`).checked; const e = (r || (x && k!=='ver_como')) && !d; $(`[data-efe="${k}"]`).textContent = e ? '✅' : '—'; });
  document.querySelectorAll('[data-extra],[data-neg]').forEach(c => c.onchange = recalc);
  $('#pGuardar').style.display = editable ? '' : 'none';
  // Formularios
  const fRol = rol.formularios || [], fExtra = p.formularios_extra || [], todos = fRol.includes('*'); const misF = yo.rol.formularios || [];
  $('#tbForm').innerHTML = FORMS.map(f => { const r = todos || fRol.includes(f.id), x = fExtra.includes(f.id); const puedoDar = esSuperadmin(yo) || misF.includes('*') || misF.includes(f.id);
    return `<tr><td>${esc(f.icono||'')} <b>${esc(f.titulo)}</b>${f.activo ? '' : ' <span class="nota">(oculto en el inicio)</span>'}<br><span class="nota">${esc(f.id)}</span></td><td>${r ? '<span class="origen rol">rol</span>' : '<span class="nota">—</span>'}</td>
      <td><input type="checkbox" data-fx="${f.id}" ${x?'checked':''} ${(editable && puedoDar && !r) ? '' : 'disabled'}></td><td class="efe" data-fe="${f.id}">${(r||x) ? '✅' : '—'}</td></tr>`; }).join('') || '<tr><td colspan=4 class="nota">Sin formularios</td></tr>';
  document.querySelectorAll('[data-fx]').forEach(c => c.onchange = () => { const r = todos || fRol.includes(c.dataset.fx); $(`[data-fe="${c.dataset.fx}"]`).textContent = (r || c.checked) ? '✅' : '—'; });
  $('#fGuardar').style.display = editable ? '' : 'none';
  // Historial
  const ACC = { insert:'Creó', update:'Modificó', delete:'Eliminó', reset_password:'Restableció contraseña', ver_como_inicio:'Empezó a ver como', ver_como_fin:'Dejó de ver como', sancion_advertencia:'Advertencia', sancion_sancion:'Sanción', sancion_anulada:'Anuló sanción', permisos_granulares:'Cambió permisos granulares', mfa_reset:'Quitó 2FA', avatar:'Cambió la foto', login_inactivo:'Intento de acceso inactivo' };
  const sinEmoji = t => String(t).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu,'');
  $('#actividad').innerHTML = (F.auditoria||[]).map(a => `<div class="act"><b>${esc(ACC[a.accion]||a.accion)}</b> <span class="nota">${esc(a.tabla)}</span> — por ${esc(a.usuario||'sistema')}<div class="f">${fmt(a.en)} · ${esc(sinEmoji(JSON.stringify(a.detalle||{})).slice(0,160))}</div></div>`).join('') || '<p class="nota">Sin registros.</p>';
}
await cargar();

async function guardarGranular(){
  const extra = {}, neg = {}; document.querySelectorAll('[data-extra]').forEach(c => { if(c.checked) extra[c.dataset.extra] = true; }); document.querySelectorAll('[data-neg]').forEach(c => { if(c.checked) neg[c.dataset.neg] = true; });
  const forms = [...document.querySelectorAll('[data-fx]')].filter(c => c.checked).map(c => c.dataset.fx);
  const { error } = await sb.rpc('fijar_permisos_usuario', { p_usuario: ID, p_extra: extra, p_negados: neg, p_formularios: forms, p_notas: $('#notas').value });
  if(error) throw new Error(error.message);
}
$('#pGuardar').onclick = async () => { $('#pErr').textContent=''; try{ await guardarGranular(); toast('Permisos guardados.'); cargar(); }catch(x){ $('#pErr').textContent = x.message; } };
$('#fGuardar').onclick = async () => { $('#fErr').textContent=''; try{ await guardarGranular(); toast('Formularios guardados.'); cargar(); }catch(x){ $('#fErr').textContent = x.message; } };
$('#nGuardar').onclick = async () => { try{ await guardarGranular(); toast('Notas guardadas.'); }catch(x){ toast(x.message, true); } };
$('#fReset').onsubmit = async e => {
  e.preventDefault(); const err=$('#rpErr'); err.textContent='';
  const a=$('#rpPass').value, b=$('#rpPass2').value; if(a!==b){ err.textContent='Las contraseñas no coinciden.'; return; }
  const v=validarPassword(a); if(v){ err.textContent=v; return; }
  $('#rpOk').disabled=true;
  try{ const { data, error } = await sb.functions.invoke('reset-password', { body:{ usuario_id: ID, password: a } });
    if(error){ let m=error.message; try{ const j=await error.context.json(); if(j.error) m=j.error; }catch{} throw new Error(m); }
    if(data && data.error) throw new Error(data.error); $('#dlgPass').close(); toast('Contraseña restablecida.'); }
  catch(x){ err.textContent=x.message; }
  $('#rpOk').disabled=false;
};
