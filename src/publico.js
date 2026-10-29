// Los dos formularios públicos (solicitar acceso y recuperar contraseña). A propósito NO importa
// nada de la app: ni auth.js, ni config.js, ni la librería de Supabase. Lo único que hace es mandar
// tres campos de texto a una función de borde aislada. No lee ni guarda nada.
// La página dice cuál es con <body data-tipo="acceso|password">.
(function () {
  'use strict';
  var FUNCION = 'https://rvwvnrqwlaudjgzvrzgf.supabase.co/functions/v1/solicitud-acceso';
  var SITE_KEY = '0x4AAAAAAFrNEt5xSSbtHKaV';   // widget propio de este formulario (no el del login)
  var UNIDADES = { pm: 'Army de Wasco · Policía Militar', eea: 'Army de Wasco · Escuadrón Tormenta' };
  var TIPO = document.body.getAttribute('data-tipo') === 'password' ? 'password' : 'acceso';
  var ACCION = TIPO === 'password' ? 'recuperar-password' : 'solicitud-acceso';
  var LISTO = TIPO === 'password'
    ? '✅ Aviso enviado. El liderazgo confirmará que eres tú y te dará una contraseña nueva por Discord.'
    : '✅ Solicitud enviada. El liderazgo la revisará y te contactará por Discord.';

  var u = (new URLSearchParams(location.search).get('u') || 'pm').toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(UNIDADES, u)) u = 'pm';
  document.getElementById('unidad').textContent = UNIDADES[u];
  document.title = (TIPO === 'password' ? 'Olvidé mi contraseña · ' : 'Solicitar acceso · ') + UNIDADES[u];

  var f = document.getElementById('f'), b = document.getElementById('b'), msg = document.getElementById('msg');
  var widget = null;

  var s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  s.async = true; s.defer = true;
  s.onload = function () {
    widget = window.turnstile.render('#cf', { sitekey: SITE_KEY, action: ACCION, theme: 'dark', language: 'es' });
  };
  document.head.appendChild(s);

  function aviso(texto, clase) { msg.className = 'msg ' + (clase || ''); msg.textContent = texto; }

  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var nombre = f.nombre.value.trim(), rango = f.rango.value.trim(), unidad = f.unidad.value.trim();
    if (nombre.length < 3 || rango.length < 2 || unidad.length < 2) {
      aviso('Completa los tres campos.', 'err'); return;
    }
    var token = (window.turnstile && widget !== null) ? window.turnstile.getResponse(widget) : '';
    if (!token) { aviso('Marca la casilla de "no soy un robot".', 'err'); return; }

    b.disabled = true; b.textContent = 'Enviando…'; aviso('');
    fetch(FUNCION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org: u, tipo: TIPO, nombre: nombre, rango: rango, unidad: unidad, token: token })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; });
    }).then(function (res) {
      if (res.ok && res.j.ok) {
        f.style.display = 'none';
        aviso(LISTO, 'ok');
        return;
      }
      aviso(res.j.error || 'No se pudo enviar la solicitud. Inténtalo más tarde.', 'err');
      b.disabled = false; b.textContent = 'Enviar solicitud';
      if (window.turnstile && widget !== null) window.turnstile.reset(widget);
    }).catch(function () {
      aviso('No se pudo enviar la solicitud. Revisa tu conexión e inténtalo de nuevo.', 'err');
      b.disabled = false; b.textContent = 'Enviar solicitud';
      if (window.turnstile && widget !== null) window.turnstile.reset(widget);
    });
  });
})();
