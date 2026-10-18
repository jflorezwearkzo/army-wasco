  import { requerir, barraUsuario, cerrarSesion, instalarPWA, puedeInstalar, esStandalone, sb, esc, nombreCompleto, validarPassword, traducirAuth, REGLA_PASSWORD, urlImagen, verificarCodigo2FA, enVerComo } from './auth.js';
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
    const { data } = await sb.from('reportes_vista').select('id,folio,fecha,formulario,formulario_id,resumen,creado_en,imagen_path,estado,comentario_revision,revisor,requiere_aprobacion').eq('usuario_id', yo.id).order('id',{ascending:false}).limit(500);
    MIS=data||[]; const forms=[...new Map(MIS.map(r=>[r.formulario_id,r.formulario])).entries()];
    document.getElementById('mForm').innerHTML='<option value="">Todos los formularios</option>'+forms.map(([id,t])=>`<option value="${esc(id)}">${esc(t||id)}</option>`).join('');
    pintarMis();
  }
  function pintarMis(){
    const f=document.getElementById('mForm').value, q=document.getElementById('mBuscar').value.trim().toLowerCase();
    const lista=MIS.filter(r=>(!f||r.formulario_id===f)&&(!q||(r.folio||'').toLowerCase().includes(q)||(r.resumen||'').toLowerCase().includes(q)));
    document.getElementById('mTotal').textContent=`${lista.length} de ${MIS.length}`;
    document.getElementById('tbMis').innerHTML=lista.map(r=>`<tr><td><b>${esc(r.folio||'')}</b></td><td>${fmt(r.fecha)}</td><td>${esc(r.formulario||'')}</td><td>${esc(r.resumen||'')}${r.estado==='pendiente'?' <span class="tag" style="background:var(--avisobg);color:#e0a92a">Pendiente de revisión</span>':r.estado==='rechazado'?` <span class="tag off">Rechazado</span>${r.comentario_revision?`<br><span class="muted" style="font-size:12px">Motivo (${esc(r.revisor||'revisor')}): ${esc(r.comentario_revision)}</span>`:''}`:(r.requiere_aprobacion?' <span class="tag on">Aprobado</span>':'')}${r.estado==='aprobado'&&r.comentario_revision?`<br><span class="muted" style="font-size:12px">${esc(r.revisor||'')}: ${esc(r.comentario_revision)}</span>`:''}</td><td class="muted">${r.creado_en?new Date(r.creado_en).toLocaleString('es-CO'):''}</td><td>${r.imagen_path?`<button class="ghost" data-img="${esc(r.imagen_path)}" data-folio="${esc(r.folio||'')}" style="padding:4px 8px;font-size:12px">Descargar</button>`:'<span class="muted">—</span>'}</td></tr>`).join('')||'<tr><td colspan=6 class="muted">Aún no tienes reportes.</td></tr>';
    document.querySelectorAll('[data-img]').forEach(b=>b.onclick=async()=>{ b.disabled=true; try{ const u=await urlImagen(b.dataset.img); const a=document.createElement('a'); a.href=u; a.download=`reporte-${b.dataset.folio}.${(b.dataset.img.split('.').pop()||'png')}`; a.target='_blank'; a.click(); }catch(x){ alert('No se pudo obtener la imagen: '+x.message); } b.disabled=false; });
  }
  document.getElementById('mForm').onchange=pintarMis; document.getElementById('mBuscar').oninput=pintarMis;
  cargarMis();

  document.getElementById('btnTodas').onclick=()=>{ if(confirm('¿Cerrar la sesión en todos tus dispositivos? Tendrás que volver a ingresar en cada uno.')) cerrarSesion(true); };

  // ---------- Instalar como app ----------
  { const btn=document.getElementById('btnInstalar'), ios=document.getElementById('instalarIos'), txt=document.getElementById('instalarTxt');
    const esIos=/iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    const pintar=()=>{ if(esStandalone()){ txt.textContent='Ya estás usando PM Reportes como app instalada.'; btn.style.display='none'; ios.style.display='none'; return; }
      btn.style.display=puedeInstalar()?'':'none'; ios.style.display=esIos?'':'none';
      if(!puedeInstalar() && !esIos) txt.textContent='Para instalar: abre el menú del navegador (⋮) y elige "Instalar aplicación" o "Añadir a pantalla de inicio". Si no aparece, vuelve a esta página en unos segundos.'; };
    btn.onclick=async()=>{ const ok=await instalarPWA(); if(ok){ txt.textContent='¡Instalada! Búscala como "PM Reportes" entre tus aplicaciones.'; btn.style.display='none'; } };
    document.addEventListener('pm-instalable', pintar); pintar(); }

// ---------- Verificación en dos pasos (TOTP) ----------
(async()=>{
  const $=s=>document.querySelector(s); const err=$('#mfaErr'), ok=$('#mfaOk');
  if(!sb.auth.mfa){ $('#mfaEstado').textContent='No disponible en este navegador.'; return; }
  let enrolando=null;
  async function estado(){
    err.textContent=''; const { data, error } = await sb.auth.mfa.listFactors();
    if(error){ $('#mfaEstado').textContent='No se pudo consultar: '+traducirAuth(error.message); return; }
    const activos=(data.totp||[]).filter(f=>f.status==='verified'); const pendientes=(data.all||[]).filter(f=>f.status==='unverified');
    for(const p of pendientes){ try{ await sb.auth.mfa.unenroll({ factorId:p.id }); }catch(e){} }
    if(activos.length){ $('#mfaEstado').innerHTML='<span class="tag on">Activa</span> Al iniciar sesión se te pedirá el código de tu app.'; $('#mfaActivar').hidden=true; $('#mfaQuitar').hidden=enVerComo(yo); }
    else { $('#mfaEstado').innerHTML='<span class="tag off">Desactivada</span>'; $('#mfaActivar').hidden=enVerComo(yo); $('#mfaQuitar').hidden=true; }
  }
  await estado();
  $('#mfaEmpezar').onclick=async()=>{
    err.textContent=''; ok.textContent='';
    const { data, error } = await sb.auth.mfa.enroll({ factorType:'totp', friendlyName:'PM Reportes '+new Date().toISOString().slice(0,10) });
    if(error){ err.textContent=traducirAuth(error.message); return; }
    enrolando=data.id; const svg=data.totp.qr_code||''; $('#mfaQr').innerHTML = svg.trim().startsWith('<svg') ? svg : `<img src="${esc(svg)}" alt="QR" width="180" height="180">`; $('#mfaSecreto').textContent=data.totp.secret||'';
    $('#mfaPaso').hidden=false; $('#mfaEmpezar').hidden=true; $('#mfaCodigo').value=''; $('#mfaCodigo').focus();
  };
  $('#mfaCancelar').onclick=async()=>{ if(enrolando){ try{ await sb.auth.mfa.unenroll({ factorId:enrolando }); }catch(e){} enrolando=null; } $('#mfaPaso').hidden=true; $('#mfaEmpezar').hidden=false; };
  $('#fMfaVerif').onsubmit=async e=>{
    e.preventDefault(); err.textContent='';
    const { data: ch, error: e1 } = await sb.auth.mfa.challenge({ factorId:enrolando }); if(e1){ err.textContent=traducirAuth(e1.message); return; }
    const { error: e2 } = await sb.auth.mfa.verify({ factorId:enrolando, challengeId:ch.id, code:$('#mfaCodigo').value.replace(/\s+/g,'') });
    if(e2){ err.textContent=/invalid|incorrect|expired/i.test(e2.message) ? 'Código incorrecto. Revisa que la hora del celular esté en automático y vuelve a intentarlo.' : traducirAuth(e2.message); return; }
    enrolando=null; $('#mfaPaso').hidden=true; ok.textContent='✅ Verificación en dos pasos activada. Guarda bien tu app: sin ella no podrás entrar (el administrador puede ayudarte restableciendo tu cuenta).'; await estado();
  };
  $('#mfaDesactivar').onclick=async()=>{
    err.textContent=''; ok.textContent='';
    const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if(data && data.currentLevel!=='aal2'){ const c=prompt('Para desactivarla escribe el código actual de tu app:'); if(!c) return; try{ await verificarCodigo2FA(c); }catch(x){ err.textContent=x.message; return; } }
    if(!confirm('¿Desactivar la verificación en dos pasos? Tu cuenta quedará protegida solo por la contraseña.')) return;
    const { data: f } = await sb.auth.mfa.listFactors(); for(const x of (f.all||[])){ const { error } = await sb.auth.mfa.unenroll({ factorId:x.id }); if(error){ err.textContent=traducirAuth(error.message); return; } }
    ok.textContent='Verificación en dos pasos desactivada.'; await estado();
  };
})();
