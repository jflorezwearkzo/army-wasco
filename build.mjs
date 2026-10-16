// Construye js/ (ofuscado) a partir de src/ (legible).  Uso: npm install && npm run build
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
