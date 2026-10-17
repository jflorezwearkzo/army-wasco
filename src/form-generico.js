// Formulario genérico: carga la definición JSON del formulario (?id=...) y la ejecuta con el motor de plantillas.
import { requerir, barraUsuario, crearReporte, adjuntarImagen, faviconEmoji, sb, esc } from './auth.js';
import { construirFormulario, validar, dibujar, cargarFondo, cargarImagen, resumenDe, fmtFecha } from './plantilla.js';

const ID = new URLSearchParams(location.search).get('id') || '';
const YO = await requerir({ formulario: ID });
barraUsuario(YO);
const $=s=>document.querySelector(s);
const { data: F, error } = await sb.from('formularios').select('*').eq('id', ID).maybeSingle();
if(error || !F || !F.definicion){ document.querySelector('main').innerHTML = `<p class="err" style="padding:20px">${esc(error ? error.message : 'Este formulario no tiene plantilla configurada.')}</p>`; throw new Error('sin plantilla'); }
const DEF = F.definicion;
document.title = `${F.titulo} — Policía Militar`; $('#titulo').textContent = `${F.titulo} · Army de Wasco · Policía Militar`; $('#descripcion').textContent = F.descripcion || '';
faviconEmoji(F.icono);

let INTEGRANTES=[];
sb.rpc('listar_integrantes').then(({data})=>{ INTEGRANTES=(data||[]).map(p=>({...p, texto:[p.rango,p.nombre||p.usuario].filter(Boolean).join(' ')})); });

const cv=$('#cv'); let FONDO=null; let SELLO=null;
let form=null;
form = construirFormulario($('#campos'), DEF, YO, { onChange:()=>draw(), integrantes:()=>INTEGRANTES });

// Anexo fotográfico
const FOT=DEF.fotos||{min:0,max:10}; let fotos=[];
if((FOT.max||0)<=0) $('#fsFotos').style.display='none';
$('#legFotos').textContent = `${FOT.titulo||'Anexo fotográfico'} (${FOT.min||0} a ${FOT.max} fotos)${FOT.min?' *':''}`;
$('#fotos').addEventListener('change', async e=>{ for(const f of e.target.files){ if(fotos.length>=FOT.max) break; fotos.push({img:await cargarImagen(f),name:f.name}); } e.target.value=''; thumbs(); draw(); });
function thumbs(){ const t=$('#thumbs'); t.innerHTML=''; fotos.forEach((p,i)=>{ const d=document.createElement('div'); d.className='thumb'; d.innerHTML=`<img src="${p.img.src}" alt=""><b>${i+1}</b><button type="button" title="Quitar">✕</button>`; d.querySelector('button').onclick=()=>{ fotos.splice(i,1); thumbs(); draw(); }; t.appendChild(d); }); $('#fotoCount').textContent=fotos.length?`${fotos.length} de ${FOT.max} fotos`:'Sin fotos'; }

function fechaAnexo(v){ const c=DEF.campos.find(c=>c.tipo==='fecha'); return c&&v[c.id]?fmtFecha(v[c.id],c.estilo&&c.estilo.formato):''; }
function draw(){ if(!form) return; const v=form.leer(); dibujar(cv, DEF, FONDO, v, form.fotos, fotos, SELLO, { fechaAnexo:fechaAnexo(v) }); }
function showErr(msg,ok){ const el=$('#err'); el.textContent=msg; el.className='err'+(ok?' ok':''); }

FONDO = await cargarFondo(DEF); draw();
document.fonts && document.fonts.ready.then(draw);
$('#form').addEventListener('submit',e=>e.preventDefault());
$('#btnPreview').onclick=draw;
$('#btnExport').onclick=async()=>{
  const v=form.leer(), e=validar(DEF, v, form.fotos, fotos);
  if(e.length){ showErr(e.join('\n')); return; }
  showErr(''); const btn=$('#btnExport'); btn.disabled=true; btn.textContent='Registrando…';
  try{
    const fc=DEF.campos.find(c=>c.tipo==='fecha'); const fecha=fc&&v[fc.id]?v[fc.id]:new Date().toISOString().slice(0,10);
    const resumen = resumenDe(DEF, v) || `${YO.nombre||YO.usuario} · ${F.titulo}`;
    const reg=await crearReporte({ formularioId:ID, fecha, resumen:`${resumen}${fotos.length?` · ${fotos.length} foto(s)`:''}`, datos:{ ...v, plantilla_version:F.version, fotos:fotos.map(p=>p.name) } });
    SELLO={ folio:reg.folio, texto:`${(reg.datos.usuario||'')} · ${new Date(reg.datos.sellado_en||Date.now()).toLocaleString('es-CO')}` };
    draw(); btn.textContent='Exportando…';
    const blob=await new Promise(res=>cv.toBlob(res,'image/png'));
    const a=document.createElement('a'); a.download=`reporte-${ID}-${reg.folio}-${fecha}.png`; a.href=URL.createObjectURL(blob); a.click();
    await adjuntarImagen({ yo:YO, id:reg.id, formularioId:ID, pngBlob:blob });
    showErr(`Reporte ${reg.folio} exportado y guardado en el historial.`, true);
  }catch(x){ showErr('No se pudo completar: '+x.message); }
  SELLO=null; draw(); btn.disabled=false; btn.textContent='Exportar imagen';
};
$('#btnReset').onclick=()=>{ location.reload(); };
