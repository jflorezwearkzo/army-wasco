// Ficha de formulario: configuración, canal de Discord, quién lo usa, reportes recientes, estadísticas e historial.
import { requerir, barraUsuario, tiene, sb, esc, nombreCompleto } from './auth.js';
const yo = await requerir(); barraUsuario(yo);
if(!['crear_reportes','gestion_reportes','disenar_formularios'].some(p => tiene(yo,p))){ document.querySelector('main').innerHTML = '<p class="err" style="padding:30px;text-align:center">No tienes permiso para ver fichas de formularios.</p>'; throw new Error('sin permiso'); }
const $ = s => document.querySelector(s);
const ID = new URLSearchParams(location.search).get('id') || '';
const fmt = iso => iso ? new Date(iso).toLocaleString('es-CO') : '—';
const fmtD = iso => iso ? String(iso).slice(0,10).split('-').reverse().join('-') : '—';
let toastT=null; const toast = (t, err=false) => { const e=$('#toast'); e.textContent=t; e.className='toast on'+(err?' err':''); clearTimeout(toastT); toastT=setTimeout(()=>e.classList.remove('on'),3200); };
document.querySelectorAll('#pestanas button').forEach(b => b.onclick = () => { document.querySelectorAll('#pestanas button').forEach(x => x.classList.toggle('on', x===b)); document.querySelectorAll('main section').forEach(s => s.classList.toggle('on', s.id==='p-'+b.dataset.p)); });
const GEST = tiene(yo,'gestion_reportes');
let F = null;

async function cargar(){
  const [{ data: f, error }, { data: roles }, { data: extra }, { data: dc }, { data: reps }, { data: aud }] = await Promise.all([
    sb.from('formularios').select('*').eq('id', ID).maybeSingle(), sb.from('roles').select('id,nombre,formularios').order('nombre'),
    sb.from('perfiles').select('id,usuario,nombre,rango').contains('formularios_extra', [ID]).order('usuario'),
    GEST ? sb.from('formularios_discord').select('webhook,activo').eq('formulario_id', ID).maybeSingle() : Promise.resolve({ data:null }),
    tiene(yo,'historial') ? sb.from('reportes_vista').select('id,folio,fecha,usuario,usuario_nombre,usuario_rango,resumen,estado,creado_en').eq('formulario_id', ID).order('id',{ascending:false}).limit(25) : Promise.resolve({ data:null }),
    sb.from('auditoria').select('en,usuario,accion,detalle').eq('tabla','formularios').eq('registro', ID).order('id',{ascending:false}).limit(40)]);
  if(error || !f){ $('#cab').innerHTML = `<p class="err">${esc(error ? error.message : 'Formulario no encontrado')}</p>`; return; }
  F = f; document.title = `${f.titulo} · Administración`; $('#migaNombre').textContent = f.titulo;
  $('#cab').innerHTML = `<div class="av">${esc(f.icono||'📋')}</div><div><h1>${esc(f.titulo)}</h1><div class="sub"><code>${esc(f.id)}</code> · <span class="tag ${f.activo?'on':'off'}">${f.activo?'Visible en el inicio':'Oculto'}</span>${f.requiere_aprobacion ? ' <span class="tag" style="background:var(--avisobg);color:#e0a92a">Con revisión</span>' : ''}${f.definicion ? ` <span class="tag">Plantilla v${f.version||1}</span>` : ''}</div></div>
    <div class="acc"><a class="ghost sm" href="../${esc(f.ruta)}" target="_blank" style="text-decoration:none;display:inline-block">↗ Abrir</a>${(f.definicion && tiene(yo,'disenar_formularios')) ? `<a class="ghost sm" href="disenador.html?id=${esc(f.id)}" style="text-decoration:none;display:inline-block">🎨 Diseñar</a>` : ''}${GEST ? `<button type="button" class="ghost sm" id="bActivo">${f.activo?'🙈 Ocultar del inicio':'👁 Mostrar en el inicio'}</button><button type="button" class="ghost sm" id="bEliminar">🗑 Eliminar del catálogo</button>` : ''}<a class="ghost sm" href="./#formularios" style="text-decoration:none;display:inline-block">← Formularios</a></div>`;
  const ba = $('#bActivo'); if(ba) ba.onclick = async () => { const { error: e } = await sb.from('formularios').update({ activo: !f.activo }).eq('id', ID); if(e){ toast(e.message, true); return; } toast(f.activo ? 'Oculto del inicio.' : 'Visible en el inicio.'); cargar(); };
  const be = $('#bEliminar'); if(be) be.onclick = async () => { if(!confirm(`¿Eliminar "${f.titulo}" del catálogo? Los reportes del historial se conservan.`)) return; const { error: e } = await sb.from('formularios').delete().eq('id', ID); if(e){ toast(e.message, true); return; } location.href = './#formularios'; };
  $('#kvForm').innerHTML = [['Identificador', f.id], ['Ruta', f.ruta], ['Orden', f.orden], ['Creado', fmtD(f.creado_en)], ['Plantilla', f.definicion ? `Diseñador · v${f.version||1} · ${(f.definicion.campos||[]).length} campos` : 'Página propia (repositorio)'], ['Aprobación', f.requiere_aprobacion ? 'Requiere revisor' : 'Inmediata']].map(([k,v]) => `<span>${esc(k)}</span><span>${esc(String(v ?? '—'))}</span>`).join('');
  // Estadísticas
  if(tiene(yo,'historial')){
    const { data: st } = await sb.from('reportes_vista').select('id,fecha,estado,usuario').eq('formulario_id', ID).limit(5000);
    const L = st||[], apr = L.filter(r => r.estado==='aprobado'); const hace30 = new Date(Date.now()-30*864e5).toISOString().slice(0,10); const top = {}; apr.forEach(r => top[r.usuario] = (top[r.usuario]||0)+1);
    const t3 = Object.entries(top).sort((a,b) => b[1]-a[1]).slice(0,3).map(([u,n]) => `${u} (${n})`).join(', ');
    $('#kvStats').innerHTML = [['Reportes aprobados', apr.length], ['Pendientes', L.filter(r => r.estado==='pendiente').length], ['Rechazados', L.filter(r => r.estado==='rechazado').length], ['Últimos 30 días', apr.filter(r => r.fecha >= hace30).length], ['Último', fmtD(apr.map(r => r.fecha).sort().pop())], ['Quién más reporta', t3 || '—']].map(([k,v]) => `<span>${esc(k)}</span><span>${esc(String(v))}</span>`).join('');
  } else $('#kvStats').innerHTML = '<span class="nota" style="grid-column:1/-1">Necesitas "Ver historial" para ver estadísticas.</span>';
  // Configuración
  $('#cTitulo').value = f.titulo; $('#cIcono').value = f.icono || ''; $('#cOrden').value = f.orden ?? 100; $('#cDesc').value = f.descripcion || ''; $('#cRuta').value = f.ruta || ''; $('#cActivo').checked = !!f.activo; $('#cAprob').checked = !!f.requiere_aprobacion;
  ['#cTitulo','#cIcono','#cOrden','#cDesc','#cRuta','#cActivo','#cAprob'].forEach(x => $(x).disabled = !GEST); $('#cGuardar').style.display = GEST ? '' : 'none'; $('#cfgNota').textContent = GEST ? '' : 'Solo lectura: necesitas "Gestión de reportes".';
  // Discord
  $('#dWebhook').value = dc ? (dc.webhook||'') : ''; $('#dOn').checked = dc ? dc.activo !== false : true; ['#dWebhook','#dOn'].forEach(x => $(x).disabled = !GEST); $('#dGuardar').style.display = GEST ? '' : 'none'; $('#dProbar').style.display = GEST ? '' : 'none'; if(!GEST) $('#dMsg').textContent = 'Solo "Gestión de reportes" puede ver o cambiar el webhook.';
  // Acceso
  const conRol = (roles||[]).filter(r => (r.formularios||[]).includes('*') || (r.formularios||[]).includes(ID));
  $('#acceso').innerHTML = `<p style="margin:0 0 6px"><b>Roles:</b> ${conRol.map(r => `<a href="rol.html?id=${esc(r.id)}" class="tag on" style="text-decoration:none">${esc(r.nombre)}${(r.formularios||[]).includes('*') ? ' (todos)' : ''}</a>`).join(' ') || '<span class="nota">ningún rol</span>'}</p>
    <p style="margin:0"><b>Usuarios con acceso extra:</b> ${(extra||[]).map(u => `<a href="usuario.html?id=${esc(u.id)}" class="tag" style="text-decoration:none">${esc(nombreCompleto(u))}</a>`).join(' ') || '<span class="nota">ninguno</span>'}</p>`;
  // Reportes
  $('#tbRep').innerHTML = reps === null ? '<tr><td colspan=5 class="nota">Necesitas "Ver historial".</td></tr>' : (reps||[]).map(r => `<tr><td><b>${esc(r.folio||r.id)}</b></td><td>${fmtD(r.fecha)}</td><td>${esc(r.usuario||'')}<br><span class="nota">${esc([r.usuario_rango, r.usuario_nombre].filter(Boolean).join(' '))}</span></td><td>${esc(r.resumen||'')}</td><td>${r.estado==='pendiente' ? '<span class="tag pend" style="background:var(--avisobg);color:#e0a92a">Pendiente</span>' : r.estado==='rechazado' ? '<span class="tag off">Rechazado</span>' : '<span class="tag on">Aprobado</span>'}</td></tr>`).join('') || '<tr><td colspan=5 class="nota">Sin reportes.</td></tr>';
  const sinEmoji = t => String(t).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu,'');
  $('#actividad').innerHTML = (aud||[]).map(a => `<div class="act"><b>${esc({insert:'Creó',update:'Modificó',delete:'Eliminó'}[a.accion]||a.accion)}</b> — por ${esc(a.usuario||'sistema')}<div class="f">${fmt(a.en)} · ${esc(sinEmoji(JSON.stringify(a.detalle||{})).slice(0,200))}</div></div>`).join('') || '<p class="nota">Sin registros.</p>';
}
await cargar();
$('#cGuardar').onclick = async () => { $('#cErr').textContent='';
  const cambios = { titulo: $('#cTitulo').value.trim(), icono: $('#cIcono').value.trim(), orden: parseInt($('#cOrden').value)||100, descripcion: $('#cDesc').value.trim(), ruta: $('#cRuta').value.trim(), activo: $('#cActivo').checked, requiere_aprobacion: $('#cAprob').checked };
  if(!cambios.titulo || !cambios.ruta){ $('#cErr').textContent='Título y ruta son obligatorios.'; return; }
  const { error } = await sb.from('formularios').update(cambios).eq('id', ID); if(error){ $('#cErr').textContent = error.message; return; } toast('Configuración guardada.'); cargar(); };
async function guardarDiscord(){ const w = $('#dWebhook').value.trim();
  if(!w){ await sb.from('formularios_discord').delete().eq('formulario_id', ID); return true; }
  if(!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(w)){ $('#dMsg').textContent='El webhook debe ser un enlace de Discord.'; return false; }
  const { error } = await sb.from('formularios_discord').upsert({ formulario_id: ID, webhook: w, activo: $('#dOn').checked, actualizado_en: new Date().toISOString() }); if(error){ $('#dMsg').textContent = error.message; return false; } return true; }
$('#dGuardar').onclick = async () => { $('#dMsg').textContent=''; if(await guardarDiscord()) toast('Canal guardado.'); };
$('#dProbar').onclick = async () => { $('#dMsg').textContent=''; if(!(await guardarDiscord())) return; $('#dMsg').textContent='Enviando…'; const { data, error } = await sb.functions.invoke('notificar-discord', { body:{ formulario_id: ID, prueba: true } }); $('#dMsg').textContent = error ? 'Error: '+error.message : (data&&data.ok) ? '✅ Mensaje de prueba enviado.' : 'Error: '+((data&&data.error)||'sin respuesta'); };
