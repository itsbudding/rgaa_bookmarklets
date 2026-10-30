// Test de fumée : charge test/page.html, exécute chaque bookmarklet et affiche le contenu du panneau.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const load = (n) => decodeURIComponent(fs.readFileSync(path.join(__dirname, '..', 'dist', n + '.js'), 'utf8').trim().replace(/^javascript:/, ''));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 1200 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.goto('file://' + path.join(__dirname, 'page.html'));
  await p.waitForTimeout(200);
  const panel = (id) => p.evaluate((id) => { const h = document.getElementById(id); return h && h.shadowRoot.querySelector('.panel').innerText.replace(/\n+/g, ' | '); }, id);
  const hover = async (sel) => { await p.mouse.move(0, 0); await p.hover(sel, { force: true }); await p.waitForTimeout(50); };

  await p.evaluate(load('rgaa-1-images'));
  for (const s of ['#i1', '#i2', '#i3', '#i4', '#i5', '#s1', '#s2', '#c1', '#i6', '#bg1', '#host']) { await hover(s); console.log('IMG', s, '→', await panel('rgaa-1-images')); }
  await hover('#g1'); console.log('IMG gradient hidden:', await p.evaluate(() => document.getElementById('rgaa-1-images').shadowRoot.querySelector('.panel').hidden));
  console.log('xss escaped:', !(await p.evaluate(() => !!document.getElementById('rgaa-1-images').shadowRoot.querySelector('.panel b:not(strong)'))));
  await p.keyboard.press('Shift+I'); console.log('dim on:', await p.evaluate(() => !!document.getElementById('rgaa-1-images-dim')));
  await p.evaluate(load('rgaa-1-images'));
  console.log('toggle off:', await p.evaluate(() => !document.getElementById('rgaa-1-images') && !document.getElementById('rgaa-1-images-dim')));

  await p.evaluate(load('rgaa-11-formulaires'));
  for (const s of ['#f1', 'label[for=f1]', '#h1', '#fs legend', '#r1', '#cb1', '#f3', '#sel', '#ac1', '#ac2', '#ac3', '#b1']) { await hover(s); console.log('FORM', s, '→', await panel('rgaa-11-formulaires')); }
  await p.focus('#f2'); console.log('FOCUS #f2 →', await panel('rgaa-11-formulaires'));
  await p.keyboard.press('Escape');
  console.log('esc off:', await p.evaluate(() => !document.getElementById('rgaa-11-formulaires')), 'outline restored:', JSON.stringify(await p.evaluate(() => document.getElementById('f1').style.outline + '/' + document.getElementById('f2').style.outline)));

  await p.evaluate(load('rgaa-2-cadres'));
  console.log('CADRES →', await panel('rgaa-2-cadres'));
  await p.evaluate(() => document.getElementById('rgaa-2-cadres').shadowRoot.querySelector('.item').click());
  console.log('locate outline:', await p.evaluate(() => document.querySelector('iframe').style.outline));
  await p.screenshot({ path: process.env.SHOT || path.join(__dirname, 'cadres.png') });
  await p.keyboard.press('Escape');
  console.log('dialog esc off:', await p.evaluate(() => !document.getElementById('rgaa-2-cadres')));
  console.log('errors:', errors.filter((e) => !/Failed to load resource/.test(e)));
  await b.close();
})();
