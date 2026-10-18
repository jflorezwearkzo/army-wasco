  import { requerir, barraUsuario, puedeFormulario, sb, esc } from './auth.js';
  const yo = await requerir(); barraUsuario(yo);
  const fmt = iso => { if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}-${m}-${y}`; };
  const el = document.getElementById('lista');
  const { data: formularios, error } = await sb.from('formularios').select('*').eq('activo', true).order('orden');
  if(error){ el.innerHTML = `<p class="empty">No se pudo cargar la lista de reportes: ${esc(error.message)}</p>`; }
  else {
    const visibles = (formularios||[]).filter(f => puedeFormulario(yo, f.id));
    if(!visibles.length) el.innerHTML = '<p class="empty">No tienes formularios asignados. Pide acceso al administrador.</p>';
    else el.innerHTML = visibles.map(r => `<a class="card" href="${esc(r.ruta)}">
          <div class="ico">${esc(r.icono || '📋')}</div>
          <h2>${esc(r.titulo)}</h2>
          <p>${esc(r.descripcion || '')}</p>
          <div class="meta"><span>${r.creado_en ? 'Desde ' + fmt(r.creado_en.slice(0,10)) : ''}</span><span class="tag">Disponible</span></div>
        </a>`).join('');
  }

// ---- Tablón de anuncios y turnos ----
(async()=>{
  const fmtF = iso => iso ? String(iso).slice(0,10).split('-').reverse().join('-') : '';
  const hoy = new Date(); const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
  const en14 = new Date(hoy.getTime()+14*864e5); const en14ISO = `${en14.getFullYear()}-${String(en14.getMonth()+1).padStart(2,'0')}-${String(en14.getDate()).padStart(2,'0')}`;
  const [{ data: an }, { data: vis }, { data: tu }] = await Promise.all([
    sb.from('anuncios').select('id,titulo,cuerpo,fijado,publicado_en,expira_en,activo').eq('activo', true).order('fijado', { ascending:false }).order('publicado_en', { ascending:false }).limit(20),
    sb.from('anuncios_vistos').select('anuncio_id').eq('usuario_id', yo.id),
    sb.rpc('turnos_lista', { p_desde: hoyISO, p_hasta: en14ISO })
  ]);
  const vistos = new Set((vis||[]).map(v => v.anuncio_id));
  const anuncios = (an||[]).filter(a => !a.expira_en || new Date(a.expira_en) > hoy);
  const turnos = (tu||[]).filter(t => t.usuario_id === yo.id);
  if(!anuncios.length && !turnos.length) return;
  document.getElementById('tablon').style.display = '';
  const esc2 = esc;
  document.getElementById('anuncios').innerHTML = anuncios.map(a => `<div class="anu ${vistos.has(a.id)?'':'nuevo'}" data-a="${a.id}"><h4>${a.fijado?'📌 ':''}${esc2(a.titulo)}</h4><p>${esc2(a.cuerpo||'')}</p><div class="f">${fmtF(a.publicado_en)}${vistos.has(a.id)?'':' · <a data-leer="'+a.id+'">Marcar como leído</a>'}</div></div>`).join('') || '<p class="muted" style="margin:0">Sin anuncios por ahora.</p>';
  document.querySelectorAll('[data-leer]').forEach(x => x.onclick = async () => { await sb.from('anuncios_vistos').insert({ anuncio_id: +x.dataset.leer, usuario_id: yo.id }); const d = x.closest('.anu'); d.classList.remove('nuevo'); x.remove(); });
  const dia = iso => ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][new Date(iso+'T00:00:00').getDay()];
  document.getElementById('turnos').innerHTML = turnos.map(t => `<div class="turno"><b>${t.fecha===hoyISO?'HOY':dia(t.fecha)+' '+fmtF(t.fecha).slice(0,5)}</b><span>${String(t.hora_inicio).slice(0,5)}${t.hora_fin?'–'+String(t.hora_fin).slice(0,5):''}</span>${t.notas?`<span class="muted">· ${esc2(t.notas)}</span>`:''}${t.reporte?'<span title="Reporte de fin de día enviado">✅</span>':''}</div>`).join('') || '<p class="muted" style="margin:0">No tienes turnos asignados en los próximos 14 días.</p>';
})();
