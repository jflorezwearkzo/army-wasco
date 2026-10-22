// Exporta el Resumen de actividad (KPIs, gráficas y tablas) como imagen PNG o como PDF, dibujado en canvas
// con la identidad de la Policía Militar. Sin librerías: el PDF se arma a mano con una imagen JPEG por página.

const W = 1240, H = 1754, M = 56;                  // tamaño de página (proporción A4) y margen
const AN = W - 2*M;                                 // ancho útil
const F = '"Roboto Condensed", Arial, sans-serif';
const C = {
  fondo:'#0b1216', panel:'#121b20', panel2:'#0e171c', borde:'#2b3a40', borde2:'#1d2a30',
  texto:'#f3f3f3', muted:'#9aa7ad', tenue:'#6b7b82', oro:'#f0c24d', oroTenue:'#6b5a24', cabecera:'#07100f'
};
// Paleta categórica validada (orden fijo, nunca ciclada) para la gráfica de formularios.
const PAL = ['#3987e5','#d95926','#199e70','#c98500','#d55181','#008300'];
const OTROS = '#6b7b82';
// El color sigue a la entidad, no a su posición en el ranking: cada formulario tiene su cupo fijo.
const CUPO = { bajas:0, reclutamiento:1, patrullaje:2, 'toma-territorio':3 };
function cupo(id, usados){
  let i = CUPO[id];
  if(i == null){ let h = 0; const s = String(id||''); for(let k=0;k<s.length;k++) h = (h*31 + s.charCodeAt(k)) >>> 0; i = h % PAL.length; }
  for(let k=0;k<PAL.length;k++){ const j = (i+k) % PAL.length; if(!usados.has(j)){ usados.add(j); return j; } }
  return -1;
}

let escudo;                                         // el emblema PM, cargado una sola vez
function cargarEscudo(){
  if(escudo !== undefined) return Promise.resolve(escudo);
  return new Promise(r => {
    const im = new Image();
    im.onload = () => { escudo = im; r(im); };
    im.onerror = () => { escudo = null; r(null); };
    im.src = new URL('../icons/icon-192.png', import.meta.url).href;
  });
}

const fmtF = s => (s||'').split('-').reverse().join('-');
const redondo = (g,x,y,w,h,r) => { g.beginPath(); g.roundRect(x,y,Math.max(0,w),Math.max(0,h),r); };
function lineas(g, texto, ancho){ const out=[]; let l=''; for(const w of String(texto||'').split(/\s+/)){ const t = l ? l+' '+w : w; if(g.measureText(t).width > ancho && l){ out.push(l); l = w; } else l = t; } if(l) out.push(l); return out.length ? out : ['']; }
function recortar(g, t, ancho){ let s = String(t ?? ''); if(g.measureText(s).width <= ancho) return s; while(s.length && g.measureText(s+'…').width > ancho) s = s.slice(0,-1); return s + '…'; }
function iniciales(n){ const p = String(n||'').replace(/[^\p{L}\p{N} ]/gu,' ').trim().split(/\s+/).filter(Boolean);
  const a = (p[0]||'')[0] || '', b = (p[1]||'')[0] || ''; return ((a+b) || '?').toUpperCase().slice(0,2); }

// ---- Página ----
const CAB = 150;                                    // alto de la cabecera
function nuevaPagina(pags, cab){
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = C.fondo; g.fillRect(0,0,W,H);
  g.textBaseline = 'alphabetic';

  // franja superior con degradado y filo dorado
  const deg = g.createLinearGradient(0,0,W,CAB); deg.addColorStop(0,'#07100f'); deg.addColorStop(1,'#101c1c');
  g.fillStyle = deg; g.fillRect(0,0,W,CAB);
  g.fillStyle = C.oro; g.fillRect(0,CAB,W,3);
  g.fillStyle = 'rgba(240,194,77,.18)'; g.fillRect(0,CAB+3,W,1);

  let x = M;
  if(escudo){ g.drawImage(escudo, M, 38, 74, 74); x = M + 94; }
  g.fillStyle = C.oro; g.font = `bold 14px ${F}`; g.letterSpacing = '4px';
  g.fillText('ARMY DE WASCO · POLICÍA MILITAR', x, 60); g.letterSpacing = '0px';
  g.fillStyle = C.texto; g.font = `italic bold 36px ${F}`; g.fillText('RESUMEN DE ACTIVIDAD', x, 100);
  g.fillStyle = C.tenue; g.font = `13px ${F}`; g.letterSpacing = '1px';
  g.fillText('INFORME GENERADO DESDE EL PANEL DE ADMINISTRACIÓN', x, 124); g.letterSpacing = '0px';

  g.textAlign = 'right';
  g.fillStyle = C.muted; g.font = `bold 15px ${F}`; g.fillText(cab.periodo, W-M, 60);
  g.fillStyle = C.tenue; g.font = `13px ${F}`; g.fillText(cab.generado, W-M, 84);
  g.textAlign = 'left';

  pags.push({ cv, g, y: CAB + 40 });
  return pags[pags.length-1];
}
function pies(pags, cab){
  pags.forEach((p,i) => { const g = p.g;
    g.fillStyle = C.borde2; g.fillRect(M, H-66, AN, 1);
    g.fillStyle = C.tenue; g.font = `12px ${F}`; g.fillText('Documento interno · Policía Militar · Army de Wasco', M, H-40);
    g.textAlign = 'right'; g.fillStyle = C.muted; g.font = `bold 12px ${F}`;
    g.fillText(`PÁGINA ${i+1} DE ${pags.length}`, W-M, H-40); g.textAlign = 'left'; });
}

// ---- Dibuja todo el resumen y devuelve la lista de canvas ----
export async function dibujarResumen(R, cab){
  await cargarEscudo();
  const pags = []; let p = nuevaPagina(pags, cab);
  const LIM = H - 86;
  const asegurar = h => { if(p.y + h > LIM) p = nuevaPagina(pags, cab); };

  // Marco de tarjeta: fondo, borde y título con filete dorado
  const tarjeta = (alto, tit) => {
    asegurar(alto);
    const g = p.g, y = p.y;
    g.fillStyle = C.panel; redondo(g, M, y, AN, alto, 14); g.fill();
    g.strokeStyle = C.borde2; g.lineWidth = 1.5; redondo(g, M+.75, y+.75, AN-1.5, alto-1.5, 14); g.stroke();
    if(tit){
      g.fillStyle = C.oro; redondo(g, M+22, y+22, 3, 16, 2); g.fill();
      g.fillStyle = C.texto; g.font = `bold 16px ${F}`; g.letterSpacing = '2px';
      g.fillText(tit.toUpperCase(), M+36, y+36); g.letterSpacing = '0px';
    }
    return { g, x:M, y, ix:M+22, iy:y + (tit ? 58 : 22), iw:AN-44 };
  };
  const seccion = t => { asegurar(56); const g = p.g; g.fillStyle = C.oro; redondo(g, M, p.y+2, 3, 16, 2); g.fill();
    g.fillStyle = C.texto; g.font = `bold 16px ${F}`; g.letterSpacing = '2px'; g.fillText(t.toUpperCase(), M+14, p.y+16); g.letterSpacing = '0px';
    g.fillStyle = C.borde2; g.fillRect(M, p.y+28, AN, 1); p.y += 46; };

  // ============ KPIs: ficha principal + rejilla ============
  const K = R.kpis.slice();
  const [vTot, lTot] = K.shift() || [0,'Reportes'];
  const ALTO_K = 220, HW = 352, GAP = 16;
  asegurar(ALTO_K + 28);
  {
    const g = p.g, y = p.y;
    // ficha principal
    const dg = g.createLinearGradient(M, y, M+HW, y+ALTO_K); dg.addColorStop(0,'#17222a'); dg.addColorStop(1,'#101a1f');
    g.fillStyle = dg; redondo(g, M, y, HW, ALTO_K, 14); g.fill();
    g.strokeStyle = C.oroTenue; g.lineWidth = 1.5; redondo(g, M+.75, y+.75, HW-1.5, ALTO_K-1.5, 14); g.stroke();
    g.fillStyle = C.oro; redondo(g, M+24, y+26, 44, 3, 2); g.fill();
    g.fillStyle = C.muted; g.font = `bold 13px ${F}`; g.letterSpacing = '3px'; g.fillText(String(lTot).toUpperCase(), M+24, y+58); g.letterSpacing = '0px';
    g.fillStyle = C.oro; g.font = `bold 92px ${F}`; g.fillText(String(vTot), M+22, y+146);
    g.fillStyle = C.tenue; g.font = `14px ${F}`;
    g.fillText(`${fmtF(R.desde)}  →  ${fmtF(R.hasta)}`, M+24, y+180);
    // rejilla 3×2
    const gx = M + HW + GAP, gw = AN - HW - GAP;
    const tw = (gw - 2*GAP)/3, th = (ALTO_K - GAP)/2;
    K.slice(0,6).forEach(([v,l],i) => {
      const x = gx + (i%3)*(tw+GAP), yy = y + Math.floor(i/3)*(th+GAP);
      g.fillStyle = C.panel; redondo(g, x, yy, tw, th, 12); g.fill();
      g.strokeStyle = C.borde2; g.lineWidth = 1.5; redondo(g, x+.75, yy+.75, tw-1.5, th-1.5, 12); g.stroke();
      g.fillStyle = C.oro; redondo(g, x, yy+16, 3, th-32, 2); g.fill();
      const s = String(v); g.fillStyle = C.texto; g.font = `bold ${s.length>6?30:38}px ${F}`;
      g.fillText(recortar(g, s, tw-36), x+18, yy+th/2+8);
      g.fillStyle = C.muted; g.font = `13px ${F}`; g.fillText(recortar(g, l, tw-36), x+18, yy+th-18);
    });
    p.y += ALTO_K + 26;
  }

  // ============ Reportes por día ============
  {
    const dias = Object.entries(R.porDia);
    const ALTO = 286, t = tarjeta(ALTO, 'Reportes por día'); const g = t.g;
    const x0 = t.ix, y0 = t.iy + 6, bh = 164, ancho = t.iw;
    const max = Math.max(1, ...dias.map(d=>d[1]));
    const esc = v => Math.round(v/max*bh);
    // rejilla recesiva
    g.font = `11px ${F}`;
    const vistos = new Set();
    for(let i=0;i<=3;i++){
      const v = Math.round(max*i/3); if(vistos.has(v)) continue; vistos.add(v);
      const yy = y0 + bh - esc(v);
      g.fillStyle = C.borde2; g.fillRect(x0+34, yy, ancho-34, 1);
      g.fillStyle = C.tenue; g.textAlign='right'; g.fillText(String(v), x0+24, yy+4); g.textAlign='left';
    }
    const bx = x0 + 34, bancho = ancho - 34;
    const bw = bancho/dias.length, aMax = dias.reduce((a,d)=>d[1]>a[1]?d:a, dias[0]||['',0]);
    dias.forEach(([d,v],i) => {
      const h = v ? Math.max(3, esc(v)) : 0, x = bx + i*bw + 1, w = Math.max(1, bw-2);
      if(h){ g.fillStyle = C.oro; redondo(g, x, y0+bh-h, w, h, Math.min(4, w/2)); g.fill(); }
      else { g.fillStyle = '#1a262b'; g.fillRect(x, y0+bh-2, w, 2); }
      // etiquetas directas, solo donde aportan
      if(v && (dias.length<=12 || d===aMax[0])){ g.fillStyle = C.texto; g.font = `bold 12px ${F}`; g.textAlign='center'; g.fillText(String(v), x+w/2, y0+bh-h-6); g.textAlign='left'; }
      const paso = Math.max(1, Math.ceil(dias.length/16));
      const ultimo = i===dias.length-1 && (dias.length-1)%paso >= paso/2;
      if(i%paso===0 || ultimo){ g.fillStyle = C.tenue; g.font = `11px ${F}`; g.textAlign='center'; g.fillText(fmtF(d).slice(0,5), x+w/2, y0+bh+18); g.textAlign='left'; }
    });
    g.fillStyle = C.borde; g.fillRect(bx, y0+bh, bancho, 1);
    g.fillStyle = C.tenue; g.font = `12px ${F}`;
    g.fillText(aMax[1] ? `Pico de ${aMax[1]} reporte(s) el ${fmtF(aMax[0])}` : 'Sin reportes aprobados en el periodo', x0, y0 + bh + 48);
    p.y += ALTO + 20;
  }

  // ============ Formularios (anillo) + Top integrantes ============
  {
    const ALTO = 340;
    asegurar(ALTO + 24);
    const AI = Math.round(AN*0.46), AD = AN - AI - 18, XD = M + AI + 18;
    const g = p.g, y = p.y;
    const caja = (x,w,tit) => { g.fillStyle = C.panel; redondo(g, x, y, w, ALTO, 14); g.fill();
      g.strokeStyle = C.borde2; g.lineWidth = 1.5; redondo(g, x+.75, y+.75, w-1.5, ALTO-1.5, 14); g.stroke();
      g.fillStyle = C.oro; redondo(g, x+22, y+22, 3, 16, 2); g.fill();
      g.fillStyle = C.texto; g.font = `bold 16px ${F}`; g.letterSpacing = '2px'; g.fillText(tit.toUpperCase(), x+36, y+36); g.letterSpacing = '0px'; };

    // --- Por formulario: anillo + leyenda con nombre, cantidad y % ---
    caja(M, AI, 'Por formulario');
    const total = Math.max(1, R.total||0);
    const usados = new Set();
    let segs = (R.porForm||[]).map(([nom,n,pct,id]) => ({ nom, n, pct, col: PAL[cupo(id||nom, usados)] || OTROS }));
    if(segs.length > 6){ const cola = segs.slice(5); segs = segs.slice(0,5);
      segs.push({ nom:'Otros', n: cola.reduce((a,s)=>a+s.n,0), pct: Math.round(cola.reduce((a,s)=>a+s.n,0)/total*100)+'%', col: OTROS }); }
    const cx = M + 112, cy = y + 170, rExt = 80, gro = 26;
    if(!segs.length){ g.fillStyle = C.tenue; g.font = `14px ${F}`; g.fillText('Sin reportes en el periodo', M+22, y+80); }
    else {
      let ang = -Math.PI/2;
      segs.forEach(s => {
        const d = (s.n/total) * Math.PI*2;
        g.strokeStyle = s.col; g.lineWidth = gro; g.lineCap = 'butt';
        g.beginPath(); g.arc(cx, cy, rExt-gro/2, ang, ang+d); g.stroke();
        ang += d;
      });
      // separador de 2px del color de la superficie entre porciones
      if(segs.length > 1){ let a2 = -Math.PI/2; segs.forEach(s => { g.strokeStyle = C.panel; g.lineWidth = 2;
        g.beginPath(); g.moveTo(cx + Math.cos(a2)*(rExt-gro), cy + Math.sin(a2)*(rExt-gro)); g.lineTo(cx + Math.cos(a2)*rExt, cy + Math.sin(a2)*rExt); g.stroke();
        a2 += (s.n/total)*Math.PI*2; }); }
      g.fillStyle = C.texto; g.font = `bold 34px ${F}`; g.textAlign='center'; g.fillText(String(R.total||0), cx, cy+4);
      g.fillStyle = C.tenue; g.font = `12px ${F}`; g.letterSpacing='1px'; g.fillText('REPORTES', cx, cy+24); g.letterSpacing='0px'; g.textAlign='left';
      // leyenda
      const lx = M + 214, lw = AI - (214) - 22;
      segs.forEach((s,i) => {
        const ly = y + 78 + i*34;
        g.fillStyle = s.col; redondo(g, lx, ly-9, 11, 11, 3); g.fill();
        g.fillStyle = C.texto; g.font = `14px ${F}`; g.fillText(recortar(g, s.nom, lw-74), lx+20, ly);
        g.textAlign='right'; g.fillStyle = C.texto; g.font = `bold 14px ${F}`; g.fillText(String(s.n), lx+lw-40, ly);
        g.fillStyle = C.tenue; g.font = `13px ${F}`; g.fillText(s.pct, lx+lw, ly); g.textAlign='left';
      });
    }

    // --- Top integrantes en patrullajes (barras horizontales, una sola serie) ---
    caja(XD, AD, 'Top integrantes · patrullajes');
    const top = (R.integrantes||[]).slice(0,6);
    if(!top.length){ g.fillStyle = C.tenue; g.font = `14px ${F}`; g.fillText('Sin patrullajes en el periodo', XD+22, y+80); }
    else {
      const maxT = Math.max(1, ...top.map(t=>t[1]));
      const bx = XD + 22, bw = AD - 44;
      top.forEach(([nom,n],i) => {
        const yy = y + 76 + i*40;
        g.fillStyle = C.texto; g.font = `14px ${F}`; g.fillText(recortar(g, nom, bw-56), bx, yy);
        g.textAlign='right'; g.font = `bold 14px ${F}`; g.fillText(String(n), bx+bw, yy); g.textAlign='left';
        g.fillStyle = '#17242a'; redondo(g, bx, yy+8, bw, 8, 4); g.fill();
        g.fillStyle = C.oro; redondo(g, bx, yy+8, Math.max(6, bw*n/maxT), 8, 4); g.fill();
      });
    }
    p.y += ALTO + 26;
  }

  // ============ Tablas ============
  const tabla = (tit, cols, filas, vacio) => {
    seccion(tit);
    const anchos = cols.map(c => c.w*AN);
    const maxBar = {}; cols.forEach((c,i) => { if(c.bar) maxBar[i] = Math.max(1, ...filas.map(f => +f[i] || 0)); });
    const cabTabla = () => { asegurar(40); const g=p.g;
      g.fillStyle = '#0a1114'; redondo(g, M, p.y, AN, 32, 8); g.fill();
      g.fillStyle = C.tenue; g.font = `bold 12px ${F}`; g.letterSpacing = '1px';
      let x = M+14; cols.forEach((c,i)=>{ g.textAlign = c.num?'right':'left'; g.fillText(c.t.toUpperCase(), c.num ? x+anchos[i]-26 : x, p.y+21); x += anchos[i]; });
      g.letterSpacing = '0px'; g.textAlign='left'; p.y += 36; };
    cabTabla();
    if(!filas.length){ p.g.fillStyle = C.tenue; p.g.font = `14px ${F}`; p.g.fillText(vacio, M+14, p.y+20); p.y += 44; return; }
    filas.forEach((f, idx) => {
      const g0 = p.g; g0.font = `15px ${F}`;
      const celdas = cols.map((c,i) => c.wrap ? lineas(g0, f[i], anchos[i]-30) : null);
      const h = Math.max(38, 14 + 21*Math.max(1, ...cols.map((c,i)=>c.wrap?celdas[i].length:1)));
      if(p.y + h > LIM){ p = nuevaPagina(pags, cab); seccion(tit + ' (continuación)'); cabTabla(); }
      const g = p.g;
      if(idx%2===0){ g.fillStyle = C.panel2; redondo(g, M, p.y, AN, h, 6); g.fill(); }
      if(idx===0){ g.fillStyle = C.oro; redondo(g, M, p.y+6, 3, h-12, 2); g.fill(); }
      let x = M+14;
      cols.forEach((c,i) => {
        const cy = p.y + h/2 + 5;
        if(c.avatar){
          const r = 13, acx = x + r, acy = p.y + h/2;
          g.fillStyle = '#1b2a31'; g.beginPath(); g.arc(acx, acy, r, 0, Math.PI*2); g.fill();
          g.strokeStyle = C.oroTenue; g.lineWidth = 1.5; g.stroke();
          g.fillStyle = C.oro; g.font = `bold 12px ${F}`; g.textAlign='center';
          g.fillText(iniciales(c.de != null ? f[c.de] : f[i]), acx, acy+4); g.textAlign='left';
          g.fillStyle = C.texto; g.font = `bold 15px ${F}`; g.fillText(recortar(g, f[i], anchos[i]-2*r-16), x+2*r+10, cy);
        } else if(c.bar){
          const v = +f[i] || 0, der = x + anchos[i] - 26;
          g.fillStyle = C.texto; g.font = `bold 15px ${F}`; g.textAlign='right'; g.fillText(String(f[i] ?? ''), der, cy); g.textAlign='left';
          const bw2 = Math.min(96, Math.max(0, anchos[i]-86)), bx2 = der - 42 - bw2, by2 = p.y + h/2 - 3;
          if(bw2 > 10){ g.fillStyle = '#17242a'; redondo(g, bx2, by2, bw2, 6, 3); g.fill();
            g.fillStyle = C.oro; redondo(g, bx2, by2, Math.max(4, bw2*v/maxBar[i]), 6, 3); g.fill(); }
        } else {
          g.fillStyle = c.bold ? C.oro : (c.muted ? C.muted : C.texto);
          g.font = `${c.bold?'bold ':''}${c.muted?13:15}px ${F}`; g.textAlign = c.num?'right':'left';
          if(c.wrap) celdas[i].forEach((l,j) => g.fillText(l, x, p.y+24+21*j));
          else g.fillText(recortar(g, f[i] ?? '', anchos[i]-30), c.num ? x+anchos[i]-26 : x, cy);
        }
        x += anchos[i];
      });
      g.textAlign='left'; p.y += h;
    });
    p.y += 26;
  };

  tabla('Actividad por usuario',
    [{t:'Usuario',w:.34,avatar:true,de:1},{t:'Rango y nombre',w:.34,muted:true},{t:'Reportes',w:.17,num:true,bar:true},{t:'Último',w:.15,num:true,muted:true}],
    R.porUsuario, '—');
  tabla('Patrullajes por integrante',
    [{t:'Integrante',w:.7,avatar:true},{t:'Patrullajes',w:.3,num:true,bar:true}],
    R.integrantes, '—');
  tabla('Bajas reportadas por persona',
    [{t:'Quien reporta',w:.3,avatar:true,de:1},{t:'Rango y nombre',w:.33,muted:true},{t:'Reportes',w:.15,num:true,muted:true},{t:'Bajas',w:.22,num:true,bar:true}],
    R.bajas, 'Sin reportes de bajas en el periodo');
  tabla('Reclutamientos por persona',
    [{t:'Quien recluta',w:.26,avatar:true,de:1},{t:'Rango y nombre',w:.22,muted:true},{t:'Reclutados',w:.14,num:true,bar:true},{t:'Nombres',w:.38,wrap:true,muted:true}],
    R.reclut, 'Sin reclutamientos en el periodo');

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
