// Ordre des listes : chaque bookmarklet affiche les éléments dans l'ordre du
// document, quel que soit leur statut, y compris dans un Shadow DOM ou une
// iframe de même origine (à la place de leur hôte).
// Chaque élément porte un repère <lettre><chiffre> : les chiffres doivent se suivre.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const load = (n) => decodeURIComponent(fs.readFileSync(path.join(__dirname, '..', 'dist', n + '.js'), 'utf8').trim().replace(/^javascript:/, ''));

const IMG = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22/%3E';
const frame = `<p style="color:#ddd">T4 très pâle</p><img src="${IMG}" alt="I4"><a href="/x4">L4</a>
<table><caption>D4</caption><tr><td>a</td><td>b</td></tr></table><div role="button" tabindex="0" aria-label="C4">x</div>
<input aria-label="F4">`;
const page = `<!doctype html><html lang="fr"><body style="background:#fff;color:#000">
<h1>H1 début</h1>
<p>T1 noir</p><img src="${IMG}" alt="I1"><a href="/x1">L1</a>
<table><caption>D1</caption><tr><th>a</th></tr><tr><td>b</td></tr></table>
<div role="button" tabindex="0" aria-label="C1">x</div><input aria-label="F1">
<ul><li>U1</li><li>U1b</li></ul>
<h2 style="display:none">H2 masqué</h2>
<p style="color:#bbb">T2 pâle</p><img src="${IMG}"><a href="/x2"><img src="${IMG}"></a>
<table><caption>D2</caption><tr><td>a</td><td>b</td></tr></table>
<div role="tab" tabindex="0">C2</div><input>
<ul style="display:none"><li>U2</li><li>U2b</li></ul>
<h3>H3 après un saut</h3>
<div id="host"></div>
<iframe title="I3 cadre" srcdoc='${frame}' style="width:400px;height:300px"></iframe>
<h2>H5 fin</h2>
<p>T5 noir</p><img src="${IMG}" alt="I5"><a href="/x5">L5</a>
<table><caption>D5</caption><tr><th>a</th></tr><tr><td>b</td></tr></table>
<div role="button" tabindex="0" aria-label="C5">x</div><input aria-label="F5">
<nav><a href="/n1">U5 lien</a> <a href="/n2">U5 autre</a></nav>
<ul><li>U6</li><li>U6b</li></ul>
<script>
document.getElementById('host').attachShadow({ mode: 'open' }).innerHTML =
  '<p style="color:#ccc">T3 pâle</p><img src="${IMG}" alt="I3"><a href="/x3">L3</a><div role="button" tabindex="0" aria-label="C3">x</div><input aria-label="F3"><h2>H4 shadow</h2><ul><li>U3</li><li>U3b</li></ul>';
</script>
</body></html>`;

const CASES = [
  ['rgaa-1-images', 'I'],
  ['rgaa-3-couleurs', 'T'],
  ['rgaa-5-tableaux', 'D'],
  ['rgaa-6-liens', 'L'],
  ['rgaa-7-composants', 'C'],
  ['rgaa-9-titres', 'H'],
  ['rgaa-9-listes', 'U'],
  ['rgaa-11-formulaires', 'F'],
];
const fail = [];
const check = (ok, msg) => { console.log(ok ? '✓' : '✗', msg); if (!ok) fail.push(msg); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const file = path.join(require('os').tmpdir(), 'rgaa-ordre.html');
  fs.writeFileSync(file, page);
  await p.goto('file://' + file);
  await p.waitForTimeout(200);
  for (const [id, letter] of CASES) {
    await p.evaluate(load(id));
    await p.waitForTimeout(150);
    const labels = await p.evaluate((id) => [...document.getElementById(`${id}-liste`).shadowRoot.querySelectorAll('.item')].map((i) => i.innerText.replace(/\s+/g, ' ')), id);
    const nums = labels.map((l) => (l.match(new RegExp(`\\b${letter}(\\d)\\b`)) || [])[1]).filter(Boolean).map(Number);
    const sorted = nums.every((n, i) => !i || n >= nums[i - 1]);
    check(sorted && nums.length >= 3, `${id} : ${nums.join(' ')}`);
    if (!sorted) labels.forEach((l) => console.log('   ', l.slice(0, 100)));
    await p.evaluate(load(id)); // 2e clic : arrêt
  }
  check(!errors.length, `pas d’erreur JavaScript ${errors.join(' | ')}`);
  await b.close();
  fs.unlinkSync(file);
  process.exit(fail.length ? 1 : 0);
})();
