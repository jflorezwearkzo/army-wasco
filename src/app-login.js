  import { iniciarSesion, cargarYo, configurado, RAIZ, TURNSTILE_SITE_KEY, faltaSegundoPaso, verificarCodigo2FA, sb } from './auth.js';
  const err=document.getElementById('err'), b=document.getElementById('b');
  const next=new URLSearchParams(location.search).get('next');
  { const m=new URLSearchParams(location.search).get('motivo'); if(m==='inactividad') err.textContent='Tu sesión se cerró por inactividad (más de 2 horas). Vuelve a ingresar.'; if(m==='todas') err.textContent='Cerraste la sesión en todos tus dispositivos.'; }
  const destino=()=> (next && next.startsWith(RAIZ)) ? next : RAIZ;
  if(!configurado) err.textContent='Falta configurar config.js con las claves de Supabase.';
  const f1=document.getElementById('f'), f2=document.getElementById('fMfa');
  function pedirCodigo(){ f1.hidden=true; f2.hidden=false; setTimeout(()=>document.getElementById('codigo').focus(),50); }
  f2.onsubmit=async e=>{ e.preventDefault(); const eb=document.getElementById('errMfa'), bm=document.getElementById('bMfa'); eb.textContent=''; bm.disabled=true; bm.textContent='Verificando…';
    try{ await verificarCodigo2FA(document.getElementById('codigo').value); location.replace(destino()); }catch(x){ eb.textContent=x.message; bm.disabled=false; bm.textContent='Verificar'; } };
  document.getElementById('mfaSalir').onclick=async e=>{ e.preventDefault(); await sb.auth.signOut(); f2.hidden=true; f1.hidden=false; };
  if(configurado){ const yo=await cargarYo(); if(yo && yo.activo){ if(await faltaSegundoPaso()) pedirCodigo(); else location.replace(destino()); } }
  // Cloudflare Turnstile (solo si hay clave de sitio configurada)
  let turnstileId=null;
  if(TURNSTILE_SITE_KEY){
    const s=document.createElement('script'); s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async=true;
    s.onload=()=>{ turnstileId=window.turnstile.render('#turnstile', { sitekey: TURNSTILE_SITE_KEY, theme:'dark', language:'es' }); };
    document.head.appendChild(s);
  }
  document.getElementById('f').onsubmit=async e=>{
    e.preventDefault(); err.textContent='';
    let token='';
    if(TURNSTILE_SITE_KEY){
      token = window.turnstile && turnstileId!==null ? window.turnstile.getResponse(turnstileId) : '';
      if(!token){ err.textContent='Completa la verificación de seguridad.'; return; }
    }
    b.disabled=true; b.textContent='Ingresando…';
    try{ await iniciarSesion(document.getElementById('u').value, document.getElementById('p').value, token); if(await faltaSegundoPaso()){ b.disabled=false; b.textContent='Ingresar'; pedirCodigo(); return; } location.replace(destino()); }
    catch(x){ err.textContent=x.message; b.disabled=false; b.textContent='Ingresar'; if(TURNSTILE_SITE_KEY && window.turnstile) window.turnstile.reset(turnstileId); }
  };
