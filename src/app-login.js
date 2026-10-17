  import { iniciarSesion, cargarYo, configurado, RAIZ, TURNSTILE_SITE_KEY } from './auth.js';
  const err=document.getElementById('err'), b=document.getElementById('b');
  const next=new URLSearchParams(location.search).get('next');
  { const m=new URLSearchParams(location.search).get('motivo'); if(m==='inactividad') err.textContent='Tu sesión se cerró por inactividad (más de 2 horas). Vuelve a ingresar.'; if(m==='todas') err.textContent='Cerraste la sesión en todos tus dispositivos.'; }
  const destino=()=> (next && next.startsWith(RAIZ)) ? next : RAIZ;
  if(!configurado) err.textContent='Falta configurar config.js con las claves de Supabase.';
  else { const yo=await cargarYo(); if(yo && yo.activo) location.replace(destino()); }
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
    try{ await iniciarSesion(document.getElementById('u').value, document.getElementById('p').value, token); location.replace(destino()); }
    catch(x){ err.textContent=x.message; b.disabled=false; b.textContent='Ingresar'; if(TURNSTILE_SITE_KEY && window.turnstile) window.turnstile.reset(turnstileId); }
  };
