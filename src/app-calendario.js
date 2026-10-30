// Calendario de eventos diarios del servidor. El catálogo (actividades + horarios) es común a todas
// las organizaciones: las actividades con org_id NULL las ve cualquiera, y una organización puede
// tener además las suyas. Las horas se guardan en UTC y aquí se muestran también en la hora local.
import { requerir, barraUsuario, sb, esc } from './auth.js';
const yo = await requerir(); barraUsuario(yo);
const $ = s => document.querySelector(s);

const dosD = n => String(n).padStart(2, '0');
// "14:20:00" -> Date de hoy (local) con esa hora UTC
function fechaDeHoraUTC(hhmmss, diaExtra = 0){
  const [h, m] = String(hhmmss).split(':').map(Number);
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + diaExtra, h, m, 0));
}
const horaLocal = d => `${dosD(d.getHours())}:${dosD(d.getMinutes())}`;
const horaUTC = d => `${dosD(d.getUTCHours())}:${dosD(d.getUTCMinutes())}`;
function falta(ms){
  const t = Math.max(0, Math.round(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h} h ${dosD(m)} min` : m ? `${m} min ${dosD(s)} s` : `${s} s`;
}

let SLOTS = [];                      // { act, hora_utc, etiqueta } ordenados por hora UTC
async function cargar(){
  const { data: actos, error } = await sb.from('actividades').select('id,nombre,icono,descripcion,orden').eq('activo', true).order('orden');
  if(error){ $('#err').textContent = error.message; return; }
  const ids = (actos || []).map(a => a.id);
  if(!ids.length){ $('#lista').innerHTML = '<p class="muted">Todavía no hay actividades en el calendario.</p>'; $('#prox').innerHTML = ''; return; }
  const { data: hs, error: e2 } = await sb.from('actividades_horarios').select('actividad_id,hora_utc,etiqueta').in('actividad_id', ids).eq('activo', true).order('hora_utc');
  if(e2){ $('#err').textContent = e2.message; return; }

  SLOTS = [];
  $('#lista').innerHTML = (actos || []).map(a => {
    // Se listan en orden de la hora local de quien mira (el día tal como lo vive), aunque por dentro
    // el "siguiente evento" se calcula con las horas UTC en orden absoluto.
    const mios = (hs || []).filter(h => h.actividad_id === a.id)
      .sort((x, y) => horaLocal(fechaDeHoraUTC(x.hora_utc)).localeCompare(horaLocal(fechaDeHoraUTC(y.hora_utc))));
    mios.forEach(h => SLOTS.push({ act: a, hora_utc: h.hora_utc, etiqueta: h.etiqueta }));
    return `<section class="act"><h3>${esc(a.icono || '•')} ${esc(a.nombre)}</h3>
      ${a.descripcion ? `<p class="des">${esc(a.descripcion)}</p>` : ''}
      <div class="slots">${mios.map(h => {
        const d = fechaDeHoraUTC(h.hora_utc);
        return `<div class="slot" data-h="${esc(h.hora_utc)}" data-a="${a.id}">
          <span class="hl">${horaLocal(d)}</span>
          <span class="hu">${horaUTC(d)} UTC · servidor</span>
          ${h.etiqueta ? `<span class="et">${esc(h.etiqueta)}</span>` : ''}
        </div>`;
      }).join('') || '<p class="muted" style="margin:0">Sin horario fijo.</p>'}</div></section>`;
  }).join('');
  SLOTS.sort((a, b) => String(a.hora_utc).localeCompare(String(b.hora_utc)));
  tick();
}

// Marca lo que ya pasó, resalta el siguiente y actualiza la cuenta atrás cada segundo.
function tick(){
  if(!SLOTS.length) return;
  const ahora = Date.now();
  let sig = null;
  for(const s of SLOTS){ const d = fechaDeHoraUTC(s.hora_utc); if(d.getTime() > ahora){ sig = { s, d }; break; } }
  if(!sig){ const s = SLOTS[0]; sig = { s, d: fechaDeHoraUTC(s.hora_utc, 1) }; }   // ya pasaron todos: el primero de mañana

  document.querySelectorAll('.slot').forEach(el => {
    const d = fechaDeHoraUTC(el.dataset.h);
    const esSig = +el.dataset.a === sig.s.act.id && el.dataset.h === sig.s.hora_utc;
    el.classList.toggle('ya', d.getTime() <= ahora && !esSig);
    el.classList.toggle('sig', esSig);
  });
  $('#prox').innerHTML = `<h3>Lo siguiente</h3>
    <p class="gr" style="margin:0">${esc(sig.s.act.icono || '')} ${esc(sig.s.act.nombre)}${sig.s.etiqueta ? ` · <span style="color:var(--gold)">${esc(sig.s.etiqueta)}</span>` : ''}</p>
    <p style="margin:4px 0 0">${horaLocal(sig.d)} tu hora · <span class="muted">${horaUTC(sig.d)} UTC del servidor</span></p>
    <p style="margin:4px 0 0">Empieza en <b class="cuenta">${falta(sig.d.getTime() - ahora)}</b></p>`;
}

// ====================== AGENDA (eventos puntuales) ======================
// Reuniones, operaciones especiales… Tienen fecha, hora y lugar, y cada quien confirma si va.
// Los horarios fijos del servidor (entrega aérea, arsenal) son otra cosa y no se tocan desde aquí.
let AGENDA = [];
const fechaLarga = d => d.toLocaleString('es-CO', { weekday:'long', day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' });

async function cargarAgenda(){
  const desde = new Date(Date.now() - 6 * 3600 * 1000).toISOString();   // los de hace un rato siguen a la vista
  const { data, error } = await sb.from('agenda_eventos')
    .select('id,titulo,descripcion,lugar,inicia_en,duracion_min,cancelado')
    .gte('inicia_en', desde).order('inicia_en').limit(20);
  if(error || !data || !data.length){ $('#agenda').innerHTML = ''; return; }
  AGENDA = data;
  const ids = data.map(e => e.id);
  const [{ data: resp }, { data: mias }] = await Promise.all([
    sb.from('agenda_asistencia').select('evento_id,respuesta').in('evento_id', ids),
    sb.from('agenda_asistencia').select('evento_id,respuesta').in('evento_id', ids).eq('usuario_id', yo.id),
  ]);
  const cuenta = {}, mia = {};
  (resp || []).forEach(r => { cuenta[r.evento_id] = cuenta[r.evento_id] || { si:0, no:0 }; cuenta[r.evento_id][r.respuesta]++; });
  (mias || []).forEach(r => mia[r.evento_id] = r.respuesta);

  $('#agenda').innerHTML = '<h2>📌 Próximos eventos</h2>' + data.map(e => {
    const d = new Date(e.inicia_en), c = cuenta[e.id] || { si:0, no:0 }, m = mia[e.id];
    return `<article class="ev${e.cancelado ? ' cancelado' : ''}">
      <h3>${e.cancelado ? '🚫 ' : ''}${esc(e.titulo)}${e.cancelado ? ' <span class="muted" style="font-size:14px">(cancelado)</span>' : ''}</h3>
      <p class="cuando" style="margin:0"><b>${esc(fechaLarga(d))}</b> <span class="muted">tu hora</span></p>
      <p class="det">🕒 ${dosD(d.getUTCHours())}:${dosD(d.getUTCMinutes())} UTC del servidor${e.duracion_min ? ` · dura ${e.duracion_min} min` : ''}
        ${e.lugar ? `<br>📍 ${esc(e.lugar)}` : ''}</p>
      ${e.descripcion ? `<p class="des">${esc(e.descripcion)}</p>` : ''}
      ${e.cancelado ? '' : `<div class="resp" data-ev="${e.id}">
        <button type="button" class="ghost${m === 'si' ? ' on' : ''}" data-r="si">✅ Asisto</button>
        <button type="button" class="ghost${m === 'no' ? ' on' : ''}" data-r="no">❌ No puedo</button>
        <span class="conteo">${c.si} asisten · ${c.no} no pueden</span>
      </div>`}
    </article>`;
  }).join('');
  document.querySelectorAll('#agenda .resp button').forEach(b => b.onclick = () => responder(b.closest('.resp').dataset.ev, b.dataset.r));
}

async function responder(id, r){
  const { error } = await sb.rpc('agenda_responder', { p_id: +id, p_respuesta: r });
  if(error){ $('#err').textContent = error.message; return; }
  $('#err').textContent = '';
  await cargarAgenda();
  const ev = AGENDA.find(x => x.id === +id);
  if(ev) aviso(r === 'si' ? `Quedaste apuntado a «${ev.titulo}».` : `Anotado: no puedes ir a «${ev.titulo}».`);
}
function aviso(txt, mal = false){
  const c = $('#avisoResp'); c.textContent = txt; c.classList.toggle('mal', mal);
}
// Enlaces de Discord: calendario.html?evento=<id>&r=si|no  (si no hay sesión, el login devuelve aquí)
async function respuestaDesdeEnlace(){
  const p = new URLSearchParams(location.search), id = p.get('evento'), r = p.get('r');
  if(!id) return;
  if(r === 'si' || r === 'no'){
    const { data, error } = await sb.rpc('agenda_responder', { p_id: +id, p_respuesta: r });
    if(error) aviso('No se pudo registrar tu respuesta: ' + error.message, true);
    else { aviso(r === 'si' ? `✅ Listo, quedaste apuntado a «${data.titulo}».` : `❌ Anotado: no puedes ir a «${data.titulo}».`);
           await cargarAgenda(); }   // repinta con la respuesta recién guardada
  }
  history.replaceState(null, '', location.pathname);   // deja la dirección limpia
  const el = document.getElementById('agenda');
  if(el) el.scrollIntoView({ behavior:'smooth', block:'start' });
}

$('#tz').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || '—';
await cargar();
await cargarAgenda();
await respuestaDesdeEnlace();
setInterval(tick, 1000);
