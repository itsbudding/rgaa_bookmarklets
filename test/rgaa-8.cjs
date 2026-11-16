// Test RGAA 8 : les deux bookmarklets sur leurs pages de démo (verdicts
// attendus), puis, sur un serveur local, la relecture du code source (texte
// avant le doctype), l'envoi au validateur du W3C (requête interceptée, rien
// ne part sur le réseau), la copie du code généré et le suivi du titre.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const DIST = path.join(__dirname, '..', 'dist');
const load = (n) => decodeURIComponent(fs.readFileSync(path.join(DIST, n + '.js'), 'utf8').trim().replace(/^javascript:/, ''));
const fail = [];
const check = (ok, msg) => { console.log(ok ? '✓' : '✗', msg); if (!ok) fail.push(msg); };

const panel = (p, id) => p.evaluate((id) => { const h = document.getElementById(id); const el = h && h.shadowRoot.querySelector('.panel'); return el && !el.hidden ? el.innerText.replace(/\s+/g, ' ') : ''; }, id);
const lines = (p, id) => p.evaluate((id) => [...document.getElementById(`${id}-liste`).shadowRoot.querySelectorAll('.item')].map((i) => i.innerText.replace(/\s+/g, ' ')), id);
const click = async (p, id, re) => {
  const i = (await lines(p, id)).findIndex((l) => re.test(l));
  if (i < 0) return '';
  await p.evaluate(([id, i]) => document.getElementById(`${id}-liste`).shadowRoot.querySelectorAll('.item')[i].click(), [id, i]);
  await p.waitForTimeout(150);
  return panel(p, id);
};
const has = (list, re) => list.some((l) => re.test(l));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));

  /* ---------- RGAA 8 – Page, page de démo ---------- */
  console.log('===== rgaa-8-page (démo)');
  await p.goto('file://' + path.join(DIST, 'demo', 'rgaa-8-page.html'));
  await p.waitForTimeout(200);
  await p.evaluate(load('rgaa-8-page'));
  await p.waitForTimeout(300);
  let L = await lines(p, 'rgaa-8-page');
  check(/Doctype 8\.1 ✓/.test(L[0]) && /Validité 8\.2 ×/.test(L[1]), 'page : doctype ✓, validité ×');
  check(has(L, /id « courriel » présent 2 fois/), 'id en double');
  check(has(L, /<center> obsolète/) && has(L, /<font> obsolète/), 'éléments obsolètes');
  check(has(L, /<button> dans <a>/) && has(L, /tabindex dans <button>/), 'imbrications interdites');
  check(has(L, /Langue 8\.3 ✓.*8\.4 !.*lang="fr" \(français\)/), 'langue de la page');
  check(has(L, /Titre 8\.5 ✓.*8\.6 !.*Démo RGAA 8 – Page/), 'titre de la page');
  check(has(L, /Doctype 8\.1 ×.*aucun doctype/), 'iframe sans doctype ×');
  check(has(L, /Doctype 8\.1 !.*DOCTYPE htm>/), 'doctype mal écrit !');
  check(has(L, /Doctype 8\.1 ∅/), 'iframe srcdoc ∅');
  check(has(L, /8\.4 ×.*lang="french"/) && has(L, /8\.4 ×.*lang="fr_FR"/), 'codes invalides ×');
  check(has(L, /8\.3 ×.*xml:lang="fr"/) || has(L, /8\.3 ×.*aucune langue/), 'langue absente ou xml:lang seul ×');
  check(L.filter((l) => /Validité/.test(l)).length === 1, 'iframes sans erreur : pas de ligne Validité');
  const d = await click(p, 'rgaa-8-page', /lang="fr" \(français\)/);
  check(/Début du texte/.test(d) && /8\.4/.test(d), `détail Langue : ${d.slice(0, 80)}`);
  // Titre changé pendant l'audit.
  await p.keyboard.press('Escape');
  await p.click('#titre-generique');
  await p.waitForTimeout(800);
  const t = await click(p, 'rgaa-8-page', /Titre 8\.5/);
  check(/Titre générique « Document »/.test(t) && /a changé 1 fois/.test(t) && /Pris pendant l’audit/.test(t), `titre suivi en direct : ${t.slice(0, 160)}`);
  await p.click('#titre-vide');
  await p.waitForTimeout(800);
  L = await lines(p, 'rgaa-8-page');
  check(has(L, /Titre 8\.5 ×/), 'balise title supprimée : 8.5 ×');
  await p.evaluate(load('rgaa-8-page'));

  /* ---------- RGAA 8 – Langues et balises, page de démo ---------- */
  console.log('\n===== rgaa-8-langues (démo)');
  await p.goto('file://' + path.join(DIST, 'demo', 'rgaa-8-langues.html'));
  await p.waitForTimeout(200);
  await p.evaluate(load('rgaa-8-langues'));
  await p.waitForTimeout(300);
  L = await lines(p, 'rgaa-8-langues');
  const one = (re, msg) => check(has(L, re), msg);
  one(/span 8\.8 !.*lang="en" « mobile app »/, 'lang="en" : pertinence !');
  one(/8\.8 ×.*lang="english"/, 'lang="english" ×');
  one(/8\.8 ×.*lang="de_DE"/, 'lang="de_DE" ×');
  one(/8\.8 !.*lang="" « xyzzy »/, 'lang="" !');
  one(/div 8\.8 ∅.*même langue que le parent/, 'lang redondant ∅');
  one(/8\.7 !.*Спасибо.*cyrillique, sans lang/, 'mot russe sans lang : 8.7 !');
  one(/8\.7 !.*東京/, 'nom propre japonais : 8.7 !');
  one(/title 8\.7 !.*grec, sans lang/, 'attribut title en grec : 8.7 !');
  check(!has(L, /8\.7.*Добро/), 'russe avec lang="en" : signalé en 8.8 seulement, pas en 8.7');
  check(!has(L, /newsletter|stay tuned/), 'anglais sans lang (même alphabet) : non détecté');
  check(!has(L, /приветствие|π|µm|25 €/), 'code, lettre isolée, symboles : non signalés');
  one(/p 8\.10 ✓.*dir="rtl"/, 'dir="rtl" ✓');
  one(/¶ 8\.10 ×.*hébreu, sans dir/, 'hébreu sans dir ×');
  one(/¶ 8\.10 ×.*شكرا.*arabe, sans dir/, 'mot arabe isolé sans dir × (lecture stricte)');
  one(/p 8\.10 !.*dir="auto"/, 'dir="auto" !');
  one(/p 8\.10 ×.*dir="right"/, 'dir="right" ×');
  one(/p 8\.10 !.*dir="rtl" « Texte en français/, 'dir="rtl" sur du français !');
  check(!has(L, /Texte en français affiché.*latin, sans dir/), 'dir="rtl" non pertinent : pas de doublon « sans dir »');
  one(/br 8\.9 !.*2 suites de <br>/, 'br à la suite !');
  one(/p 8\.9 !.*2 paragraphes vides/, 'paragraphes vides !');
  check(L.filter((l) => /blockquote 8\.9 !/.test(l)).length === 2, 'deux blockquote !');
  one(/center 8\.9 !/, 'center !');
  check(!has(L, /Mairie|1 rue de la Paix/), 'adresse et br seul : non signalés');
  const calque = await p.evaluate(() => document.getElementById('rgaa-8-langues-langues').shadowRoot.querySelectorAll('.tag').length);
  check(calque > 10, `calque Langues affiché au lancement (${calque} étiquettes)`);
  await p.keyboard.press('Shift+B');
  const balises = await p.evaluate(() => !!document.getElementById('rgaa-8-langues-balises'));
  check(balises, 'Maj+B : calque Balises affiché');
  await p.keyboard.press('Shift+E');
  check(!(await p.$('#rgaa-8-langues-langues')), 'Maj+E : calque Langues masqué');
  // Survol d'un élément qui porte lang et dir : deux détails.
  await p.evaluate(() => document.querySelector('p[lang="ar"][dir="rtl"]').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(200);
  const bx = await (await p.$('p[lang="ar"][dir="rtl"]')).boundingBox();
  await p.mouse.move(bx.x + bx.width - 20, bx.y + bx.height / 2);
  await p.waitForTimeout(100);
  const both = await panel(p, 'rgaa-8-langues');
  check(/8\.8/.test(both) && /8\.10/.test(both), 'survol : détail lang et dir réunis');
  // Suivi en direct : un lang ajouté passe dans la liste.
  await p.evaluate(() => document.querySelector('.case .demo p').setAttribute('lang', 'es'));
  await p.keyboard.press('Shift+E');
  await p.evaluate(() => document.querySelector('.case .demo p').setAttribute('lang', 'it'));
  await p.waitForTimeout(600);
  L = await lines(p, 'rgaa-8-langues');
  one(/lang="it"/, 'lang ajouté par script : liste mise à jour');
  await p.evaluate(load('rgaa-8-langues'));
  check(!(await p.$('[data-rgaa-bookmarklet]')), 'arrêt : calques retirés');

  /* ---------- Serveur local : code source, W3C, copie ---------- */
  console.log('\n===== rgaa-8-page (serveur)');
  const pages = {
    '/': `<!-- commentaire accepté -->\nTexte parasite\n<!doctype html><html lang="fr"><head><title>Accueil – Mon site</title></head><body><h1>Accueil</h1><p id="a">Bonjour</p></body></html>`,
    '/propre': `<!-- commentaire -->\n<!doctype html><html lang="fr"><head><title>Contact – Mon site</title></head><body><p>Bonjour</p></body></html>`,
  };
  const server = http.createServer((req, res) => {
    const page = pages[req.url];
    res.writeHead(page ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page || '');
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  let posted = null;
  await ctx.route('https://validator.w3.org/**', (route) => {
    posted = { method: route.request().method(), body: route.request().postData() || '', url: route.request().url() };
    route.fulfill({ status: 200, contentType: 'text/html', body: '<p>validateur simulé</p>' });
  });

  await p.goto(base + '/');
  await p.evaluate(load('rgaa-8-page'));
  await p.waitForTimeout(200);
  L = await lines(p, 'rgaa-8-page');
  check(/Doctype 8\.1 ×/.test(L[0]), 'texte avant le doctype : aucun doctype dans le DOM ×');
  await p.evaluate(() => [...document.getElementById('rgaa-8-page-liste').shadowRoot.querySelectorAll('.tool')].find((b) => /code source/.test(b.textContent)).click());
  await p.waitForTimeout(400);
  const dt = await click(p, 'rgaa-8-page', /Doctype/);
  check(/Doctype placé après du contenu \(« Texte parasite »\)/.test(dt), `code source relu : ${dt.slice(0, 160)}`);

  // Validateur : formulaire POST vers le W3C dans un nouvel onglet (intercepté).
  await p.keyboard.press('Escape');
  await click(p, 'rgaa-8-page', /Validité/);
  const popup = p.waitForEvent('popup');
  await p.evaluate(() => document.getElementById('rgaa-8-page').shadowRoot.querySelector('[data-action="w3c-dom"]').click());
  const tab = await popup;
  await tab.waitForLoadState();
  check(posted && posted.method === 'POST' && /name="content"/.test(posted.body) && /<html lang="fr">/.test(posted.body), 'code généré envoyé au W3C (POST, champ content)');
  check(posted && !/data-rgaa-bookmarklet/.test(posted.body), 'sans les panneaux du bookmarklet');
  await tab.close();
  const msg = await panel(p, 'rgaa-8-page');
  check(/Code envoyé au validateur/.test(msg), 'message après envoi');
  await p.evaluate(() => document.getElementById('rgaa-8-page').shadowRoot.querySelector('[data-action="copy"]').click());
  await p.waitForTimeout(200);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  check(/^<!DOCTYPE html>|^<html/.test(clip) && /<p id="a">Bonjour<\/p>/.test(clip) && !/data-rgaa-bookmarklet/.test(clip), 'code généré copié, sans les panneaux');
  const popup2 = p.waitForEvent('popup');
  await p.evaluate(() => document.getElementById('rgaa-8-page').shadowRoot.querySelector('[data-action="w3c-url"]').click());
  const tab2 = await popup2;
  await tab2.waitForLoadState().catch(() => {});
  check(/validator\.w3\.org\/nu\/\?doc=http/.test(tab2.url()) || /doc=http/.test((posted || {}).url || ''), `validation de l’adresse : ${tab2.url()}`);
  await tab2.close();
  await p.evaluate(load('rgaa-8-page'));

  await p.goto(base + '/propre');
  await p.evaluate(load('rgaa-8-page'));
  await p.evaluate(() => [...document.getElementById('rgaa-8-page-liste').shadowRoot.querySelectorAll('.tool')].find((b) => /code source/.test(b.textContent)).click());
  await p.waitForTimeout(400);
  L = await lines(p, 'rgaa-8-page');
  check(/Doctype 8\.1 ✓/.test(L[0]), 'commentaire avant le doctype accepté');
  await p.evaluate(load('rgaa-8-page'));

  check(!errors.length, `pas d’erreur JavaScript ${errors.join(' | ')}`);
  await b.close();
  server.close();
  process.exit(fail.length ? 1 : 0);
})();
