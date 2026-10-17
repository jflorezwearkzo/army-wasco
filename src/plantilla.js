// Motor de plantillas: definición JSON -> formulario HTML + dibujo sobre canvas.
// Lo usan reportes/plantilla/ (formulario genérico) y admin/disenador.html (vista previa).
import { RANGOS, esc, hoyISO } from './auth.js';

export const ANCHO = 1024;                    // todas las plantillas se dibujan a 1024 px de ancho (x2 al exportar)
export const TIPOS = {
  texto:    { nombre:'Texto corto' },
  parrafo:  { nombre:'Texto largo (varias líneas)' },
  fecha:    { nombre:'Fecha (calendario)' },
  hora:     { nombre:'Hora militar (HH:MM)' },
  numero:   { nombre:'Número' },
  opcion:   { nombre:'Desplegable (opciones)' },
  sino:     { nombre:'Sí / No' },
  rango:    { nombre:'Rango (lista de rangos)' },
  persona:  { nombre:'Persona (buscador de miembros)' },
  personas: { nombre:'Lista de personas (1 a N, con buscador)' },
  lista:    { nombre:'Lista de textos (1 a N)' },
  foto:     { nombre:'Foto en recuadro' },
};
export const DEFECTOS = { '':'— Vacío —', hoy:'Fecha de hoy', mi_nombre:'Mi nombre', mi_rango:'Mi rango', mi_rango_pm:'Mi Rango PM', mi_usuario:'Mi usuario', mi_rango_nombre:'Mi rango y nombre' };

export function campoNuevo(tipo='texto', n=1){
  return { id:'c'+Date.now().toString(36)+n, tipo, etiqueta:'Campo '+n, req:true, defecto:'', bloqueado:false, opciones:[], max:3, resumen:false,
    caja:{ x:40, y:40+n*30, w:300, h:24 },
    estilo:{ tam:17, negrita:true, color:'#f0c24d', fondo:'#0e1b20', alinear:'left', prefijo:'', prefijoColor:'#ffffff', columnas:1, formato:'dd-mm-aaaa', lineas:0 } };
}
export function definicionNueva(){ return { v:1, fondo:null, fotos:{ min:0, max:10, titulo:'ANEXO FOTOGRÁFICO' }, campos:[] }; }

// ---------- Valores por defecto a partir del perfil ----------
export function valorDefecto(campo, yo){
  const d = campo.defecto || '';
  switch(d){
    case 'hoy': return hoyISO();
    case 'mi_nombre': return yo.nombre || yo.usuario || '';
    case 'mi_rango': return yo.rango || '';
    case 'mi_rango_pm': return (yo.rol && yo.rol.rango_pm) || '';
    case 'mi_usuario': return yo.usuario || '';
    case 'mi_rango_nombre': return [yo.rango, yo.nombre||yo.usuario].filter(Boolean).join(' ');
    default: return d;
  }
}

// ---------- Construcción del formulario HTML ----------
// Devuelve { leer(): valores, fotosDe(campo), setIntegrantes(lista) }
export function construirFormulario(cont, def, yo, { onChange=()=>{}, integrantes=()=>[] }={}){
  cont.innerHTML='';
  const fotos = {};             // id campo -> {img,name} para tipo foto
  const el = {};                // id campo -> elemento(s)
  const sel = (n, sel0) => `<select>${'<option value="">--</option>'+Array.from({length:n},(_,i)=>`<option${String(i).padStart(2,'0')===sel0?' selected':''}>${String(i).padStart(2,'0')}</option>`).join('')}</select>`;
  function sugerencias(input, buscar, pintar, elegir){
    const ul=document.createElement('ul'); input.parentElement.appendChild(ul);
    const cerrar=()=>{ ul.style.display='none'; }; let timer=null;
    const mostrar=async()=>{ const items=await buscar(input.value.trim()); if(!items.length){ cerrar(); return; }
      ul.innerHTML=items.map((it,i)=>`<li data-i="${i}">${pintar(it)}</li>`).join('');
      ul.querySelectorAll('li').forEach(li=>li.onmousedown=e=>{ e.preventDefault(); elegir(items[+li.dataset.i]); cerrar(); input.dataset.elegido='1'; input.dispatchEvent(new Event('input',{bubbles:true})); input.blur(); });
      ul.style.display='block'; };
    input.addEventListener('focus',mostrar);
    input.addEventListener('input',()=>{ if(input.dataset.elegido){ delete input.dataset.elegido; return; } clearTimeout(timer); timer=setTimeout(mostrar,150); });
    input.addEventListener('blur',cerrar);
  }
  const buscarPersona = (inputs, inp) => async q => { q=q.toLowerCase(); const usados=inputs.filter(x=>x!==inp).map(x=>x.value.trim().toLowerCase()).filter(Boolean);
    return integrantes().filter(p=>!usados.includes(p.texto.toLowerCase())&&(!q||p.texto.toLowerCase().includes(q)||p.usuario.toLowerCase().includes(q))).slice(0,12); };
  const pintarPersona = p=>`<b>${esc(p.texto)}</b><small>@${esc(p.usuario)}</small>`;

  for(const c of def.campos){
    const w=document.createElement('div'); w.className='campo'; w.dataset.id=c.id;
    const lab=document.createElement('label'); lab.textContent=c.etiqueta+(c.req?' *':''); w.appendChild(lab);
    const v0=valorDefecto(c,yo);
    let box=document.createElement('div'); w.appendChild(box);
    const bloquear=i=>{ if(c.bloqueado){ i.readOnly=true; i.tabIndex=-1; i.style.opacity='.75'; i.title='Lo asigna el administrador'; if(i.tagName==='SELECT') i.style.pointerEvents='none'; } };
    switch(c.tipo){
      case 'texto': case 'numero': { const i=document.createElement('input'); i.type=c.tipo==='numero'?'number':'text'; i.maxLength=120; i.value=v0; bloquear(i); box.appendChild(i); el[c.id]=i; break; }
      case 'parrafo': { const i=document.createElement('textarea'); i.maxLength=600; i.value=v0; bloquear(i); box.appendChild(i); el[c.id]=i; break; }
      case 'fecha': { const i=document.createElement('input'); i.type='date'; i.value=v0; bloquear(i); i.addEventListener('click',()=>{ try{ i.showPicker(); }catch(e){} }); box.appendChild(i); el[c.id]=i; break; }
      case 'hora': { box.className='hora'; box.innerHTML=sel(24,(v0||'').slice(0,2))+'<span>:</span>'+sel(60,(v0||'').slice(3,5)); const s=box.querySelectorAll('select'); s.forEach(bloquear); el[c.id]=s; break; }
      case 'opcion': case 'rango': case 'sino': { const i=document.createElement('select'); const ops=c.tipo==='sino'?['SÍ','NO']:c.tipo==='rango'?RANGOS:(c.opciones||[]);
        i.innerHTML='<option value="">— Selecciona —</option>'+ops.map(o=>`<option${o===v0?' selected':''}>${esc(o)}</option>`).join(''); bloquear(i); box.appendChild(i); el[c.id]=i; break; }
      case 'persona': { box.className='sug'; const i=document.createElement('input'); i.type='text'; i.maxLength=60; i.autocomplete='off'; i.value=v0; i.placeholder='Escribe para buscar…'; bloquear(i); box.appendChild(i); if(!c.bloqueado) sugerencias(i,buscarPersona([i],i),pintarPersona,p=>{ i.value=p.texto; }); el[c.id]=i; break; }
      case 'personas': case 'lista': {
        const n=Math.max(1,Math.min(60,+c.max||3)); const inputs=[];
        box.className='lista'; const nsel=document.createElement('select'); nsel.innerHTML=Array.from({length:n},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join(''); nsel.value=String(Math.min(n,+c.min||1));
        const lab2=document.createElement('small'); lab2.textContent='Cantidad: '; lab2.appendChild(nsel); box.appendChild(lab2);
        const cont2=document.createElement('div'); cont2.className='ints'; box.appendChild(cont2);
        const ajustar=()=>{ const k=+nsel.value; while(cont2.children.length<k){ const idx=cont2.children.length; const wrap=document.createElement('div'); wrap.className='sug'; const i=document.createElement('input'); i.type='text'; i.maxLength=60; i.autocomplete='off'; i.placeholder=`${idx+1}.`;
            if(idx===0 && v0){ i.value=v0; if(c.bloqueado) bloquear(i); }
            wrap.appendChild(i); cont2.appendChild(wrap); inputs.push(i); if(c.tipo==='personas' && !(idx===0&&c.bloqueado)) sugerencias(i,buscarPersona(inputs,i),pintarPersona,p=>{ i.value=p.texto; }); }
          while(cont2.children.length>k){ cont2.lastElementChild.remove(); inputs.pop(); } onChange(); };
        nsel.addEventListener('change',ajustar); ajustar(); el[c.id]=inputs; break; }
      case 'foto': { const i=document.createElement('input'); i.type='file'; i.accept='image/*'; i.style.fontSize='13px'; const t=document.createElement('div'); t.className='thumb'; t.textContent='Sin foto';
        i.addEventListener('change',async e=>{ const f=e.target.files[0]; if(!f) return; fotos[c.id]={img:await cargarImagen(f),name:f.name}; t.innerHTML=`<img src="${fotos[c.id].img.src}" alt=""><button type="button" title="Quitar">✕</button>`; t.querySelector('button').onclick=()=>{ delete fotos[c.id]; t.textContent='Sin foto'; i.value=''; onChange(); }; onChange(); });
        box.appendChild(i); box.appendChild(t); el[c.id]=i; break; }
    }
    cont.appendChild(w);
  }
  cont.addEventListener('input',onChange); cont.addEventListener('change',onChange);
  function leer(){
    const v={};
    for(const c of def.campos){ const e=el[c.id]; if(!e) continue;
      if(c.tipo==='hora'){ v[c.id]=(e[0].value&&e[1].value)?`${e[0].value}:${e[1].value}`:''; }
      else if(Array.isArray(e)){ v[c.id]=e.map(i=>i.value.trim()); }
      else if(c.tipo==='foto'){ v[c.id]=fotos[c.id]?fotos[c.id].name:''; }
      else v[c.id]=(e.value||'').trim(); }
    return v;
  }
  return { leer, fotos, el };
}
export function cargarImagen(f){ return new Promise((res,rej)=>{ const u=URL.createObjectURL(f); const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=u; }); }

export function validar(def, v, fotosCampo, fotosAnexo){
  const e=[];
  for(const c of def.campos){ const x=v[c.id];
    if(c.tipo==='foto'){ if(c.req && !fotosCampo[c.id]) e.push(`• Falta la foto: ${c.etiqueta}.`); continue; }
    if(Array.isArray(x)){ const vacios=x.map((s,i)=>s?null:i+1).filter(Boolean); if(c.req&&vacios.length) e.push(`• ${c.etiqueta}: falta el ${vacios.join(', ')}.`);
      const vistos=new Set(); for(const s of x){ const k=s.toLowerCase(); if(k&&vistos.has(k)){ e.push(`• ${c.etiqueta}: "${s}" está repetido.`); break; } vistos.add(k); } continue; }
    if(c.req && !x) e.push(`• ${c.etiqueta} es obligatorio.`);
    if(c.tipo==='fecha' && x && x>hoyISO()) e.push(`• ${c.etiqueta}: la fecha no puede ser futura.`);
  }
  const f=def.fotos||{min:0,max:10};
  if(fotosAnexo.length<(f.min||0)) e.push(`• Adjunta al menos ${f.min} foto(s) de evidencia.`);
  return e;
}

// ---------- Dibujo ----------
export function fmtFecha(iso, formato='dd-mm-aaaa'){ if(!iso) return ''; const [y,m,d]=iso.split('-'); return formato==='dd/mm/aaaa'?`${d}/${m}/${y}`:formato==='aaaa-mm-dd'?iso:`${d}-${m}-${y}`; }
function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function fit(ctx,txt,maxW){ while(ctx.measureText(txt).width>maxW && txt.length>1) txt=txt.slice(0,-1); return txt; }
function wrap(ctx,txt,maxW){ const out=[]; for(const para of String(txt).split('\n')){ let line=''; for(const w of para.split(' ')){ const t=line?line+' '+w:w; if(ctx.measureText(t).width>maxW && line){out.push(line);line=w;} else line=t; } out.push(line); } return out; }
export function layoutAnexo(fotos, W){
  const gap=18, colW=(W-gap*3)/2, maxH=520, rows=[];
  for(let i=0;i<fotos.length;i+=2){ const pair=fotos.slice(i,i+2).map(p=>{ const s=Math.min(colW/p.img.naturalWidth,maxH/p.img.naturalHeight); return {p,w:p.img.naturalWidth*s,h:p.img.naturalHeight*s}; }); rows.push({items:pair,h:Math.max(...pair.map(x=>x.h))}); }
  return { gap, colW, rows, total: fotos.length ? 60+rows.reduce((a,r)=>a+r.h+gap,0)+30 : 0 };
}
// Dibuja la plantilla completa en cv. fondoImg: Image cargada. valores: leer(). fotosCampo: {id:{img}}. fotosAnexo: [{img}]. sello: {folio, texto} | null
export function dibujar(cv, def, fondoImg, valores, fotosCampo, fotosAnexo, sello=null, { escala=2, fechaAnexo='' }={}){
  const ctx=cv.getContext('2d'); const W=ANCHO, H=def.fondo ? Math.round(def.fondo.h) : 572;
  const L=layoutAnexo(fotosAnexo||[], W);
  cv.width=W*escala; cv.height=(H+L.total)*escala;
  ctx.setTransform(escala,0,0,escala,0,0); ctx.imageSmoothingQuality='high';
  ctx.fillStyle='#070b0d'; ctx.fillRect(0,0,W,H+L.total);
  if(fondoImg && fondoImg.naturalWidth) ctx.drawImage(fondoImg,0,0,W,H); else { ctx.fillStyle='#101c21'; ctx.fillRect(0,0,W,H); }
  ctx.textBaseline='middle';
  for(const c of def.campos){
    const b=c.caja, s=c.estilo||{}; const v=valores[c.id];
    const fuente=(peso)=>`${peso?'bold ':''}${s.tam||17}px "Roboto Condensed",Arial`;
    if(s.fondo && s.fondo!=='transparent'){ ctx.fillStyle=s.fondo; ctx.fillRect(b.x,b.y,b.w,b.h); }
    if(c.tipo==='foto'){ const p=fotosCampo[c.id]; ctx.fillStyle='#050a0c'; rr(ctx,b.x,b.y,b.w,b.h,6); ctx.fill(); if(p){ const sc=Math.min(b.w/p.img.naturalWidth,b.h/p.img.naturalHeight), w=p.img.naturalWidth*sc, h=p.img.naturalHeight*sc; ctx.save(); rr(ctx,b.x,b.y,b.w,b.h,6); ctx.clip(); ctx.drawImage(p.img,b.x+(b.w-w)/2,b.y+(b.h-h)/2,w,h); ctx.restore(); } continue; }
    let texto = v;
    if(c.tipo==='fecha') texto=fmtFecha(v,s.formato);
    const lineas = Array.isArray(v) ? v.map((t,i)=>t?`${i+1}. ${t}`:'') .filter(Boolean) : (c.tipo==='parrafo' ? null : [texto]);
    const pad=4; let x=b.x+pad; const maxW=b.w-pad*2;
    // prefijo (etiqueta dentro de la imagen)
    let px=0; if(s.prefijo){ ctx.textAlign='left'; ctx.fillStyle=s.prefijoColor||'#fff'; ctx.font=fuente(false); ctx.fillText(s.prefijo,x,b.y+(c.tipo==='parrafo'||Array.isArray(v)?(s.tam||17)/2+pad:b.h/2)); px=ctx.measureText(s.prefijo).width+6; }
    ctx.fillStyle=s.color||'#f0c24d'; ctx.font=fuente(s.negrita!==false);
    if(c.tipo==='parrafo'){ if(!texto) continue; const lh=(s.tam||17)+3; const ls=wrap(ctx,texto,maxW-px); const top=b.y+pad+(s.tam||17)/2; const maxL=s.lineas>0?s.lineas:Math.floor((b.h-pad*2)/lh); ctx.textAlign='left'; ls.slice(0,Math.max(1,maxL)).forEach((ln,i)=>ctx.fillText(ln,x+(i===0?px:0),top+i*lh)); continue; }
    if(Array.isArray(v)){ if(!lineas.length) continue; const cols=Math.max(1,Math.min(6,+s.columnas||1)); const lh=(s.tam||17)+3; const rows=Math.ceil(lineas.length/cols); const colW=(maxW-px)/cols; ctx.textAlign='left';
      lineas.forEach((ln,i)=>{ const col=Math.floor(i/rows), row=i%rows; ctx.fillText(fit(ctx,ln,colW-6),x+px+col*colW,b.y+pad+(s.tam||17)/2+row*lh); }); continue; }
    if(!texto) continue;
    const al=s.alinear||'left'; ctx.textAlign=al; const tx=al==='center'?x+px+(maxW-px)/2:al==='right'?b.x+b.w-pad:x+px;
    ctx.fillText(fit(ctx,String(texto),maxW-px),tx,b.y+b.h/2);
  }
  ctx.textAlign='left';
  // Anexo
  if(fotosAnexo && fotosAnexo.length){
    let y=H; const tit=(def.fotos&&def.fotos.titulo)||'ANEXO FOTOGRÁFICO';
    ctx.fillStyle='#0e1b20'; ctx.fillRect(0,y,W,46); ctx.fillStyle='#c9a43a'; ctx.fillRect(0,y,W,3); ctx.fillRect(0,y+43,W,3);
    ctx.fillStyle='#f0c24d'; ctx.font='italic bold 24px "Roboto Condensed",Arial'; ctx.fillText(tit,24,y+23);
    ctx.fillStyle='#fff'; ctx.font='bold 15px "Roboto Condensed",Arial'; ctx.textAlign='right'; ctx.fillText(fechaAnexo||'',W-24,y+23); ctx.textAlign='left';
    y+=60; let n=0;
    L.rows.forEach(r=>{ r.items.forEach((it,k)=>{ const x=L.gap+k*(L.colW+L.gap)+(L.colW-it.w)/2;
        ctx.fillStyle='#0e1b20'; rr(ctx,x-4,y-4,it.w+8,it.h+8,8); ctx.fill(); ctx.strokeStyle='#c9a43a'; ctx.lineWidth=1.5; rr(ctx,x-4,y-4,it.w+8,it.h+8,8); ctx.stroke();
        ctx.drawImage(it.p.img,x,y,it.w,it.h); n++; ctx.fillStyle='#000b'; rr(ctx,x+6,y+6,30,22,4); ctx.fill(); ctx.fillStyle='#f0c24d'; ctx.font='bold 14px "Roboto Condensed",Arial'; ctx.textAlign='center'; ctx.fillText(String(n),x+21,y+17); ctx.textAlign='left'; });
      y+=r.h+L.gap; });
    ctx.fillStyle='#8a9398'; ctx.font='bold 13px "Roboto Condensed",Arial'; ctx.textAlign='center'; ctx.fillText('¡HONOR  ★  LEALTAD  ★  DISCIPLINA!',W/2,y+10); ctx.textAlign='left';
  }
  // Sello
  if(sello && sello.folio){ ctx.save(); ctx.textAlign='right'; ctx.textBaseline='alphabetic'; const txt=`FOLIO ${sello.folio} · ${sello.texto||''}`;
    ctx.font='bold 12px "Roboto Condensed",Arial'; const w=ctx.measureText(txt).width+16; ctx.fillStyle='#000c'; rr(ctx,W-14-w,H-26,w,18,4); ctx.fill(); ctx.fillStyle='#f0c24d'; ctx.fillText(txt,W-22,H-13); ctx.restore(); }
  return { W, H, total:L.total };
}
export function resumenDe(def, v){
  const partes=[]; for(const c of def.campos){ if(!c.resumen) continue; const x=v[c.id]; if(Array.isArray(x)) { if(x.filter(Boolean).length) partes.push(`${x.filter(Boolean).length} ${c.etiqueta.toLowerCase()}`); } else if(x) partes.push(c.tipo==='fecha'?fmtFecha(x):String(x)); }
  return partes.join(' · ');
}
// Fondo público del bucket "plantillas"
export function cargarFondo(def){ return new Promise(res=>{ if(!def.fondo||!def.fondo.url) return res(null); const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=()=>res(null); i.src=def.fondo.url; }); }
