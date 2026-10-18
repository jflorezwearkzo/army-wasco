// Aplica el tema (claro/oscuro) antes de pintar la página. Se guarda por dispositivo en localStorage.
(function(){
  var t = null; try { t = localStorage.getItem('pm_tema'); } catch (e) {}
  if (t !== 'light' && t !== 'dark') t = 'dark';
  document.documentElement.setAttribute('data-theme', t);
  var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', t === 'light' ? '#e9e3d2' : '#0b1216');
  window.pmTema = { actual: function(){ return document.documentElement.getAttribute('data-theme') || 'dark'; },
    fijar: function(n){ document.documentElement.setAttribute('data-theme', n); try { localStorage.setItem('pm_tema', n); } catch (e) {} if (m) m.setAttribute('content', n === 'light' ? '#e9e3d2' : '#0b1216'); document.dispatchEvent(new CustomEvent('pm-tema', { detail: n })); },
    alternar: function(){ this.fijar(this.actual() === 'light' ? 'dark' : 'light'); } };
})();
