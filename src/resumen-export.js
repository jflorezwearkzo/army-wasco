// Exporta el Resumen de actividad (KPIs y tablas) como imagen PNG o como PDF, dibujado en canvas con el estilo de los reportes.
// Sin librerías: el PDF se arma a mano con una imagen JPEG por página.

const W = 1240, H = 1754, M = 60;                  // tamaño de página (proporción A4) y margen
const F = '"Roboto Condensed", Arial, sans-serif';
const C = { fondo:'#0b1216', panel:'#121b20', borde:'#2b3a40', texto:'#f3f3f3', muted:'#9aa7ad', oro:'#f0c24d', fila:'#0e171c', verde:'#5fd38d' };

function nuevaPagina(pags, cab){
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = C.fondo; g.fillRect(0,0,W,H);
  // cabecera
  g.fillStyle = '#07100f'; g.fillRect(0,0,W,110); g.fillStyle = C.oro; g.fillRect(0,110,W,3);
  g.textBaseline = 'alphabetic'; g.fillStyle = C.oro; g.font = `bold 15px ${F}`; g.letterSpacing = '4px'; g.fillText('ARMY DE WASCO · POLICÍA MILITAR', M, 42); g.letterSpacing = '0px';
  g.fillStyle = C.texto; g.font = `italic bold 34px ${F}`; g.fillText('RESUMEN DE ACTIVIDAD', M, 84);
  g.fillStyle = C.muted; g.font = `15px ${F}`; g.textAlign = 'right'; g.fillText(cab.periodo, W-M, 50); g.fillText(cab.generado, W-M, 78); g.textAlign = 'left';
  pags.push({ cv, g, y: 150 });
  return pags[pags.length-1];
}
function pies(pags, cab){
  pags.forEach((p,i) => { const g = p.g; g.fillStyle = C.borde; g.fillRect(M, H-70, W-2*M, 1); g.fillStyle = C.muted; g.font = `13px ${F}`; g.fillText(`${cab.generado} · ${cab.periodo}`, M, H-42); g.textAlign = 'right'; g.fillText(`Página ${i+1} de ${pags.length}`, W-M, H-42); g.textAlign = 'left'; });
}
const fmtF = s => (s||'').split('-').reverse().join('-');
function lineas(g, texto, ancho){ const out=[]; let l=''; for(const w of String(texto||'').split(/\s+/)){ const t = l ? l+' '+w : w; if(g.measureText(t).width > ancho && l){ out.push(l); l = w; } else l = t; } if(l) out.push(l); return out.length ? out : ['']; }

// Dibuja todo el resumen y devuelve la lista de páginas (canvas)
export function dibujarResumen(R, cab){
  const pags = []; let p = nuevaPagina(pags, cab);
  const LIM = H - 90;
  const asegurar = h => { if(p.y + h > LIM) p = nuevaPagina(pags, cab); };
  const titulo = t => { asegurar(60); p.g.fillStyle = C.oro; p.g.font = `bold 17px ${F}`; p.g.letterSpacing = '2px'; p.g.fillText(t.toUpperCase(), M, p.y+18); p.g.letterSpacing = '0px'; p.g.fillStyle = C.borde; p.g.fillRect(M, p.y+28, W-2*M, 1); p.y += 44; };

  // KPIs
  const k = R.kpis; const n = k.length, gap = 12, aw = (W-2*M - gap*(n-1))/n;
  asegurar(110);
  k.forEach(([v,l],i) => { const x = M + i*(aw+gap); const g=p.g; g.fillStyle = C.panel; g.strokeStyle = C.borde; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(x, p.y, aw, 92, 10); g.fill(); g.stroke();
    g.fillStyle = C.oro; g.font = `bold ${String(v).length>5?30:38}px ${F}`; g.textAlign='center'; g.fillText(String(v), x+aw/2, p.y+50);
    g.fillStyle = C.muted; g.font = `13px ${F}`; g.fillText(l, x+aw/2, p.y+76); g.textAlign='left'; });
  p.y += 120;

  // Barras por día
  titulo('Reportes por día');
  const dias = Object.entries(R.porDia); const bh = 180; asegurar(bh+50);
  const max = Math.max(1, ...dias.map(d=>d[1])); const bw = (W-2*M)/dias.length; const g0 = p.g;
  g0.fillStyle = C.borde; g0.fillRect(M, p.y+bh, W-2*M, 1);
  dias.forEach(([d,v],i) => { const h = Math.max(2, Math.round(v/max*(bh-24))); const x = M + i*bw + 1; g0.fillStyle = v ? C.oro : '#1c272c'; g0.fillRect(x, p.y+bh-h, Math.max(1,bw-2), h);
    if(v && bw>=18){ g0.fillStyle = C.texto; g0.font = `bold 12px ${F}`; g0.textAlign='center'; g0.fillText(v, x+bw/2-1, p.y+bh-h-5); }
    if(dias.length<=31 || i%Math.ceil(dias.length/31)===0){ g0.save(); g0.translate(x+bw/2, p.y+bh+8); g0.rotate(-Math.PI/2); g0.fillStyle = C.muted; g0.font = `11px ${F}`; g0.textAlign='right'; g0.fillText(fmtF(d).slice(0,5), 0, 4); g0.restore(); }
    g0.textAlign='left'; });
  p.y += bh + 56;

  // Tablas
  const tabla = (tit, cols, filas, vacio) => {
    titulo(tit);
    const tw = W-2*M; const anchos = cols.map(c => c.w*tw);
    const cabTabla = () => { asegurar(34); const g=p.g; g.fillStyle = '#0a1114'; g.fillRect(M, p.y, tw, 30); g.fillStyle = C.muted; g.font = `bold 13px ${F}`; let x = M+12; cols.forEach((c,i)=>{ g.textAlign = c.num?'right':'left'; g.fillText(c.t.toUpperCase(), c.num ? x+anchos[i]-24 : x, p.y+20); x += anchos[i]; }); g.textAlign='left'; p.y += 30; };
    cabTabla();
    if(!filas.length){ p.g.fillStyle = C.muted; p.g.font = `14px ${F}`; p.g.fillText(vacio, M+12, p.y+22); p.y += 40; return; }
    filas.forEach((f, idx) => {
      const g = p.g; g.font = `15px ${F}`;
      const celdas = cols.map((c,i) => c.wrap ? lineas(g, f[i], anchos[i]-24) : [String(f[i] ?? '')]);
      const h = 10 + 22*Math.max(...celdas.map(c=>c.length));
      if(p.y + h > LIM){ p = nuevaPagina(pags, cab); cabTabla(); }
      const gg = p.g; if(idx%2===0){ gg.fillStyle = C.fila; gg.fillRect(M, p.y, tw, h); }
      let x = M+12; cols.forEach((c,i) => { gg.fillStyle = c.bold ? C.oro : (c.muted ? C.muted : C.texto); gg.font = `${c.bold?'bold ':''}${c.muted?13:15}px ${F}`; gg.textAlign = c.num?'right':'left';
        celdas[i].forEach((l,j) => gg.fillText(l, c.num ? x+anchos[i]-24 : x, p.y+22+22*j)); x += anchos[i]; });
      gg.textAlign='left'; p.y += h;
    });
    p.y += 24;
  };
  tabla('Por formulario', [{t:'Formulario',w:.6},{t:'Reportes',w:.2,num:true,bold:true},{t:'%',w:.2,num:true,muted:true}], R.porForm, 'Sin reportes en el periodo');
  tabla('Actividad por usuario', [{t:'Usuario',w:.25},{t:'Nombre',w:.35,muted:true},{t:'Reportes',w:.2,num:true,bold:true},{t:'Último',w:.2,num:true,muted:true}], R.porUsuario, '—');
  tabla('Patrullajes por integrante', [{t:'Integrante',w:.75},{t:'Patrullajes',w:.25,num:true,bold:true}], R.integrantes, '—');
  tabla('Bajas reportadas por persona', [{t:'Quien reporta',w:.25},{t:'Nombre',w:.35,muted:true},{t:'Reportes',w:.2,num:true},{t:'Bajas',w:.2,num:true,bold:true}], R.bajas, 'Sin reportes de bajas en el periodo');
  tabla('Reclutamientos por persona', [{t:'Quien recluta',w:.2},{t:'Nombre',w:.25,muted:true},{t:'Reclutados',w:.15,num:true,bold:true},{t:'Nombres',w:.4,wrap:true,muted:true}], R.reclut, 'Sin reclutamientos en el periodo');
  pies(pags, cab);
  return pags.map(x => x.cv);
}

// ---- PNG: todas las páginas apiladas en una sola imagen ----
export async function resumenPNG(pags){
  if(pags.length === 1) return new Promise(r => pags[0].toBlob(r, 'image/png'));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H*pags.length + 8*(pags.length-1); const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0,0,cv.width,cv.height); pags.forEach((p,i) => g.drawImage(p, 0, i*(H+8)));
  return new Promise(r => cv.toBlob(r, 'image/png'));
}

// ---- PDF mínimo: una imagen JPEG por página A4 ----
export function resumenPDF(pags){
  const enc = new TextEncoder(); const partes = []; let len = 0; const offs = [];
  const put = s => { const b = typeof s === 'string' ? enc.encode(s) : s; partes.push(b); len += b.length; };
  const obj = (n, cuerpo, stream) => { offs[n] = len; put(`${n} 0 obj\n${cuerpo}\n`); if(stream){ put('stream\n'); put(stream); put('\nendstream\n'); } put('endobj\n'); };
  const jpg = cv => { const b64 = cv.toDataURL('image/jpeg', 0.9).split(',')[1]; const bin = atob(b64); const u = new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i] = bin.charCodeAt(i); return u; };
  put('%PDF-1.4\n%âãÏÓ\n');
  const total = 2 + pags.length*3; const kids = pags.map((_,i) => `${3+i*3} 0 R`).join(' ');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pags.length} >>`);
  pags.forEach((cv,i) => { const pg = 3+i*3, ct = pg+1, im = pg+2; const img = jpg(cv);
    obj(pg, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>`);
    const c = 'q 595.28 0 0 841.89 0 0 cm /Im0 Do Q'; obj(ct, `<< /Length ${c.length} >>`, c);
    obj(im, `<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>`, img); });
  const xref = len; let t = `xref\n0 ${total+1}\n0000000000 65535 f \n`; for(let i=1;i<=total;i++) t += String(offs[i]).padStart(10,'0') + ' 00000 n \n';
  put(t + `trailer\n<< /Size ${total+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(partes, { type:'application/pdf' });
}

export function descargar(blob, nombre){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 30000); }
