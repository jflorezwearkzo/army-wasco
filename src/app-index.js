  import { requerir, barraUsuario, puedeFormulario, sb, esc, avisoDiscord, nombreCompleto, rutaVisible } from './auth.js';
  import { pendientes } from './ruta-pasos.js';
  const yo = await requerir(); barraUsuario(yo);
  { const er = document.getElementById('enlaceRuta'); if(er) er.hidden = !rutaVisible(yo); }

  // ---- Aviso de ruta de aprendizaje sin terminar ----
  // Insiste cada vez que se entra al inicio, hasta que la termine.
  (async () => {
    if(!(yo.ruta && yo.ruta.activa)) return;                       // apagada para esta persona
    const dlg = document.getElementById('dlgRuta'); if(!dlg || !dlg.showModal) return;
    const { data, error } = await sb.rpc('mi_ruta', {});
    if(error || !data || !data.activa) return;
    const p = pendientes(data);
    if(!p) return;                                                  // ya la terminó
    const faltan = p.faltan.map(x => `<li>${esc(x.texto)}</li>`).join('')
      + (p.firmaPendiente ? '<li>Que el liderazgo firme esta etapa</li>' : '');
    document.getElementById('rutaCuerpo').innerHTML =
      `<p class="rprog">Llevas <b>${p.listos} de ${p.total}</b> pasos.</p>
       <p class="retapa">${esc(p.etapa.icono)} Etapa ${p.etapa.n} · ${esc(p.etapa.titulo)}</p>
       <ul>${faltan || '<li>Nada pendiente en esta etapa.</li>'}</ul>
       <p class="rpie">No es obligatorio ni tiene plazo: es una guía para que no se te escape nada al empezar.</p>`;
    dlg.showModal();
    const cerrar = () => dlg.close();
    document.getElementById('rutaCerrar').onclick = cerrar;
    document.getElementById('rutaLuego').onclick = cerrar;
  })().catch(() => {});
  const fmt = iso => { if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}-${m}-${y}`; };
  const el = document.getElementById('lista');
  const { data: formularios, error } = await sb.from('formularios').select('*').eq('activo', true).order('orden');
  if(error){ el.innerHTML = `<p class="empty">No se pudo cargar la lista de reportes: ${esc(error.message)}</p>`; }
  else {
    const visibles = (formularios||[]).filter(f => puedeFormulario(yo, f.id));
    if(!visibles.length) el.innerHTML = `<p class="empty">No tienes formularios asignados todavía.<br>
      <button type="button" id="pedirAcceso" class="primary" style="margin-top:12px;padding:8px 16px;font-size:14px">✋ Pedir acceso al liderazgo</button></p>`;
    else {
      // Lo que cada quien más usa va primero, y de cada formulario se recuerda su último reporte
      const mios = {}, ultimo = {};
      try{
        const { data } = await sb.from('reportes').select('id,formulario_id')
          .eq('usuario_id', yo.id).order('id', { ascending:false }).limit(300);
        for(const r of data || []){ mios[r.formulario_id] = (mios[r.formulario_id]||0) + 1;
          if(!ultimo[r.formulario_id]) ultimo[r.formulario_id] = r.id; }
      }catch(e){}
      visibles.sort((a,b) => (mios[b.id]||0) - (mios[a.id]||0) || (a.orden||100) - (b.orden||100));
      el.innerHTML = visibles.map(r => {
        const n = mios[r.id] || 0;
        return `<div class="item"><a class="card" href="${esc(r.ruta)}">
          <div class="ico">${esc(r.icono || '📋')}</div>
          <h2>${esc(r.titulo)}</h2>
          <p>${esc(r.descripcion || '')}</p>
          <div class="meta"><span>${n ? n + ' reporte(s) tuyo(s)' : (r.creado_en ? 'Desde ' + fmt(r.creado_en.slice(0,10)) : '')}</span><span class="tag">Disponible</span></div>
        </a>${ultimo[r.id] ? `<a class="rep" href="${esc(r.ruta)}${r.ruta.includes('?') ? '&' : '?'}repetir=${ultimo[r.id]}" title="Abre el formulario con los datos de tu último reporte">↻ Repetir</a>` : ''}</div>`;
      }).join('');
    }
  }
  // Avisar al liderazgo, sin tener que buscar a nadie por fuera
  const bp = document.getElementById('pedirAcceso');
  if(bp) bp.onclick = async () => {
    bp.disabled = true; const antes = bp.textContent; bp.textContent = 'Enviando…';
    const r = await avisoDiscord('solicitudes', { texto: `✋ **${nombreCompleto(yo)}** (usuario \`${yo.usuario}\`) pide acceso a los formularios de reporte.`, origen: { tabla:'perfiles', id: yo.id } });
    bp.textContent = r === 'ok' ? '✅ Aviso enviado al liderazgo' : antes;
    if(r !== 'ok'){ bp.disabled = false; alert('No se pudo avisar automáticamente. Escríbele a un Líder, Co-Líder o Auxiliar por Discord.'); }
  };

// ---- Cómo van mis reportes y mi turno de hoy ----
(async()=>{
  const caja = document.getElementById('avisos'); if(!caja) return;
  const hoy = new Date(); const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
  const avisos = [];
  try{
    const { data } = await sb.from('reportes_vista').select('id,folio,estado,formulario_id')
      .eq('usuario_id', yo.id).in('estado', ['pendiente','devuelto','rechazado']).order('id', { ascending:false }).limit(100);
    const n = e => (data||[]).filter(r => r.estado===e).length;
    const dev = n('devuelto'), pen = n('pendiente'), rec = n('rechazado');
    if(dev) avisos.push({ ojo:true, html:`✏️ Tienes <b>${dev}</b> reporte(s) <b>devuelto(s) para corregir</b>. Arréglalos y reenvíalos para que cuenten. <a href="cuenta.html#mis">Ver cuáles</a>` });
    if(rec) avisos.push({ html:`⛔ <b>${rec}</b> reporte(s) rechazado(s). <a href="cuenta.html#mis">Ver el motivo</a>` });
    if(pen) avisos.push({ html:`⏳ <b>${pen}</b> reporte(s) esperando revisión. <span class="sep">Cuentan para el ranking cuando los aprueben</span>` });
  }catch(e){}
  try{
    const { data: tu } = await sb.rpc('turnos_lista', { p_desde: hoyISO, p_hasta: hoyISO });
    const mio = (tu||[]).filter(t => t.usuario_id === yo.id);
    for(const t of mio){
      const h = String(t.hora_inicio||'').slice(0,5) + (t.hora_fin ? '–' + String(t.hora_fin).slice(0,5) : '');
      avisos.push({ ojo:!t.reporte, html: t.reporte
        ? `✅ Tu turno de hoy (<b>${h}</b>) ya tiene su reporte de patrullaje.`
        : `🚔 <b>Hoy tienes turno</b> a las <b>${h}</b>${t.notas ? ' · ' + esc(t.notas) : ''}. Recuerda enviar el reporte de patrullaje al terminar.` });
    }
  }catch(e){}
  // Dónde vas en el ranking del mes: la mejor posición que tengas
  try{
    const { data } = await sb.rpc('ranking_mes');
    const CAT = [['patrullajes','patrullajes'],['bajas','bajas'],['reportes','reportes'],['reclutamientos','reclutamientos'],['participaciones','participaciones'],['aks','AKs']];
    let mejor = null;
    for(const [k, nom] of CAT){
      const orden = (data||[]).filter(r => +r[k] > 0).sort((a,b) => b[k]-a[k]);
      const i = orden.findIndex(r => r.usuario_id === yo.id);
      if(i < 0) continue;
      const falta = i === 0 ? 0 : (+orden[i-1][k] - +orden[i][k] + 1);
      if(!mejor || i < mejor.i) mejor = { i, nom, falta, valor:+orden[i][k] };
    }
    if(mejor) avisos.push({ html: mejor.i === 0
      ? `🥇 Vas <b>de primero</b> en ${mejor.nom} este mes, con ${mejor.valor}. <a href="ranking.html">Ver el ranking</a>`
      : `🏅 Vas <b>#${mejor.i+1}</b> en ${mejor.nom} este mes. Te falta${mejor.falta===1?'':'n'} <b>${mejor.falta}</b> para subir un puesto. <a href="ranking.html">Ver el ranking</a>` });
  }catch(e){}
  if(avisos.length) caja.innerHTML = avisos.map(a => `<div class="av${a.ojo ? ' ojo' : ''}">${a.html}</div>`).join('');
})();

// ---- Tablón de anuncios y turnos ----
// La imagen puede estar en el bucket 'anuncios' o ser una URL absoluta (p. ej. una pieza publicada en el propio sitio).
const urlAnu = p => /^https?:\/\//.test(p) ? p : sb.storage.from('anuncios').getPublicUrl(p).data.publicUrl;
(async()=>{
  const fmtF = iso => iso ? String(iso).slice(0,10).split('-').reverse().join('-') : '';
  const hoy = new Date(); const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
  const en14 = new Date(hoy.getTime()+14*864e5); const en14ISO = `${en14.getFullYear()}-${String(en14.getMonth()+1).padStart(2,'0')}-${String(en14.getDate()).padStart(2,'0')}`;
  const [{ data: an }, { data: vis }, { data: tu }] = await Promise.all([
    sb.from('anuncios').select('id,titulo,cuerpo,fijado,publicado_en,expira_en,activo,imagen_path').eq('activo', true).order('fijado', { ascending:false }).order('publicado_en', { ascending:false }).limit(20),
    sb.from('anuncios_vistos').select('anuncio_id').eq('usuario_id', yo.id),
    sb.rpc('turnos_lista', { p_desde: hoyISO, p_hasta: en14ISO })
  ]);
  const vistos = new Set((vis||[]).map(v => v.anuncio_id));
  const anuncios = (an||[]).filter(a => !a.expira_en || new Date(a.expira_en) > hoy);
  const turnos = (tu||[]).filter(t => t.usuario_id === yo.id);
  if(!anuncios.length && !turnos.length) return;
  document.getElementById('tablon').style.display = '';
  const esc2 = esc;
  document.getElementById('anuncios').innerHTML = anuncios.map(a => `<div class="anu ${vistos.has(a.id)?'':'nuevo'}" data-a="${a.id}"><h4>${a.fijado?'📌 ':''}${esc2(a.titulo)}</h4>${a.imagen_path?`<a href="${esc2(urlAnu(a.imagen_path))}" target="_blank" rel="noopener"><img src="${esc2(urlAnu(a.imagen_path))}" alt="" style="max-width:100%;max-height:260px;border-radius:8px;border:1px solid var(--line2);display:block;margin:6px 0"></a>`:''}<p>${esc2(a.cuerpo||'')}</p><div class="f">${fmtF(a.publicado_en)}${vistos.has(a.id)?'':' · <a data-leer="'+a.id+'">Marcar como leído</a>'}</div></div>`).join('') || '<p class="muted" style="margin:0">Sin anuncios por ahora.</p>';
  document.querySelectorAll('[data-leer]').forEach(x => x.onclick = async () => { await sb.from('anuncios_vistos').insert({ anuncio_id: +x.dataset.leer, usuario_id: yo.id }); const d = x.closest('.anu'); d.classList.remove('nuevo'); x.remove(); });
  const dia = iso => ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][new Date(iso+'T00:00:00').getDay()];
  document.getElementById('turnos').innerHTML = turnos.map(t => `<div class="turno"><b>${t.fecha===hoyISO?'HOY':dia(t.fecha)+' '+fmtF(t.fecha).slice(0,5)}</b><span>${String(t.hora_inicio).slice(0,5)}${t.hora_fin?'–'+String(t.hora_fin).slice(0,5):''}</span>${t.notas?`<span class="muted">· ${esc2(t.notas)}</span>`:''}${t.reporte?'<span title="Reporte de patrullaje enviado">✅</span>':''}</div>`).join('') || '<p class="muted" style="margin:0">No tienes turnos asignados en los próximos 14 días.</p>';
})();
