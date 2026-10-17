import { requerir, barraUsuario, crearReporte, adjuntarImagen, hoyISO, faviconEmoji, sb, esc } from './auth.js';
const YO = await requerir({ formulario:'patrullaje' }); barraUsuario(YO);
sb.from('formularios').select('icono').eq('id','patrullaje').maybeSingle().then(({data}) => faviconEmoji(data && data.icono));

const $=s=>document.querySelector(s);
const bloquear=(id,val)=>{ const el=document.getElementById(id); el.value=val||''; el.readOnly=true; el.tabIndex=-1; el.style.opacity='.75'; el.title='Lo asigna el administrador'; };
const MAX_PAT=10;
$('#nPat').innerHTML=Array.from({length:MAX_PAT},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');

// ---------- Catálogos para los desplegables con búsqueda ----------
let INTEGRANTES=[];                                        // [{usuario,nombre,rango}]
sb.rpc('listar_integrantes').then(({data})=>{ INTEGRANTES=(data||[]).map(p=>({...p, texto:[p.rango,p.nombre||p.usuario].filter(Boolean).join(' ')})); });
let foliosTimer=null;
async function buscarFolios(q){ const {data}=await sb.rpc('buscar_folios',{q}); return data||[]; }

// ---------- Páginas (un patrullaje = una página/imagen) ----------
const paginas=[];   // [{el, fotos:{sal:null, reg:null}}]
function precargar(){
  $('#fecha').value=hoyISO();
  const fe=$('#fecha'); if(!fe.dataset.picker){ fe.dataset.picker='1'; fe.addEventListener('click',()=>{ try{ fe.showPicker(); }catch(e){} }); }
  bloquear('nombre', YO.nombre || YO.usuario);
  bloquear('rango', YO.rango);
}
function opciones(sel,n,sel0){ sel.innerHTML='<option value="">--</option>'+Array.from({length:n},(_,i)=>`<option>${String(i).padStart(2,'0')}</option>`).join(''); if(sel0!=null) sel.value=sel0; }
function sugerencias(input, buscar, pintar, elegir){
  const ul=input.parentElement.querySelector('ul');
  const cerrar=()=>{ ul.style.display='none'; };
  const mostrar=async()=>{
    const items=await buscar(input.value.trim());
    if(!items.length){ cerrar(); return; }
    ul.innerHTML=items.map((it,i)=>`<li data-i="${i}">${pintar(it)}</li>`).join('');
    ul.querySelectorAll('li').forEach(li=>li.onmousedown=e=>{ e.preventDefault(); elegir(items[+li.dataset.i]); cerrar(); input.dispatchEvent(new Event('input',{bubbles:true})); });
    ul.style.display='block';
  };
  input.addEventListener('focus',mostrar); input.addEventListener('input',()=>{ clearTimeout(foliosTimer); foliosTimer=setTimeout(mostrar,150); });
  input.addEventListener('blur',cerrar);
}
function crearPagina(i){
  const el=$('#tplPag').content.firstElementChild.cloneNode(true);
  el.dataset.i=i; el.querySelector('.num').textContent=i+1;
  for(const c of ['hIniH','hFinH']) opciones(el.querySelector('.'+c),24);
  for(const c of ['hIniM','hFinM']) opciones(el.querySelector('.'+c),60);
  const pg={el, fotos:{sal:null,reg:null}};
  // Integrantes: búsqueda sobre los miembros activos
  // El integrante 1 es siempre quien hace el reporte (bloqueado)
  { const i1=el.querySelector('.int[data-k="0"]'); i1.value=[YO.rango, YO.nombre||YO.usuario].filter(Boolean).join(' '); i1.readOnly=true; i1.tabIndex=-1; i1.style.opacity='.75'; i1.title='Eres quien reporta'; i1.placeholder='1.'; }
  // Un mismo miembro no puede ir dos veces en el patrullaje: se excluyen los ya elegidos en los otros campos
  const yaElegidos=excepto=>[...el.querySelectorAll('.int')].filter(x=>x!==excepto).map(x=>x.value.trim().toLowerCase()).filter(Boolean);
  el.querySelectorAll('.int:not([data-k="0"])').forEach(inp=>sugerencias(inp,
    async q=>{ q=q.toLowerCase(); const usados=yaElegidos(inp); return INTEGRANTES.filter(p=>!usados.includes(p.texto.toLowerCase())&&(!q||p.texto.toLowerCase().includes(q)||p.usuario.toLowerCase().includes(q))).slice(0,12); },
    p=>`<b>${esc(p.texto)}</b><small>@${esc(p.usuario)}</small>`,
    p=>{ inp.value=p.texto; }));
  // Código de reporte: búsqueda de folios existentes
  const cod=el.querySelector('.cod');
  sugerencias(cod, buscarFolios, f=>`<b>${esc(f.folio)}</b> · ${esc(f.formulario||'')} · ${esc(f.fecha||'')}<small>${esc(f.usuario_nombre||'')} — ${esc(f.resumen||'')}</small>`, f=>{ cod.value=f.folio; });
  // Novedades: cantidad solo si SÍ
  const nov=el.querySelector('.nov'), novN=el.querySelector('.novN');
  nov.addEventListener('change',()=>{ novN.disabled=nov.value!=='SÍ'; if(novN.disabled) novN.value='0'; else if(+novN.value===0) novN.value='1'; draw(); });
  // Fotos
  for(const [k,cls,tcls] of [['sal','fSal','tSal'],['reg','fReg','tReg']]){
    el.querySelector('.'+cls).addEventListener('change',async e=>{
      const f=e.target.files[0]; if(!f) return;
      pg.fotos[k]={img:await loadFile(f),name:f.name};
      const t=el.querySelector('.'+tcls); t.innerHTML=`<img src="${pg.fotos[k].img.src}" alt=""><button type="button" title="Quitar">✕</button>`;
      t.querySelector('button').onclick=()=>{ pg.fotos[k]=null; t.textContent='Sin foto'; e.target.value=''; draw(); };
      ACTUAL=i; draw();
    });
  }
  el.addEventListener('focusin',()=>{ if(ACTUAL!==i){ ACTUAL=i; draw(); } });
  return pg;
}
function ajustarPaginas(){
  const n=+$('#nPat').value||1, cont=$('#paginas');
  while(paginas.length<n){ const pg=crearPagina(paginas.length); paginas.push(pg); cont.appendChild(pg.el); }
  while(paginas.length>n){ paginas.pop().el.remove(); }
  if(ACTUAL>=n) ACTUAL=n-1;
  tabs(); draw();
}
$('#nPat').addEventListener('change',ajustarPaginas);
function loadFile(f){return new Promise((res,rej)=>{const u=URL.createObjectURL(f);const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=u;});}

let ACTUAL=0;
function tabs(){
  const t=$('#tabs'); t.innerHTML=paginas.map((_,i)=>`<button type="button" data-i="${i}" class="${i===ACTUAL?'act':''}">Patrullaje ${i+1}</button>`).join('');
  t.querySelectorAll('button').forEach(b=>b.onclick=()=>{ ACTUAL=+b.dataset.i; tabs(); draw(); });
}

function datosPagina(i){
  const el=paginas[i].el, v=c=>el.querySelector('.'+c).value;
  const hora=(h,m)=>(v(h)&&v(m))?`${v(h)}:${v(m)}`:'';
  return { n:i+1, horaIni:hora('hIniH','hIniM'), horaFin:hora('hFinH','hFinM'),
    integrantes:[...el.querySelectorAll('.int')].map(x=>x.value.trim()).filter(Boolean),
    novedades:v('nov'), novedadesN:v('nov')==='SÍ'?(+v('novN')||0):0, codigo:v('cod').trim().toUpperCase(), obs:v('obs').trim() };
}
function getData(){ return { fecha:$('#fecha').value, nombre:$('#nombre').value.trim(), rango:$('#rango').value.trim(), total:paginas.length }; }
function fmtFecha(iso){ if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}-${m}-${y}`; }
function validate(d){
  const e=[];
  if(!d.fecha) e.push('• La fecha es obligatoria.');
  if(!d.nombre) e.push('• El nombre del responsable es obligatorio.');
  if(!d.rango) e.push('• Tu perfil no tiene rango asignado. Pide al administrador que lo asigne.');
  paginas.forEach((pg,i)=>{
    const p=datosPagina(i), t=`Patrullaje ${i+1}: `;
    if(!p.horaIni||!p.horaFin) e.push(`• ${t}indica hora de inicio y fin.`);
    else if(p.horaFin<=p.horaIni) e.push(`• ${t}la hora de fin debe ser posterior a la de inicio.`);
    if(p.integrantes.length<2) e.push(`• ${t}debe haber mínimo 2 integrantes (tú y al menos uno más).`);
    { const vistos=new Set(); for(const n of p.integrantes){ const k=n.toLowerCase(); if(vistos.has(k)){ e.push(`• ${t}"${n}" está repetido en los integrantes.`); break; } vistos.add(k); } }
    if(p.novedades==='SÍ'&&p.novedadesN<1) e.push(`• ${t}indica la cantidad de novedades/bajas.`);
    if(p.codigo&&!/^PM-\d{6}$/.test(p.codigo)) e.push(`• ${t}el código de reporte debe ser un folio existente (PM-000000).`);
    if(!pg.fotos.sal) e.push(`• ${t}falta la foto de salida de patrulla.`);
    if(!pg.fotos.reg) e.push(`• ${t}falta la foto de regreso de patrulla.`);
  });
  return e;
}
function showErr(msg,ok){ const el=$('#err'); el.textContent=msg; el.className='err'+(ok?' ok':''); }

// ---------- Dibujo (plantilla 1024 x 572) ----------
const cv=$('#cv'), ctx=cv.getContext('2d');
const tpl=new Image(); tpl.src='plantilla.png?v=1';
const SCALE=2, W=1024, H=572;
const T={
  panel:'#07111a',
  date:{x:554,y:60,w:100,h:19},
  nombre:{x:262,y:157,w:238,h:20},
  rango:{x:92,y:178,w:408,h:20},
  cont:{x:22,y:252,w:484,h:195},
  foto1:{x:548,y:166,w:218,h:154}, foto2:{x:781,y:166,w:218,h:154},
  obs:{x:546,y:332,w:454,h:128}
};
function fit(txt,maxW){ while(ctx.measureText(txt).width>maxW && txt.length>1) txt=txt.slice(0,-1); return txt; }
function wrap(txt,maxW){ const out=[]; for(const para of txt.split('\n')){ let line=''; for(const w of para.split(' ')){ const t=line?line+' '+w:w; if(ctx.measureText(t).width>maxW && line){out.push(line);line=w;} else line=t; } out.push(line); } return out; }
function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function foto(c,p){
  ctx.fillStyle='#050a0c'; rr(c.x,c.y,c.w,c.h,6); ctx.fill();
  if(!p) return;
  const s=Math.min(c.w/p.img.naturalWidth,c.h/p.img.naturalHeight), w=p.img.naturalWidth*s, h=p.img.naturalHeight*s;
  ctx.save(); rr(c.x,c.y,c.w,c.h,6); ctx.clip(); ctx.drawImage(p.img,c.x+(c.w-w)/2,c.y+(c.h-h)/2,w,h); ctx.restore();
}
function annexLayout(fotos){
  const gap=18, colW=(W-gap*3)/2, items=[];
  for(const [k,tit] of [['sal','SALIDA DE PATRULLA'],['reg','REGRESO DE PATRULLA']]){ const p=fotos[k]; if(!p) continue;
    const s=Math.min(colW/p.img.naturalWidth,900/p.img.naturalHeight); items.push({p,tit,w:p.img.naturalWidth*s,h:p.img.naturalHeight*s}); }
  const h=items.length?Math.max(...items.map(i=>i.h)):0;
  return {gap,colW,items,h,total:items.length?60+h+30+gap+gap:0};
}
let FOLIO=null, SELLO=null;
function draw(i=ACTUAL){
  if(!tpl.complete||!tpl.naturalWidth||!paginas.length) return;
  const d=getData(), p=datosPagina(i), fotos=paginas[i].fotos, L=annexLayout(fotos);
  cv.width=W*SCALE; cv.height=(H+L.total)*SCALE;
  ctx.setTransform(SCALE,0,0,SCALE,0,0); ctx.imageSmoothingQuality='high';
  ctx.fillStyle='#070b0d'; ctx.fillRect(0,0,W,H+L.total);
  ctx.drawImage(tpl,0,0,W,H);
  ctx.textBaseline='middle'; ctx.textAlign='left';
  const label=(t,x,y,f='17px')=>{ ctx.fillStyle='#fff'; ctx.font=`${f} "Roboto Condensed",Arial`; ctx.fillText(t,x,y); return ctx.measureText(t).width; };
  const val=(t,x,y,maxW,f='bold 17px')=>{ ctx.fillStyle='#f0c24d'; ctx.font=`${f} "Roboto Condensed",Arial`; ctx.fillText(fit(t,maxW),x,y); return ctx.measureText(fit(t,maxW)).width; };

  // Fecha
  { const b=T.date; ctx.fillStyle='#07090b'; ctx.beginPath(); ctx.moveTo(b.x,b.y+2); ctx.lineTo(b.x+b.w+4,b.y-5); ctx.lineTo(b.x+b.w+4,b.y+b.h-3); ctx.lineTo(b.x,b.y+b.h+2); ctx.closePath(); ctx.fill();
    if(d.fecha){ ctx.fillStyle='#fff'; ctx.font='bold 15px "Roboto Condensed",Arial'; ctx.fillText(fmtFecha(d.fecha),b.x+6,b.y+b.h/2+1); } }
  // Responsable
  { const b=T.nombre; ctx.fillStyle=T.panel; ctx.fillRect(b.x,b.y,b.w,b.h); if(d.nombre) val(d.nombre,b.x+4,b.y+b.h/2,b.w-8); }
  { const b=T.rango;  ctx.fillStyle=T.panel; ctx.fillRect(b.x,b.y,b.w,b.h); if(d.rango)  val(d.rango,b.x+4,b.y+b.h/2,b.w-8); }
  // Registro del patrullaje (se redibuja toda la zona)
  { const b=T.cont; ctx.fillStyle=T.panel; ctx.fillRect(b.x,b.y,b.w,b.h);
    let y=b.y+12, x=b.x+8; const lh=20;
    let w=label('Patrullaje N°',x,y,'bold 18px'); val(String(p.n).padStart(2,'0'),x+w+8,y,80,'bold 18px'); y+=lh;
    w=label('Hora Inicio/Fin:',x,y); val(`${p.horaIni||'--:--'}  /  ${p.horaFin||'--:--'}`,x+w+8,y,200); y+=lh;
    w=label('Integrantes:',x,y);
    const ints=p.integrantes.length?p.integrantes:[]; const ix=x+w+8, maxW=b.w-(ix-b.x)-8;
    ints.forEach((n,k)=>{ val(`${k+1}. ${n}`,ix,y,maxW,'bold 16px'); y+=lh; });
    if(!ints.length) y+=lh;
    y+=6;
    w=label('Novedades/Bajas:',x,y); let w2=val(p.novedades==='SÍ'?'SÍ':'NO',x+w+8,y,60); if(p.novedades==='SÍ'){ ctx.fillStyle='#fff'; ctx.font='17px "Roboto Condensed",Arial'; ctx.fillText(`· Cantidad: ${p.novedadesN}`,x+w+8+w2+8,y); } y+=lh;
    w=label('Código Reporte:',x,y); val(p.codigo||'—',x+w+8,y,b.w-w-24); }
  // Evidencias
  foto(T.foto1,fotos.sal); foto(T.foto2,fotos.reg);
  { const b=T.obs; ctx.fillStyle=T.panel; ctx.fillRect(b.x,b.y,b.w,b.h);
    ctx.fillStyle='#fff'; ctx.font='17px "Roboto Condensed",Arial'; ctx.textAlign='center'; ctx.fillText('Observaciones Adicionales:',b.x+b.w/2,b.y+14); ctx.textAlign='left';
    if(p.obs){ ctx.fillStyle='#f0c24d'; ctx.font='bold 15px "Roboto Condensed",Arial'; wrap(p.obs,b.w-16).slice(0,5).forEach((ln,k)=>ctx.fillText(ln,b.x+8,b.y+38+k*18)); } }

  // Anexo fotográfico (las dos fotos en grande)
  if(L.items.length){
    let y=H;
    ctx.fillStyle='#0e1b20'; ctx.fillRect(0,y,W,46); ctx.fillStyle='#c9a43a'; ctx.fillRect(0,y,W,3); ctx.fillRect(0,y+43,W,3);
    ctx.fillStyle='#f0c24d'; ctx.font='italic bold 24px "Roboto Condensed",Arial'; ctx.fillText(`ANEXO FOTOGRÁFICO · PATRULLAJE N° ${String(p.n).padStart(2,'0')}`,24,y+23);
    ctx.fillStyle='#fff'; ctx.font='bold 15px "Roboto Condensed",Arial'; ctx.textAlign='right'; ctx.fillText(d.fecha?fmtFecha(d.fecha):'',W-24,y+23); ctx.textAlign='left';
    y+=60;
    L.items.forEach((it,k)=>{
      const x=L.gap+k*(L.colW+L.gap)+(L.colW-it.w)/2;
      ctx.fillStyle='#0e1b20'; rr(x-4,y-4,it.w+8,it.h+8,8); ctx.fill(); ctx.strokeStyle='#c9a43a'; ctx.lineWidth=1.5; rr(x-4,y-4,it.w+8,it.h+8,8); ctx.stroke();
      ctx.drawImage(it.p.img,x,y,it.w,it.h);
      ctx.fillStyle='#f0c24d'; ctx.font='bold 13px "Roboto Condensed",Arial'; ctx.textAlign='center'; ctx.fillText(it.tit,L.gap+k*(L.colW+L.gap)+L.colW/2,y+it.h+18); ctx.textAlign='left';
    });
    y+=L.h+L.gap+16;
    ctx.fillStyle='#8a9398'; ctx.font='bold 13px "Roboto Condensed",Arial'; ctx.textAlign='center'; ctx.fillText('¡HONOR  ★  LEALTAD  ★  DISCIPLINA!',W/2,y+10); ctx.textAlign='left';
  }
  // Sello
  if(FOLIO){ ctx.save(); ctx.textAlign='right'; ctx.textBaseline='alphabetic'; const txt=`FOLIO ${FOLIO} · ${SELLO||''}`;
    ctx.font='bold 12px "Roboto Condensed",Arial'; const w=ctx.measureText(txt).width+16;
    ctx.fillStyle='#000c'; rr(W-14-w,H-26,w,18,4); ctx.fill(); ctx.fillStyle='#f0c24d'; ctx.fillText(txt,W-22,H-13); ctx.restore(); }
}

precargar(); ajustarPaginas();
tpl.onload=()=>draw();
document.fonts && document.fonts.ready.then(()=>draw());
$('#form').addEventListener('submit',e=>e.preventDefault());
$('#form').addEventListener('input',()=>draw());
$('#btnPreview').onclick=()=>draw();
const espera=ms=>new Promise(r=>setTimeout(r,ms));
$('#btnExport').onclick=async()=>{
  const d=getData(), e=validate(d);
  if(e.length){ showErr(e.join('\n')); return; }
  showErr('');
  const btn=$('#btnExport'); btn.disabled=true; const hechos=[];
  try{
    for(let i=0;i<paginas.length;i++){
      btn.textContent=`Registrando ${i+1}/${paginas.length}…`;
      const p=datosPagina(i);
      const reg=await crearReporte({ formularioId:'patrullaje', fecha:d.fecha,
        resumen:`${d.nombre} (${d.rango}) · Patrullaje ${p.n}/${d.total} · ${p.horaIni}-${p.horaFin} · ${p.integrantes.length} integrante(s)` + (p.novedades==='SÍ'?` · ${p.novedadesN} novedad(es)`:'') + (p.codigo?` · ref. ${p.codigo}`:''),
        datos:{...d, ...p, fotos:{salida:paginas[i].fotos.sal.name, regreso:paginas[i].fotos.reg.name}} });
      FOLIO=reg.folio; SELLO=`${(reg.datos.usuario||'')} · ${new Date(reg.datos.sellado_en||Date.now()).toLocaleString('es-CO')}`;
      ACTUAL=i; tabs(); draw(i);
      btn.textContent=`Exportando ${i+1}/${paginas.length}…`;
      const blob=await new Promise(res=>cv.toBlob(res,'image/png'));
      const a=document.createElement('a'); a.download=`reporte-patrullaje-${FOLIO}-${fmtFecha(d.fecha)}-p${p.n}.png`; a.href=URL.createObjectURL(blob); a.click();
      await adjuntarImagen({ yo:YO, id:reg.id, formularioId:'patrullaje', pngBlob:blob });
      hechos.push(FOLIO); FOLIO=null; SELLO=null;
      if(i<paginas.length-1) await espera(700);   // el navegador necesita un respiro entre descargas
    }
    showErr(`${hechos.length} reporte(s) exportado(s) y guardado(s) en el historial: ${hechos.join(', ')}.`,true);
  }catch(x){ FOLIO=null; SELLO=null; showErr((hechos.length?`Se exportaron ${hechos.join(', ')}. `:'')+'No se pudo completar: '+x.message); }
  draw(); btn.disabled=false; btn.textContent='Exportar imágenes';
};
$('#btnReset').onclick=()=>{ $('#form').reset(); paginas.splice(0).forEach(p=>p.el.remove()); ACTUAL=0; showErr(''); precargar(); $('#nPat').value='1'; ajustarPaginas(); };
