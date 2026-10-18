// Motor de plantillas: definición JSON -> formulario HTML + dibujo sobre canvas.
// Lo usan reportes/plantilla/ (formulario genérico) y admin/disenador.html (vista previa).
import { RANGOS, esc, hoyISO, cargarFoto } from './auth.js';

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
  casillas: { nombre:'Casillas (lista fija con ✔/✘ y texto)' },
  formula:  { nombre:'Campo calculado (fórmula)' },
  foto:     { nombre:'Foto en recuadro' },
};
export const OPERACIONES = {
  contar:   'Contar (casillas marcadas o elementos de una lista)',
  copiar:   'Copiar el valor de otro campo',
  unir:     'Unir varios campos con un separador',
  codigo:   'Código a partir de una fecha (PREFIJO-AAAA-MMDD)',
  total:    'Marcadas / total de una lista de casillas (p. ej. 2 / 3)',
  pagina:   'Número de página (01, 02…) en reportes de varias páginas',
  paginas:  'Página / total (p. ej. 2 / 3)',
};
export const DEFECTOS = { '':'— Vacío —', hoy:'Fecha de hoy', mi_nombre:'Mi nombre', mi_rango:'Mi rango', mi_rango_pm:'Mi Rango PM', mi_usuario:'Mi usuario', mi_rango_nombre:'Mi rango y nombre' };

export function campoNuevo(tipo='texto', n=1){
  return { id:'c'+Date.now().toString(36)+n, tipo, etiqueta:'Campo '+n, req:true, defecto:'', bloqueado:false, opciones:[], min:1, max:3, resumen:false, porPagina:false,
    conTexto:false, textoDef:'', formula:{ op:'contar', origen:'', origenes:[], sep:' · ', prefijo:'DOC' },
    reglas:{ habilitarCampo:'', habilitarValor:'', reqCampo:'', reqValor:'', posteriorA:'' },
    caja:{ x:40, y:40+n*30, w:300, h:24 },
    estilo:{ tam:17, negrita:true, color:'#f0c24d', fondo:'#0e1b20', alinear:'left', prefijo:'', prefijoColor:'#ffffff', columnas:0, formato:'dd-mm-aaaa', lineas:0 } };
}
export function definicionNueva(){ return { v:3, fondo:null, fotos:{ min:0, max:10, titulo:'ANEXO FOTOGRÁFICO' }, paginas:{ activo:false, etiqueta:'Página', max:10 }, campos:[] }; }

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

// ---------- Reglas ----------
const norm = s => String(s==null?'':s).trim().toLowerCase();
function cumple(def, valores, campoId, valor){
  if(!campoId) return true;
  const c=def.campos.find(x=>x.id===campoId); if(!c) return true;
  const v=valores[campoId];
  if(c.tipo==='casillas') return Array.isArray(v) && v.some(x=>x.on);          // "si hay alguna casilla marcada"
  if(Array.isArray(v)) return v.filter(Boolean).length>0;
  if(valor==null || valor==='') return !!norm(v);
  return norm(v)===norm(valor);
}
export const estaActivo = (def, valores, c) => cumple(def, valores, c.reglas&&c.reglas.habilitarCampo, c.reglas&&c.reglas.habilitarValor);
const esRequerido = (def, valores, c) => c.req && (!c.reglas||!c.reglas.reqCampo ? true : cumple(def, valores, c.reglas.reqCampo, c.reglas.reqValor));

// ---------- Fórmulas ----------
export function calcular(def, c, valores){
  const f=c.formula||{}; const o=def.campos.find(x=>x.id===f.origen); const v=o?valores[o.id]:undefined;
  const cnt = x => Array.isArray(x) ? (o&&o.tipo==='casillas' ? x.filter(i=>i.on).length : x.filter(Boolean).length) : (x?1:0);
  switch(f.op){
    case 'contar': return o ? String(cnt(v)) : '';
    case 'total':  return o ? `${cnt(v)} / ${o.tipo==='casillas' ? (o.opciones||[]).length : (Array.isArray(v)?v.length:0)}` : '';
    case 'copiar': return o ? textoDe(o, v) : '';
    case 'unir':   return (f.origenes||[]).map(id=>{ const oc=def.campos.find(x=>x.id===id); return oc?textoDe(oc, valores[id]):''; }).filter(Boolean).join(f.sep||' · ');
    case 'codigo': { if(!o||!v) return ''; const [y,m,d]=String(v).split('-'); return `${f.prefijo||'DOC'}-${y}-${m}${d}`; }
    case 'pagina': return String(valores.__pagina||1).padStart(2,'0');
    case 'paginas': return `${valores.__pagina||1} / ${valores.__paginas||1}`;
    default: return '';
  }
}
function textoDe(c, v){ if(v==null) return ''; if(c.tipo==='fecha') return fmtFecha(v, c.estilo&&c.estilo.formato); if(c.tipo==='casillas') return v.filter(i=>i.on).map(i=>i.nombre).join(', '); if(Array.isArray(v)) return v.filter(Boolean).join(', '); return String(v); }

// ---------- Construcción del formulario HTML ----------
export function construirFormulario(cont, def, yo, { onChange=()=>{}, integrantes=()=>[], campos=null, otros=()=>({}) }={}){
  cont.innerHTML='';
  const CAMPOS = campos || def.campos;
  const fotos = {}; const el = {}; const wraps = {};
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

  for(const c of CAMPOS){
    const w=document.createElement('div'); w.className='campo'; w.dataset.id=c.id; wraps[c.id]=w;
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
      case 'casillas': { box.className='casillas'; const filas=[];
        for(const o of (c.opciones||[])){ const f=document.createElement('div'); f.className='terr'; const chk=document.createElement('input'); chk.type='checkbox'; const l=document.createElement('label'); l.appendChild(chk); l.appendChild(document.createTextNode(' '+o)); f.appendChild(l);
          let txt=null; if(c.conTexto){ txt=document.createElement('input'); txt.type='text'; txt.maxLength=80; txt.placeholder='Resultado / detalle'; f.appendChild(txt); chk.addEventListener('change',()=>{ if(chk.checked && !txt.value.trim() && c.textoDef) txt.value=c.textoDef; }); }
          box.appendChild(f); filas.push({nombre:o, chk, txt}); }
        el[c.id]=filas; break; }
      case 'formula': { const i=document.createElement('input'); i.type='text'; i.readOnly=true; i.tabIndex=-1; i.style.opacity='.75'; i.title='Se calcula automáticamente'; box.appendChild(i); el[c.id]=i; break; }
      case 'foto': { const i=document.createElement('input'); i.type='file'; i.accept='image/*'; i.style.fontSize='13px'; const t=document.createElement('div'); t.className='thumb'; t.textContent='Sin foto';
        i.addEventListener('change',async e=>{ const f=e.target.files[0]; if(!f) return; fotos[c.id]={img:await cargarImagen(f),name:f.name}; t.innerHTML=`<img src="${fotos[c.id].img.src}" alt=""><button type="button" title="Quitar">✕</button>`; t.querySelector('button').onclick=()=>{ delete fotos[c.id]; t.textContent='Sin foto'; i.value=''; onChange(); }; onChange(); });
        box.appendChild(i); box.appendChild(t); el[c.id]=i; break; }
    }
    cont.appendChild(w);
  }
  function leerPropio(){
    const v={};
    for(const c of CAMPOS){ const e=el[c.id]; if(!e) continue;
      if(c.tipo==='hora'){ v[c.id]=(e[0].value&&e[1].value)?`${e[0].value}:${e[1].value}`:''; }
      else if(c.tipo==='casillas'){ v[c.id]=e.map(f=>({ nombre:f.nombre, on:f.chk.checked, texto:f.txt?f.txt.value.trim():'' })); }
      else if(c.tipo==='formula'){ v[c.id]=''; }
      else if(Array.isArray(e)){ v[c.id]=e.map(i=>i.value.trim()); }
      else if(c.tipo==='foto'){ v[c.id]=fotos[c.id]?fotos[c.id].name:''; }
      else v[c.id]=(e.value||'').trim(); }
    return v;
  }
  function leerCrudo(){ return { ...otros(), ...leerPropio() }; }
  function leer(){
    const v=leerCrudo();
    for(const c of def.campos){ if(!estaActivo(def,v,c)) v[c.id]=Array.isArray(v[c.id])?[]:''; }     // campos inhabilitados no cuentan
    for(const c of def.campos){ if(c.tipo==='formula'){ v[c.id]=calcular(def,c,v); if(el[c.id]) el[c.id].value=v[c.id]; } }
    return v;
  }
  function aplicarReglas(){
    const v=leerCrudo();
    for(const c of CAMPOS){ const w=wraps[c.id]; if(!w) continue; const on=estaActivo(def,v,c);
      w.classList.toggle('inactivo',!on); w.querySelectorAll('input,select,textarea').forEach(i=>{ if(c.tipo==='formula') return; i.disabled=!on; });
      const lab=w.querySelector('label'); if(lab) lab.textContent=c.etiqueta+(esRequerido(def,v,c)?' *':''); }
  }
  cont.addEventListener('input',()=>{ aplicarReglas(); onChange(); }); cont.addEventListener('change',()=>{ aplicarReglas(); onChange(); });
  aplicarReglas();
  return { leer, leerPropio, fotos, el };
}
export const cargarImagen = f => cargarFoto(f);

export function validar(def, v, fotosCampo, fotosAnexo){
  const e=[];
  for(const c of def.campos){ if(!estaActivo(def,v,c) || c.tipo==='formula') continue; const x=v[c.id]; const req=esRequerido(def,v,c);
    if(c.tipo==='foto'){ if(req && !fotosCampo[c.id]) e.push(`• Falta la foto: ${c.etiqueta}.`); continue; }
    if(c.tipo==='casillas'){ if(req && !x.some(i=>i.on)) e.push(`• ${c.etiqueta}: marca al menos una casilla.`); if(c.conTexto) x.forEach(i=>{ if(req && !i.texto) e.push(`• ${c.etiqueta}: falta el texto de "${i.nombre}".`); }); continue; }
    if(Array.isArray(x)){ const vacios=x.map((s,i)=>s?null:i+1).filter(Boolean); if(req&&vacios.length) e.push(`• ${c.etiqueta}: falta el ${vacios.join(', ')}.`);
      const vistos=new Set(); for(const s of x){ const k=s.toLowerCase(); if(k&&vistos.has(k)){ e.push(`• ${c.etiqueta}: "${s}" está repetido.`); break; } vistos.add(k); } continue; }
    if(req && !x) e.push(`• ${c.etiqueta} es obligatorio.`);
    if(c.tipo==='fecha' && x && x>hoyISO()) e.push(`• ${c.etiqueta}: la fecha no puede ser futura.`);
    if(c.reglas && c.reglas.posteriorA && x){ const o=def.campos.find(k=>k.id===c.reglas.posteriorA); const y=o?v[o.id]:''; if(y && x<=y) e.push(`• ${c.etiqueta} debe ser posterior a ${o.etiqueta}.`); }
  }
  const f=def.fotos||{min:0,max:10};
  if(fotosAnexo.length<(f.min||0)) e.push(`• Adjunta al menos ${f.min} foto(s) de evidencia.`);
  return e;
}

// ---------- Dibujo ----------
export function fmtFecha(iso, formato='dd-mm-aaaa'){ if(!iso) return ''; const [y,m,d]=String(iso).split('-'); if(!d) return iso; return formato==='dd/mm/aaaa'?`${d}/${m}/${y}`:formato==='aaaa-mm-dd'?iso:`${d}-${m}-${y}`; }
function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function fit(ctx,txt,maxW){ while(ctx.measureText(txt).width>maxW && txt.length>1) txt=txt.slice(0,-1); return txt; }
function wrap(ctx,txt,maxW){ const out=[]; for(const para of String(txt).split('\n')){ let line=''; for(const w of para.split(' ')){ const t=line?line+' '+w:w; if(ctx.measureText(t).width>maxW && line){out.push(line);line=w;} else line=t; } out.push(line); } return out; }
export function layoutAnexo(fotos, W){
  const gap=18, colW=(W-gap*3)/2, maxH=520, rows=[];
  for(let i=0;i<fotos.length;i+=2){ const pair=fotos.slice(i,i+2).map(p=>{ const s=Math.min(colW/p.img.naturalWidth,maxH/p.img.naturalHeight); return {p,w:p.img.naturalWidth*s,h:p.img.naturalHeight*s}; }); rows.push({items:pair,h:Math.max(...pair.map(x=>x.h))}); }
  return { gap, colW, rows, total: fotos.length ? 60+rows.reduce((a,r)=>a+r.h+gap,0)+30 : 0 };
}
// Líneas en columnas; columnas=0 -> automático (las que hagan falta para que quepan en el alto de la caja, hasta 6, reduciendo la letra si es necesario)
function dibujarLineas(ctx, lineas, b, s, px, pintar){
  const pad=4, maxW=b.w-pad*2-px, n=lineas.length; let tam=s.tam||17, lh=tam+3;
  const filasQueCaben = () => Math.max(1,Math.floor((b.h-pad*2)/lh));
  let cols=+s.columnas||0, rows=filasQueCaben();
  if(cols>0 && Math.ceil(n/cols)>rows) cols=0;                         // las columnas fijas no alcanzan: pasa a automático
  if(cols<=0){
    cols=Math.ceil(n/rows);
    while(cols>6 && tam>10){ tam--; lh=tam+3; rows=filasQueCaben(); cols=Math.ceil(n/rows); }   // reduce la letra antes de pasar de 6 columnas
    cols=Math.max(1,Math.min(6,cols));
  }
  rows=Math.ceil(n/cols); const colW=maxW/cols;
  // Si aun así no cabe, se reduce la letra hasta que quepa (mínimo 8 px); nunca se dibuja fuera de la caja
  while(rows*lh>b.h-pad*2 && tam>8){ tam--; lh=tam+3; }
  ctx.save(); ctx.beginPath(); ctx.rect(b.x,b.y,b.w,b.h); ctx.clip();
  ctx.font=`${s.negrita!==false?'bold ':''}${tam}px "Roboto Condensed",Arial`; ctx.textAlign='left';
  lineas.forEach((ln,i)=>{ const col=Math.floor(i/rows), row=i%rows; pintar(ln, b.x+pad+px+col*colW, b.y+pad+tam/2+row*lh, colW-6, tam); });
  ctx.restore();
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
    if(!estaActivo(def,valores,c)) continue;
    const b=c.caja, s=c.estilo||{}; const v=valores[c.id];
    const fuente=(peso)=>`${peso?'bold ':''}${s.tam||17}px "Roboto Condensed",Arial`;
    if(s.fondo && s.fondo!=='transparent'){ ctx.fillStyle=s.fondo; ctx.fillRect(b.x,b.y,b.w,b.h); }
    if(c.tipo==='foto'){ const p=fotosCampo[c.id]; ctx.fillStyle='#050a0c'; rr(ctx,b.x,b.y,b.w,b.h,6); ctx.fill(); if(p){ const sc=Math.min(b.w/p.img.naturalWidth,b.h/p.img.naturalHeight), w=p.img.naturalWidth*sc, h=p.img.naturalHeight*sc; ctx.save(); rr(ctx,b.x,b.y,b.w,b.h,6); ctx.clip(); ctx.drawImage(p.img,b.x+(b.w-w)/2,b.y+(b.h-h)/2,w,h); ctx.restore(); } continue; }
    const pad=4; let x=b.x+pad; const maxW=b.w-pad*2; const multi = c.tipo==='parrafo' || Array.isArray(v);
    let px=0; if(s.prefijo){ ctx.textAlign='left'; ctx.fillStyle=s.prefijoColor||'#fff'; ctx.font=fuente(false); ctx.fillText(s.prefijo,x,multi?b.y+pad+(s.tam||17)/2:b.y+b.h/2); px=ctx.measureText(s.prefijo).width+6; }
    ctx.fillStyle=s.color||'#f0c24d'; ctx.font=fuente(s.negrita!==false);
    if(c.tipo==='casillas'){ const items=(v||[]); if(!items.length) continue;
      dibujarLineas(ctx, items, b, s, px, (it,xx,yy,cw,tam)=>{ ctx.fillStyle=it.on?'#7fd38a':'#ff6b6b'; ctx.font=`bold ${tam}px "Roboto Condensed",Arial`; ctx.fillText(it.on?'✔':'✘',xx,yy); const n=it.nombre.toUpperCase()+(it.texto?' —':''); ctx.fillStyle='#ffffff'; ctx.fillText(fit(ctx,n,cw-22),xx+20,yy); const nw=ctx.measureText(n).width; if(it.texto){ ctx.fillStyle=s.color||'#f0c24d'; ctx.font=`${tam-1}px "Roboto Condensed",Arial`; ctx.fillText(fit(ctx,it.texto,cw-26-nw),xx+26+nw,yy); } }); continue; }
    if(Array.isArray(v)){ const lineas=v.map((t,i)=>t?`${i+1}. ${t}`:'').filter(Boolean); if(!lineas.length) continue;
      dibujarLineas(ctx, lineas, b, s, px, (ln,xx,yy,cw)=>{ ctx.fillStyle=s.color||'#f0c24d'; ctx.fillText(fit(ctx,ln,cw),xx,yy); }); continue; }
    let texto = c.tipo==='fecha' ? fmtFecha(v,s.formato) : v;
    if(c.tipo==='parrafo'){ if(!texto) continue; const lh=(s.tam||17)+3; const ls=wrap(ctx,texto,maxW-px); const top=b.y+pad+(s.tam||17)/2; const maxL=s.lineas>0?s.lineas:Math.floor((b.h-pad*2)/lh); ctx.textAlign='left'; ls.slice(0,Math.max(1,maxL)).forEach((ln,i)=>ctx.fillText(ln,x+(i===0?px:0),top+i*lh)); continue; }
    if(!texto) continue;
    const al=s.alinear||'left'; ctx.textAlign=al; const tx=al==='center'?x+px+(maxW-px)/2:al==='right'?b.x+b.w-pad:x+px;
    ctx.fillText(fit(ctx,String(texto),maxW-px),tx,b.y+b.h/2);
  }
  ctx.textAlign='left';
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
  if(sello && sello.folio){ ctx.save(); ctx.textAlign='right'; ctx.textBaseline='alphabetic'; const txt=`FOLIO ${sello.folio} · ${sello.texto||''}`;
    ctx.font='bold 12px "Roboto Condensed",Arial'; const w=ctx.measureText(txt).width+16; ctx.fillStyle='#000c'; rr(ctx,W-14-w,H-26,w,18,4); ctx.fill(); ctx.fillStyle='#f0c24d'; ctx.fillText(txt,W-22,H-13); ctx.restore(); }
  return { W, H, total:L.total };
}
export function resumenDe(def, v){
  const partes=[]; for(const c of def.campos){ if(!c.resumen) continue; const x=v[c.id];
    if(c.tipo==='casillas'){ const n=(x||[]).filter(i=>i.on).length; partes.push(`${n}/${(c.opciones||[]).length} ${c.etiqueta.toLowerCase()}`); }
    else if(Array.isArray(x)){ if(x.filter(Boolean).length) partes.push(`${x.filter(Boolean).length} ${c.etiqueta.toLowerCase()}`); }
    else if(x) partes.push(c.tipo==='fecha'?fmtFecha(x):String(x)); }
  return partes.join(' · ');
}
export function cargarFondo(def){ return new Promise(res=>{ if(!def.fondo||!def.fondo.url) return res(null); const i=new Image(); i.crossOrigin='anonymous'; i.onload=()=>res(i); i.onerror=()=>res(null); i.src=def.fondo.url; }); }
