// Copia de seguridad completa (solo Administrador): datos en JSON + CSV e imágenes del historial, empaquetados en un ZIP
// generado en el navegador (sin compresión: las imágenes ya vienen comprimidas). No incluye webhooks ni claves.
import { sb, bloquearPantalla } from './auth.js';

const TABLAS = [
  ['perfiles', 'id,usuario,nombre,rango,rol_id,activo,visible,creado_en'],
  ['roles', 'id,nombre,descripcion,permisos,formularios,rango_pm,protegido'],
  ['rangos_pm', '*'], ['formularios', 'id,titulo,descripcion,icono,orden,activo,ruta,requiere_aprobacion,version,definicion,creado_en'],
  ['reportes', 'id,folio_v2,formulario_id,usuario_id,fecha,resumen,datos,imagen_path,estado,revisado_por,revisado_en,comentario_revision,discord_enviado_en,creado_en'],
  ['sanciones', '*'], ['ascensos', '*'], ['requisitos_ascenso', '*'], ['turnos', '*'], ['anuncios', '*'], ['anuncios_vistos', '*'], ['insignias', '*'], ['configuracion', '*'], ['auditoria', '*'],
];

// ---- CRC32 + ZIP (método "store") ----
const CRC = (() => { const t = new Uint32Array(256); for(let i=0;i<256;i++){ let c=i; for(let k=0;k<8;k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i]=c>>>0; } return t; })();
function crc32(u8){ let c = 0xFFFFFFFF; for(let i=0;i<u8.length;i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function fechaDos(d){ return { t: (d.getHours()<<11) | (d.getMinutes()<<5) | (d.getSeconds()>>1), f: ((d.getFullYear()-1980)<<9) | ((d.getMonth()+1)<<5) | d.getDate() }; }
function zip(archivos){ // [{nombre, datos:Uint8Array}]
  const enc = new TextEncoder(), partes = [], centro = []; let off = 0; const { t, f } = fechaDos(new Date());
  const u16 = n => [n & 255, (n>>8) & 255], u32 = n => [n & 255, (n>>8)&255, (n>>16)&255, (n>>>24)&255];
  for(const a of archivos){
    const nom = enc.encode(a.nombre), crc = crc32(a.datos), n = a.datos.length;
    const loc = new Uint8Array([0x50,0x4b,3,4, ...u16(20), ...u16(0x800), ...u16(0), ...u16(t), ...u16(f), ...u32(crc), ...u32(n), ...u32(n), ...u16(nom.length), ...u16(0), ...nom]);
    partes.push(loc, a.datos);
    centro.push(new Uint8Array([0x50,0x4b,1,2, ...u16(20), ...u16(20), ...u16(0x800), ...u16(0), ...u16(t), ...u16(f), ...u32(crc), ...u32(n), ...u32(n), ...u16(nom.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...nom]));
    off += loc.length + n;
  }
  const cdir = centro.reduce((a,c) => a + c.length, 0);
  const fin = new Uint8Array([0x50,0x4b,5,6, ...u16(0), ...u16(0), ...u16(archivos.length), ...u16(archivos.length), ...u32(cdir), ...u32(off), ...u16(0)]);
  return new Blob([...partes, ...centro, fin], { type:'application/zip' });
}
const csv = filas => { if(!filas.length) return ''; const cols = Object.keys(filas[0]); const c = v => { if(v===null||v===undefined) return ''; const s = typeof v==='object' ? JSON.stringify(v) : String(v); return /[",\n;]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
  return '﻿' + cols.join(';') + '\n' + filas.map(r => cols.map(k => c(r[k])).join(';')).join('\n'); };

export async function respaldoCompleto({ imagenes=true } = {}){
  const ov = bloquearPantalla('Preparando la copia de seguridad…'); const enc = new TextEncoder(); const archivos = []; const resumen = { generado: new Date().toISOString(), tablas:{}, imagenes:0, imagenes_error:0 };
  try{
    for(const [t, cols] of TABLAS){
      ov.texto(`Exportando ${t}…`); let todo = [], desde = 0;
      while(true){ const { data, error } = await sb.from(t).select(cols).range(desde, desde+999); if(error){ resumen.tablas[t] = 'error: '+error.message; break; } todo = todo.concat(data||[]); if(!data || data.length < 1000) break; desde += 1000; }
      if(typeof resumen.tablas[t] !== 'string'){ resumen.tablas[t] = todo.length; archivos.push({ nombre:`datos/${t}.json`, datos: enc.encode(JSON.stringify(todo, null, 1)) }); archivos.push({ nombre:`datos/${t}.csv`, datos: enc.encode(csv(todo)) }); }
    }
    if(imagenes){
      const reps = JSON.parse(new TextDecoder().decode((archivos.find(a => a.nombre==='datos/reportes.json')||{datos:enc.encode('[]')}).datos)).filter(r => r.imagen_path);
      for(let i=0;i<reps.length;i++){ const r = reps[i]; ov.texto(`Descargando imágenes… ${i+1} de ${reps.length}`);
        try{ const { data, error } = await sb.storage.from('reportes').download(r.imagen_path); if(error || !data) throw new Error(error ? error.message : 'sin datos');
          archivos.push({ nombre:`imagenes/${(r.folio_v2||r.id)}-${r.formulario_id}.${(r.imagen_path.split('.').pop()||'png')}`, datos: new Uint8Array(await data.arrayBuffer()) }); resumen.imagenes++; }
        catch(e){ resumen.imagenes_error++; } }
    }
    archivos.unshift({ nombre:'LEEME.txt', datos: enc.encode(`Copia de seguridad · Policía Militar · Army de Wasco\nGenerada: ${new Date().toLocaleString('es-CO')}\n\nCarpetas:\n- datos/   cada tabla en JSON (completo) y CSV (para Excel; separador ;)\n- imagenes/ imágenes de los reportes, nombradas <folio>-<formulario>.<ext>\n\nNo incluye contraseñas, webhooks de Discord ni claves.\n\nResumen: ${JSON.stringify(resumen, null, 1)}\n`) });
    ov.texto('Empaquetando ZIP…'); const blob = zip(archivos);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `respaldo-pm-${new Date().toISOString().slice(0,10)}.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    ov.exito(`Copia lista: ${Object.values(resumen.tablas).filter(n => typeof n==='number').reduce((a,b)=>a+b,0)} registros, ${resumen.imagenes} imágenes${resumen.imagenes_error?` (${resumen.imagenes_error} no se pudieron descargar)`:''}. Tamaño: ${(blob.size/1048576).toFixed(1)} MB.`, null, 10, 'Copia de seguridad descargada', '');
    return resumen;
  }catch(x){ ov.quitar(); throw x; }
}
