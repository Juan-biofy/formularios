#!/usr/bin/env node
/*
  Monta el index.html publicable de Formularios · Culligan Biofy a partir de src/app.html:
    1. mete el logo horizontal (SVG) en base64 (Juan, 17/11);
    2. mete los formularios de la carpeta forms/ (un .json por formulario);
    3. mete la conexión con el repositorio privado de respuestas, con el token cifrado con las contraseñas.

  Uso (publicar):
      node build.mjs --secrets /Users/diseno/claves-formularios/formularios-secretos.json --out ../index.html
  Uso (probar en este ordenador; las respuestas se quedan en el navegador):
      node build.mjs --local --secrets ../datos-locales/prueba-secretos.json --out ../datos-locales/prueba.html

  formularios-secretos.json (FUERA del repositorio, no se comparte):
      {
        "owner": "Juan-biofy", "repo": "formularios-datos", "branch": "main", "dir": "respuestas",
        "token": "github_pat_… (Contents: lectura y escritura, SOLO del repo formularios-datos)",
        "pw_responder": "contraseña para responder (la que se da a los comerciales)",
        "usuarios": [ { "nombre": "Juan Giraldo", "pw": "contraseña personal para ver respuestas" } ]
      }
  La primera vez el script crea la pareja de claves para cifrar las respuestas y la guarda en ese mismo
  fichero («claves»). NO hay que borrarla nunca: sin ella las respuestas guardadas no se pueden leer.

  Qué abre cada contraseña:
      pw_responder -> token (solo sirve para guardar; las respuestas van cifradas y no se pueden leer)
      usuarios[].pw -> token + clave privada (panel: ver, descargar y borrar respuestas)

  El script nunca escribe tokens ni contraseñas en pantalla. Requiere Node 18 o superior. Sin dependencias.
*/
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encrypt, decrypt } from './encrypt.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = k => process.argv.includes('--' + k);
const src = arg('src', join(aqui, '../src/app.html'));
const out = arg('out', join(aqui, '../index.html'));
const formsDir = arg('forms', join(aqui, '../forms'));
const secretsPath = arg('secrets');
if (!secretsPath) { console.error('Falta --secrets'); process.exit(1); }

let html = readFileSync(src, 'utf8');
const MARK = 'const CLOUD=/*__CLOUD__*/null;', MARKF = 'const FORMS=/*__FORMS__*/[];';
if (!html.includes(MARK) || !html.includes(MARKF)) { console.error('Faltan las marcas __CLOUD__ / __FORMS__'); process.exit(1); }
// Dos versiones del logo: azul para el modo claro y blanco para el oscuro
html = html.split('__LOGO_W__').join(readFileSync(join(aqui, '../src/logo-horizontal-white.svg')).toString('base64'));
html = html.split('__LOGO__').join(readFileSync(join(aqui, '../src/logo-horizontal-blue.svg')).toString('base64'));

// Formularios: se comprueba que cada uno está bien escrito
const TIPOS = ['texto', 'parrafo', 'numero', 'email', 'telefono', 'fecha', 'opcion', 'lista', 'varias', 'escala', 'firma', 'info'];
const forms = readdirSync(formsDir).filter(f => f.endsWith('.json')).sort().map(f => {
  const F = JSON.parse(readFileSync(join(formsDir, f), 'utf8'));
  const ids = new Set();
  if (!F.id || !F.titulo || !Array.isArray(F.secciones)) throw new Error(f + ': faltan id, titulo o secciones');
  for (const s of F.secciones) for (const q of s.preguntas) {
    if (!TIPOS.includes(q.tipo)) throw new Error(`${f}: tipo desconocido «${q.tipo}»`);
    if (q.tipo === 'info') continue;
    if (!q.id || ids.has(q.id)) throw new Error(`${f}: id de pregunta vacío o repetido «${q.id}»`);
    ids.add(q.id);
    if (['opcion', 'lista', 'varias'].includes(q.tipo) && !(q.opciones || []).length) throw new Error(`${f}: «${q.id}» no tiene opciones`);
  }
  return F;
});
html = html.replace(MARKF, 'const FORMS=' + JSON.stringify(forms) + ';');

// Conexión y contraseñas
const S = JSON.parse(readFileSync(secretsPath, 'utf8'));
// Sistema único de contraseñas (17/11): las personas del panel salen del archivo de accesos común
const accesosPath = arg('accesos');
if (accesosPath) {
  const A = JSON.parse(readFileSync(accesosPath, 'utf8'));
  S.usuarios = A.usuarios.filter(u => u.webs && u.webs.formularios).map(u => ({ nombre: u.nombre, pw: u.pw }));
}
for (const k of ['pw_responder', 'usuarios']) if (!S[k]) { console.error('Falta «' + k + '» en los secretos'); process.exit(1); }
if (!flag('local')) for (const k of ['owner', 'repo', 'token']) if (!S[k] || String(S[k]).includes('…')) { console.error('Falta «' + k + '» en los secretos'); process.exit(1); }
const pws = [S.pw_responder, ...S.usuarios.map(u => u.pw)];
if (new Set(pws).size !== pws.length) { console.error('Todas las contraseñas tienen que ser distintas'); process.exit(1); }
if (pws.some(p => !p || p.length < 10)) console.warn('Aviso: usa contraseñas de 10 caracteres o más.');

const { subtle } = globalThis.crypto;
if (!S.claves) {
  const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  S.claves = { pub: await subtle.exportKey('jwk', kp.publicKey), priv: await subtle.exportKey('jwk', kp.privateKey) };
  { const orig = JSON.parse(readFileSync(secretsPath, 'utf8')); orig.claves = S.claves; writeFileSync(secretsPath, JSON.stringify(orig, null, 2)); }
  console.log('Claves de cifrado creadas y guardadas en el fichero de secretos (no las borres).');
}
const token = flag('local') ? 'local' : S.token;
const cloud = {
  local: flag('local') || undefined,
  owner: S.owner, repo: S.repo, branch: S.branch || 'main', dir: S.dir || 'respuestas',
  pub: { kty: S.claves.pub.kty, crv: S.claves.pub.crv, x: S.claves.pub.x, y: S.claves.pub.y },
  resp: await encrypt(S.pw_responder, token),
  users: [],
};
for (const u of S.usuarios) cloud.users.push({ n: u.nombre, b: await encrypt(u.pw, JSON.stringify({ t: token, k: S.claves.priv })) });
// Comprobaciones
if ((await decrypt(cloud.resp, S.pw_responder)) !== token) throw new Error('Fallo al cifrar la contraseña de responder');
for (const [i, u] of S.usuarios.entries()) {
  const o = JSON.parse(await decrypt(cloud.users[i].b, u.pw));
  if (o.t !== token || o.k.d !== S.claves.priv.d) throw new Error('Fallo al cifrar la contraseña de ' + u.nombre);
  if (await decrypt(cloud.users[i].b, S.pw_responder)) throw new Error('La contraseña de responder abre el panel');
}
html = html.replace(MARK, 'const CLOUD=' + JSON.stringify(cloud) + ';');
if (html.includes(S.claves.priv.d) || (!flag('local') && html.includes(S.token))) throw new Error('Un secreto ha quedado a la vista: no se escribe nada');
writeFileSync(out, html);
console.log(`Hecho: ${out} · ${forms.length} formulario(s) · ${S.usuarios.length} persona(s) en el panel · ${cloud.local ? 'modo local de pruebas' : 'modo nube: ' + cloud.owner + '/' + cloud.repo}`);
