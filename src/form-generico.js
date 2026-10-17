// Formulario genérico: carga la definición JSON del formulario (?id=...) y la ejecuta con el motor de plantillas.
// Soporta reportes de varias páginas (def.paginas.activo): los campos "por página" se repiten y se exporta una imagen por página.
import { requerir, barraUsuario, crearReporte, adjuntarImagen, notificarDiscord, textoDiscord, borrador, mejorasMovil, faviconEmoji, sb, esc } from './auth.js';
import { construirFormulario, validar, dibujar, cargarFondo, cargarImagen, resumenDe, fmtFecha, calcular, estaActivo } from './plantilla.js';

const ID = new URLSearchParams(location.search).get('id') || '';
const YO = await requerir({ formulario: ID });
barraUsuario(YO);
const $=s=>document.querySelector(s);
const { data: F, error } = await sb.from('formularios').select('*').eq('id', ID).maybeSingle();
if(error || !F || !F.definicion){ document.querySelector('main').innerHTML = `<p class="err" style="padding:20px">${esc(error ? error.message : 'Este formulario no tiene plantilla configurada.')}</p>`; throw new Error('sin plantilla'); }
const DEF = F.definicion; DEF.paginas = DEF.paginas || { activo:false };
const MULTI = !!DEF.paginas.activo, ETQ = DEF.paginas.etiqueta || 'Página', MAXP = Math.max(1, Math.min(20, +DEF.paginas.max || 10));
document.title = `${F.titulo} — Policía Militar`; $('#titulo').textContent = `${F.titulo} · Army de Wasco · Policía Militar`; $('#descripcion').textContent = F.descripcion || (MULTI ? `Indica cuántos ${ETQ.toLowerCase()}s hubo: se genera una imagen por cada uno, con su propio folio.` : '');
faviconEmoji(F.icono);

let INTEGRANTES=[];
sb.rpc('listar_integrantes').then(({data})=>{ INTEGRANTES=(data||[]).map(p=>({...p, texto:[p.rango,p.nombre||p.usuario].filter(Boolean).join(' ')})); });

const cv=$('#cv'); let FONDO=null; let SELLO=null; let ACTUAL=0;
const FOT=DEF.fotos||{min:0,max:10}; let fotos=[];
const COMUNES = DEF.campos.filter(c=>!MULTI || !c.porPagina), PORPAG = MULTI ? DEF.campos.filter(c=>c.porPagina) : [];
let comun=null; const paginas=[];           // paginas[i] = { el, form }
const valoresDe = i => { if(!comun) return {}; if(!paginas[i]) return comun.leer(); const v={ ...comun.leerPropio(), ...paginas[i].form.leerPropio(), __pagina:i+1, __paginas:paginas.length }; for(const c of DEF.campos) if(!estaActivo(DEF,v,c)) v[c.id]=Array.isArray(v[c.id])?[]:''; for(const c of DEF.campos) if(c.tipo==='formula'){ v[c.id]=calcular(DEF,c,v); const e=paginas[i].form.el[c.id]||comun.el[c.id]; if(e) e.value=v[c.id]; } return v; };
const fotosDe = i => ({ ...(comun?comun.fotos:{}), ...(paginas[i]?paginas[i].form.fotos:{}) });

comun = construirFormulario($('#campos'), DEF, YO, { onChange:()=>draw(), integrantes:()=>INTEGRANTES, campos:COMUNES, otros:()=>paginas[ACTUAL]?paginas[ACTUAL].form.leerPropio():{} });

// ---- Páginas ----
if(MULTI){
  const fs=document.createElement('fieldset'); fs.id='fsPaginas'; fs.innerHTML=`<legend>${esc(ETQ)}s</legend><label for="nPag">Número de ${esc(ETQ.toLowerCase())}s * <small>(no aparece en el reporte; genera una imagen por cada uno)</small></label><select id="nPag">${Array.from({length:MAXP},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}</select><div id="paginas"></div>`;
  $('#campos').parentElement.insertAdjacentElement('afterend', fs);
  const tabs=document.createElement('div'); tabs.className='tabs'; tabs.id='tabs'; $('.preview h2').insertAdjacentElement('afterend', tabs);
  const ajustar=()=>{ const n=+$('#nPag').value||1, cont=$('#paginas');
    while(paginas.length<n){ const i=paginas.length; const el=document.createElement('div'); el.className='pag'; el.dataset.i=i; el.innerHTML=`<h3>${esc(ETQ)} N° <span class="num">${i+1}</span></h3>`; const box=document.createElement('div'); el.appendChild(box); cont.appendChild(el);
      const form=construirFormulario(box, DEF, YO, { onChange:()=>{ ACTUAL=i; pintarTabs(); draw(); }, integrantes:()=>INTEGRANTES, campos:PORPAG, otros:()=>({ ...(comun?comun.leerPropio():{}), __pagina:i+1, __paginas:paginas.length }) });
      el.addEventListener('focusin',()=>{ if(ACTUAL!==i){ ACTUAL=i; pintarTabs(); draw(); } }); paginas.push({ el, form }); }
    while(paginas.length>n){ paginas.pop().el.remove(); }
    if(ACTUAL>=n) ACTUAL=n-1; pintarTabs(); draw(); };
  $('#nPag').addEventListener('change',ajustar); ajustar();
}
function pintarTabs(){ const t=$('#tabs'); if(!t) return; t.innerHTML=paginas.map((_,i)=>`<button type="button" data-i="${i}" class="${i===ACTUAL?'act':''}">${esc(ETQ)} ${i+1}</button>`).join(''); t.querySelectorAll('button').forEach(b=>b.onclick=()=>{ ACTUAL=+b.dataset.i; pintarTabs(); draw(); }); }

// Anexo fotográfico (compartido entre páginas: cada imagen lleva el anexo completo)
if((FOT.max||0)<=0) $('#fsFotos').style.display='none';
$('#legFotos').textContent = `${FOT.titulo||'Anexo fotográfico'} (${FOT.min||0} a ${FOT.max} fotos)${FOT.min?' *':''}`;
$('#fotos').addEventListener('change', async e=>{ for(const f of e.target.files){ if(fotos.length>=FOT.max) break; fotos.push({img:await cargarImagen(f),name:f.name}); } e.target.value=''; thumbs(); draw(); });
function thumbs(){ const t=$('#thumbs'); t.innerHTML=''; fotos.forEach((p,i)=>{ const d=document.createElement('div'); d.className='thumb'; d.innerHTML=`<img src="${p.img.src}" alt=""><b>${i+1}</b><button type="button" title="Quitar">✕</button>`; d.querySelector('button').onclick=()=>{ fotos.splice(i,1); thumbs(); draw(); }; t.appendChild(d); }); $('#fotoCount').textContent=fotos.length?`${fotos.length} de ${FOT.max} fotos`:'Sin fotos'; }

function fechaAnexo(v){ const c=DEF.campos.find(c=>c.tipo==='fecha'); return c&&v[c.id]?fmtFecha(v[c.id],c.estilo&&c.estilo.formato):''; }
function draw(i=ACTUAL){ if(!comun) return; const v=valoresDe(i); dibujar(cv, DEF, FONDO, v, fotosDe(i), fotos, SELLO, { fechaAnexo:fechaAnexo(v) }); }
function showErr(msg,ok){ const el=$('#err'); el.textContent=msg; el.className='err'+(ok?' ok':''); }

FONDO = await cargarFondo(DEF); draw();
const BORR = borrador({ clave:'plantilla:'+ID, yo:YO, form:document.getElementById('form'), despues:()=>{ pintarTabs(); draw(); } });
document.fonts && document.fonts.ready.then(()=>draw());
$('#form').addEventListener('submit',e=>e.preventDefault());
$('#btnPreview').onclick=()=>draw();
const espera=ms=>new Promise(r=>setTimeout(r,ms));
$('#btnExport').onclick=async()=>{
  const n=Math.max(1,paginas.length); const errores=[];
  for(let i=0;i<n;i++){ const v=valoresDe(i); const e=validar(DEF, v, fotosDe(i), fotos); if(e.length) errores.push(...(n>1?e.map(x=>`• ${ETQ} ${i+1}: ${x.replace(/^• /,'')}`):e)); if(!MULTI) break; }
  if(errores.length){ showErr([...new Set(errores)].join('\n')); return; }
  showErr(''); const btn=$('#btnExport'); btn.disabled=true; const hechos=[]; let publicados=0;
  try{
    for(let i=0;i<n;i++){
      btn.textContent=n>1?`Registrando ${i+1}/${n}…`:'Registrando…';
      const v=valoresDe(i); const fc=DEF.campos.find(c=>c.tipo==='fecha'); const fecha=fc&&v[fc.id]?v[fc.id]:new Date().toISOString().slice(0,10);
      const resumen=(resumenDe(DEF, v) || `${YO.nombre||YO.usuario} · ${F.titulo}`) + (n>1?` · ${ETQ} ${i+1}/${n}`:'');
      const datos={ ...v, plantilla_version:F.version, fotos:fotos.map(p=>p.name) }; delete datos.__pagina; delete datos.__paginas; if(n>1){ datos.pagina=i+1; datos.paginas=n; }
      const reg=await crearReporte({ formularioId:ID, fecha, resumen:`${resumen}${fotos.length?` · ${fotos.length} foto(s)`:''}`, datos });
      SELLO={ folio:reg.folio, texto:`${(reg.datos.usuario||'')} · ${new Date(reg.datos.sellado_en||Date.now()).toLocaleString('es-CO')}` };
      ACTUAL=i; pintarTabs(); draw(i); btn.textContent=n>1?`Exportando ${i+1}/${n}…`:'Exportando…';
      const blob=await new Promise(res=>cv.toBlob(res,'image/png'));
      const a=document.createElement('a'); a.download=`reporte-${ID}-${reg.folio}-${fecha}${n>1?`-p${i+1}`:''}.png`; a.href=URL.createObjectURL(blob); a.click();
      await adjuntarImagen({ yo:YO, id:reg.id, formularioId:ID, pngBlob:blob });
      const dc=await notificarDiscord(reg.id); if(dc==='ok') publicados++;
      hechos.push(reg.folio); SELLO=null; if(i<n-1) await espera(700);
    }
    BORR.limpiar();
    showErr(n>1 ? `${hechos.length} reporte(s) exportado(s) y guardado(s) en el historial: ${hechos.join(', ')}.`+(publicados?` ${publicados} publicado(s) en Discord.`:'') : `Reporte ${hechos[0]} exportado y guardado en el historial.`+(publicados?' Publicado en Discord.':''), true);
  }catch(x){ SELLO=null; showErr((hechos.length?`Se exportaron ${hechos.join(', ')}. `:'')+'No se pudo completar: '+x.message); }
  draw(); btn.disabled=false; btn.textContent='Exportar imagen';
};
$('#btnReset').onclick=()=>{ BORR.limpiar(); location.reload(); };
mejorasMovil();
