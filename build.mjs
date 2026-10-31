// Construit chaque bookmarklet de src/bookmarklets/ en un fichier autonome
// dist/<nom>.js (URL javascript: prête à coller dans un favori) et une page
// dist/index.html où l'on peut glisser les liens dans la barre de favoris.
// Copie aussi les pages de démo (demo/ → dist/demo/), où {{BOOKMARKLET}} est
// remplacé par l'URL du bookmarklet de même nom.
import { build } from 'esbuild';
import { readdirSync, readFileSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';

const SRC = 'src/bookmarklets';
const OUT = 'dist';
mkdirSync(OUT, { recursive: true });

const files = readdirSync(SRC).filter((f) => f.endsWith('.js')).sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
const links = [];
// Nom affiché du lien : « rgaa-11-formulaires » → « RGAA 11 – Formulaires ».
const LABELS = { 'rgaa-7-composants': 'RGAA 7 – Composants ARIA' };
const label = (name) => LABELS[name] || name.replace(/^rgaa-(\d+)-(.*)$/, (_, n, t) => `RGAA ${n} – ${t[0].toUpperCase()}${t.slice(1)}`);

for (const file of files) {
  const res = await build({
    entryPoints: [`${SRC}/${file}`],
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'es2020',
    charset: 'utf8',
    legalComments: 'none',
    write: false,
  });
  const code = res.outputFiles[0].text.trim();
  // Encodage minimal : seuls les caractères qui gênent dans une URL de favori.
  const url = `javascript:${code.replace(/[%"<>`#\n\r\t]/g, (c) => encodeURIComponent(c))}`;
  writeFileSync(`${OUT}/${file}`, url + '\n');
  const name = file.replace(/\.js$/, '');
  links.push({ name, url });
  console.log(`${name}: ${url.length} caractères`);
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
writeFileSync(
  `${OUT}/index.html`,
  `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bookmarklets RGAA</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;color:#1a1a1a}
ul:not(.demos) a{display:inline-block;padding:.4rem .8rem;margin:.25rem 0;border:2px solid #005a9c;border-radius:4px;color:#005a9c;font-weight:700;text-decoration:none}</style>
</head>
<body>
<h1>Bookmarklets RGAA</h1>
<p>Glissez chaque lien dans votre barre de favoris. Cliquez une seconde fois sur un bookmarklet (ou appuyez sur Échap) pour le désactiver.</p>
<ul>
${links.map((l) => `<li><a href="${esc(l.url)}">${esc(label(l.name))}</a></li>`).join('\n')}
</ul>
<h2>Pages de démo</h2>
<p>Pour essayer chaque bookmarklet sur des cas conformes et non conformes :</p>
<ul class="demos">
${links.map((l) => `<li><a href="demo/${l.name}.html">Démo ${esc(label(l.name))}</a></li>`).join('\n')}
</ul>
</body>
</html>
`,
);

// Pages de démo.
const DEMO = 'demo';
cpSync(DEMO, `${OUT}/demo`, { recursive: true, filter: (f) => !f.endsWith('.html') });
for (const file of readdirSync(DEMO).filter((f) => f.endsWith('.html'))) {
  const link = links.find((l) => `${l.name}.html` === file);
  const html = readFileSync(`${DEMO}/${file}`, 'utf8').replaceAll('{{BOOKMARKLET}}', () => (link ? esc(link.url) : '#'));
  writeFileSync(`${OUT}/demo/${file}`, html);
}
console.log(`demo: ${readdirSync(DEMO).filter((f) => f.endsWith('.html')).length} pages`);
