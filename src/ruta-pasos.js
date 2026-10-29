// Definición de la ruta de aprendizaje, compartida por la página de la ruta y por el aviso del
// inicio. Cada paso dice cómo se comprueba: auto (una función sobre los datos que trae mi_ruta) o
// marca (la persona la marca a mano).
export const ETAPAS = [
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


export const hechoPaso = (p, d) => p.tipo === 'auto' ? !!p.hecho(d) : (d.marcas || []).includes(p.id);
// Una etapa está completa cuando están sus pasos obligatorios; la 4 además necesita la firma.
export function etapaCompleta(e, d){
  const pasos = e.pasos.filter(p => !p.opcional).every(p => hechoPaso(p, d));
  return e.firma ? (pasos && !!(d.firma && d.firma.etapa >= 4)) : pasos;
}
export function etapaActual(d){
  for(const e of ETAPAS) if(!etapaCompleta(e, d)) return e.n;
  return ETAPAS.length + 1;   // todas hechas
}


// Resumen corto de lo que falta: etapa en curso y sus pasos pendientes (sin los opcionales).
export function pendientes(d){
  const act = etapaActual(d);
  if(act > ETAPAS.length) return null;
  const e = ETAPAS.find(x => x.n === act);
  const faltan = e.pasos.filter(p => !p.opcional && !hechoPaso(p, d));
  const total = ETAPAS.reduce((a,x) => a + x.pasos.filter(p => !p.opcional).length, 0);
  const listos = ETAPAS.reduce((a,x) => a + x.pasos.filter(p => !p.opcional && hechoPaso(p, d)).length, 0);
  return { etapa:e, faltan, total, listos, firmaPendiente: !!e.firma && !(d.firma && d.firma.etapa >= 4) };
}
