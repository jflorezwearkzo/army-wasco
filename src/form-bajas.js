import { requerir, barraUsuario, crearReporte, adjuntarImagen, notificarDiscord, textoDiscord, borrador, hoyISO, faviconEmoji, sb } from './auth.js';
const YO = await requerir({ formulario:'bajas' }); barraUsuario(YO);
sb.from('formularios').select('icono').eq('id','bajas').maybeSingle().then(({data}) => faviconEmoji(data && data.icono));
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
const BORR = borrador({ clave:'bajas', yo:YO, form:document.getElementById('form'), despues:()=>{ try{ draw(); }catch(e){} } });
// ---------- Coordenadas sobre la plantilla (1024 x 765) ----------
const T = {
  panel: '#0e1b20',
  date:  {x:552, y:58, w:96, h:20},               // cuadro "DD-MM-AAAA"
  nombre:{x:104, y:155, w:396, h:21},              // valor "Nombre:"
  rango: {x:92,  y:175, w:408, h:21},              // valor "Rango:"
  lineY0:252, lineStep:21.8,                       // filas 1..10 de abatidos
  lineX:{clear:[48,502], clear10:58, text:50},
  cells: (()=>{                                    // 12 celdas en la plantilla (se usan 10)
    const cols=[540,700,858], rows=[162,242,321,401], w=147, h=76, out=[];
    for(let r=0;r<4;r++) for(let c=0;c<3;c++){
      let hh=h; if(out.length===11) hh=56;        // última celda: no tapar el escudo
      out.push({x:cols[c], y:rows[r], w, h:hh});
    }
    return out;
  })()
};

const $=s=>document.querySelector(s);
const cv=$('#cv'), ctx=cv.getContext('2d');
const tpl=new Image(); tpl.src='plantilla.png?v=3';
let photos=[]; // {img, name}

// Filas de abatidos
const abat=$('#abatidos');
for(let i=1;i<=10;i++){
  abat.insertAdjacentHTML('beforeend',
   `<div class="row"><span>${i}.</span>
    <input type="text" class="a-nombre" maxlength="22" placeholder="Nombre">
    <input type="text" class="a-rango" maxlength="16" placeholder="Rango">
    <input type="text" class="a-motivo" maxlength="26" placeholder="Motivo"></div>`);
}

// Fotos
$('#fotos').addEventListener('change', async e=>{
  const files=[...e.target.files];
  for(const f of files){
    if(photos.length>=10){ showErr('Máximo 10 fotos. Se ignoraron las demás.'); break; }
    const img=await loadFile(f); photos.push({img,name:f.name});
  }
  e.target.value=''; renderThumbs(); draw();
});
function loadFile(f){return new Promise((res,rej)=>{const u=URL.createObjectURL(f);const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=u;});}
function renderThumbs(){
  const t=$('#thumbs'); t.innerHTML='';
  photos.forEach((p,i)=>{
    const d=document.createElement('div'); d.className='thumb';
    d.innerHTML=`<img src="${p.img.src}" alt=""><b>${i+1}</b><button type="button" title="Quitar">✕</button>`;
    d.querySelector('button').onclick=()=>{photos.splice(i,1);renderThumbs();draw();};
    t.appendChild(d);
  });
  $('#fotoCount').textContent=`${photos.length} / 10 fotos`;
}

// ---------- Datos ----------
function getData(){
  const rows=[...abat.querySelectorAll('.row')].map(r=>({
    nombre:r.querySelector('.a-nombre').value.trim(),
    rango:r.querySelector('.a-rango').value.trim(),
    motivo:r.querySelector('.a-motivo').value.trim()}));
  return {fecha:$('#fecha').value, nombre:$('#nombre').value.trim(), rango:$('#rango').value.trim(), rows};
}
function fmtFecha(iso){ if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}-${m}-${y}`; }
function validate(d){
  const e=[];
  if(!d.fecha) e.push('• La fecha es obligatoria.');
  if(!d.nombre) e.push('• El nombre de quien reporta es obligatorio.');
  if(!d.rango) e.push('• Tu perfil no tiene rango asignado. Pide al administrador que lo asigne.');
  if(!d.rows.some(r=>r.nombre)) e.push('• Debes registrar al menos una persona abatida (nombre).');
  d.rows.forEach((r,i)=>{ if(!r.nombre && (r.rango||r.motivo)) e.push(`• Fila ${i+1}: falta el nombre.`); });
  if(photos.length<1) e.push('• Debes adjuntar al menos una foto.');
  if(photos.length>10) e.push('• Máximo 10 fotos.');
  return e;
}
function showErr(msg){ $('#err').textContent=msg; if(!msg) $('#err').style.color=''; }

// ---------- Dibujo ----------
function fit(txt,maxW){ while(ctx.measureText(txt).width>maxW && txt.length>1) txt=txt.slice(0,-1); return txt; }
const SCALE=2;                      // exportación a 2048 px de ancho
const W=1024, H=572;
function annexLayout(){             // filas de 2 fotos debajo del formato
  const gap=18, colW=(W-gap*3)/2, maxH=520, rows=[];
  for(let i=0;i<photos.length;i+=2){
    const pair=photos.slice(i,i+2).map(p=>{
      const s=Math.min(colW/p.img.naturalWidth, maxH/p.img.naturalHeight);
      return {p, w:p.img.naturalWidth*s, h:p.img.naturalHeight*s};
    });
    rows.push({items:pair, h:Math.max(...pair.map(x=>x.h))});
  }
  const total = photos.length ? 60 + rows.reduce((a,r)=>a+r.h+gap,0) + 30 : 0;
  return {gap,colW,rows,total};
}
let FOLIO=null, SELLO=null;
function draw(){
  if(!tpl.complete||!tpl.naturalWidth) return;
  const d=getData();
  const L=annexLayout();
  cv.width=W*SCALE; cv.height=(H+L.total)*SCALE;
  ctx.setTransform(SCALE,0,0,SCALE,0,0);
  ctx.imageSmoothingQuality='high';
  ctx.fillStyle='#070b0d'; ctx.fillRect(0,0,W,H+L.total);
  ctx.drawImage(tpl,0,0,W,H);
  ctx.textBaseline='middle';

  // Fecha
  if(d.fecha){
    ctx.fillStyle='#0c0f10'; rr(T.date.x,T.date.y,T.date.w,T.date.h,4); ctx.fill();
    ctx.fillStyle='#ffffff'; ctx.font='bold 15px "Roboto Condensed",Arial';
    ctx.textAlign='center'; ctx.fillText(fmtFecha(d.fecha),T.date.x+T.date.w/2,T.date.y+T.date.h/2+1);
  }
  ctx.textAlign='left';

  // Emisor
  for(const [k,box] of [['nombre',T.nombre],['rango',T.rango]]){
    if(!d[k]) continue;
    ctx.fillStyle=T.panel; ctx.fillRect(box.x,box.y,box.w,box.h);
    ctx.fillStyle='#f0c24d'; ctx.font='bold 17px "Roboto Condensed",Arial';
    ctx.fillText(fit(d[k],box.w-4),box.x+2,box.y+box.h/2);
  }

  // Abatidos
  d.rows.forEach((r,i)=>{
    if(!r.nombre) return;
    const y=T.lineY0+i*T.lineStep;
    const x0=i===9?T.lineX.clear10:T.lineX.clear[0];
    ctx.fillStyle=T.panel; ctx.fillRect(x0,y-10,T.lineX.clear[1]-x0,20);
    let x=x0+2;
    const part=(lbl,val,w)=>{
      ctx.font='bold 15px "Roboto Condensed",Arial'; ctx.fillStyle='#ffffff'; ctx.fillText(lbl,x,y); x+=ctx.measureText(lbl).width+4;
      ctx.fillStyle='#f0c24d'; const v=fit(val||'—',w); ctx.fillText(v,x,y); x+=ctx.measureText(v).width+6;
    };
    part('Nombre:',r.nombre,118); sep(); part('Rango:',r.rango,80); sep(); part('Motivo:',r.motivo,110);
    function sep(){ ctx.fillStyle='#8a9398'; ctx.fillText('|',x,y); x+=10; }
  });

  // Fotos: tapa el texto de la celda y dibuja la foto (contain) con su número
  T.cells.forEach((c,i)=>{
    ctx.fillStyle='#070b0d'; rr(c.x+4,c.y+4,c.w-8,c.h-8,6); ctx.fill();   // limpia el texto de la celda
    const p=photos[i];
    if(!p){ if(i<10){ ctx.fillStyle='#f0c24d'; ctx.font='bold 13px "Roboto Condensed",Arial'; ctx.fillText(`${i+1}.`,c.x+10,c.y+14);} return; }
    const pad=5, aw=c.w-pad*2, ah=c.h-pad*2;
    const s=Math.min(aw/p.img.naturalWidth, ah/p.img.naturalHeight);
    const w=p.img.naturalWidth*s, h=p.img.naturalHeight*s;
    ctx.save(); rr(c.x+4,c.y+4,c.w-8,c.h-8,6); ctx.clip();
    ctx.drawImage(p.img, c.x+(c.w-w)/2, c.y+(c.h-h)/2, w, h); ctx.restore();
    ctx.fillStyle='#000c'; rr(c.x+6,c.y+6,24,16,4); ctx.fill();
    ctx.fillStyle='#f0c24d'; ctx.font='bold 13px "Roboto Condensed",Arial'; ctx.fillText(`${i+1}.`,c.x+10,c.y+14);
  });

  // Anexo fotográfico (fotos grandes)
  if(photos.length){
    let y=H;
    ctx.fillStyle='#0e1b20'; ctx.fillRect(0,y,W,46);
    ctx.fillStyle='#c9a43a'; ctx.fillRect(0,y,W,3); ctx.fillRect(0,y+43,W,3);
    ctx.fillStyle='#f0c24d'; ctx.font='italic bold 24px "Roboto Condensed",Arial'; ctx.textAlign='left';
    ctx.fillText('ANEXO FOTOGRÁFICO · PRUEBAS GRÁFICAS', 24, y+23);
    ctx.fillStyle='#ffffff'; ctx.font='bold 15px "Roboto Condensed",Arial'; ctx.textAlign='right';
    ctx.fillText(`${photos.length} foto${photos.length>1?'s':''}${d.fecha?' · '+fmtFecha(d.fecha):''}`, W-24, y+23);
    ctx.textAlign='left';
    y+=60; let n=0;
    L.rows.forEach(r=>{
      r.items.forEach((it,k)=>{
        const x=L.gap+k*(L.colW+L.gap)+(L.colW-it.w)/2, yy=y;
        ctx.fillStyle='#0e1b20'; rr(x-4,yy-4,it.w+8,it.h+8,8); ctx.fill();
        ctx.strokeStyle='#c9a43a'; ctx.lineWidth=1.5; rr(x-4,yy-4,it.w+8,it.h+8,8); ctx.stroke();
        ctx.drawImage(it.p.img, x, yy, it.w, it.h);
        n++; ctx.fillStyle='#000c'; rr(x+8,yy+8,34,24,5); ctx.fill();
        ctx.fillStyle='#f0c24d'; ctx.font='bold 17px "Roboto Condensed",Arial'; ctx.fillText(`${n}.`,x+15,yy+20);
      });
      y+=r.h+L.gap;
    });
    ctx.fillStyle='#8a9398'; ctx.font='bold 13px "Roboto Condensed",Arial'; ctx.textAlign='center';
    ctx.fillText('¡HONOR  ★  LEALTAD  ★  DISCIPLINA!', W/2, y+10); ctx.textAlign='left';
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
function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

tpl.onload=draw;
document.fonts && document.fonts.ready.then(draw);
$('#form').addEventListener('submit',e=>e.preventDefault());
$('#form').addEventListener('input',draw);
$('#btnPreview').onclick=draw;
$('#btnExport').onclick=async()=>{
  const d=getData(), e=validate(d);
  if(e.length){ showErr(e.join('\n')); return; }
  showErr('');
  const btn=$('#btnExport'); btn.disabled=true; btn.textContent='Registrando…';
  try{
    // 1) Registro en el servidor (sella identidad y asigna folio)
    const reg=await crearReporte({ formularioId:'bajas', fecha:d.fecha, resumen:`${d.nombre} (${d.rango}) · ${d.rows.filter(r=>r.nombre).length} abatido(s) · ${photos.length} foto(s)`, datos:{...d, fotos:photos.map(p=>p.name)} });
    FOLIO=reg.folio; SELLO=`${(reg.datos.usuario||'')} · ${new Date(reg.datos.sellado_en||Date.now()).toLocaleString('es-CO')}`;
    draw();
    // 2) Imagen con el folio estampado
    btn.textContent='Exportando…';
    const blob=await new Promise(res=>cv.toBlob(res,'image/png'));
    const a=document.createElement('a'); a.download=`reporte-bajas-${FOLIO}-${fmtFecha(d.fecha)}.png`; a.href=URL.createObjectURL(blob); a.click();
    // 3) Adjuntar al historial
    await adjuntarImagen({ yo:YO, id:reg.id, formularioId:'bajas', pngBlob:blob });
    BORR.limpiar(); const dc=await notificarDiscord(reg.id);
    $('#err').style.color='#7fd38a'; showErr(`Reporte ${FOLIO} exportado y guardado en el historial.`+textoDiscord(dc));
  }catch(x){ $('#err').style.color=''; showErr('No se pudo completar: '+x.message); }
  FOLIO=null; SELLO=null;
  btn.disabled=false; btn.textContent='Exportar imagen';
};
$('#btnReset').onclick=()=>{ BORR.limpiar(); $('#form').reset(); photos=[]; renderThumbs(); showErr(''); precargar(); draw(); };
