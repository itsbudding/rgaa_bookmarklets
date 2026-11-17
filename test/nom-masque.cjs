// Nom accessible : le contenu masqué aux technologies d'assistance est
// ignoré (aria-hidden, display:none, hidden, visibility:hidden, images en
// role="presentation"), sauf cible masquée référencée directement
// (aria-labelledby, label), dont tout le contenu compte (accname 1.2).
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const path = require('path');

const lib = esbuild.buildSync({
  stdin: { contents: "import * as n from './src/lib/name.js'; window.N = n;", resolveDir: path.join(__dirname, '..') },
  bundle: true,
  format: 'iife',
  write: false,
}).outputFiles[0].text;

const page = `<!doctype html><html lang="fr"><body>
<a href="#" id="a1">Lire <span aria-hidden="true">★</span>la suite</a>
<a href="#" id="a2">Contact<span style="display:none"> caché</span></a>
<a href="#" id="a3">Panier<span hidden> (3 articles)</span></a>
<a href="#" id="a4"><span style="visibility:hidden">invisible <b style="visibility:visible">Visible</b></span></a>
<a href="#" id="a5"><img role="presentation" alt="Logo" src="data:,"> Accueil</a>
<a href="#" id="a6"><span role="presentation">Texte</span> du lien</a>
<a href="#" id="a7"><img role="presentation" alt="Logo" aria-label="Logo maison" src="data:,"></a>
<a href="#" id="a8" aria-labelledby="t8">x</a><div id="t8" hidden>Nom <span aria-hidden="true">complet</span></div>
<a href="#" id="a9" aria-labelledby="t9">x</a><p id="t9">Nom <span aria-hidden="true">★</span></p>
<label for="f10" style="display:none">Nom caché</label><input id="f10">
<a href="#" id="a11" aria-labelledby="t11">x</a><span id="t11" style="visibility:hidden">Cible</span>
<button id="b12"><svg aria-hidden="true"><title>icône</title></svg>Envoyer</button>
<a href="#" id="a13"><span aria-hidden="true">★</span></a>
<table><caption id="c14">Ventes <span aria-hidden="true">(€)</span></caption></table>
<script>${lib}</script>
</body></html>`;

const CASES = [
  ['a1', 'Lire la suite'],
  ['a2', 'Contact'],
  ['a3', 'Panier'],
  ['a4', 'Visible'],
  ['a5', 'Accueil'],
  ['a6', 'Texte du lien'],
  ['a7', 'Logo maison'],
  ['a8', 'Nom complet'],
  ['a9', 'Nom'],
  ['f10', 'Nom caché'],
  ['a11', 'Cible'],
  ['b12', 'Envoyer'],
  ['a13', ''],
];
const fail = [];
const check = (ok, msg) => { console.log(ok ? '✓' : '✗', msg); if (!ok) fail.push(msg); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.setContent(page);
  for (const [id, want] of CASES) {
    const got = await p.evaluate((id) => window.N.nameOf(document.getElementById(id)).name, id);
    check(got === want, `${id} : « ${got} »${got === want ? '' : ` (attendu « ${want} »)`}`);
  }
  const cap = await p.evaluate(() => window.N.accText(document.getElementById('c14')));
  check(cap === 'Ventes', `accText caption : « ${cap} »`);
  const ig = await p.evaluate(() => window.N.ignoredList(window.N.nameOf(document.getElementById('a1')).acc.ignored));
  check(ig.length === 1 && ig[0] === '« ★ » (aria-hidden)', `contenu ignoré a1 : ${ig.join(', ')}`);
  const ig5 = await p.evaluate(() => window.N.ignoredList(window.N.nameOf(document.getElementById('a5')).acc.ignored));
  check(ig5[0] === '« Logo » (role="presentation")', `contenu ignoré a5 : ${ig5.join(', ')}`);
  const ig13 = await p.evaluate(() => window.N.ignoredList(window.N.nameOf(document.getElementById('a13')).acc.ignored));
  check(ig13.length === 1, `nom vide : contenu ignoré affiché (${ig13.join(', ')})`);
  check(!errors.length, `pas d’erreur JavaScript ${errors.join(' ')}`);
  await b.close();
  if (fail.length) {
    console.error(`\n${fail.length} échec(s)`);
    process.exit(1);
  }
})();
