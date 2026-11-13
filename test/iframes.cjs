// Test RGAA 3 et iframes : sert une page sur deux origines (localhost et
// 127.0.0.1). L'iframe de même origine défile jusqu'au texte caché pour le
// mesurer ; l'iframe d'une autre origine est signalée avec un lien.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const code = decodeURIComponent(fs.readFileSync(path.join(__dirname, '..', 'dist', 'rgaa-3-couleurs.js'), 'utf8').trim().replace(/^javascript:/, ''));

// Texte gris clair posé sur un bloc noir qui n'est pas son parent : seule la
// pile réelle (élément visible à l'écran) donne le bon fond.
const inner = `<!doctype html><body style="margin:0;background:#fff">
<p style="color:#000">Haut de l'iframe</p><div style="height:1500px"></div>
<div style="position:relative;height:60px"><div style="position:absolute;inset:0;background:#000"></div>
<p style="position:relative;margin:0;color:#ccc">Bas de l'iframe</p></div></body>`;
const pages = {
  '/': (port) => `<!doctype html><html lang="fr"><body>
<h1>Iframes</h1>
<iframe title="Même origine" src="/inner" style="width:500px;height:200px"></iframe>
<iframe title="Autre origine" src="http://127.0.0.1:${port}/inner" style="width:500px;height:200px"></iframe>
<iframe title="Masquée" src="http://127.0.0.1:${port}/inner" style="display:none"></iframe>
</body></html>`,
  '/inner': () => inner,
};
const fail = [];
const check = (ok, msg) => { console.log(ok ? '✓' : '✗', msg); if (!ok) fail.push(msg); };

(async () => {
  const server = http.createServer((req, res) => {
    const page = pages[req.url];
    res.writeHead(page ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page ? page(server.address().port) : '');
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://localhost:${port}/`);
  await p.waitForLoadState('load');
  await p.evaluate(code);
  await p.waitForTimeout(200);
  const list = await p.evaluate(() => document.getElementById('rgaa-3-couleurs-liste').shadowRoot.querySelector('.panel').innerText.replace(/\n+/g, ' | '));
  console.log('LISTE →', list);
  check(/1 iframe non analysée/.test(list), 'compteur : 1 iframe non analysée (la masquée est ignorée)');
  check(/Iframe non analysée : « Autre origine »/.test(list), 'ligne de liste pour l’iframe d’une autre origine');
  check(!/« Même origine »/.test(list), 'iframe de même origine non signalée');
  const href = await p.evaluate(() => [...document.getElementById('rgaa-3-couleurs-liste').shadowRoot.querySelectorAll('.list-summary a')].map((a) => a.href + '|' + a.target));
  check(href.length === 1 && href[0] === `http://127.0.0.1:${port}/inner|_blank`, `lien d’ouverture : ${href}`);
  // #ccc sur noir = 13,09:1 (mesuré) ; sur blanc = 1,6:1 (déduit des parents).
  check(/« Bas de l'iframe » 13,0\d/.test(list), 'texte hors écran dans l’iframe mesuré après défilement de l’iframe');
  const scroll = await p.evaluate(() => [scrollY, document.querySelector('iframe').contentWindow.scrollY]);
  check(scroll[0] === 0 && scroll[1] === 0, `positions de défilement rétablies : ${scroll}`);
  // Clic sur la ligne : l'iframe reçoit le focus et le détail l'explique.
  await p.evaluate(() => [...document.getElementById('rgaa-3-couleurs-liste').shadowRoot.querySelectorAll('.item')].find((i) => /Iframe non analysée/.test(i.innerText)).click());
  await p.waitForTimeout(100);
  const detail = await p.evaluate(() => { const el = document.getElementById('rgaa-3-couleurs').shadowRoot.querySelector('.panel'); return el.hidden ? '(masqué)' : el.innerText.replace(/\n+/g, ' | '); });
  console.log('DÉTAIL →', detail);
  check(/autre origine/.test(detail), 'détail de l’iframe au focus');
  check(!errors.length, `pas d’erreur JavaScript ${errors}`);
  await b.close();
  server.close();
  if (fail.length) process.exit(1);
})();
