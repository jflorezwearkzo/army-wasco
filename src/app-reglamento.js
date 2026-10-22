import { requerir, barraUsuario } from './auth.js';
const yo = await requerir(); barraUsuario(yo);

// Lo que es propio de otra organización no existe aquí
const ORG = (yo.org && yo.org.id) || '';
const deEstaOrg = e => !e.dataset.soloOrg || e.dataset.soloOrg === ORG;
const enlaces = [...document.querySelectorAll('#nav a[data-sec]')].filter(deEstaOrg);
const paneles = [...document.querySelectorAll('.sec-panel')].filter(deEstaOrg);
const sel = document.getElementById('navMovil');
let grupo = '';
for (const el of [...document.querySelectorAll('#nav .grp, #nav a[data-sec]')].filter(e => !e.hidden)) {
  if (el.classList.contains('grp')) { grupo = el.textContent; const og = document.createElement('optgroup'); og.label = grupo; sel.append(og); }
  else { const o = document.createElement('option'); o.value = el.dataset.sec; o.textContent = el.textContent.trim(); sel.lastElementChild.append(o); }
}
function mostrar(id, scroll = false) {
  if (!paneles.some(p => p.id === 'sec-' + id)) id = enlaces[0].dataset.sec;
  for (const p of paneles) p.hidden = p.id !== 'sec-' + id;
  for (const a of enlaces) a.classList.toggle('act', a.dataset.sec === id);
  sel.value = id;
  if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
}
for (const a of enlaces) a.addEventListener('click', e => { e.preventDefault(); history.replaceState(null, '', '#' + a.dataset.sec); mostrar(a.dataset.sec, true); });
sel.addEventListener('change', () => { history.replaceState(null, '', '#' + sel.value); mostrar(sel.value, true); });
window.addEventListener('hashchange', () => mostrar(location.hash.slice(1)));
mostrar(location.hash.slice(1));
