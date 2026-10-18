// Manuales de uso: cada sección declara los permisos que la habilitan (data-permisos="*" = todos).
// data-solo en bloques internos oculta pasos que requieren un permiso concreto (o "superadmin").
import { requerir, barraUsuario, tiene, esSuperadmin } from './auth.js';
const yo = await requerir(); barraUsuario(yo);
const puede = lista => lista === '*' || lista.split(',').some(p => tiene(yo, p.trim()));
const paneles = [...document.querySelectorAll('.sec-panel')].filter(p => { const ok = puede(p.dataset.permisos); if(!ok) p.remove(); return ok; });
for (const b of document.querySelectorAll('[data-solo]')) { const s = b.dataset.solo; if(!(s === 'superadmin' ? esSuperadmin(yo) : tiene(yo, s))) b.remove(); }
const nav = document.getElementById('nav'), sel = document.getElementById('navMovil'); let grupo = null, og = null;
for (const p of paneles) {
  if (p.dataset.grupo !== grupo) { grupo = p.dataset.grupo; nav.insertAdjacentHTML('beforeend', `<div class="grp">${grupo}</div>`); og = document.createElement('optgroup'); og.label = grupo; sel.append(og); }
  const id = p.id.replace(/^sec-/, '');
  nav.insertAdjacentHTML('beforeend', `<a href="#${id}" data-sec="${id}"><span>${p.dataset.icono}</span>${p.dataset.titulo}</a>`);
  const o = document.createElement('option'); o.value = id; o.textContent = p.dataset.titulo; og.append(o);
}
const enlaces = [...nav.querySelectorAll('a[data-sec]')];
function mostrar(id, scroll = false) {
  if (!paneles.some(p => p.id === 'sec-' + id)) id = enlaces[0] ? enlaces[0].dataset.sec : '';
  for (const p of paneles) p.hidden = p.id !== 'sec-' + id;
  for (const a of enlaces) a.classList.toggle('act', a.dataset.sec === id);
  sel.value = id; if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
}
for (const a of enlaces) a.addEventListener('click', e => { e.preventDefault(); history.replaceState(null, '', '#' + a.dataset.sec); mostrar(a.dataset.sec, true); });
sel.addEventListener('change', () => { history.replaceState(null, '', '#' + sel.value); mostrar(sel.value, true); });
window.addEventListener('hashchange', () => mostrar(location.hash.slice(1)));
mostrar(location.hash.slice(1));
