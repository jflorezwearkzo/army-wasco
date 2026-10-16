  import { requerir, barraUsuario, sb, esc, nombreCompleto, validarPassword, traducirAuth, REGLA_PASSWORD } from './auth.js';
  const yo=await requerir(); barraUsuario(yo);
  const NP={usuarios:'Gestión de usuarios',asignar_roles:'Asignación de roles',reset_password:'Restablecer contraseñas',crear_roles:'Creación de roles',crear_reportes:'Creación de reportes',gestion_reportes:'Gestión de reportes',historial:'Ver historial',eliminar_historial:'Eliminar historial',auditoria:'Ver auditoría'};
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
