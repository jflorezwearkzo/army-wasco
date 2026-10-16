  import { iniciarSesion, cargarYo, configurado, RAIZ } from './auth.js';
  const err=document.getElementById('err'), b=document.getElementById('b');
  const next=new URLSearchParams(location.search).get('next');
  const destino=()=> (next && next.startsWith(RAIZ)) ? next : RAIZ;
  if(!configurado) err.textContent='Falta configurar config.js con las claves de Supabase.';
  else { const yo=await cargarYo(); if(yo && yo.activo) location.replace(destino()); }
  document.getElementById('f').onsubmit=async e=>{
    e.preventDefault(); err.textContent=''; b.disabled=true; b.textContent='Ingresando…';
    try{ await iniciarSesion(document.getElementById('u').value, document.getElementById('p').value); location.replace(destino()); }
    catch(x){ err.textContent=x.message; b.disabled=false; b.textContent='Ingresar'; }
  };
