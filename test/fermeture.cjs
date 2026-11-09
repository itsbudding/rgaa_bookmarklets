// Test du bouton « Réduire » et de la fermeture du panneau liste, sur chaque
// page de démo : fermer le panneau doit laisser la page exactement dans l'état
// obtenu par un 2e clic sur le bookmarklet (contours, styles, écouteurs…).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIST = path.join(__dirname, '..', 'dist');
const NAMES = fs.readdirSync(DIST).filter((f) => /^rgaa-.*\.js$/.test(f)).map((f) => f.replace(/\.js$/, ''));
const load = (n) => decodeURIComponent(fs.readFileSync(path.join(DIST, n + '.js'), 'utf8').trim().replace(/^javascript:/, ''));

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  const fails = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const check = (ok, msg) => { if (!ok) fails.push(msg); console.log(`${ok ? 'ok ' : 'KO '} ${msg}`); };
  const snapshot = () => p.evaluate(() => ({
    html: document.documentElement.outerHTML,
    registry: Object.keys(window.__rgaaBookmarklets || {}),
  }));
  // Quelques interactions pour laisser des traces (contours, épinglage…).
  const use = async (name) => {
    await p.waitForTimeout(200);
    await p.evaluate((id) => {
      const it = document.getElementById(`${id}-liste`).shadowRoot.querySelector('.item');
      if (it) it.click();
    }, name);
    await p.waitForTimeout(100);
    await p.mouse.move(300, 300);
    await p.mouse.move(500, 400);
    await p.waitForTimeout(100);
  };

  for (const name of NAMES) {
    const page = 'file://' + path.join(DIST, 'demo', name + '.html');
    console.log(`\n===== ${name}`);

    // Référence : lancer puis 2e clic sur le bookmarklet.
    await p.goto(page);
    await p.evaluate(load(name));
    await use(name);
    await p.evaluate(load(name));
    await p.waitForTimeout(100);
    const ref = await snapshot();

    // Réduire / déplier, puis fermer par le bouton ✕.
    await p.goto(page);
    await p.evaluate(load(name));
    await use(name);
    const root = (sel) => p.evaluateHandle(([id, sel]) => document.getElementById(`${id}-liste`).shadowRoot.querySelector(sel), [name, sel]);
    const state = () => p.evaluate((id) => {
      const r = document.getElementById(`${id}-liste`).shadowRoot;
      const btn = r.querySelector('.collapse');
      const name = btn.getAttribute('aria-labelledby') && r.getElementById(btn.getAttribute('aria-labelledby')).textContent;
      return { expanded: btn.getAttribute('aria-expanded'), bodyHidden: r.querySelector('.body').hidden, controls: !!r.getElementById(btn.getAttribute('aria-controls')), name, h: r.querySelector('.panel').offsetHeight };
    }, name);
    const before = await state();
    await (await root('.collapse')).click();
    const reduced = await state();
    check(before.expanded === 'true' && !before.bodyHidden && before.controls && !!before.name, `déplié au lancement, nom « ${before.name} »`);
    check(reduced.expanded === 'false' && reduced.bodyHidden && reduced.h < before.h, `réduit (${before.h}px → ${reduced.h}px)`);
    await p.evaluate((id) => document.getElementById(`${id}-liste`).shadowRoot.querySelector('.collapse').focus(), name);
    await p.keyboard.press('Enter');
    const back = await state();
    check(back.expanded === 'true' && !back.bodyHidden, 'déplié au clavier (Entrée)');
    await (await root('.close')).click();
    await p.waitForTimeout(100);
    const closed = await snapshot();
    check(closed.registry.length === 0, 'bookmarklet désactivé (registre vide)');
    if (closed.html !== ref.html) { let i = 0; while (closed.html[i] === ref.html[i]) i++; console.log('REF:', ref.html.slice(i - 150, i + 150)); console.log('CLOSE:', closed.html.slice(i - 150, i + 150)); }
    check(closed.html === ref.html, 'page identique à un 2e clic sur le bookmarklet');
    // Les écouteurs sont retirés : le survol n'affiche plus rien.
    await p.mouse.move(400, 300);
    await p.mouse.move(600, 500);
    check(!(await p.$('[data-rgaa-bookmarklet]')), 'plus aucun panneau après survol');
    // Relancer après fermeture fonctionne (pas d'état résiduel).
    await p.evaluate(load(name));
    check(!!(await p.$(`#${name}-liste`)), 'relance possible');
  }

  // Échap dans le panneau liste avec un détail épinglé : libère seulement le
  // détail ; un 2e Échap arrête le bookmarklet.
  console.log('\n===== Échap dans le panneau liste');
  await p.goto('file://' + path.join(DIST, 'demo', 'rgaa-2-cadres.html'));
  await p.evaluate(load('rgaa-2-cadres'));
  await use('rgaa-2-cadres');
  const pinned = () => p.evaluate(() => document.getElementById('rgaa-2-cadres')?.shadowRoot.querySelector('.panel.pinned') != null);
  check(await pinned(), 'détail épinglé');
  await p.evaluate(() => document.getElementById('rgaa-2-cadres-liste').shadowRoot.querySelector('.refresh').focus());
  await p.keyboard.press('Escape');
  check(!(await pinned()) && !!(await p.$('#rgaa-2-cadres-liste')), '1er Échap : détail libéré, bookmarklet actif');
  await p.keyboard.press('Escape');
  check(!(await p.$('[data-rgaa-bookmarklet]')), '2e Échap : bookmarklet arrêté');

  check(errors.length === 0, `erreurs JS : ${JSON.stringify(errors)}`);
  await b.close();
  if (fails.length) process.exit(1);
})();
