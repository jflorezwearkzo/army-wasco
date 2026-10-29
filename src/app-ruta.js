// Ruta de aprendizaje: cuatro etapas iguales para todas las unidades. Es SOLO una guía: no otorga
// ni quita permisos. Las etapas 1 a 3 se comprueban con datos que ya existen (reportes aprobados,
// turnos cumplidos, verificación en dos pasos); la 4 la firma alguien del liderazgo.
// Con ?u=<id> y permiso de usuarios se ve la ruta de otra persona (solo lectura).
import { requerir, barraUsuario, sb, esc, nombreCompleto } from './auth.js';
import { ETAPAS, hechoPaso, etapaCompleta, etapaActual } from './ruta-pasos.js';
const yo = await requerir(); barraUsuario(yo);
const $ = s => document.querySelector(s);

const OTRO = new URLSearchParams(location.search).get('u') || '';
const AJENA = !!OTRO && OTRO !== yo.id;

let D = null, PERFIL = null;

function pintar(){
  const d = D, act = etapaActual(d);
  // El interruptor general lo mueve solo el administrador; mientras esté apagado, la ruta es un
  // borrador que únicamente ve quien puede encenderla.
  const general = d.puedo_activar && !AJENA
    ? `<label class="sw"><input type="checkbox" id="chkActiva" ${d.activa_general?'checked':''}>
         <span>Ruta de aprendizaje <b>${d.activa_general?'activada':'desactivada'}</b> para toda la página</span></label>
       <small>Mientras esté desactivada, solo tú la ves. Nadie más la tiene en el menú ni puede firmar.</small>`
    : '';
  // Excepción para una persona concreta, por encima del ajuste general
  const exc = d.excepcion === null || d.excepcion === undefined ? '' : (d.excepcion ? 'si' : 'no');
  const porUsuario = AJENA && d.puedo_reiniciar
    ? `<label class="sw" for="selExc"><span>Ruta para esta persona</span></label>
       <select id="selExc" style="width:auto;margin-top:6px">
         <option value=""${exc===''?' selected':''}>Según el ajuste general (${d.activa_general?'activada':'desactivada'})</option>
         <option value="si"${exc==='si'?' selected':''}>Activada siempre</option>
         <option value="no"${exc==='no'?' selected':''}>Desactivada para esta persona</option>
       </select>
       <small>Sirve para quitársela a quien ya es veterano, o para encendérsela a alguien mientras la general sigue apagada.</small>`
    : '';
  $('#switch').innerHTML = general + porUsuario;
  // Quien administra sigue viendo la ruta de alguien aunque esté apagada para esa persona
  const avisoApagada = !d.activa
    ? `<p class="muted" style="margin:0 0 8px">⚠️ La ruta está <b>desactivada</b> ${AJENA ? 'para esta persona: no la ve en su menú' : 'y solo la ves tú'}.</p>` : '';
  if(!d.activa && !d.puedo_activar && !(AJENA && d.puedo_reiniciar)){
    $('#cab').innerHTML = '';
    $('#etapas').innerHTML = '<section class="etapa"><h2><span class="ico">🚧</span> Todavía no está disponible</h2><p class="intro">La ruta de aprendizaje está en preparación. Cuando el liderazgo la active, la verás aquí.</p></section>';
    return;
  }
  const total = ETAPAS.reduce((a,e) => a + e.pasos.filter(p => !p.opcional).length, 0);
  const listos = ETAPAS.reduce((a,e) => a + e.pasos.filter(p => !p.opcional && hechoPaso(p,d)).length, 0);

  $('#cab').innerHTML = `
    ${avisoApagada}
    <p class="muted" style="margin:0 0 6px">${AJENA ? `Ruta de <b>${esc(PERFIL ? nombreCompleto(PERFIL) : 'este integrante')}</b>` : 'Tu avance como integrante del Army'}</p>
    <div class="prog"><div class="progbar"><span style="width:${Math.round(listos/total*100)}%"></span></div>
      <b>${listos} de ${total}</b> pasos${act > ETAPAS.length ? ' · ruta terminada 🎖️' : ` · vas en la etapa ${act}`}</div>`;

  $('#etapas').innerHTML = ETAPAS.map(e => {
    const lista = e.pasos.map(p => {
      const ok = hechoPaso(p, d);
      const marca = p.tipo === 'marca' && !AJENA
        ? `<button class="chk" data-paso="${esc(p.id)}" aria-pressed="${ok}" title="${ok?'Desmarcar':'Marcar como hecho'}">${ok?'✅':'⬜'}</button>`
        : `<span class="chk est">${ok?'✅':'⬜'}</span>`;
      return `<li class="${ok?'ok':''}">${marca}
        <div><span class="txt">${esc(p.texto)}${p.opcional?' <i class="opc">(opcional)</i>':''}</span>
        ${p.cuenta ? `<small class="cnt">${esc(p.cuenta(d))}</small>` : ''}
        ${p.ayuda ? `<small class="ayu">${esc(p.ayuda)}</small>` : ''}</div></li>`;
    }).join('');
    const lista_ok = etapaCompleta(e, d);
    const firmaTxt = e.firma && d.firma && d.firma.etapa >= 4
      ? `<p class="firmada">🎖️ Firmada por <b>${esc(d.firma.firmado_por || '—')}</b> el ${new Date(d.firma.firmado_en).toLocaleDateString('es-CO')}${d.firma.nota ? ` · ${esc(d.firma.nota)}` : ''}</p>` : '';
    const yaFirmada = !!(d.firma && d.firma.etapa >= 4);
    const botonFirma = e.firma && d.puedo_firmar && !yaFirmada && d.activa
      ? `<button class="primary sm" id="btnFirmar">🎖️ Firmar esta etapa</button>`
      : (e.firma && !yaFirmada && AJENA && +d.mi_nivel >= 1
          ? `<p class="nota-jer">No puedes firmar esta ruta: esa persona está en tu mismo nivel o por encima.</p>` : '');
    return `<section class="etapa ${lista_ok?'completa':''} ${e.n===act?'actual':''}">
      <h2><span class="ico">${e.icono}</span> Etapa ${e.n} · ${esc(e.titulo)}
        <small>${esc(e.cuando)}</small>${lista_ok?'<span class="sello">Completa</span>':''}</h2>
      <p class="intro">${esc(e.intro)}</p>
      <ul class="pasos">${lista}</ul>${firmaTxt}${botonFirma}</section>`;
  }).join('');

  document.querySelectorAll('[data-paso]').forEach(b => b.onclick = () => alternar(b.dataset.paso));
  const bf = $('#btnFirmar'); if(bf) bf.onclick = firmar;
  const ch = $('#chkActiva'); if(ch) ch.onchange = () => activar(ch.checked);
  const se = $('#selExc'); if(se) se.onchange = () => excepcion(se.value);
  $('#pie').innerHTML = d.puedo_reiniciar && AJENA
    ? `<button class="ghost sm" id="btnReiniciar">↺ Reiniciar esta ruta</button>` : '';
  const br = $('#btnReiniciar'); if(br) br.onclick = reiniciar;
}

async function alternar(paso){
  const ya = (D.marcas || []).includes(paso);
  const { error } = ya
    ? await sb.from('ruta_marcas').delete().eq('usuario_id', yo.id).eq('paso', paso)
    : await sb.from('ruta_marcas').insert({ usuario_id: yo.id, paso });
  if(error){ $('#err').textContent = error.message; return; }
  D.marcas = ya ? D.marcas.filter(p => p !== paso) : [...D.marcas, paso];
  pintar();
}

async function firmar(){
  const nota = prompt('¿Algún comentario para dejar en la firma? (opcional)');
  if(nota === null) return;
  const { error } = await sb.rpc('firmar_ruta', { p_usuario: OTRO || yo.id, p_nota: nota.trim() || null });
  if(error){ $('#err').textContent = error.message; return; }
  await cargar();
}

// Borra lo que la persona marcó y su firma. No toca nada automático: los reportes aprobados o los
// turnos cumplidos siguen ahí, así que esos pasos vuelven a marcarse solos.
async function reiniciar(){
  if(!confirm('¿Reiniciar la ruta de esta persona?\n\nSe borran los pasos que marcó a mano y la firma. Lo que se comprueba solo (reportes, turnos, dos pasos) se vuelve a marcar enseguida.')) return;
  const { error } = await sb.rpc('reiniciar_ruta', { p_usuario: OTRO });
  if(error){ $('#err').textContent = error.message; return; }
  await cargar();
}

// '' = sin excepción (sigue el ajuste general) · 'si' / 'no' = encendida o apagada para esa persona
async function excepcion(valor){
  const activa = valor === '' ? null : valor === 'si';
  const { error } = await sb.rpc('ruta_para_usuario', { p_usuario: OTRO, p_activa: activa });
  if(error){ $('#err').textContent = error.message; return; }
  await cargar();
}

async function activar(valor){
  const { error } = await sb.from('ajustes_globales')
    .upsert({ clave:'ruta_aprendizaje', valor:{ activo: !!valor }, actualizado_en: new Date().toISOString(), actualizado_por: yo.id });
  if(error){ $('#err').textContent = error.message; return; }
  await cargar();
}

async function cargar(){
  const { data, error } = await sb.rpc('mi_ruta', AJENA ? { p_usuario: OTRO } : {});
  if(error){ $('#err').textContent = error.message; return; }
  D = data; $('#err').textContent = '';
  if(AJENA && !PERFIL){ const { data: p } = await sb.from('perfiles').select('usuario,nombre,rango').eq('id', OTRO).maybeSingle(); PERFIL = p; }
  pintar();
}
await cargar();
