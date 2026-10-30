// Test de fumée : charge test/page.html, exécute chaque bookmarklet et vérifie le panneau.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const load = (n) => decodeURIComponent(fs.readFileSync(path.join(__dirname, '..', 'dist', n + '.js'), 'utf8').trim().replace(/^javascript:/, ''));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.goto('file://' + path.join(__dirname, 'page.html'));
  const panel = (id) => p.evaluate((id) => { const h = document.getElementById(id); return h && h.shadowRoot.querySelector('.panel').innerText; }, id);
  const hover = async (sel) => { await p.mouse.move(0, 0); await p.hover(sel); await p.waitForTimeout(50); };

  await p.evaluate(load('rgaa-1-images'));
  for (const s of ['#i1', '#i2', '#s1', '#bg1']) { await hover(s); console.log('IMG', s, '→', JSON.stringify(await panel('rgaa-1-images'))); }
  console.log('xss escaped:', !(await p.evaluate(() => !!document.getElementById('rgaa-1-images').shadowRoot.querySelector('b'))));
  await p.evaluate(load('rgaa-1-images'));
  console.log('toggle off:', await p.evaluate(() => !document.getElementById('rgaa-1-images')));

  await p.evaluate(load('rgaa-11-formulaires'));
  for (const s of ['#f1', 'label[for=f1]', '#h1', '#fs legend', '#b1']) { await hover(s); console.log('FORM', s, '→', JSON.stringify(await panel('rgaa-11-formulaires'))); }
  await p.focus('#f2'); console.log('FOCUS #f2 →', JSON.stringify(await panel('rgaa-11-formulaires')));
  await p.keyboard.press('Escape');
  console.log('esc off:', await p.evaluate(() => !document.getElementById('rgaa-11-formulaires')), 'outline restored:', await p.evaluate(() => document.getElementById('f1').style.outline + ' / ' + document.getElementById('f2').style.outline));

  await p.evaluate(load('rgaa-2-cadres'));
  console.log('CADRES →', JSON.stringify(await panel('rgaa-2-cadres')));
  console.log('focus on close:', await p.evaluate(() => document.getElementById('rgaa-2-cadres').shadowRoot.activeElement?.className));
  await p.evaluate(() => document.getElementById('rgaa-2-cadres').shadowRoot.querySelector('.item').click());
  console.log('locate outline:', await p.evaluate(() => document.querySelector('iframe').style.outline));
  await p.screenshot({ path: path.join(__dirname, 'cadres.png') });
  await p.keyboard.press('Escape');
  console.log('dialog esc off:', await p.evaluate(() => !document.getElementById('rgaa-2-cadres')));
  console.log('errors:', errors);
  await b.close();
})();
