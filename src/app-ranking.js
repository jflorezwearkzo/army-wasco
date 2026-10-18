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
  pintarTabla();
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
