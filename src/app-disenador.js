// Diseñador visual de formularios: fondo + cajas de campos -> definición JSON guardada en formularios.definicion
import { requerir, barraUsuario, tiene, sb, esc, RANGOS } from './auth.js';
import { ANCHO, TIPOS, DEFECTOS, OPERACIONES, campoNuevo, definicionNueva, dibujar, cargarFondo, fmtFecha, calcular } from './plantilla.js';

const yo = await requerir(); barraUsuario(yo);
if(!tiene(yo,'disenar_formularios')){ document.body.innerHTML='<p style="padding:30px;color:var(--text);font-family:Arial">Necesitas el permiso de creación de formularios (diseñador).</p>'; throw new Error('sin permiso'); }
const $=s=>document.querySelector(s);
const msg=(t,ok)=>{ const m=$('#msg'); m.textContent=t; m.className='msg '+(ok?'ok':t?'err':''); };

let DEF=definicionNueva(), ESNUEVO=true, FONDO=null, SEL=null, FORM=null;
$('#tipoNuevo').innerHTML=Object.entries(TIPOS).map(([k,v])=>`<option value="${k}">${esc(v.nombre)}</option>`).join('');
$('#pTipo').innerHTML=$('#tipoNuevo').innerHTML;
$('#pOp').innerHTML=Object.entries(OPERACIONES).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('');
$('#pDefecto').innerHTML=Object.entries(DEFECTOS).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')+'<option value="__txt">Texto fijo…</option>';

// ---------- Catálogo ----------
async function cargarCatalogo(selId){
  const { data } = await sb.from('formularios').select('id,titulo,definicion').order('orden');
  const plant=(data||[]).filter(f=>f.definicion);
  $('#selForm').innerHTML='<option value="">— Elige un formulario con plantilla —</option>'+plant.map(f=>`<option value="${esc(f.id)}"${f.id===selId?' selected':''}>${esc(f.titulo)}</option>`).join('');
}
$('#selForm').addEventListener('change',()=>{ if($('#selForm').value) abrir($('#selForm').value); });
$('#btnNuevo').onclick=()=>nuevo();
function nuevo(){ FORM=null; ESNUEVO=true; DEF=definicionNueva(); FONDO=null; SEL=null; $('#fMulti').checked=false; $('#fMultiEtq').value='Patrullaje'; $('#fMultiMax').value=10; multiUI(); $('#fId').value=''; $('#fId').disabled=false; $('#fTitulo').value=''; $('#fDesc').value=''; $('#fIcono').value='📋'; $('#fOrden').value=100; $('#fActivo').value='1'; $('#fMin').value=0; $('#fMax').value=10; $('#fAnexo').value='ANEXO FOTOGRÁFICO'; $('#selForm').value=''; render(); msg(''); }
async function abrir(id){
  const { data:f, error } = await sb.from('formularios').select('*').eq('id',id).maybeSingle(); if(error||!f){ msg(error?error.message:'No existe'); return; }
  FORM=f; ESNUEVO=false; DEF=f.definicion||definicionNueva(); DEF.campos=DEF.campos||[]; DEF.fotos=DEF.fotos||{min:0,max:10,titulo:'ANEXO FOTOGRÁFICO'};
  $('#fId').value=f.id; $('#fId').disabled=true; $('#fTitulo').value=f.titulo; $('#fDesc').value=f.descripcion||''; $('#fIcono').value=f.icono||'📋'; $('#fOrden').value=f.orden; $('#fActivo').value=f.activo?'1':'0';
  $('#fMin').value=DEF.fotos.min||0; $('#fMax').value=DEF.fotos.max??10; $('#fAnexo').value=DEF.fotos.titulo||'ANEXO FOTOGRÁFICO';
  const pgs=DEF.paginas||{}; $('#fMulti').checked=!!pgs.activo; $('#fMultiEtq').value=pgs.etiqueta||'Patrullaje'; $('#fMultiMax').value=pgs.max||10; multiUI();
  FONDO=await cargarFondo(DEF); SEL=null; render(); msg('');
}

function multiUI(){ const on=$('#fMulti').checked; $('#fMultiW').style.display=on?'':'none'; $('#pPorPagW').style.display=on?'':'none'; }
$('#fMulti').addEventListener('change',multiUI);

// ---------- Fondo ----------
$('#fondo').addEventListener('change', async e=>{
  const f=e.target.files[0]; if(!f) return; e.target.value='';
  const id=$('#fId').value.trim().toLowerCase(); if(!id){ msg('Escribe primero el identificador del formulario.'); return; }
  msg('Subiendo fondo…');
  const img=await new Promise((res,rej)=>{ const u=URL.createObjectURL(f); const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=u; });
  // Normaliza a PNG de 2048 px de ancho (2x la base de dibujo) para no subir archivos enormes
  const c=document.createElement('canvas'); const w=Math.min(2048,img.naturalWidth), h=Math.round(img.naturalHeight*w/img.naturalWidth); c.width=w; c.height=h; c.getContext('2d').drawImage(img,0,0,w,h);
  const blob=await new Promise(r=>c.toBlob(r,'image/png'));
  const path=`${id}/${Date.now()}.png`;
  const { error } = await sb.storage.from('plantillas').upload(path, blob, { contentType:'image/png', upsert:false });
  if(error){ msg('No se pudo subir el fondo: '+error.message); return; }
  const url=sb.storage.from('plantillas').getPublicUrl(path).data.publicUrl;
  DEF.fondo={ url, path, w:ANCHO, h:Math.round(ANCHO*h/w) };
  FONDO=await cargarFondo(DEF); render(); msg('Fondo cargado ('+ANCHO+'×'+DEF.fondo.h+' px base). Ahora agrega campos y guarda.', true);
});

// ---------- Escenario ----------
const esc_=$('#escenario'); let escala=1;
function render(){
  esc_.innerHTML='';
  if(!DEF.fondo){ esc_.innerHTML='<div class="vacio">Sube la imagen de fondo del formato para empezar.</div>'; lista(); props(); return; }
  const img=document.createElement('img'); img.src=DEF.fondo.url; img.alt=''; esc_.appendChild(img);
  escala=esc_.clientWidth/ANCHO;
  for(const c of DEF.campos){
    const b=document.createElement('div'); b.className='box'+(c.tipo==='foto'?' foto':'')+(SEL===c.id?' sel':''); b.dataset.id=c.id;
    b.style.left=c.caja.x*escala+'px'; b.style.top=c.caja.y*escala+'px'; b.style.width=c.caja.w*escala+'px'; b.style.height=c.caja.h*escala+'px';
    b.textContent=c.etiqueta; const rs=document.createElement('span'); rs.className='rs'; b.appendChild(rs);
    b.addEventListener('pointerdown',e=>{ e.preventDefault(); seleccionar(c.id); const resize=e.target===rs; const sx=e.clientX, sy=e.clientY, o={...c.caja};
      const mover=ev=>{ const dx=(ev.clientX-sx)/escala, dy=(ev.clientY-sy)/escala; if(resize){ c.caja.w=Math.max(16,Math.round(o.w+dx)); c.caja.h=Math.max(10,Math.round(o.h+dy)); } else { c.caja.x=Math.max(0,Math.round(o.x+dx)); c.caja.y=Math.max(0,Math.round(o.y+dy)); } posicionar(b,c); props(false); };
      const fin=()=>{ window.removeEventListener('pointermove',mover); window.removeEventListener('pointerup',fin); };
      window.addEventListener('pointermove',mover); window.addEventListener('pointerup',fin); });
    esc_.appendChild(b);
  }
  lista(); props();
}
function posicionar(b,c){ b.style.left=c.caja.x*escala+'px'; b.style.top=c.caja.y*escala+'px'; b.style.width=c.caja.w*escala+'px'; b.style.height=c.caja.h*escala+'px'; }
window.addEventListener('resize',()=>{ if(DEF.fondo) render(); });
document.addEventListener('keydown',e=>{ const c=sel(); if(!c||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return; const d=e.shiftKey?10:1; let h=true;
  if(e.key==='ArrowLeft') c.caja.x-=d; else if(e.key==='ArrowRight') c.caja.x+=d; else if(e.key==='ArrowUp') c.caja.y-=d; else if(e.key==='ArrowDown') c.caja.y+=d; else h=false;
  if(h){ e.preventDefault(); const b=esc_.querySelector(`.box[data-id="${c.id}"]`); if(b) posicionar(b,c); props(false); } });

// ---------- Campos ----------
const sel=()=>DEF.campos.find(c=>c.id===SEL);
function seleccionar(id){ SEL=id; esc_.querySelectorAll('.box').forEach(b=>b.classList.toggle('sel',b.dataset.id===id)); lista(); props(); }
$('#btnAdd').onclick=()=>{ if(!DEF.fondo){ msg('Sube primero el fondo.'); return; } const c=campoNuevo($('#tipoNuevo').value, DEF.campos.length+1); if(c.tipo==='foto'){ c.caja.w=220; c.caja.h=150; c.estilo.fondo='transparent'; } if(c.tipo==='parrafo'){ c.caja.h=90; } if(c.tipo==='personas'||c.tipo==='lista'||c.tipo==='casillas'){ c.caja.h=70; } if(c.tipo==='casillas'){ c.opciones=['Opción 1','Opción 2','Opción 3']; c.conTexto=true; } if(c.tipo==='formula'){ c.req=false; } if(c.tipo==='fecha') c.defecto='hoy'; DEF.campos.push(c); SEL=c.id; render(); };
function lista(){ $('#lista').innerHTML=DEF.campos.map(c=>`<li data-id="${c.id}" class="${c.id===SEL?'sel':''}"><span>${esc(c.etiqueta)}${c.porPagina?' <small title="Se repite por página">⧉</small>':''}</span><small>${esc(TIPOS[c.tipo]?TIPOS[c.tipo].nombre.split(' ')[0]:c.tipo)}</small></li>`).join('')||'<li><small>Sin campos todavía</small></li>'; $('#lista').querySelectorAll('li[data-id]').forEach(li=>li.onclick=()=>seleccionar(li.dataset.id)); }
let llenando=false;
function props(todo=true){
  const c=sel(); $('#prop').classList.toggle('on',!!c); if(!c) return; llenando=true;
  if(todo){ $('#pEtiqueta').value=c.etiqueta; $('#pTipo').value=c.tipo; const auto=c.defecto in DEFECTOS; $('#pDefecto').value=auto?c.defecto:'__txt'; $('#pDefectoTxt').value=auto?'':c.defecto; $('#pDefectoTxt').style.display=auto?'none':'';
    $('#pReq').checked=!!c.req; $('#pBloq').checked=!!c.bloqueado; $('#pRes').checked=!!c.resumen; $('#pPorPag').checked=!!c.porPagina; $('#pOpciones').value=(c.opciones||[]).join('\n'); $('#pMin').value=c.min||1; $('#pMax').value=c.max||3;
    $('#pOpcionesW').style.display=(c.tipo==='opcion'||c.tipo==='casillas')?'':'none'; $('#pCasW').style.display=c.tipo==='casillas'?'':'none'; $('#pConTexto').checked=!!c.conTexto; $('#pTextoDef').value=c.textoDef||'';
    $('#pListaW').style.display=(c.tipo==='personas'||c.tipo==='lista')?'':'none';
    const otros=DEF.campos.filter(x=>x.id!==c.id); const opts=(filtro,sel0,vacio='— Ninguno —')=>`<option value="">${vacio}</option>`+otros.filter(filtro).map(x=>`<option value="${x.id}"${x.id===sel0?' selected':''}>${esc(x.etiqueta)}</option>`).join('');
    const f=c.formula||{op:'contar',origen:'',origenes:[],sep:' · ',prefijo:'DOC'}; $('#pFormulaW').style.display=c.tipo==='formula'?'':'none'; $('#pOp').value=f.op||'contar';
    $('#pOrigen').innerHTML=opts(x=>true,f.origen,'— Elige —'); $('#pOrigenes').innerHTML=otros.map(x=>`<option value="${x.id}"${(f.origenes||[]).includes(x.id)?' selected':''}>${esc(x.etiqueta)}</option>`).join(''); $('#pSep').value=f.sep||' · '; $('#pCodPrefijo').value=f.prefijo||'DOC'; mostrarFormula();
    const r=c.reglas||{}; $('#pHabCampo').innerHTML=opts(x=>['sino','opcion','casillas','texto','numero','personas','lista'].includes(x.tipo),r.habilitarCampo,'— Siempre —'); $('#pHabValor').value=r.habilitarValor||'';
    $('#pReqCampo').innerHTML=opts(x=>['sino','opcion','casillas','texto','numero'].includes(x.tipo),r.reqCampo,'— Siempre (si es obligatorio) —'); $('#pReqValor').value=r.reqValor||'';
    $('#pPostCampo').innerHTML=opts(x=>x.tipo==='hora'||x.tipo==='fecha',r.posteriorA,'— No aplica —');
    const s=c.estilo; $('#pTam').value=s.tam; $('#pCols').value=s.columnas??0; $('#pColor').value=s.color; $('#pSinFondo').checked=s.fondo==='transparent'; $('#pFondo').value=s.fondo==='transparent'?'#0e1b20':s.fondo; $('#pAlinear').value=s.alinear||'left'; $('#pFormato').value=s.formato||'dd-mm-aaaa'; $('#pPrefijo').value=s.prefijo||''; $('#pPrefijoColor').value=s.prefijoColor||'#ffffff'; $('#pNegrita').checked=s.negrita!==false; }
  $('#pX').value=c.caja.x; $('#pY').value=c.caja.y; $('#pW').value=c.caja.w; $('#pH').value=c.caja.h; llenando=false;
}
function mostrarFormula(){ const op=$('#pOp').value; $('#pOrigenW').style.display=op==='unir'?'none':''; $('#pOrigenesW').style.display=op==='unir'?'':'none'; $('#pCodW').style.display=op==='codigo'?'':'none'; }
$('#pOp').addEventListener('change',mostrarFormula);
$('#prop').addEventListener('input',aplicar); $('#prop').addEventListener('change',aplicar);
function aplicar(){ if(llenando) return; const c=sel(); if(!c) return;
  c.etiqueta=$('#pEtiqueta').value; const t=$('#pTipo').value; if(t!==c.tipo){ c.tipo=t; props(); }
  const d=$('#pDefecto').value; $('#pDefectoTxt').style.display=d==='__txt'?'':'none'; c.defecto=d==='__txt'?$('#pDefectoTxt').value:d;
  c.req=$('#pReq').checked; c.bloqueado=$('#pBloq').checked; c.resumen=$('#pRes').checked; c.porPagina=$('#pPorPag').checked; c.opciones=$('#pOpciones').value.split('\n').map(s=>s.trim()).filter(Boolean); c.min=+$('#pMin').value||1; c.max=+$('#pMax').value||3;
  c.conTexto=$('#pConTexto').checked; c.textoDef=$('#pTextoDef').value;
  c.formula={ op:$('#pOp').value, origen:$('#pOrigen').value, origenes:[...$('#pOrigenes').selectedOptions].map(o=>o.value), sep:$('#pSep').value, prefijo:$('#pCodPrefijo').value.trim()||'DOC' };
  c.reglas={ habilitarCampo:$('#pHabCampo').value, habilitarValor:$('#pHabValor').value.trim(), reqCampo:$('#pReqCampo').value, reqValor:$('#pReqValor').value.trim(), posteriorA:$('#pPostCampo').value };
  c.caja={ x:+$('#pX').value||0, y:+$('#pY').value||0, w:Math.max(16,+$('#pW').value||16), h:Math.max(10,+$('#pH').value||10) };
  c.estilo={ tam:+$('#pTam').value||17, columnas:Math.max(0,+$('#pCols').value||0), color:$('#pColor').value, fondo:$('#pSinFondo').checked?'transparent':$('#pFondo').value, alinear:$('#pAlinear').value, formato:$('#pFormato').value, prefijo:$('#pPrefijo').value, prefijoColor:$('#pPrefijoColor').value, negrita:$('#pNegrita').checked, lineas:0 };
  const b=esc_.querySelector(`.box[data-id="${c.id}"]`); if(b){ posicionar(b,c); b.firstChild.textContent=c.etiqueta; b.classList.toggle('foto',c.tipo==='foto'); } lista(); }
$('#btnDel').onclick=()=>{ const c=sel(); if(!c) return; DEF.campos=DEF.campos.filter(x=>x!==c); SEL=null; render(); };
$('#btnDup').onclick=()=>{ const c=sel(); if(!c) return; const n=JSON.parse(JSON.stringify(c)); n.id='c'+Date.now().toString(36); n.caja.y+=c.caja.h+6; n.etiqueta+=' (copia)'; DEF.campos.push(n); SEL=n.id; render(); };

// ---------- Vista previa ----------
function ejemplo(c){ switch(c.tipo){ case 'fecha': return new Date().toISOString().slice(0,10); case 'hora': return '14:30'; case 'numero': return '3'; case 'sino': return 'SÍ'; case 'rango': return RANGOS[2]; case 'opcion': return (c.opciones||[])[0]||'Opción'; case 'persona': return 'Capitán Nombre Apellido'; case 'personas': return Array.from({length:Math.min(+c.max||3,4)},(_,i)=>`Teniente Integrante ${i+1}`); case 'lista': return Array.from({length:Math.min(+c.max||3,3)},(_,i)=>`Elemento ${i+1}`); case 'casillas': return (c.opciones||[]).map((o,i)=>({nombre:o,on:i%3!==2,texto:c.conTexto?(i%3!==2?(c.textoDef||'Logrado'):'Fallido'):''})); case 'formula': return ''; case 'parrafo': return 'Texto de ejemplo para ver cómo se acomoda el párrafo dentro de la caja, con varias líneas si hace falta.'; default: return c.defecto in DEFECTOS ? (c.defecto==='mi_nombre'?'Nombre Apellido':c.defecto==='mi_rango'?'Capitán':c.defecto==='mi_rango_pm'?'Auxiliar PM':c.defecto==='mi_rango_nombre'?'Capitán Nombre Apellido':c.defecto==='mi_usuario'?'usuario':'') || c.etiqueta : (c.defecto||c.etiqueta); } }
$('#btnPreview').onclick=()=>{ if(!DEF.fondo){ msg('Sube primero el fondo.'); return; } const v={__pagina:1,__paginas:3}; for(const c of DEF.campos) v[c.id]=ejemplo(c); for(const c of DEF.campos) if(c.tipo==='formula') v[c.id]=calcular(DEF,c,v);
  const fc=DEF.campos.find(c=>c.tipo==='fecha'); dibujar($('#cv'), DEF, FONDO, v, {}, [], { folio:'PM-000000', texto:'usuario · '+new Date().toLocaleString('es-CO') }, { fechaAnexo: fc?fmtFecha(v[fc.id],fc.estilo.formato):'' }); $('#modal').classList.add('on'); };
$('#btnCerrar').onclick=()=>$('#modal').classList.remove('on');

// ---------- Guardar ----------
$('#btnGuardar').onclick=async()=>{
  const id=$('#fId').value.trim().toLowerCase(), titulo=$('#fTitulo').value.trim();
  if(!/^[a-z0-9_\-]{2,30}$/.test(id)){ msg('Identificador inválido (2–30 caracteres: letras minúsculas, números, guion).'); return; }
  if(!titulo){ msg('Falta el título.'); return; }
  if(!DEF.fondo){ msg('Sube el fondo del formato.'); return; }
  if(!tiene(yo,'disenar_formularios')){ msg('No tienes permiso de creación de formularios.'); return; }
  DEF.fotos={ min:Math.max(0,+$('#fMin').value||0), max:Math.max(0,Math.min(10,+$('#fMax').value||0)), titulo:$('#fAnexo').value.trim()||'ANEXO FOTOGRÁFICO' };
  DEF.paginas={ activo:$('#fMulti').checked, etiqueta:$('#fMultiEtq').value.trim()||'Página', max:Math.max(1,Math.min(20,+$('#fMultiMax').value||10)) };
  if(DEF.paginas.activo && !DEF.campos.some(c=>c.porPagina)){ msg('Marcaste varias páginas pero ningún campo se repite por página.'); return; }
  if(DEF.fotos.min>DEF.fotos.max) DEF.fotos.min=DEF.fotos.max;
  const fila={ id, titulo, descripcion:$('#fDesc').value.trim(), icono:$('#fIcono').value.trim()||'📋', orden:parseInt($('#fOrden').value)||100, activo:$('#fActivo').value==='1', ruta:`reportes/plantilla/?id=${id}`, definicion:DEF, version:(FORM&&FORM.version?FORM.version:0)+1 };
  const { error } = ESNUEVO ? await sb.from('formularios').insert(fila) : await sb.from('formularios').update(fila).eq('id',id);
  if(error){ msg(/duplicate|unique/i.test(error.message)?'Ya existe un formulario con ese identificador.':error.message); return; }
  msg(`Formulario "${titulo}" guardado (versión ${fila.version}). Ya aparece en el inicio para los roles con acceso.`, true);
  ESNUEVO=false; $('#fId').disabled=true; FORM={...fila}; await cargarCatalogo(id);
};

await cargarCatalogo(new URLSearchParams(location.search).get('id'));
const inicial=new URLSearchParams(location.search).get('id'); if(inicial) abrir(inicial); else nuevo();

// ---------- Duplicar ----------
$('#btnDuplicar').onclick=async()=>{
  if(ESNUEVO||!FORM){ msg('Abre primero el formulario que quieres duplicar.'); return; }
  const id=(prompt('Identificador del nuevo formulario (letras minúsculas, números, guion):', FORM.id+'-copia')||'').trim().toLowerCase();
  if(!id) return; if(!/^[a-z0-9_\-]{2,30}$/.test(id)){ msg('Identificador inválido.'); return; }
  const titulo=(prompt('Título del nuevo formulario:', FORM.titulo+' (copia)')||'').trim(); if(!titulo) return;
  DEF.fotos={ min:Math.max(0,+$('#fMin').value||0), max:Math.max(0,Math.min(10,+$('#fMax').value||0)), titulo:$('#fAnexo').value.trim()||'ANEXO FOTOGRÁFICO' };
  DEF.paginas={ activo:$('#fMulti').checked, etiqueta:$('#fMultiEtq').value.trim()||'Página', max:Math.max(1,Math.min(20,+$('#fMultiMax').value||10)) };
  const copia=JSON.parse(JSON.stringify(DEF));
  const fila={ id, titulo, descripcion:$('#fDesc').value.trim(), icono:$('#fIcono').value.trim()||'📋', orden:(parseInt($('#fOrden').value)||100)+1, activo:false, ruta:`reportes/plantilla/?id=${id}`, definicion:copia, version:1 };
  const { error } = await sb.from('formularios').insert(fila);
  if(error){ msg(/duplicate|unique/i.test(error.message)?'Ya existe un formulario con ese identificador.':error.message); return; }
  await cargarCatalogo(id); await abrir(id); msg(`Copia creada como "${titulo}" (oculta en el inicio hasta que la marques visible). Usa el mismo fondo; súbelo de nuevo si quieres otro.`, true);
};
