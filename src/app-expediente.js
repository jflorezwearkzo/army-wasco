// Expediente por integrante: perfil, KPIs, sanciones, ascensos y reportes. ?id=<uuid> (sin id: el propio).
import { requerir, barraUsuario, tiene, sb, esc, nombreCompleto, urlImagen, RANGOS, avisoDiscord, hoyISO, cargarFoto, esSuperadmin, badgeIA } from './auth.js';
const yo = await requerir(); barraUsuario(yo);
const $ = s => document.querySelector(s);
const ID = new URLSearchParams(location.search).get('id') || yo.id;
const PROPIO = ID === yo.id;
const fmt = iso => iso ? String(iso).slice(0,10).split('-').reverse().join('-') : '—';
const dias = iso => iso ? Math.max(0, Math.floor((Date.now() - new Date(iso+'T00:00:00')) / 864e5)) : 0;
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => document.getElementById(b.dataset.close).close());
let E = null;

async function cargar(){
  const { data, error } = await sb.rpc('expediente', { p_usuario: ID });
  if(error){ $('#cab').innerHTML = `<p class="err">${esc(error.message)}</p>`; return; }
  E = data; const p = E.perfil, s = E.stats || {}, rol = E.rol || {};
  document.title = `Expediente · ${nombreCompleto(p)} · Policía Militar`;
  const ini = (p.nombre || p.usuario || '?').trim().split(/\s+/).map(x => x[0]).slice(0,2).join('').toUpperCase();
  const puedoAvatar = PROPIO || tiene(yo,'usuarios');
  const avUrl = p.avatar_path ? sb.storage.from('avatares').getPublicUrl(p.avatar_path).data.publicUrl + '?v=' + encodeURIComponent(p.avatar_path.split('/').pop()) : null;
  $('#cab').innerHTML = `<div class="cab"><div><div class="av ${puedoAvatar?'editable':''}" id="avatar" title="${puedoAvatar?'Cambiar la foto del personaje':''}">${avUrl ? `<img src="${esc(avUrl)}" alt="">` : esc(ini)}</div>${puedoAvatar ? '<div class="av-nota">Foto del personaje en el RP, no de la vida real.</div>' : ''}</div>
    <div><h1>${esc(nombreCompleto(p))}</h1><div class="sub">@${esc(p.usuario)} · ${esc(rol.nombre || 'Sin rol')}${rol.rango_pm ? ' · ' + esc(rol.rango_pm) : ''} · <span class="tag ${p.activo?'on':'off'}">${p.activo?'Activo':'Inactivo'}</span></div>
      <div class="sub">Rango <b style="color:var(--text)">${esc(p.rango || 'sin rango')}</b> desde ${fmt(E.en_rango_desde)} (${dias(E.en_rango_desde)} días) · En el Army desde ${fmt(p.creado_en)}</div></div>
    <div class="acc">${PROPIO ? '' : `<a class="ghost sm" href="admin/#usuarios/editar/${esc(p.id)}" style="text-decoration:none;display:inline-block">Editar usuario</a>`}${(!PROPIO && esSuperadmin(yo)) ? `<button type="button" class="ghost sm" id="btnMfa" title="Solo Administrador">🔓 Quitar 2FA</button>` : ''}<a class="ghost sm" href="${PROPIO?'cuenta.html':'admin/#usuarios'}" style="text-decoration:none;display:inline-block">← Volver</a></div></div>`;
  if(puedoAvatar) $('#avatar').onclick = abrirAvatar;
  const bm = $('#btnMfa'); if(bm) bm.onclick = async () => {
    const { data: q, error: e0 } = await sb.functions.invoke('reset-mfa', { body:{ usuario_id: ID, consultar: true } });
    if(e0 || !q || q.error){ alert('No se pudo consultar: ' + (e0 ? e0.message : (q && q.error) || 'sin respuesta')); return; }
    if(!q.factores){ alert(`${p.usuario} no tiene verificación en dos pasos activa.`); return; }
    if(!confirm(`${p.usuario} tiene la verificación en dos pasos activa. ¿Quitarla? Podrá entrar solo con su contraseña y volver a configurarla. Queda en Auditoría.`)) return;
    const { data, error } = await sb.functions.invoke('reset-mfa', { body:{ usuario_id: ID } });
    alert(error || !data || data.error ? 'No se pudo quitar: ' + (error ? error.message : (data && data.error) || 'sin respuesta') : `Verificación en dos pasos eliminada (${data.quitados} factor(es)).`);
  };
  const adv = +E.advertencias_activas || 0;
  $('#kpis').innerHTML = [
    ['Reportes aprobados', s.reportes], ['Últimos 30 días', s.ultimos_30], ['Bajas', s.bajas], ['Reclutamientos', s.reclutamientos], ['Patrullajes', s.patrullajes], ['AKs tomados', s.aks],
    ['Participaciones', E.participaciones, 'Como integrante en patrullajes y tomas de otros'], ['Advertencias activas', adv, '3 advertencias = expulsión', adv >= 3], ['Pendientes / rechazados', `${s.pendientes||0} / ${s.rechazados||0}`],
  ].map(([t, v, tip, al]) => `<div class="kpi ${al?'alerta':''}" title="${esc(tip||'')}"><b>${esc(String(v ?? 0))}</b><span>${esc(t)}</span></div>`).join('');
  $('#alerta').innerHTML = adv >= 3 ? `<div class="alerta3">⚠️ ${esc(nombreCompleto(p))} acumula ${adv} advertencias activas: según el reglamento corresponde la expulsión.</div>` : '';
  // Sanciones
  const puedoSancionar = tiene(yo,'sanciones') && !PROPIO;
  $('#btnSancion').style.display = puedoSancionar ? '' : 'none';
  $('#sanciones').innerHTML = (E.sanciones||[]).map(x => `<div class="item ${x.activa?'':'inactiva'}"><span class="tipo ${esc(x.tipo)}">${esc(x.tipo)}</span>${esc(x.motivo)}${x.detalle ? `<div class="muted" style="font-size:13px;margin-top:3px">${esc(x.detalle)}</div>` : ''}
      <div class="f">${fmt(x.fecha)} · impuesta por ${esc(x.impuesta_por||'—')}${!x.activa ? ` · anulada por ${esc(x.anulada_por||'—')}: ${esc(x.motivo_anulacion||'')}` : ''}${(x.activa && puedoSancionar) ? ` · <a href="#" data-anular="${x.id}">anular</a>` : ''}</div></div>`).join('') || '<p class="muted">Sin sanciones. 🎖️</p>';
  document.querySelectorAll('[data-anular]').forEach(a => a.onclick = async e => { e.preventDefault(); const m = prompt('Motivo de la anulación:'); if(!m || !m.trim()) return; const { error } = await sb.rpc('anular_sancion', { p_id: +a.dataset.anular, p_motivo: m }); if(error) alert(error.message); cargar(); });
  // Ascensos
  $('#btnRango').style.display = (tiene(yo,'usuarios') && !PROPIO) ? '' : 'none';
  $('#ascensos').innerHTML = (E.ascensos||[]).map(x => `<div class="item"><b>${esc(x.rango_anterior||'sin rango')} → ${esc(x.rango_nuevo||'sin rango')}</b>${x.motivo ? `<div style="font-size:13px">${esc(x.motivo)}</div>` : ''}<div class="f">${fmt(x.fecha)} · ${esc(x.otorgado_por||'sistema')}</div></div>`).join('') || `<div class="item">Rango actual: <b>${esc(p.rango||'sin rango')}</b><div class="f">Sin cambios registrados</div></div>`;
  // Reportes
  const reps = E.reportes_recientes || []; $('#repN').textContent = reps.length ? `últimos ${reps.length}` : '';
  const verImg = PROPIO || tiene(yo,'historial') || tiene(yo,'aprobar_reportes');
  $('#tbRep').innerHTML = reps.map(r => `<tr><td><b>${esc(r.folio||r.id)}</b></td><td>${fmt(r.fecha)}</td><td>${esc(r.formulario||r.formulario_id)}</td><td>${esc(r.resumen||'')}</td>
    <td>${r.estado==='pendiente' ? '<span class="tag" style="background:var(--avisobg);color:#e0a92a">Pendiente</span>' : r.estado==='rechazado' ? '<span class="tag off">Rechazado</span>' : '<span class="tag on">Aprobado</span>'}${(r.imagen_path && (tiene(yo,'aprobar_reportes') || tiene(yo,'historial'))) ? `<br>${badgeIA(r)}` : ''}</td>
    <td>${(r.imagen_path && verImg) ? `<button class="ghost sm" data-img="${esc(r.imagen_path)}" data-n="reporte-${esc(r.folio||r.id)}.${esc((r.imagen_path||'png').split('.').pop())}">Ver</button>` : ''}</td></tr>`).join('') || '<tr><td colspan=6 class="muted">Sin reportes</td></tr>';
  document.querySelectorAll('[data-img]').forEach(b => b.onclick = async () => { try{ const u = await urlImagen(b.dataset.img); $('#dlgImg').src = u; $('#dlgDl').href = u; $('#dlgDl').download = b.dataset.n; $('#dlg').showModal(); }catch(x){ alert(x.message); } });
}
await cargar();

// ---- Registrar sanción ----
$('#btnSancion').onclick = () => { $('#fSancion').reset(); $('#sFecha').value = hoyISO(); $('#sErr').textContent=''; $('#dlgSancion').showModal(); };
$('#fSancion').onsubmit = async e => {
  e.preventDefault(); $('#sErr').textContent=''; $('#sGuardar').disabled = true;
  const tipo = $('#sTipo').value, motivo = $('#sMotivo').value.trim();
  const { data, error } = await sb.rpc('registrar_sancion', { p_usuario: ID, p_tipo: tipo, p_motivo: motivo, p_detalle: $('#sDetalle').value.trim() || null, p_fecha: $('#sFecha').value || null });
  $('#sGuardar').disabled = false;
  if(error){ $('#sErr').textContent = error.message; return; }
  $('#dlgSancion').close();
  const p = E.perfil, n = +data.advertencias_activas || 0, quien = nombreCompleto(p);
  const titulo = { advertencia:'⚠️ Advertencia', sancion:'⛔ Sanción', suspension:'⏸️ Suspensión', expulsion:'🚫 Expulsión' }[tipo] || tipo;
  avisoDiscord('avisos', { embed: { title: `${titulo} · ${quien}`, description: motivo, color: tipo==='advertencia' ? 0xe0a92a : 0xe03a3a,
    fields: [{ name:'Impuesta por', value: nombreCompleto(yo), inline:true }, ...(tipo==='advertencia' ? [{ name:'Advertencias activas', value: `${n} de 3`, inline:true }] : [])],
    footer: { text: n >= 3 && tipo==='advertencia' ? 'Ha alcanzado 3 advertencias: corresponde la expulsión según el reglamento.' : 'Policía Militar · Army de Wasco' } } });
  if(tipo==='advertencia' && n >= 3) alert(`${quien} acumula ${n} advertencias activas. Según el reglamento corresponde la expulsión.`);
  cargar();
};

// ---- Cambiar rango ----
$('#btnRango').onclick = () => { const p = E.perfil; $('#rRango').innerHTML = '<option value="">— Sin rango —</option>' + RANGOS.map(r => `<option ${r===p.rango?'selected':''}>${esc(r)}</option>`).join(''); $('#rMotivo').value=''; $('#rErr').textContent=''; $('#dlgRango').showModal(); };
$('#fRango').onsubmit = async e => {
  e.preventDefault(); $('#rErr').textContent=''; $('#rGuardar').disabled = true;
  const { data, error } = await sb.rpc('cambiar_rango', { p_usuario: ID, p_rango: $('#rRango').value, p_motivo: $('#rMotivo').value.trim() || null });
  $('#rGuardar').disabled = false;
  if(error){ $('#rErr').textContent = error.message; return; }
  $('#dlgRango').close();
  const sube = RANGOS.indexOf(data.rango_nuevo) > RANGOS.indexOf(data.rango_anterior);
  avisoDiscord('avisos', { embed: { title: `${sube ? '🎖️ Ascenso' : '🔻 Cambio de rango'} · ${E.perfil.nombre || E.perfil.usuario}`, description: `${data.rango_anterior || 'Sin rango'} → **${data.rango_nuevo || 'Sin rango'}**${$('#rMotivo').value.trim() ? `\n${$('#rMotivo').value.trim()}` : ''}`, color: sube ? 0x2fa35a : 0x9aa7ad, fields: [{ name:'Otorgado por', value: nombreCompleto(yo), inline:true }] } });
  cargar();
};

// ---- Foto del personaje (avatar) ----
let AV_BLOB = null;
function abrirAvatar(){ AV_BLOB = null; $('#avArchivo').value=''; $('#avPrev').style.display='none'; $('#avGuardar').disabled = true; $('#avErr').textContent=''; $('#avQuitar').style.display = E.perfil.avatar_path ? '' : 'none'; $('#dlgAvatar').showModal(); }
$('#avArchivo').onchange = async e => {
  const f = e.target.files[0]; if(!f) return; $('#avErr').textContent='';
  try{ const img = await cargarFoto(f, 1024); const s = Math.min(img.naturalWidth||img.width, img.naturalHeight||img.height); const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const x = c.getContext('2d'); x.imageSmoothingQuality='high'; x.drawImage(img, ((img.naturalWidth||img.width)-s)/2, ((img.naturalHeight||img.height)-s)/2, s, s, 0, 0, 512, 512);
    let blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.9)); if(!blob || blob.type!=='image/webp') blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    AV_BLOB = blob; $('#avPrevImg').src = URL.createObjectURL(blob); $('#avPrev').style.display=''; $('#avGuardar').disabled = false; }
  catch(x){ $('#avErr').textContent = 'No se pudo leer la imagen.'; }
};
$('#avGuardar').onclick = async () => {
  if(!AV_BLOB) return; $('#avGuardar').disabled = true; $('#avErr').textContent='';
  const ext = AV_BLOB.type==='image/webp' ? 'webp' : 'jpg'; const path = `${ID}/${Date.now()}.${ext}`;
  const { error: e1 } = await sb.storage.from('avatares').upload(path, AV_BLOB, { contentType: AV_BLOB.type, upsert: true });
  if(e1){ $('#avErr').textContent = 'No se pudo subir: ' + e1.message; $('#avGuardar').disabled = false; return; }
  const anterior = E.perfil.avatar_path;
  const { error: e2 } = await sb.rpc('fijar_avatar', { p_usuario: ID, p_path: path });
  if(e2){ $('#avErr').textContent = e2.message; $('#avGuardar').disabled = false; return; }
  if(anterior) sb.storage.from('avatares').remove([anterior]).then(()=>{}, ()=>{});
  $('#dlgAvatar').close(); cargar();
};
$('#avQuitar').onclick = async () => {
  if(!confirm('¿Quitar la foto del personaje?')) return; const anterior = E.perfil.avatar_path;
  const { error } = await sb.rpc('fijar_avatar', { p_usuario: ID, p_path: null }); if(error){ $('#avErr').textContent = error.message; return; }
  if(anterior) sb.storage.from('avatares').remove([anterior]).then(()=>{}, ()=>{});
  $('#dlgAvatar').close(); cargar();
};
