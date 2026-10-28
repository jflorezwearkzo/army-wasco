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


// ---- Copiar cada macro con un botón ----
async function alPortapapeles(texto){
  try{ await navigator.clipboard.writeText(texto); return true; }
  catch(e){
    try{ const t = document.createElement('textarea'); t.value = texto;
      t.setAttribute('readonly',''); t.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.append(t); t.select(); t.setSelectionRange(0, texto.length);
      const ok = document.execCommand('copy'); t.remove(); return ok;
    }catch(x){ return false; }
  }
}
for(const code of document.querySelectorAll('.macros code')){
  // El texto se guarda ANTES de meter el botón, y sin el número de orden ("1. ")
  const texto = code.textContent.replace(/^\s*\d+\.\s*/, '').trim();
  if(!texto) continue;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'copiar'; b.textContent = '📋';
  b.title = 'Copiar esta macro'; b.setAttribute('aria-label', 'Copiar esta macro');
  b.addEventListener('click', async e => {
    e.preventDefault(); e.stopPropagation();
    const ok = await alPortapapeles(texto);
    b.textContent = ok ? '✅' : '✖';
    b.classList.toggle('listo', ok);
    b.title = ok ? 'Copiada' : 'No se pudo copiar; selecciónala a mano';
    setTimeout(() => { b.textContent = '📋'; b.classList.remove('listo'); b.title = 'Copiar esta macro'; }, 1400);
  });
  code.append(b);
}
