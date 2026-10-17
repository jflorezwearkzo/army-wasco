import { requerir, barraUsuario, crearReporte, adjuntarImagen, notificarDiscord, textoDiscord, borrador, mejorasMovil, hoyISO, faviconEmoji, sb, RANGOS, esc } from './auth.js';
const FORM='toma-territorio';
const YO = await requerir({ formulario:FORM }); barraUsuario(YO);
sb.from('formularios').select('icono').eq('id',FORM).maybeSingle().then(({data}) => faviconEmoji(data && data.icono));

const $=s=>document.querySelector(s);
const TERRITORIOS=['Almacén','Paseo de la Fama','Torre de Control'];
const VEHICULOS=['Tanqueta Blindada','Humvee Blindado','Interceptor','Jeep','Bus'];
const ESTADOS=['Sin novedad','Toma parcial','Fallido'];
const MAX_INT=60, MAX_FOTOS=10;
const bloquear=(id,val)=>{ const el=document.getElementById(id); el.value=val||''; el.readOnly=true; el.tabIndex=-1; el.style.opacity='.75'; el.title='Lo asigna el administrador'; };
const miNombre=()=>[YO.rango, YO.nombre||YO.usuario].filter(Boolean).join(' ');

// ---------- Construcción del formulario ----------
$('#territorios').innerHTML=TERRITORIOS.map((t,i)=>`<div class="terr">
  <label><input type="checkbox" class="tTom" data-i="${i}"> ${esc(t)}</label>
  <input type="text" class="tRes" data-i="${i}" maxlength="60" placeholder="Resultado (p. ej. Control del estado logrado)"></div>`).join('');
document.querySelectorAll('.tTom').forEach(c=>c.addEventListener('change',()=>{ const r=document.querySelector(`.tRes[data-i="${c.dataset.i}"]`); if(c.checked&&!r.value.trim()) r.value='Control del estado logrado'; actualizarTotal(); draw(); }));
function actualizarTotal(){ $('#total').value=String(document.querySelectorAll('.tTom:checked').length); }
$('#nInt').innerHTML=Array.from({length:MAX_INT},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');
function ajustarIntegrantes(){
  const n=+$('#nInt').value||1, cont=$('#ints');
  while(cont.children.length<n){ const k=cont.children.length; const inp=document.createElement('input'); inp.type='text'; inp.maxLength=40; inp.className='int'; inp.placeholder=`${k+1}.`; if(k===0){ inp.value=miNombre(); inp.readOnly=true; inp.tabIndex=-1; inp.style.opacity='.75'; inp.title='Eres quien reporta'; } cont.appendChild(inp); }
  while(cont.children.length>n) cont.lastElementChild.remove();
  draw();
}
$('#nInt').addEventListener('change',ajustarIntegrantes);
function filaVehiculo(tipo='',n=1){
  const d=document.createElement('div'); d.className='veh';
  d.innerHTML=`<select class="vTipo"><option value="">— Tipo —</option>${VEHICULOS.map(v=>`<option${v===tipo?' selected':''}>${esc(v)}</option>`).join('')}</select>
    <input type="number" class="vN" min="1" max="99" value="${n}" title="Cantidad"><button type="button" class="ghost" title="Quitar">✕</button>`;
  d.querySelector('button').onclick=()=>{ if($('#vehiculos').children.length>1){ d.remove(); draw(); } };
  $('#vehiculos').appendChild(d);
}
$('#addVeh').onclick=()=>{ if($('#vehiculos').children.length<VEHICULOS.length) filaVehiculo(); };
$('#supRango').innerHTML='<option value="">— Selecciona —</option>'+RANGOS.map(r=>`<option>${esc(r)}</option>`).join('');

function precargar(){
  $('#fecha').value=hoyISO();
  const fe=$('#fecha'); if(!fe.dataset.picker){ fe.dataset.picker='1'; fe.addEventListener('click',()=>{ try{ fe.showPicker(); }catch(e){} }); }
  bloquear('nombre', YO.nombre || YO.usuario); bloquear('rango', YO.rango);
  $('#objetivo').value='Asegurar puntos AK.';
  $('#nInt').value='2'; $('#ints').innerHTML=''; ajustarIntegrantes();
  $('#vehiculos').innerHTML=''; filaVehiculo('Humvee Blindado',1);
  actualizarTotal();
}

// ---------- Fotos ----------
let photos=[];
$('#fotos').addEventListener('change', async e=>{
  for(const f of e.target.files){ if(photos.length>=MAX_FOTOS) break; photos.push({img:await loadFile(f),name:f.name}); }
  e.target.value=''; renderThumbs(); draw();
});
function loadFile(f){return new Promise((res,rej)=>{const u=URL.createObjectURL(f);const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=u;});}
function renderThumbs(){
  const t=$('#thumbs'); t.innerHTML='';
  photos.forEach((p,i)=>{ const d=document.createElement('div'); d.className='thumb';
    d.innerHTML=`<img src="${p.img.src}" alt=""><b>${i+1}</b><button type="button" title="Quitar">✕</button>`;
    d.querySelector('button').onclick=()=>{photos.splice(i,1);renderThumbs();draw();}; t.appendChild(d); });
  $('#fotoCount').textContent=photos.length?`${photos.length} de ${MAX_FOTOS} fotos`:'Sin fotos';
}

// ---------- Datos y validación ----------
function getData(){
  return { fecha:$('#fecha').value, objetivo:$('#objetivo').value.trim(),
    territorios:TERRITORIOS.map((t,i)=>({ nombre:t, tomado:document.querySelector(`.tTom[data-i="${i}"]`).checked, resultado:document.querySelector(`.tRes[data-i="${i}"]`).value.trim() })),
    estado:$('#estado').value,
    integrantes:[...document.querySelectorAll('#ints .int')].map(x=>x.value.trim()),
    vehiculos:[...document.querySelectorAll('#vehiculos .veh')].map(v=>({ tipo:v.querySelector('.vTipo').value, n:+v.querySelector('.vN').value||0 })).filter(v=>v.tipo&&v.n>0),
    nombre:$('#nombre').value.trim(), rango:$('#rango').value.trim(), supNombre:$('#supNombre').value.trim(), supRango:$('#supRango').value };
}
const totalTomados=d=>d.territorios.filter(t=>t.tomado).length;
function fmtFecha(iso){ if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
function codigoDoc(iso){ if(!iso) return 'DOC-OP-AK'; const [y,m,d]=iso.split('-'); return `DOC-OP-AK-${y}-${m}${d}`; }
function validate(d){
  const e=[];
  if(!d.fecha) e.push('• La fecha es obligatoria.');
  if(!d.objetivo) e.push('• Indica el objetivo de la operación.');
  d.territorios.forEach(t=>{ if(!t.resultado) e.push(`• Indica el resultado de ${t.nombre}.`); });
  if(!ESTADOS.includes(d.estado)) e.push('• Selecciona el estado / novedades.');
  const vacios=d.integrantes.map((n,i)=>n?null:i+1).filter(Boolean); if(vacios.length) e.push(`• Falta el nombre del integrante ${vacios.join(', ')}.`);
  { const vistos=new Set(); for(const n of d.integrantes){ const k=n.toLowerCase(); if(k&&vistos.has(k)){ e.push(`• "${n}" está repetido en los integrantes.`); break; } vistos.add(k); } }
  if(!d.vehiculos.length) e.push('• Indica al menos un vehículo (tipo y cantidad).');
  if(!d.nombre) e.push('• El nombre del responsable es obligatorio.');
  if(!d.rango) e.push('• Tu perfil no tiene rango asignado. Pide al administrador que lo asigne.');
  if(!d.supNombre) e.push('• Indica el nombre del supervisor.');
  if(!RANGOS.includes(d.supRango)) e.push('• Selecciona el rango del supervisor.');
  if(!photos.length) e.push('• Adjunta al menos una foto de evidencia.');
  return e;
}
function showErr(msg,ok){ const el=$('#err'); el.textContent=msg; el.className='err'+(ok?' ok':''); }

// ---------- Dibujo (plantilla 1024 x 768) ----------
const cv=$('#cv'), ctx=cv.getContext('2d');
const tpl=new Image(); tpl.src='plantilla.png?v=1';
const SCALE=2, W=1024, H=768;
const GOLD='#f0c24d', BLANCO='#f3f3f3', PANEL='rgba(6,12,18,.82)';
const T={ date:{x:296,y:128,w:170,h:32}, panel:{x:44,y:192,w:936,h:448}, firmaL:{x:98,y:668,w:172,h:30,sub:{x:40,y:696,w:262,h:34}}, firmaR:{x:826,y:668,w:172,h:30,sub:{x:786,y:696,w:262,h:34}}, code:{x:283,y:731,w:140,h:22} };
function fit(txt,maxW){ while(ctx.measureText(txt).width>maxW && txt.length>1) txt=txt.slice(0,-1); return txt; }
function wrap(txt,maxW){ const out=[]; for(const para of txt.split('\n')){ let line=''; for(const w of para.split(' ')){ const t=line?line+' '+w:w; if(ctx.measureText(t).width>maxW && line){out.push(line);line=w;} else line=t; } out.push(line); } return out; }
function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function tag(txt,x,y){ txt=txt.toUpperCase(); ctx.font='bold 15px "Roboto Condensed",Arial'; const w=ctx.measureText(txt).width+26; ctx.fillStyle=GOLD; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+w,y); ctx.lineTo(x+w+10,y+11); ctx.lineTo(x+w,y+22); ctx.lineTo(x,y+22); ctx.closePath(); ctx.fill(); ctx.fillStyle='#0b1016'; ctx.textBaseline='middle'; ctx.fillText(txt,x+12,y+11); return w+10; }
function annexLayout(){
  const gap=18, colW=(W-gap*3)/2, maxH=520, rows=[];
  for(let i=0;i<photos.length;i+=2){ const pair=photos.slice(i,i+2).map(p=>{ const s=Math.min(colW/p.img.naturalWidth,maxH/p.img.naturalHeight); return {p,w:p.img.naturalWidth*s,h:p.img.naturalHeight*s}; }); rows.push({items:pair,h:Math.max(...pair.map(x=>x.h))}); }
  return {gap,colW,rows,total: photos.length ? 60+rows.reduce((a,r)=>a+r.h+gap,0)+30 : 0};
}
let FOLIO=null, SELLO=null;
function draw(){
  if(!tpl.complete||!tpl.naturalWidth) return;
  const d=getData(), L=annexLayout();
  cv.width=W*SCALE; cv.height=(H+L.total)*SCALE;
  ctx.setTransform(SCALE,0,0,SCALE,0,0); ctx.imageSmoothingQuality='high';
  ctx.fillStyle='#070b0d'; ctx.fillRect(0,0,W,H+L.total);
  ctx.drawImage(tpl,0,0,W,H);
  ctx.textBaseline='middle'; ctx.textAlign='left';

  // Fecha
  { const b=T.date; ctx.fillStyle='#161c24'; rr(b.x,b.y,b.w,b.h,6); ctx.fill();
    if(d.fecha){ ctx.fillStyle=GOLD; ctx.font='bold 21px "Roboto Condensed",Arial'; ctx.textAlign='center'; ctx.fillText(fmtFecha(d.fecha),b.x+b.w/2,b.y+b.h/2+1); ctx.textAlign='left'; } }

  // Panel principal
  { const p=T.panel; ctx.fillStyle=PANEL; rr(p.x,p.y,p.w,p.h,10); ctx.fill(); ctx.strokeStyle='#c9a43a'; ctx.lineWidth=1.5; rr(p.x,p.y,p.w,p.h,10); ctx.stroke();
    const x=p.x+16; let y=p.y+14; const maxW=p.w-32;
    // Objetivo
    tag('Objetivo de la operación',x,y); y+=32;
    ctx.fillStyle=BLANCO; ctx.font='bold 16px "Roboto Condensed",Arial'; ctx.fillText(fit(d.objetivo||'—',maxW),x+4,y); y+=24;
    // Resultados
    tag('Resultados',x,y); y+=32;
    for(const t of d.territorios){
      ctx.fillStyle=t.tomado?'#7fd38a':'#ff6b6b'; ctx.font='bold 17px "Roboto Condensed",Arial'; ctx.fillText(t.tomado?'✔':'✘',x+4,y);
      ctx.fillStyle=BLANCO; ctx.font='bold 16px "Roboto Condensed",Arial'; const n=`${t.nombre.toUpperCase()} —`; ctx.fillText(n,x+24,y); const nw=ctx.measureText(n).width;
      ctx.fillStyle=GOLD; ctx.font='15px "Roboto Condensed",Arial'; ctx.fillText(fit(t.resultado||'—',maxW-nw-34),x+30+nw,y); y+=21;
    }
    // Barra total / estado
    y+=4; ctx.fillStyle='#0b141b'; rr(x,y-13,maxW,28,5); ctx.fill(); ctx.strokeStyle='#c9a43a'; ctx.lineWidth=1; rr(x,y-13,maxW,28,5); ctx.stroke();
    ctx.fillStyle=BLANCO; ctx.font='bold 15px "Roboto Condensed",Arial'; let tx=x+12; ctx.fillText('TOTAL TERRITORIOS (AKs) TOMADOS:',tx,y+1); tx+=ctx.measureText('TOTAL TERRITORIOS (AKs) TOMADOS:').width+8;
    ctx.fillStyle=GOLD; ctx.fillText(`${totalTomados(d)} / ${TERRITORIOS.length}`,tx,y+1); tx+=ctx.measureText(`${totalTomados(d)} / ${TERRITORIOS.length}`).width+16;
    ctx.fillStyle='#6b7a82'; ctx.fillText('|',tx,y+1); tx+=14;
    ctx.fillStyle=BLANCO; ctx.fillText('ESTADO:',tx,y+1); tx+=ctx.measureText('ESTADO:').width+8;
    ctx.fillStyle=d.estado==='Fallido'?'#ff6b6b':d.estado==='Toma parcial'?'#f0c24d':'#7fd38a'; ctx.fillText((d.estado||'—').toUpperCase(),tx,y+1);
    y+=32;
    // Integrantes (columnas dinámicas)
    tag('Integrantes',x,y); y+=30;
    const vehH=48, areaH=(p.y+p.h-vehH)-y-6, names=d.integrantes.map((n,i)=>n||`${i+1}. —`);
    let fs=15, lh=19; let rows=Math.max(1,Math.floor(areaH/lh)); let cols=Math.ceil(names.length/rows);
    while(cols>6 && fs>11){ fs--; lh=fs+4; rows=Math.max(1,Math.floor(areaH/lh)); cols=Math.ceil(names.length/rows); }
    cols=Math.max(1,Math.min(cols,6)); rows=Math.ceil(names.length/cols); const colW=maxW/cols;
    ctx.font=`bold ${fs}px "Roboto Condensed",Arial`;
    names.forEach((n,i)=>{ const c=Math.floor(i/rows), r=i%rows; const xx=x+4+c*colW, yy=y+r*lh;
      ctx.fillStyle=GOLD; ctx.fillText('•',xx,yy); ctx.fillStyle=i===0?GOLD:BLANCO; ctx.fillText(fit(n,colW-18),xx+10,yy); });
    // Vehículos (al pie del panel)
    const vy=p.y+p.h-vehH+10;
    ctx.strokeStyle='#c9a43a'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(x,vy-6); ctx.lineTo(x+maxW,vy-6); ctx.stroke();
    ctx.textAlign='center'; ctx.fillStyle=GOLD; ctx.font='bold 14px "Roboto Condensed",Arial'; ctx.fillText('VEHÍCULOS',p.x+p.w/2,vy+6);
    ctx.fillStyle=BLANCO; ctx.font='bold 16px "Roboto Condensed",Arial';
    ctx.fillText(fit(d.vehiculos.length?d.vehiculos.map(v=>`${v.n}x ${v.tipo}`).join('  ·  '):'—',maxW),p.x+p.w/2,vy+26); ctx.textAlign='left';
  }

  // Firmas
  for(const [b,nombre,rango,rol] of [[T.firmaL,d.nombre,d.rango,'Responsable'],[T.firmaR,d.supNombre,d.supRango,'Supervisor']]){
    ctx.fillStyle='#0b141b'; ctx.fillRect(b.x,b.y,b.w,b.h); ctx.fillRect(b.sub.x,b.sub.y,b.sub.w,b.sub.h);
    ctx.fillStyle=GOLD; ctx.font='italic bold 16px "Roboto Condensed",Arial'; ctx.fillText(fit(nombre||'',b.w-4),b.x+2,b.y+b.h/2);
    ctx.fillStyle='#d7dde0'; ctx.font='14px "Roboto Condensed",Arial'; ctx.textAlign='center'; ctx.fillText(`${rol} · ${rango||'—'}`,b.sub.x+b.sub.w/2,b.sub.y+b.sub.h/2); ctx.textAlign='left';
  }
  // Código del documento
  { const b=T.code; ctx.fillStyle='#0b141b'; ctx.fillRect(b.x-70,b.y,b.w+70,b.h);
    ctx.fillStyle='#c9b27a'; ctx.font='bold 12px "Roboto Condensed",Arial'; ctx.textAlign='right'; ctx.fillText(codigoDoc(d.fecha)+(FOLIO?` · ${FOLIO}`:''),b.x+b.w-4,b.y+b.h/2); ctx.textAlign='left'; }

  // Anexo fotográfico
  if(photos.length){
    let y=H;
    ctx.fillStyle='#0e1b20'; ctx.fillRect(0,y,W,46); ctx.fillStyle='#c9a43a'; ctx.fillRect(0,y,W,3); ctx.fillRect(0,y+43,W,3);
    ctx.fillStyle=GOLD; ctx.font='italic bold 24px "Roboto Condensed",Arial'; ctx.fillText('ANEXO FOTOGRÁFICO · TOMA DE TERRITORIO (AK)',24,y+23);
    ctx.fillStyle='#fff'; ctx.font='bold 15px "Roboto Condensed",Arial'; ctx.textAlign='right'; ctx.fillText(d.fecha?fmtFecha(d.fecha):'',W-24,y+23); ctx.textAlign='left';
    y+=60; let n=0;
    L.rows.forEach(r=>{ r.items.forEach((it,k)=>{ const x=L.gap+k*(L.colW+L.gap)+(L.colW-it.w)/2;
        ctx.fillStyle='#0e1b20'; rr(x-4,y-4,it.w+8,it.h+8,8); ctx.fill(); ctx.strokeStyle='#c9a43a'; ctx.lineWidth=1.5; rr(x-4,y-4,it.w+8,it.h+8,8); ctx.stroke();
        ctx.drawImage(it.p.img,x,y,it.w,it.h); n++;
        ctx.fillStyle='#000b'; rr(x+6,y+6,30,22,4); ctx.fill(); ctx.fillStyle=GOLD; ctx.font='bold 14px "Roboto Condensed",Arial'; ctx.textAlign='center'; ctx.fillText(String(n),x+21,y+17); ctx.textAlign='left'; });
      y+=r.h+L.gap; });
    ctx.fillStyle='#8a9398'; ctx.font='bold 13px "Roboto Condensed",Arial'; ctx.textAlign='center'; ctx.fillText('"UNIDOS SOMOS LA GRAN FUERZA DE WASCO, EJÉRCITO DE LA COSTA OESTE WASCO 2026"',W/2,y+10); ctx.textAlign='left';
  }
  // Sello
  if(FOLIO){ ctx.save(); ctx.textAlign='right'; ctx.textBaseline='alphabetic'; const txt=`FOLIO ${FOLIO} · ${SELLO||''}`;
    ctx.font='bold 12px "Roboto Condensed",Arial'; const w=ctx.measureText(txt).width+16;
    ctx.fillStyle='#000c'; rr(W-14-w,H-26,w,18,4); ctx.fill(); ctx.fillStyle=GOLD; ctx.fillText(txt,W-22,H-13); ctx.restore(); }
}

precargar();
const BORR = borrador({ clave:'toma-territorio', yo:YO, form:document.getElementById('form'),
  antes:v=>{ const n=Math.max(0,...Object.keys(v).map(k=>k.match(/^v(\d+)\|SELECT\.vTipo/)).filter(Boolean).map(m=>+m[1]))+1; while($('#vehiculos').children.length<n) filaVehiculo(); },
  despues:()=>{ actualizarTotal(); try{ draw(); }catch(e){} } });
tpl.onload=draw;
document.fonts && document.fonts.ready.then(draw);
$('#form').addEventListener('submit',e=>e.preventDefault());
$('#form').addEventListener('input',draw);
$('#form').addEventListener('change',draw);
$('#btnPreview').onclick=draw;
$('#btnExport').onclick=async()=>{
  const d=getData(), e=validate(d);
  if(e.length){ showErr(e.join('\n')); return; }
  showErr('');
  const btn=$('#btnExport'); btn.disabled=true; btn.textContent='Registrando…';
  try{
    const reg=await crearReporte({ formularioId:FORM, fecha:d.fecha,
      resumen:`${d.nombre} (${d.rango}) · ${totalTomados(d)}/${TERRITORIOS.length} AKs · ${d.estado} · ${d.integrantes.length} integrante(s) · ${d.vehiculos.map(v=>`${v.n}x ${v.tipo}`).join(', ')} · ${photos.length} foto(s)`,
      datos:{...d, totalTomados:totalTomados(d), codigo:codigoDoc(d.fecha), fotos:photos.map(p=>p.name)} });
    FOLIO=reg.folio; SELLO=`${(reg.datos.usuario||'')} · ${new Date(reg.datos.sellado_en||Date.now()).toLocaleString('es-CO')}`;
    draw();
    btn.textContent='Exportando…';
    const blob=await new Promise(res=>cv.toBlob(res,'image/png'));
    const a=document.createElement('a'); a.download=`reporte-toma-territorio-${FOLIO}-${d.fecha}.png`; a.href=URL.createObjectURL(blob); a.click();
    await adjuntarImagen({ yo:YO, id:reg.id, formularioId:FORM, pngBlob:blob });
    BORR.limpiar(); const dc=await notificarDiscord(reg.id);
    showErr(`Reporte ${FOLIO} exportado y guardado en el historial.`+textoDiscord(dc),true);
  }catch(x){ showErr('No se pudo completar: '+x.message); }
  FOLIO=null; SELLO=null; draw();
  btn.disabled=false; btn.textContent='Exportar imagen';
};
$('#btnReset').onclick=()=>{ BORR.limpiar(); $('#form').reset(); photos=[]; renderThumbs(); showErr(''); document.querySelectorAll('.tRes').forEach(i=>i.value=''); precargar(); draw(); };

mejorasMovil();
