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

$('#tz').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || '—';
await cargar();
setInterval(tick, 1000);
