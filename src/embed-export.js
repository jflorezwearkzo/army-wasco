// Dibuja en un canvas el mensaje (embed de Discord) que genera una tarea programada, para verlo antes de enviarlo
// y poder descargarlo como imagen. Mismo estilo que el resto de los informes de la Policía Militar.

const W = 1000, M = 44;
const F = '"Roboto Condensed", Arial, sans-serif';
const C = { fondo:'#0b1216', panel:'#121b20', borde:'#2b3a40', borde2:'#1d2a30', texto:'#f3f3f3', muted:'#9aa7ad', tenue:'#6b7b82', oro:'#f0c24d', cabecera:'#07100f' };

let escudo;
function cargarEscudo(){
  if(escudo !== undefined) return Promise.resolve(escudo);
  return new Promise(r => { const im = new Image();
    im.onload = () => { escudo = im; r(im); };
    im.onerror = () => { escudo = null; r(null); };
    im.src = new URL('../icons/icon-192.png', import.meta.url).href; });
}
const redondo = (g,x,y,w,h,r) => { g.beginPath(); g.roundRect(x,y,Math.max(0,w),Math.max(0,h),r); };
function lineas(g, texto, ancho){
  const out = [];
  String(texto ?? '').split('\n').forEach(parrafo => {
    let l = '';
    for(const w of parrafo.split(/\s+/)){ const t = l ? l+' '+w : w;
      if(g.measureText(t).width > ancho && l){ out.push(l); l = w; } else l = t; }
    out.push(l);
  });
  return out;
}
// Discord usa **negrita**; aquí solo se limpia para que no se vean los asteriscos.
const limpio = t => String(t ?? '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');

// Recorre el embed midiendo (g sin dibujar) o dibujando. Devuelve el alto total.
function recorrer(g, emb, cab, dibujar){
  const X = M + 18, AN = W - 2*M - 36;
  let y = 150;                                           // debajo de la cabecera
  const tit = limpio(emb.title || 'Mensaje');
  g.font = `bold 28px ${F}`;
  lineas(g, tit, AN).forEach(l => { if(dibujar){ g.fillStyle = C.oro; g.fillText(l, X, y); } y += 36; });
  y += 6;
  if(emb.description){
    g.font = `17px ${F}`;
    lineas(g, limpio(emb.description), AN).forEach(l => { if(dibujar){ g.fillStyle = C.texto; g.fillText(l, X, y); } y += 26; });
    y += 10;
  }
  (emb.fields || []).forEach(f => {
    g.font = `bold 15px ${F}`;
    if(dibujar){ g.fillStyle = C.muted; g.fillText(limpio(f.name), X, y); }
    y += 24;
    g.font = `17px ${F}`;
    lineas(g, limpio(f.value), AN - 16).forEach(l => { if(dibujar){ g.fillStyle = C.texto; g.fillText(l, X + 14, y); } y += 26; });
    y += 14;
  });
  y += 8;
  if(dibujar){
    g.fillStyle = C.borde2; g.fillRect(X, y, AN, 1);
    g.fillStyle = C.tenue; g.font = `13px ${F}`;
    g.fillText((emb.footer && emb.footer.text) || 'Generado automáticamente · Policía Militar', X, y + 24);
    g.textAlign = 'right'; g.fillText(cab.generado || '', W - M - 18, y + 24); g.textAlign = 'left';
  }
  return y + 44;
}

export async function dibujarEmbed(emb, cab){
  await cargarEscudo();
  const med = document.createElement('canvas').getContext('2d');
  med.textBaseline = 'alphabetic';
  const H = Math.max(360, recorrer(med, emb, cab, false));

  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.textBaseline = 'alphabetic';
  g.fillStyle = C.fondo; g.fillRect(0,0,W,H);
  // cabecera
  const deg = g.createLinearGradient(0,0,W,110); deg.addColorStop(0,'#07100f'); deg.addColorStop(1,'#101c1c');
  g.fillStyle = deg; g.fillRect(0,0,W,110);
  g.fillStyle = C.oro; g.fillRect(0,110,W,3);
  let x = M;
  if(escudo){ g.drawImage(escudo, M, 24, 60, 60); x = M + 78; }
  g.fillStyle = C.oro; g.font = `bold 13px ${F}`; g.letterSpacing = '4px';
  g.fillText('ARMY DE WASCO · POLICÍA MILITAR', x, 50); g.letterSpacing = '0px';
  g.fillStyle = C.texto; g.font = `italic bold 24px ${F}`; g.fillText(cab.tarea || 'Tarea programada', x, 82);
  // panel con filete dorado
  g.fillStyle = C.panel; redondo(g, M, 132, W-2*M, H-132-28, 14); g.fill();
  g.strokeStyle = C.borde2; g.lineWidth = 1.5; redondo(g, M+.75, 132.75, W-2*M-1.5, H-132-28-1.5, 14); g.stroke();
  g.fillStyle = C.oro; redondo(g, M, 150, 4, H-132-28-36, 2); g.fill();
  recorrer(g, emb, cab, true);
  return cv;
}

// Texto plano del embed, para copiar o guardar como .txt
export function textoEmbed(emb, cab){
  const p = [limpio(emb.title || '')];
  if(emb.description) p.push('', limpio(emb.description));
  (emb.fields || []).forEach(f => p.push('', limpio(f.name), limpio(f.value)));
  p.push('', (emb.footer && emb.footer.text) || 'Generado automáticamente · Policía Militar');
  if(cab && cab.generado) p.push(cab.generado);
  return p.join('\n');
}
