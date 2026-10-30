// Test des pages de démo : ouvre chaque page de dist/demo/, lance le bookmarklet
// avec le bouton « Lancer » de la page, puis affiche pour chaque cas le résultat
// attendu et le contenu du panneau au survol. Échoue en cas d'erreur JavaScript.
const { chromium } = require('playwright');
const path = require('path');
const DEMO = path.join(__dirname, '..', 'dist', 'demo');
const PAGES = [
  ['rgaa-1-images', 'svg, img, canvas, input[type=image], [role=img], object, embed, .css-motif, .css-icone, #hote-shadow'],
  ['rgaa-3-couleurs', 'p, a, input, button, [role=checkbox], svg'],
  ['rgaa-4-multimedia', 'video, audio, iframe, lite-youtube, a'],
  ['rgaa-5-tableaux', 'caption, th, td, [role=cell], [role=gridcell], [role=columnheader]'],
  ['rgaa-11-formulaires', 'input, select, textarea, button, [contenteditable], [role=checkbox], legend'],
];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const panel = (id) => p.evaluate((id) => { const h = document.getElementById(id); const el = h && h.shadowRoot.querySelector('.panel'); return el && !el.hidden ? el.innerText.replace(/\n+/g, ' | ') : '(masqué)'; }, id);
  for (const [name, sel] of PAGES) {
    await p.goto('file://' + path.join(DEMO, name + '.html'));
    await p.click('.launch');
    await p.waitForTimeout(200);
    console.log(`\n===== ${name}\nLISTE → ${await panel(name + '-liste')}`);
    const cases = await p.$$('.case');
    for (const c of cases) {
      const h3 = (await c.$eval('h3', (e) => e.innerText)).replace(/\n/g, ' ');
      const att = await c.$eval('.attendu', (e) => e.innerText);
      console.log(`\n# ${h3}\n  ${att}`);
      for (const t of await c.$$(`.demo :is(${sel})`)) {
        await t.evaluate((e) => e.scrollIntoView({ block: 'center' }));
        const box = await t.boundingBox();
        if (!box) continue;
        // Carte cliquable : survole aussi les deux zones (area).
        const points = (await t.getAttribute('usemap')) ? [[60, 45], [60, 95]] : [];
        points.unshift([Math.min(box.width / 2, 20), box.height / 2]);
        for (const [x, y] of points) {
        await p.mouse.move(0, 0);
        await p.mouse.move(box.x + x, box.y + y);
        await p.waitForTimeout(60);
        console.log('  → ' + (await panel(name)));
        }
      }
    }
  }
  await p.goto('file://' + path.join(DEMO, 'rgaa-2-cadres.html'));
  await p.waitForTimeout(500);
  await p.click('.launch');
  await p.waitForTimeout(200);
  console.log('\n===== rgaa-2-cadres\n' + (await panel('rgaa-2-cadres')).split(' | ').join('\n'));
  console.log('\nerrors:', errors);
  await b.close();
  if (errors.length) process.exit(1);
})();
