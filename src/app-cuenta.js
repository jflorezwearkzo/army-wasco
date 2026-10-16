  import { requerir, barraUsuario, sb, esc, nombreCompleto } from './auth.js';
  const yo=await requerir(); barraUsuario(yo);
  const NP={usuarios:'Gestión de usuarios',asignar_roles:'Asignación de roles',reset_password:'Restablecer contraseñas',crear_roles:'Creación de roles',crear_reportes:'Creación de reportes',gestion_reportes:'Gestión de reportes',historial:'Historial'};
  const perms=Object.entries(yo.rol.permisos||{}).filter(([k,v])=>v).map(([k])=>NP[k]||k).join(', ')||'ninguno';
  const forms=yo.rol.formularios.includes('*')?'todos':(yo.rol.formularios.join(', ')||'ninguno');
  document.getElementById('info').innerHTML=`<p><b>Usuario:</b> ${esc(yo.usuario)}</p><p><b>Nombre:</b> ${esc(nombreCompleto(yo))}</p><p><b>Rango:</b> ${esc(yo.rango||'Sin asignar (lo asigna un administrador)')}</p>
    <p><b>Rol:</b> ${esc(yo.rol.nombre)}</p><p class="muted">Permisos: ${esc(perms)} · Formularios: ${esc(forms)}</p>`;
  document.getElementById('f').onsubmit=async e=>{
    e.preventDefault(); const err=document.getElementById('err'), ok=document.getElementById('ok'); err.textContent=''; ok.textContent='';
    const a=p1.value, b=p2.value; if(a!==b){ err.textContent='Las contraseñas no coinciden.'; return; }
    const { error }=await sb.auth.updateUser({ password:a });
    if(error) err.textContent=error.message; else { ok.textContent='Contraseña actualizada.'; e.target.reset(); }
  };
