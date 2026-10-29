// Ruta de aprendizaje: cuatro etapas iguales para todas las unidades. Es SOLO una guía: no otorga
// ni quita permisos. Las etapas 1 a 3 se comprueban con datos que ya existen (reportes aprobados,
// turnos cumplidos, verificación en dos pasos); la 4 la firma alguien del liderazgo.
// Con ?u=<id> y permiso de usuarios se ve la ruta de otra persona (solo lectura).
import { requerir, barraUsuario, sb, esc, tiene, nombreCompleto } from './auth.js';
const yo = await requerir(); barraUsuario(yo);
const $ = s => document.querySelector(s);

const OTRO = new URLSearchParams(location.search).get('u') || '';
const AJENA = !!OTRO && OTRO !== yo.id;
const PUEDE_FIRMAR = tiene(yo, 'usuarios') && AJENA;

// Cada paso dice cómo se comprueba: auto (una función sobre los datos) o marca (la persona la marca).
const ETAPAS = [
  { n:1, titulo:'Llegada', cuando:'El primer día', icono:'🚪',
    intro:'Dejar la cuenta lista y saber dónde está cada cosa.',
    pasos:[
      { id:'app', tipo:'marca', texto:'Instalé la página como app en el celular',
        ayuda:'Mi cuenta → Instalar como app. En iPhone: Safari → Compartir → Añadir a pantalla de inicio.' },
      { id:'password', tipo:'marca', texto:'Cambié la contraseña que me entregaron',
        ayuda:'Mi cuenta → Cambiar contraseña. La inicial la sabe quien te creó la cuenta.' },
      { id:'mfa', tipo:'auto', texto:'Activé la verificación en dos pasos', opcional:true,
        ayuda:'Mi cuenta → Verificación en dos pasos. Opcional, pero si manejas permisos es muy recomendable.',
        hecho:d => +d.mfa > 0 },
      { id:'reglamento', tipo:'marca', texto:'Leí el reglamento',
        ayuda:'Reglamento, en el menú. Normas generales, procedimientos de la unidad y macros.' },
    ] },
  { n:2, titulo:'Primer reporte', cuando:'La primera semana', icono:'📝',
    intro:'Lo importante no es enviarlo: es que te lo aprueben. Eso prueba que entendiste las evidencias.',
    pasos:[
      { id:'manual_reporte', tipo:'marca', texto:'Leí el manual de "Enviar un reporte"',
        ayuda:'Manuales → Enviar un reporte. Explica las fotos, las horas y qué mira la revisión.' },
      { id:'reporte1', tipo:'auto', texto:'Envié mi primer reporte',
        ayuda:'Desde el inicio, la tarjeta del reporte que te toque.',
        hecho:d => +d.reportes > 0, cuenta:d => `${d.reportes} enviado(s)` },
      { id:'aprobado1', tipo:'auto', texto:'Me aprobaron un reporte',
        ayuda:'Si te lo devuelven para corregir, no es un fallo: arréglalo y reenvíalo con el mismo folio.',
        hecho:d => +d.aprobados > 0, cuenta:d => `${d.aprobados} aprobado(s)` },
    ] },
  { n:3, titulo:'Operar solo', cuando:'El primer mes', icono:'🎯',
    intro:'Moverte sin que nadie tenga que recordarte nada.',
    pasos:[
      { id:'calendario', tipo:'marca', texto:'Sé a qué horas son los eventos del día',
        ayuda:'Eventos del día, en el menú. Salen en tu hora y en la del servidor.' },
      { id:'macros', tipo:'marca', texto:'Sé usar las macros de mi unidad',
        ayuda:'Reglamento → Macros. Cada una tiene su botón Copiar y ya trae tu rango y tu nombre puestos.' },
      { id:'turno', tipo:'auto', texto:'Cumplí un turno y lo reporté',
        ayuda:'Un turno asignado cuenta cuando ese mismo día enviaste tu reporte de patrullaje.',
        hecho:d => +d.turnos_cumplidos > 0, cuenta:d => `${d.turnos_cumplidos} de ${d.turnos_asignados} turno(s)` },
      { id:'tres', tipo:'auto', texto:'Llevo tres reportes aprobados',
        hecho:d => +d.aprobados >= 3, cuenta:d => `${Math.min(+d.aprobados,3)} de 3` },
    ] },
  { n:4, titulo:'Veterano', cuando:'Sin plazo', icono:'🎖️',
    intro:'Esta etapa no se cumple sola: la firma el liderazgo cuando considera que ya operas como veterano. Lo de abajo son señales que ayudan a decidir, no requisitos.',
    firma:true,
    pasos:[
      { id:'participacion', tipo:'auto', opcional:true, texto:'Participé en el reporte de otro como integrante',
        ayuda:'Cuando alguien te incluye entre los integrantes de su patrullaje o toma de territorio.',
        hecho:d => +d.participaciones > 0, cuenta:d => `${d.participaciones} vez(ces)` },
      { id:'diez', tipo:'auto', opcional:true, texto:'Llevo diez reportes aprobados',
        hecho:d => +d.aprobados >= 10, cuenta:d => `${Math.min(+d.aprobados,10)} de 10` },
    ] },
];

let D = null, PERFIL = null;

const hechoPaso = (p, d) => p.tipo === 'auto' ? !!p.hecho(d) : (d.marcas || []).includes(p.id);
// Una etapa está completa cuando están sus pasos obligatorios; la 4 además necesita la firma.
function etapaCompleta(e, d){
  const pasos = e.pasos.filter(p => !p.opcional).every(p => hechoPaso(p, d));
  return e.firma ? (pasos && !!(d.firma && d.firma.etapa >= 4)) : pasos;
}
function etapaActual(d){
  for(const e of ETAPAS) if(!etapaCompleta(e, d)) return e.n;
  return ETAPAS.length + 1;   // todas hechas
}

function pintar(){
  const d = D, act = etapaActual(d);
  const total = ETAPAS.reduce((a,e) => a + e.pasos.filter(p => !p.opcional).length, 0);
  const listos = ETAPAS.reduce((a,e) => a + e.pasos.filter(p => !p.opcional && hechoPaso(p,d)).length, 0);

  $('#cab').innerHTML = `
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
    const botonFirma = e.firma && PUEDE_FIRMAR && !(d.firma && d.firma.etapa >= 4)
      ? `<button class="primary sm" id="btnFirmar">🎖️ Firmar esta etapa</button>` : '';
    return `<section class="etapa ${lista_ok?'completa':''} ${e.n===act?'actual':''}">
      <h2><span class="ico">${e.icono}</span> Etapa ${e.n} · ${esc(e.titulo)}
        <small>${esc(e.cuando)}</small>${lista_ok?'<span class="sello">Completa</span>':''}</h2>
      <p class="intro">${esc(e.intro)}</p>
      <ul class="pasos">${lista}</ul>${firmaTxt}${botonFirma}</section>`;
  }).join('');

  document.querySelectorAll('[data-paso]').forEach(b => b.onclick = () => alternar(b.dataset.paso));
  const bf = $('#btnFirmar'); if(bf) bf.onclick = firmar;
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
  const nota = (prompt('¿Algún comentario para dejar en la firma? (opcional)') || '').trim();
  if(nota === null) return;
  const { error } = await sb.from('ruta_firmas').upsert({ usuario_id: OTRO, etapa: 4, firmado_por: yo.id, nota: nota || null });
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
