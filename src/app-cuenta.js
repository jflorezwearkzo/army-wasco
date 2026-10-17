  import { requerir, barraUsuario, cerrarSesion, sb, esc, nombreCompleto, validarPassword, traducirAuth, REGLA_PASSWORD, urlImagen } from './auth.js';
  const yo=await requerir(); barraUsuario(yo);
  const NP={usuarios:'Gestión de usuarios',asignar_roles:'Asignación de roles',reset_password:'Restablecer contraseñas',crear_roles:'Creación de roles',crear_reportes:'Creación de reportes',gestion_reportes:'Gestión de reportes',disenar_formularios:'Creación de formularios (diseñador)',historial:'Ver historial',eliminar_historial:'Eliminar historial',auditoria:'Ver auditoría'};
  const perms=Object.entries(yo.rol.permisos||{}).filter(([k,v])=>v).map(([k])=>NP[k]||k).join(', ')||'ninguno';
  const forms=yo.rol.formularios.includes('*')?'todos':(yo.rol.formularios.join(', ')||'ninguno');
  document.getElementById('info').innerHTML=`<p><b>Usuario:</b> ${esc(yo.usuario)}</p><p><b>Nombre:</b> ${esc(nombreCompleto(yo))}</p><p><b>Rango:</b> ${esc(yo.rango||'Sin asignar (lo asigna un administrador)')}</p>
    <p><b>Rol:</b> ${esc(yo.rol.nombre)}</p><p class="muted">Permisos: ${esc(perms)} · Formularios: ${esc(forms)}</p>`;
  document.getElementById('f').onsubmit=async e=>{
    e.preventDefault(); const err=document.getElementById('err'), ok=document.getElementById('ok'); err.textContent=''; ok.textContent='';
    const actual=p0.value, a=p1.value, b=p2.value;
    if(!actual){ err.textContent='Escribe tu contraseña actual.'; return; }
    if(a!==b){ err.textContent='Las contraseñas no coinciden.'; return; }
    const v=validarPassword(a); if(v){ err.textContent=v; return; }
    if(a===actual){ err.textContent='La contraseña nueva debe ser distinta de la actual.'; return; }
    // Supabase exige la contraseña actual ("Require current password when updating")
    const { error }=await sb.auth.updateUser({ password:a, current_password:actual });
    if(error) err.textContent=traducirAuth(error.message); else { ok.textContent='Contraseña actualizada.'; e.target.reset(); }
  };

  // ---------- Mis reportes (solo los propios; RLS lo garantiza) ----------
  const fmt=iso=>{ if(!iso) return ''; const [y,m,d]=String(iso).slice(0,10).split('-'); return `${d}-${m}-${y}`; };
  let MIS=[];
  async function cargarMis(){
    const { data } = await sb.from('reportes_vista').select('id,folio,fecha,formulario,formulario_id,resumen,creado_en,imagen_path').eq('usuario_id', yo.id).order('id',{ascending:false}).limit(500);
    MIS=data||[]; const forms=[...new Map(MIS.map(r=>[r.formulario_id,r.formulario])).entries()];
    document.getElementById('mForm').innerHTML='<option value="">Todos los formularios</option>'+forms.map(([id,t])=>`<option value="${esc(id)}">${esc(t||id)}</option>`).join('');
    pintarMis();
  }
  function pintarMis(){
    const f=document.getElementById('mForm').value, q=document.getElementById('mBuscar').value.trim().toLowerCase();
    const lista=MIS.filter(r=>(!f||r.formulario_id===f)&&(!q||(r.folio||'').toLowerCase().includes(q)||(r.resumen||'').toLowerCase().includes(q)));
    document.getElementById('mTotal').textContent=`${lista.length} de ${MIS.length}`;
    document.getElementById('tbMis').innerHTML=lista.map(r=>`<tr><td><b>${esc(r.folio||'')}</b></td><td>${fmt(r.fecha)}</td><td>${esc(r.formulario||'')}</td><td>${esc(r.resumen||'')}</td><td class="muted">${r.creado_en?new Date(r.creado_en).toLocaleString('es-CO'):''}</td><td>${r.imagen_path?`<button class="ghost" data-img="${esc(r.imagen_path)}" data-folio="${esc(r.folio||'')}" style="padding:4px 8px;font-size:12px">Descargar</button>`:'<span class="muted">—</span>'}</td></tr>`).join('')||'<tr><td colspan=6 class="muted">Aún no tienes reportes.</td></tr>';
    document.querySelectorAll('[data-img]').forEach(b=>b.onclick=async()=>{ b.disabled=true; try{ const u=await urlImagen(b.dataset.img); const a=document.createElement('a'); a.href=u; a.download=`reporte-${b.dataset.folio}.png`; a.target='_blank'; a.click(); }catch(x){ alert('No se pudo obtener la imagen: '+x.message); } b.disabled=false; });
  }
  document.getElementById('mForm').onchange=pintarMis; document.getElementById('mBuscar').oninput=pintarMis;
  cargarMis();

  document.getElementById('btnTodas').onclick=()=>{ if(confirm('¿Cerrar la sesión en todos tus dispositivos? Tendrás que volver a ingresar en cada uno.')) cerrarSesion(true); };
