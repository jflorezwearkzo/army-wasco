// Construye js/ (ofuscado) a partir de src/ (legible).  Uso: npm install && npm run build
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import JavaScriptObfuscator from 'javascript-obfuscator';
mkdirSync('js', { recursive: true });
for (const f of readdirSync('src').filter(f => f.endsWith('.js'))) {
  const code = readFileSync(`src/${f}`, 'utf8');
  if (f === 'config.js') { writeFileSync(`js/${f}`, code); continue; }   // config queda legible
  const out = JavaScriptObfuscator.obfuscate(code, {
    compact: true, controlFlowFlattening: true, controlFlowFlatteningThreshold: 0.5,
    deadCodeInjection: true, deadCodeInjectionThreshold: 0.2,
    stringArray: true, stringArrayEncoding: ['rc4'], stringArrayThreshold: 0.8, rotateStringArray: true, shuffleStringArray: true,
    splitStrings: true, splitStringsChunkLength: 8, identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false, selfDefending: false, simplify: true, transformObjectKeys: false, unicodeEscapeSequence: false,
    target: 'browser', sourceMap: false,
  }).getObfuscatedCode();
  writeFileSync(`js/${f}`, out);
  console.log('ok', f, out.length);
}
// Rompe-caché: las páginas referencian js/<archivo>.js?v=<hash> para que un cambio se vea de inmediato
const ver = {};
for (const f of readdirSync('js')) ver[f] = createHash('sha1').update(readFileSync(`js/${f}`)).digest('hex').slice(0, 8);
const pages = ['index.html', 'login.html', 'cuenta.html', 'expediente.html', 'ranking.html', 'calendario.html', 'ruta.html', 'acceso.html', 'recuperar.html', 'manuales.html', 'reglamento.html', 'sin-conexion.html', 'admin/index.html', 'admin/usuario.html', 'admin/rol.html', 'admin/formulario.html', 'reportes/bajas/index.html', 'reportes/reclutamiento/index.html', 'reportes/patrullaje/index.html', 'reportes/toma-territorio/index.html', 'reportes/plantilla/index.html', 'admin/disenador.html', 'privacidad.html'];
for (const p of pages) {
  let html = readFileSync(p, 'utf8');
  html = html.replace(/(src="(?:\.\.\/)*js\/)([a-z0-9-]+\.js)(\?v=[0-9a-f]+)?"/g, (m, pre, file) => `${pre}${file}?v=${ver[file]}"`);
  writeFileSync(p, html);
}
// Los imports internos (./auth.js, ./config.js) también llevan versión
for (const f of readdirSync('js')) {
  if (f === 'config.js') continue;
  let code = readFileSync(`js/${f}`, 'utf8');
  code = code.replace(/\.\/(auth|config|plantilla|resumen-export|embed-export|respaldo|ruta-pasos)\.js(\?v=[0-9a-f]+)?/g, (m, name) => `./${name}.js?v=${ver[name + '.js']}`);
  writeFileSync(`js/${f}`, code);
}
console.log('versiones', ver);

// Service worker: su versión cambia con cualquier cambio de los scripts, para que la caché se renueve
{ const all = Object.values(ver).join('');
  const swv = createHash('sha1').update(all + readFileSync('estilos.css')).digest('hex').slice(0, 10);
  let sw = readFileSync('sw.js', 'utf8').replace(/const VERSION = 'pm-[^']*';/, `const VERSION = 'pm-${swv}';`);
  writeFileSync('sw.js', sw); console.log('sw', swv); }
