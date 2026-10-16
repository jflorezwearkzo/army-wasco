  import { requerir, barraUsuario, puedeFormulario, sb, esc } from './auth.js';
  const yo = await requerir(); barraUsuario(yo);
  const fmt = iso => { if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}-${m}-${y}`; };
  const el = document.getElementById('lista');
  const { data: formularios, error } = await sb.from('formularios').select('*').eq('activo', true).order('orden');
  if(error){ el.innerHTML = `<p class="empty">No se pudo cargar la lista de reportes: ${esc(error.message)}</p>`; }
  else {
    const visibles = (formularios||[]).filter(f => puedeFormulario(yo, f.id));
    if(!visibles.length) el.innerHTML = '<p class="empty">No tienes formularios asignados. Pide acceso al administrador.</p>';
    else el.innerHTML = visibles.map(r => `<a class="card" href="${esc(r.ruta)}">
          <div class="ico">${esc(r.icono || '📋')}</div>
          <h2>${esc(r.titulo)}</h2>
          <p>${esc(r.descripcion || '')}</p>
          <div class="meta"><span>${r.creado_en ? 'Desde ' + fmt(r.creado_en.slice(0,10)) : ''}</span><span class="tag">Disponible</span></div>
        </a>`).join('');
  }
