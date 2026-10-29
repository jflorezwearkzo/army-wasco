// Ranking mensual (tablero de honor) e insignias. Visible para todos los integrantes activos.
import { requerir, barraUsuario, sb, esc, nombreCompleto } from './auth.js';
const yo = await requerir(); barraUsuario(yo);
const $ = s => document.querySelector(s);
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const CATS = [['reportes','📋 Más reportes'], ['bajas','🎯 Cazador del mes'], ['patrullajes','🚔 Más patrullajes'], ['reclutamientos','🪖 Mejor reclutador'], ['aks','🛡️ AKs tomados'], ['participaciones','🤝 Más participaciones']];
const NOMBRE_INS = { reportes:'📋 Más reportes', bajas:'🎯 Cazador del mes', patrullajes:'🚔 Más patrullajes', reclutamientos:'🪖 Mejor reclutador', participaciones:'🤝 Más participaciones' };
const hoy = new Date(); const sel = $('#mes');
for(let i=0;i<12;i++){ const d = new Date(hoy.getFullYear(), hoy.getMonth()-i, 1); const v = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; sel.insertAdjacentHTML('beforeend', `<option value="${v}">${MESES[d.getMonth()]} ${d.getFullYear()}${i===0?' (en curso)':''}</option>`); }
let FILAS = [], ORDEN = 'reportes';
async function cargar(){
  const { data, error } = await sb.rpc('ranking_mes', { p_mes: sel.value });
  if(error){ $('#err').textContent = error.message; return; } $('#err').textContent='';
  FILAS = (data||[]).map(r => ({ ...r, reportes:+r.reportes, bajas:+r.bajas, patrullajes:+r.patrullajes, reclutamientos:+r.reclutamientos, aks:+r.aks, participaciones:+r.participaciones, nombre: nombreCompleto(r) }));
  const activos = FILAS.filter(r => r.reportes || r.participaciones).length; $('#total').textContent = `${activos} integrante(s) con actividad`;
  $('#cats').innerHTML = CATS.map(([k, t]) => { const top = FILAS.filter(r => r[k] > 0).sort((a,b) => b[k]-a[k] || a.nombre.localeCompare(b.nombre)).slice(0,3);
    return `<div class="cat"><h3>${t}</h3>${top.map((r,i) => `<div class="pod ${r.usuario_id===yo.id?'yo':''}"><span class="m">${['🥇','🥈','🥉'][i]}</span><span class="n">${esc(r.nombre)}<small>@${esc(r.usuario)}</small></span><span class="v">${r[k]}</span></div>`).join('') || '<p class="vacio">Sin datos este mes.</p>'}</div>`; }).join('');
  pintarTabla(); pintarMiVista();
}
// Dónde va cada quien y qué le falta para subir un puesto
function pintarMiVista(){
  const caja = document.getElementById('mivista'); if(!caja) return;
  const mio = FILAS.find(r => r.usuario_id === yo.id);
  const filas = CATS.map(([k, t]) => {
    const orden = FILAS.filter(r => r[k] > 0).sort((a,b) => b[k]-a[k] || a.nombre.localeCompare(b.nombre));
    const valor = mio ? (mio[k] || 0) : 0;
    const i = orden.findIndex(r => r.usuario_id === yo.id);
    if(!orden.length && !valor) return '';
    let estado;
    if(i < 0) estado = `<span class="falta">Todavía no apareces. <b>1</b> te mete en la tabla.</span>`;
    else if(i === 0){ const seg = orden[1]; estado = seg
        ? `<span class="falta lider">🥇 Vas de primero, con <b>${valor - seg[k]}</b> de ventaja sobre ${esc(seg.nombre)}.</span>`
        : `<span class="falta lider">🥇 Vas de primero.</span>`; }
    else { const arriba = orden[i-1]; const falta = arriba[k] - valor + 1;
      estado = `<span class="falta">Te falta${falta===1?'':'n'} <b>${falta}</b> para pasar a ${esc(arriba.nombre)}${i===1?' y quedar de primero':` y subir al puesto ${i}`}.</span>`; }
    return `<div class="fila"><span class="cat-n">${t}</span>
      <span class="pos">${i >= 0 ? '#'+(i+1) : '—'}</span>
      <span class="val">${valor} este mes</span>${estado}</div>`;
  }).filter(Boolean).join('');
  caja.innerHTML = `<h3>Así vas tú · ${esc(nombreCompleto(yo))}</h3>` + (filas ||
    '<p class="muted" style="margin:0">Este mes todavía no hay actividad registrada.</p>');
}
function pintarTabla(){
  const lista = FILAS.filter(r => r.reportes || r.participaciones).sort((a,b) => ORDEN==='nombre' ? a.nombre.localeCompare(b.nombre) : (b[ORDEN]-a[ORDEN] || b.reportes-a.reportes));
  document.querySelectorAll('#tabla th').forEach(th => th.classList.toggle('on', th.dataset.k===ORDEN));
  $('#tb').innerHTML = lista.map((r,i) => `<tr class="${r.usuario_id===yo.id?'yo':''}"><td class="muted">${i+1}</td><td><b>${esc(r.nombre)}</b> <span class="muted">@${esc(r.usuario)}</span></td><td>${r.reportes}</td><td>${r.bajas}</td><td>${r.patrullajes}</td><td>${r.reclutamientos}</td><td>${r.aks}</td><td>${r.participaciones}</td></tr>`).join('') || '<tr><td colspan=8 class="muted">Nadie ha reportado este mes todavía.</td></tr>';
}
document.querySelectorAll('#tabla th').forEach(th => th.onclick = () => { if(th.dataset.k==='pos') return; ORDEN = th.dataset.k; pintarTabla(); });
sel.onchange = cargar; await cargar();
// Insignias
const { data: ins } = await sb.rpc('insignias_lista');
$('#insignias').innerHTML = (ins||[]).map(i => { const d = new Date(i.mes+'T00:00:00'); return `<span class="ins" title="${esc(NOMBRE_INS[i.tipo]||i.tipo)} · ${i.valor}"><b>${esc((NOMBRE_INS[i.tipo]||i.tipo).split(' ')[0])}</b> ${esc(nombreCompleto(i))} <small>${MESES[d.getMonth()].slice(0,3)} ${d.getFullYear()} · ${i.valor}</small></span>`; }).join('') || '<span class="muted">Aún no se han otorgado insignias. Se entregan el día 1 de cada mes.</span>';
