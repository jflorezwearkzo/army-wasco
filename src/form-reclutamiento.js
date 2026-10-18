import { requerir, barraUsuario, crearReporte, adjuntarImagen, notificarDiscord, textoDiscord, borrador, mejorasMovil, bloquearPantalla, hoyISO, faviconEmoji, sb, RANGOS } from './auth.js';
const YO = await requerir({ formulario:'reclutamiento' }); barraUsuario(YO);
sb.from('formularios').select('icono').eq('id','reclutamiento').maybeSingle().then(({data}) => faviconEmoji(data && data.icono));
// Fecha de hoy (editable); nombre, rango y Rango PM vienen del perfil/rol y quedan bloqueados
const bloquear=(id,val)=>{ const el=document.getElementById(id); if(!el) return; el.value=val||''; el.readOnly=true; el.tabIndex=-1; el.style.opacity='.75'; el.title='Lo asigna el administrador'; if(el.tagName==='SELECT'){ el.style.pointerEvents='none'; } };
function precargar(){
  document.getElementById('fecha').value = hoyISO();
  const fe=document.getElementById('fecha'); if(!fe.dataset.picker){ fe.dataset.picker='1'; fe.addEventListener('click',()=>{ try{ fe.showPicker(); }catch(e){} }); }
  bloquear('nombre', YO.nombre || YO.usuario);
  bloquear('rango', YO.rango);
  bloquear('rangoPM', YO.rol.rango_pm);
}
precargar();
const BORR = borrador({ clave:'reclutamiento', yo:YO, form:document.getElementById('form'), despues:()=>{ try{ draw(); }catch(e){} } });
// ---------- Coordenadas sobre la plantilla (1024 x 572) ----------
const T = {
  panel: '#0e1b20',
  date:   {x:536, y:44, w:122, h:40},
  nombre: {x:102, y:154, w:398, h:22},
  rango:  {x:90,  y:176, w:410, h:22},
  ofNombre:{label:'Nombre del Oficial:', x:24, y:258, w:478, h:24},
  ofRangoLibre:{label:'Rango:',          x:24, y:282, w:478, h:24},
  ofRango: {label:'Rango Asignado PM:',  x:24, y:306, w:478, h:24},
  notas:  {x:24, y:330, w:478, h:126, label:'Notas / Observaciones:', top:10},
  box:    {x:534, y:200, w:468, h:268}     // recuadro de evidencia
};
const RANGOS_ASIG=['Oficial','Auxiliar PM','Co-Líder'];
document.getElementById('ofRangoLibre').innerHTML='<option value="">— Selecciona —</option>'+RANGOS.map(r=>`<option>${r}</option>`).join('');

const $=s=>document.querySelector(s);
const cv=$('#cv'), ctx=cv.getContext('2d');
const tpl=new Image(); tpl.src='plantilla.png?v=3';
let photos=[];

$('#fotos').addEventListener('change', async e=>{
  const f=e.target.files[0];
  if(f){ const img=await loadFile(f); photos=[{img,name:f.name}]; }   // una sola foto: reemplaza la anterior
  e.target.value=''; renderThumbs(); draw();
});
function loadFile(f){return new Promise((res,rej)=>{const u=URL.createObjectURL(f);const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=u;});}
function renderThumbs(){
  const t=$('#thumbs'); t.innerHTML='';
  photos.forEach((p,i)=>{
    const d=document.createElement('div'); d.className='thumb';
    d.innerHTML=`<img src="${p.img.src}" alt=""><button type="button" title="Quitar">✕</button>`;
    d.querySelector('button').onclick=()=>{photos.splice(i,1);renderThumbs();draw();};
    t.appendChild(d);
  });
  $('#fotoCount').textContent=photos.length?'1 foto adjunta (elige otra para reemplazarla)':'Sin foto';
}

function getData(){
  return {fecha:$('#fecha').value, nombre:$('#nombre').value.trim(), rango:$('#rango').value.trim(), rangoPM:$('#rangoPM').value.trim(),
          ofNombre:$('#ofNombre').value.trim(), ofRangoLibre:$('#ofRangoLibre').value, ofRango:$('#ofRango').value,
          notas:$('#notas').value.trim()};
}
function fmtFecha(iso){ if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}-${m}-${y}`; }
function validate(d){
  const e=[];
  if(!d.fecha) e.push('• La fecha es obligatoria.');
  if(!d.nombre) e.push('• El nombre de quien reporta es obligatorio.');
  if(!d.rango) e.push('• Tu perfil no tiene rango asignado. Pide al administrador que lo asigne.');
  if(!d.ofNombre) e.push('• El nombre del oficial reclutado es obligatorio.');
  if(!d.rangoPM) e.push('• Tu rol no tiene Rango PM asignado. Pide al administrador que lo configure en el rol.');
  if(!RANGOS.includes(d.ofRangoLibre)) e.push('• Selecciona el rango del oficial.');
  if(!RANGOS_ASIG.includes(d.ofRango)) e.push('• Selecciona el rango asignado PM.');
  if(photos.length!==1) e.push('• Debes adjuntar la foto de evidencia.');
  return e;
}
function showErr(msg){ $('#err').textContent=msg; if(!msg) $('#err').style.color=''; }

// ---------- Dibujo ----------
const SCALE=2, W=1024, H=572;
function fit(txt,maxW){ while(ctx.measureText(txt).width>maxW && txt.length>1) txt=txt.slice(0,-1); return txt; }
function wrap(txt,maxW){
  const out=[]; for(const para of txt.split('\n')){ let line='';
    for(const w of para.split(' ')){ const t=line?line+' '+w:w; if(ctx.measureText(t).width>maxW && line){out.push(line);line=w;} else line=t; }
    out.push(line); }
  return out;
}
function annexLayout(){            // una foto por fila, a todo el ancho
  const gap=18, colW=W-gap*2, maxH=1200, rows=[];
  for(const p of photos){
    const s=Math.min(colW/p.img.naturalWidth,maxH/p.img.naturalHeight);
    const it={p,w:p.img.naturalWidth*s,h:p.img.naturalHeight*s};
    rows.push({items:[it],h:it.h});
  }
  return {gap,colW,rows,total: photos.length ? 60+rows.reduce((a,r)=>a+r.h+gap,0)+30 : 0};
}
function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

let FOLIO=null, SELLO=null;
function draw(){
  if(!tpl.complete||!tpl.naturalWidth) return;
  const d=getData(), L=annexLayout();
  cv.width=W*SCALE; cv.height=(H+L.total)*SCALE;
  ctx.setTransform(SCALE,0,0,SCALE,0,0); ctx.imageSmoothingQuality='high';
  ctx.fillStyle='#070b0d'; ctx.fillRect(0,0,W,H+L.total);
  ctx.drawImage(tpl,0,0,W,H);
  ctx.textBaseline='middle'; ctx.textAlign='left';

  // Fecha (siempre se limpia el texto de ejemplo de la plantilla)
  ctx.fillStyle='#0c0f10'; rr(T.date.x,T.date.y,T.date.w,T.date.h,5); ctx.fill(); ctx.strokeStyle='#c9a43a'; ctx.lineWidth=1.2; ctx.stroke();
  if(d.fecha){ ctx.fillStyle='#fff'; ctx.font='bold 15px "Roboto Condensed",Arial'; ctx.textAlign='center';
    ctx.fillText(fmtFecha(d.fecha),T.date.x+T.date.w/2+14,T.date.y+T.date.h/2+6); ctx.textAlign='left'; }
  ctx.fillStyle='#f0c24d'; ctx.font='bold 11px "Roboto Condensed",Arial'; ctx.fillText('FECHA:',T.date.x+42,T.date.y+12);
  ctx.fillStyle='#f0c24d'; rr(T.date.x+10,T.date.y+12,22,18,3); ctx.fill(); ctx.fillStyle='#0c0f10'; ctx.fillRect(T.date.x+13,T.date.y+17,16,10);

  // Emisor
  if(d.nombre){ const b=T.nombre; ctx.fillStyle=T.panel; ctx.fillRect(b.x,b.y,b.w,b.h);
    ctx.fillStyle='#f0c24d'; ctx.font='bold 17px "Roboto Condensed",Arial'; ctx.fillText(fit(d.nombre,b.w-4),b.x+2,b.y+b.h/2); }
  if(d.rango||d.rangoPM){ const b=T.rango; ctx.fillStyle=T.panel; ctx.fillRect(b.x,b.y,b.w,b.h);
    let x=b.x+2; const y=b.y+b.h/2;
    ctx.fillStyle='#f0c24d'; ctx.font='bold 17px "Roboto Condensed",Arial'; const r=fit(d.rango||'—',200); ctx.fillText(r,x,y); x+=ctx.measureText(r).width+8;
    if(d.rangoPM){ ctx.fillStyle='#8a9398'; ctx.fillText('|',x,y); x+=12;
      ctx.fillStyle='#fff'; ctx.font='17px "Roboto Condensed",Arial'; ctx.fillText('Rango PM:',x,y); x+=ctx.measureText('Rango PM:').width+6;
      ctx.fillStyle='#f0c24d'; ctx.font='bold 17px "Roboto Condensed",Arial'; ctx.fillText(d.rangoPM,x,y); }
  }

  // Oficial reclutado
  for(const [k,box] of [['ofNombre',T.ofNombre],['ofRangoLibre',T.ofRangoLibre],['ofRango',T.ofRango]]){
    if(!d[k]) continue;
    ctx.fillStyle=T.panel; ctx.fillRect(box.x,box.y,box.w,box.h);
    ctx.fillStyle='#fff'; ctx.font='17px "Roboto Condensed",Arial'; ctx.fillText(box.label,box.x+2,box.y+box.h/2);
    const lw=ctx.measureText(box.label).width+6;
    ctx.fillStyle='#f0c24d'; ctx.font='bold 17px "Roboto Condensed",Arial';
    ctx.fillText(fit(d[k],box.w-lw-4),box.x+2+lw,box.y+box.h/2);
  }

  // Notas (siempre se limpia la zona, incluida la línea vacía de la plantilla)
  { const b=T.notas; ctx.fillStyle=T.panel; ctx.fillRect(b.x,b.y,b.w,b.h); }
  if(d.notas){
    const b=T.notas;
    ctx.fillStyle='#fff'; ctx.font='17px "Roboto Condensed",Arial'; ctx.fillText(b.label,b.x+2,b.y+b.top+11);
    ctx.fillStyle='#f0c24d'; ctx.font='bold 15px "Roboto Condensed",Arial';
    wrap(d.notas,b.w-8).slice(0,5).forEach((ln,i)=>ctx.fillText(ln,b.x+2,b.y+b.top+32+i*18));
  }

  // Evidencia (primera foto en el recuadro)
  if(photos[0]){
    const c=T.box, p=photos[0], pad=8;
    ctx.fillStyle='#070b0d'; rr(c.x,c.y,c.w,c.h,8); ctx.fill();
    const s=Math.min((c.w-pad*2)/p.img.naturalWidth,(c.h-pad*2)/p.img.naturalHeight);
    const w=p.img.naturalWidth*s, h=p.img.naturalHeight*s;
    ctx.save(); rr(c.x,c.y,c.w,c.h,8); ctx.clip();
    ctx.drawImage(p.img,c.x+(c.w-w)/2,c.y+(c.h-h)/2,w,h); ctx.restore();
  }

  // Anexo fotográfico
  if(photos.length){
    let y=H;
    ctx.fillStyle='#0e1b20'; ctx.fillRect(0,y,W,46);
    ctx.fillStyle='#c9a43a'; ctx.fillRect(0,y,W,3); ctx.fillRect(0,y+43,W,3);
    ctx.fillStyle='#f0c24d'; ctx.font='italic bold 24px "Roboto Condensed",Arial';
    ctx.fillText('ANEXO FOTOGRÁFICO · EVIDENCIA DEL RECLUTAMIENTO',24,y+23);
    ctx.fillStyle='#fff'; ctx.font='bold 15px "Roboto Condensed",Arial'; ctx.textAlign='right';
    ctx.fillText(d.fecha?fmtFecha(d.fecha):'',W-24,y+23); ctx.textAlign='left';
    y+=60; let n=0;
    L.rows.forEach(r=>{
      r.items.forEach((it,k)=>{
        const x=L.gap+k*(L.colW+L.gap)+(L.colW-it.w)/2, yy=y;
        ctx.fillStyle='#0e1b20'; rr(x-4,yy-4,it.w+8,it.h+8,8); ctx.fill();
        ctx.strokeStyle='#c9a43a'; ctx.lineWidth=1.5; rr(x-4,yy-4,it.w+8,it.h+8,8); ctx.stroke();
        ctx.drawImage(it.p.img,x,yy,it.w,it.h);
      });
      y+=r.h+L.gap;
    });
    ctx.fillStyle='#8a9398'; ctx.font='bold 13px "Roboto Condensed",Arial'; ctx.textAlign='center';
    ctx.fillText('¡HONOR  ★  LEALTAD  ★  DISCIPLINA!',W/2,y+10); ctx.textAlign='left';
  }

  // Sello de verificación (folio asignado por el servidor)
  if(FOLIO){
    ctx.save(); ctx.textAlign='right'; ctx.textBaseline='alphabetic';
    const txt=`FOLIO ${FOLIO} · ${SELLO||''}`;
    ctx.font='bold 12px "Roboto Condensed",Arial'; const w=ctx.measureText(txt).width+16;
    ctx.fillStyle='#000c'; rr(W-14-w, H-26, w, 18, 4); ctx.fill();
    ctx.fillStyle='#f0c24d'; ctx.fillText(txt, W-22, H-13);
    ctx.restore();
  }
}

tpl.onload=draw;
document.fonts && document.fonts.ready.then(draw);
$('#form').addEventListener('submit',e=>e.preventDefault());
$('#form').addEventListener('input',draw);
$('#btnPreview').onclick=draw;
$('#btnExport').onclick=async()=>{
  const d=getData(), e=validate(d);
  if(e.length){ showErr(e.join('\n')); return; }
  showErr('');
  const btn=$('#btnExport'); btn.disabled=true; btn.textContent='Registrando…'; const ov=bloquearPantalla('Registrando el reporte en el servidor…');
  try{
    // 1) Registro en el servidor (sella identidad y asigna folio)
    const reg=await crearReporte({ formularioId:'reclutamiento', fecha:d.fecha, resumen:`${d.nombre} (${d.rango}, ${d.rangoPM}) reclutó a ${d.ofNombre} · ${d.ofRango}`, datos:{...d, fotos:photos.map(p=>p.name)} });
    FOLIO=reg.folio; SELLO=`${(reg.datos.usuario||'')} · ${new Date(reg.datos.sellado_en||Date.now()).toLocaleString('es-CO')}`;
    draw();
    // 2) Imagen con el folio estampado
    btn.textContent='Exportando…'; ov.texto(`Folio ${FOLIO} asignado. Generando la imagen…`);
    const blob=await new Promise(res=>cv.toBlob(res,'image/png'));
    const a=document.createElement('a'); a.download=`reporte-reclutamiento-${FOLIO}-${fmtFecha(d.fecha)}.png`; a.href=URL.createObjectURL(blob); a.click();
    // 3) Adjuntar al historial
    ov.texto('Guardando en el historial…'); await adjuntarImagen({ yo:YO, id:reg.id, formularioId:'reclutamiento', pngBlob:blob });
    BORR.limpiar(); ov.texto('Publicando en Discord…'); const dc=await notificarDiscord(reg.id);
    const msg=`Reporte ${FOLIO} exportado y guardado en el historial.`+textoDiscord(dc);
    FOLIO=null; SELLO=null; limpiarFormulario(); $('#err').style.color='#7fd38a'; showErr(msg); ov.exito(msg);
  }catch(x){ ov.quitar(); $('#err').style.color=''; showErr('No se pudo completar: '+x.message); }
  FOLIO=null; SELLO=null;
  btn.disabled=false; btn.textContent='Exportar imagen';
};
function limpiarFormulario(){ BORR.limpiar(); $('#form').reset(); photos=[]; renderThumbs(); showErr(''); precargar(); draw(); }
$('#btnReset').onclick=limpiarFormulario;

mejorasMovil();
