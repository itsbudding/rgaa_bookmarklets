/**
 * RGAA 8 – Page : éléments obligatoires de la page (critères 8.1 à 8.6).
 *
 * Quatre lignes par document (page, puis chaque iframe de même origine) :
 *  - Doctype (8.1) : présent, reconnu, placé avant <html> (code source relu
 *    à la demande) ;
 *  - Validité (8.2) : ce qui reste lisible dans le code généré (id en double,
 *    élément obsolète en HTML5, élément interactif dans un autre, plusieurs
 *    title), chaque constat sur sa ligne ; le reste se vérifie au validateur
 *    du W3C (boutons dans le détail) ;
 *  - Langue (8.3, 8.4) : lang sur html ou sur chaque texte, code valide,
 *    pertinence à confirmer avec un extrait du texte ;
 *  - Titre (8.5, 8.6) : présent et non vide, pertinence toujours à juger,
 *    titres génériques signalés, historique des titres pris pendant l'audit.
 * × seulement pour un fait lisible dans le code ; la pertinence (8.4, 8.6)
 * est toujours « à vérifier ».
 */
import { inspector } from '../lib/floating-panel.js';
import { row, esc, src, icon, flag, list } from '../lib/dom.js';
import { pills, critBlocks, lineStatus, fromChecks, CRIT_CSS, STATUS_FILTERS, statusFilter } from '../lib/criteria.js';
import { allDocuments, isOwn, textOf, norm, sortByDom, isNotExposed } from '../lib/a11y.js';
import { clean } from '../lib/name.js';
import { checkCode, expectedScripts, mainScript, scriptName, ownLang, langName } from '../lib/lang.js';

const ID = 'rgaa-8-page';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

const tagOf = (e) => e.tagName.toLowerCase();
const plural = (n, s, p = `${s}s`) => `${n} ${n > 1 ? p : s}`;
const cut = (t, n = 120) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const KEYS = ['8.1', '8.2', '8.3', '8.4', '8.5', '8.6'];

/* ---------- 8.1 Doctype ---------- */

/** Doctypes reconnus : identifiant public (en minuscules) → version. */
const PUBLIC_IDS = {
  '-//w3c//dtd html 4.01//en': 'HTML 4.01 Strict',
  '-//w3c//dtd html 4.01 transitional//en': 'HTML 4.01 Transitional',
  '-//w3c//dtd html 4.01 frameset//en': 'HTML 4.01 Frameset',
  '-//w3c//dtd html 4.0//en': 'HTML 4.0 Strict',
  '-//w3c//dtd html 4.0 transitional//en': 'HTML 4.0 Transitional',
  '-//w3c//dtd html 4.0 frameset//en': 'HTML 4.0 Frameset',
  '-//w3c//dtd html 3.2 final//en': 'HTML 3.2',
  '-//w3c//dtd html 3.2//en': 'HTML 3.2',
  '-//w3c//dtd xhtml 1.0 strict//en': 'XHTML 1.0 Strict',
  '-//w3c//dtd xhtml 1.0 transitional//en': 'XHTML 1.0 Transitional',
  '-//w3c//dtd xhtml 1.0 frameset//en': 'XHTML 1.0 Frameset',
  '-//w3c//dtd xhtml 1.1//en': 'XHTML 1.1',
  '-//w3c//dtd xhtml basic 1.1//en': 'XHTML Basic 1.1',
  '-//w3c//dtd xhtml+rdfa 1.0//en': 'XHTML+RDFa 1.0',
  '-//w3c//dtd xhtml+rdfa 1.1//en': 'XHTML+RDFa 1.1',
  '-//w3c//dtd html 4.01+rdfa 1.1//en': 'HTML 4.01+RDFa 1.1',
  '-//w3c//dtd xhtml 1.1 plus mathml 2.0//en': 'XHTML 1.1 + MathML 2.0',
};

/** Doctype tel qu'il s'écrit. */
const doctypeText = (dt) =>
  `<!DOCTYPE ${dt.name}${dt.publicId ? ` PUBLIC "${dt.publicId}"` : ''}${dt.systemId ? `${dt.publicId ? '' : ' SYSTEM'} "${dt.systemId}"` : ''}>`;

/** Version reconnue du doctype, ou ''. */
const doctypeVersion = (dt) => {
  if (!dt || dt.name.toLowerCase() !== 'html') return '';
  if (!dt.publicId && (!dt.systemId || dt.systemId === 'about:legacy-compat')) return 'HTML5';
  return PUBLIC_IDS[dt.publicId.toLowerCase()] || '';
};

const isSrcdoc = (doc) => doc.URL === 'about:srcdoc';
const MODE = { CSS1Compat: 'standard', BackCompat: 'quirks (compatibilité)' };

/** Code source relu à la demande (document principal) : { state, text?, error? }. */
let source = { state: 'none' };

/** Ce qui précède le doctype dans le code source : { found, before } (commentaires, espaces et prologue XML acceptés). */
const sourceStart = (text) => {
  const s = text.replace(/^﻿/, '');
  let i = 0;
  for (;;) {
    const ws = s.slice(i).match(/^\s+/);
    if (ws) i += ws[0].length;
    if (s.startsWith('<!--', i)) {
      const end = s.indexOf('-->', i + 4);
      if (end < 0) break;
      i = end + 3;
    } else if (s.startsWith('<?xml', i)) {
      const end = s.indexOf('?>', i);
      if (end < 0) break;
      i = end + 2;
    } else break;
  }
  if (/^<!doctype/i.test(s.slice(i))) return { found: true, before: '' };
  const at = s.search(/<!doctype/i);
  return { found: at >= 0, before: clean(s.slice(i, at >= 0 ? at : i + 120)) };
};

const doctypeCrit = (doc) => {
  const dt = doc.doctype;
  const main = doc === document;
  const src0 = main && source.state === 'ok' ? sourceStart(source.text) : null;
  if (!dt) {
    if (isSrcdoc(doc)) return { status: 'hidden', text: 'Iframe srcdoc : pas de doctype attendu (document toujours en mode standard)', extra: [] };
    if (src0 && src0.found) return { status: 'error', text: `Doctype placé après du contenu (« ${cut(src0.before, 60)} ») : le navigateur l’ignore (8.1.3)`, extra: [] };
    if (src0) return { status: 'error', text: 'Aucun doctype dans le code source (8.1.1)', extra: [] };
    return { status: 'error', text: 'Aucun doctype dans le code généré : absent, ou écrit après <html> et ignoré par le navigateur (8.1.1 ou 8.1.3)', extra: [] };
  }
  const x = [];
  if (!doctypeVersion(dt)) x.push(['warning', `Doctype non reconnu : vérifier sa syntaxe (8.1.2)`]);
  if (src0 && src0.before) x.push(['error', `Contenu avant le doctype dans le code source : « ${cut(src0.before, 60)} » (8.1.3)`]);
  if (doc.compatMode === 'BackCompat' && !x.length) x.push(['warning', 'Le navigateur affiche la page en mode quirks : vérifier la syntaxe du doctype (8.1.2)']);
  return fromChecks(x, { ok: `Doctype ${doctypeVersion(dt)} présent et valide` });
};

/* ---------- 8.2 Validité : faits lisibles dans le DOM ---------- */

/** Racines d'un document : lui-même et ses Shadow DOM ouverts (pas ses iframes). */
const rootsOf = (doc) => {
  const out = [doc];
  const visit = (root) =>
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot && !isOwn(el)) {
        out.push(el.shadowRoot);
        visit(el.shadowRoot);
      }
    });
  visit(doc);
  return out;
};

const REF_ATTRS = ['for', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant', 'aria-details', 'aria-errormessage', 'aria-flowto', 'headers', 'list', 'form'];

/** id → attributs qui le référencent, dans une racine. */
const referencesIn = (root) => {
  const refs = new Map();
  const add = (id, how) => {
    if (!refs.has(id)) refs.set(id, new Set());
    refs.get(id).add(how);
  };
  root.querySelectorAll(REF_ATTRS.map((a) => `[${a}]`).join(',')).forEach((el) =>
    REF_ATTRS.forEach((a) => el.hasAttribute(a) && el.getAttribute(a).trim().split(/\s+/).forEach((id) => id && add(id, a))),
  );
  root.querySelectorAll('a[href^="#"], area[href^="#"]').forEach((a) => add(decodeURIComponent(a.getAttribute('href').slice(1)), 'lien #ancre'));
  root.querySelectorAll('[usemap]').forEach((el) => add(el.getAttribute('usemap').replace(/^#/, ''), 'usemap'));
  return refs;
};

const OBSOLETE = {
  acronym: 'abbr', applet: 'object ou embed', basefont: 'CSS', bgsound: 'audio', big: 'CSS', blink: 'CSS (ou rien)', center: 'CSS',
  dir: 'ul', font: 'CSS', frame: 'iframe', frameset: 'une page sans cadres', isindex: 'un formulaire', keygen: '(aucun)', listing: 'pre et code',
  marquee: 'CSS (ou rien)', menuitem: 'button', multicol: 'CSS', nextid: '(aucun)', nobr: 'CSS (white-space)', noembed: 'object',
  noframes: '(aucun)', plaintext: 'pre', spacer: 'CSS', strike: 's ou del', tt: 'code, kbd, samp ou CSS', xmp: 'pre et code',
};
const INTERACTIVE = 'a[href], button, input:not([type="hidden"]), select, textarea, iframe, embed, details, label, audio[controls], video[controls], [tabindex]';

/** Le document suit-il HTML5 (doctype HTML5, ou aucun) ? */
const html5 = (doc) => !doc.doctype || doctypeVersion(doc.doctype) === 'HTML5';

const factsOf = (doc) => {
  const facts = [];
  rootsOf(doc).forEach((root) => {
    // id en double
    const ids = new Map();
    root.querySelectorAll('[id]').forEach((el) => {
      if (isOwn(el) || !el.id) return;
      if (!ids.has(el.id)) ids.set(el.id, []);
      ids.get(el.id).push(el);
    });
    const dups = [...ids].filter(([, els]) => els.length > 1);
    if (dups.length) {
      const refs = referencesIn(root);
      dups.forEach(([id, els]) =>
        facts.push({ kind: 'id', id, el: els[0], els, refs: [...(refs.get(id) || [])], text: `id « ${id} » présent ${els.length} fois` }),
      );
    }
    // éléments obsolètes en HTML5
    if (html5(doc)) {
      const byTag = new Map();
      root.querySelectorAll(Object.keys(OBSOLETE).join(',')).forEach((el) => {
        if (isOwn(el) || el.namespaceURI !== XHTML_NS) return;
        const t = tagOf(el);
        if (!byTag.has(t)) byTag.set(t, []);
        byTag.get(t).push(el);
      });
      byTag.forEach((els, t) => facts.push({ kind: 'obsolete', tag: t, el: els[0], els, text: `<${t}> obsolète en HTML5${els.length > 1 ? ` (${els.length} fois)` : ''}` }));
    }
    // éléments interactifs imbriqués
    root.querySelectorAll('a, button, label').forEach((outer) => {
      if (isOwn(outer)) return;
      const sel = outer.tagName === 'LABEL' ? 'label' : outer.tagName === 'A' ? `a, ${INTERACTIVE}` : INTERACTIVE;
      const inner = outer.querySelector(sel);
      if (!inner) return;
      const what = inner.hasAttribute('tabindex') && !inner.matches(INTERACTIVE.replace(', [tabindex]', '')) ? `élément avec tabindex` : `<${tagOf(inner)}>`;
      facts.push({ kind: 'nested', el: outer, els: [outer, inner], inner, text: `${what} dans <${tagOf(outer)}> : imbrication interdite` });
    });
  });
  return sortByDom(facts, (f) => f.el);
};

const titleEls = (doc) => [...doc.getElementsByTagName('title')].filter((t) => t.namespaceURI === XHTML_NS && !t.closest('svg'));

const validCrit = (doc, facts) => {
  const x = facts.map((f) => ['error', f.text]);
  const titles = titleEls(doc);
  if (titles.length > 1) x.push(['error', `${titles.length} balises title (seule la première compte)`]);
  if (!x.length) return { status: 'warning', text: 'Aucune erreur lisible dans le code généré : passer le validateur du W3C', extra: [] };
  const n = x.length;
  return {
    status: 'error',
    text: `${plural(n, 'erreur')} lisible${n > 1 ? 's' : ''} dans le code généré ; passer aussi le validateur du W3C`,
    extra: x.slice(0, 8).concat(n > 8 ? [['error', `… et ${n - 8} autres`]] : []),
  };
};

/* ---------- 8.3 / 8.4 Langue par défaut ---------- */

const SKIP_TEXT = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'TITLE']);

/** Textes visibles du document (Shadow DOM compris) : [{ node, el }]. */
const textNodes = (doc, max = 20000) => {
  const out = [];
  const visit = (root) => {
    const w = (root.ownerDocument || root).createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n && out.length < max; n = w.nextNode()) {
      if (n.nodeType === 1) {
        if (n.shadowRoot && !isOwn(n)) visit(n.shadowRoot);
        continue;
      }
      const el = n.parentElement;
      if (!el || SKIP_TEXT.has(el.tagName) || !n.data.trim() || !/\p{L}/u.test(n.data) || isOwn(el)) continue;
      if (!el.getClientRects().length) continue;
      out.push({ node: n, el });
    }
  };
  if (doc.body) visit(doc.body);
  return out;
};

/** Langue qui s'applique à un nœud de texte (attribut lang le plus proche, Shadow DOM compris). */
const langAbove = (el) => {
  for (let e = el; e; e = e.parentElement || (e.parentNode && e.parentNode.host) || null) {
    const v = ownLang(e);
    if (v !== null && v.trim()) return v.trim();
  }
  return '';
};

/** Extrait du texte de la page (les premières phrases). */
const excerpt = (doc) => cut(clean(textNodes(doc, 200).map((t) => t.node.data).join(' ')), 300);

const langInfo = (doc) => {
  const html = doc.documentElement;
  const lang = html.getAttribute('lang');
  const xml = html.getAttribute('xml:lang') ?? (html.getAttributeNS ? html.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang') : null);
  const dt = doc.doctype;
  const version = dt ? doctypeVersion(dt) : '';
  const xhtml = /^XHTML/.test(version);
  const served = doc.contentType;
  return { lang: lang === null ? null : lang.trim(), xml: xml === null ? null : xml.trim(), xhtml, version, served };
};

const langCrits = (doc, info) => {
  const { lang, xml, xhtml, version, served } = info;
  const c = {};
  // Attribut qui fait foi selon le type de document (glossaire « Langue par défaut »).
  const needXml = xhtml && (served !== 'text/html' || version === 'XHTML 1.1');
  const needLang = !xhtml || (served === 'text/html' && version !== 'XHTML 1.1');
  const code = xhtml ? xml || lang : lang;
  if (code) {
    const x = [];
    if (needLang && !lang) x.push(['error', `${version} servi en ${served} : attribut lang obligatoire sur html`]);
    if (needXml && !xml) x.push(['error', `${version}${version === 'XHTML 1.1' ? '' : ` servi en ${served}`} : attribut xml:lang obligatoire sur html`]);
    c['8.3'] = fromChecks(x, { ok: `Langue par défaut indiquée sur html (${lang ? `lang="${lang}"` : `xml:lang="${xml}"`})` });
  } else if (xml) {
    c['8.3'] = { status: 'error', text: 'Seul xml:lang est présent sur html : en HTML, l’attribut lang est obligatoire (glossaire « Langue par défaut »)', extra: [] };
    c['8.4'] = { status: 'hidden', text: 'Non concerné : pas de langue par défaut reconnue', extra: [] };
    return c;
  }
  if (!c['8.3']) {
    // Seconde condition du test 8.3.1 : la langue est donnée sur chaque texte.
    const texts = textNodes(doc);
    const without = texts.filter((t) => !langAbove(t.el));
    if (texts.length && !without.length) {
      c['8.3'] = { status: 'ok', text: `Pas de langue sur html, mais ${texts.length > 1 ? `chacun des ${texts.length} textes a` : 'le seul texte a'} une langue (sur lui ou un parent)`, extra: [] };
      c['8.4'] = { status: 'warning', text: 'Langue donnée sur les éléments : vérifier leurs codes avec RGAA 8 – Langues et balises', extra: [] };
      return c;
    }
    c['8.3'] = {
      status: 'error',
      text: lang === '' ? 'lang="" sur html : langue par défaut non précisée' : 'Aucune langue par défaut (ni lang sur html, ni sur chaque texte)',
      extra: texts.length ? [['error', `${plural(without.length, 'texte')} sans langue sur ${texts.length}`]] : [],
    };
    c['8.4'] = { status: 'hidden', text: 'Non concerné : pas de langue par défaut', extra: [] };
    return c;
  }
  const r = checkCode(code);
  if (r.status === 'error') c['8.4'] = { status: 'error', text: `Code de langue invalide : ${r.why}`, extra: [] };
  else {
    const x = [];
    if (r.status === 'warning') x.push(['warning', r.why]);
    if (lang && xml && lang.toLowerCase() !== xml.toLowerCase()) x.push(['warning', `lang="${lang}" et xml:lang="${xml}" différents : lequel est juste ?`]);
    const exp = expectedScripts(code);
    const main = mainScript(excerpt(doc));
    if (exp && main && !exp.has(main)) {
      x.push(['warning', `Texte surtout en alphabet ${scriptName(main)} alors que « ${code} » (${r.name || code}) s’écrit en alphabet ${[...exp].map(scriptName).join(' / ')} : la langue est-elle la bonne ?`]);
    }
    x.push(['warning', `Langue déclarée : ${r.name || code}. Vérifier que c’est la langue principale de la page`]);
    c['8.4'] = fromChecks(x);
  }
  return c;
};

/* ---------- 8.5 / 8.6 Titre ---------- */

const GENERIC_TITLES = new Set(
  [
    'document', 'untitled', 'untitled document', 'untitled page', 'sans titre', 'document sans titre', 'nouveau document', 'new document',
    'page', 'accueil', 'home', 'home page', 'homepage', 'page d accueil', 'index', 'react app', 'vite app', 'vite react ts', 'my app',
    'welcome', 'bienvenue', 'test', 'titre', 'title', 'default', 'mon site', 'site', 'new tab', 'nouvel onglet', 'blank', 'page title',
  ].map(norm),
);

/** Titres pris par la page pendant l'audit : [{ t, at }]. */
const history = [];

const titleCrits = (doc) => {
  const els = titleEls(doc);
  const t = clean(doc.title);
  const c = {};
  if (!els.length) {
    c['8.5'] = { status: 'error', text: 'Aucune balise title', extra: [] };
    c['8.6'] = { status: 'hidden', text: 'Non concerné : pas de titre', extra: [] };
    return c;
  }
  if (!t) {
    c['8.5'] = { status: 'error', text: 'Balise title vide', extra: [] };
    c['8.6'] = { status: 'hidden', text: 'Non concerné : titre vide', extra: [] };
    return c;
  }
  c['8.5'] = { status: 'ok', text: 'Titre présent', extra: [] };
  const x = [];
  const host = (() => {
    try {
      return new URL(doc.URL).hostname.replace(/^www\./, '');
    } catch (e) {
      return '';
    }
  })();
  if (GENERIC_TITLES.has(norm(t)) || /^[\w-]+\.(html?|php|aspx?|jsp)$/i.test(t) || (host && norm(t) === norm(host)) || /^https?:\/\//i.test(t)) {
    x.push(['warning', `Titre générique « ${cut(t, 60)} » : il n’identifie pas la page`]);
  }
  if (history.length > 1) x.push(['warning', `Le titre a changé ${plural(history.length - 1, 'fois', 'fois')} pendant l’audit : vérifier qu’il suit chaque vue ou étape`]);
  x.push(['warning', 'Vérifier que le titre identifie la page (et le site) et qu’il est unique sur le site']);
  c['8.6'] = fromChecks(x);
  return c;
};

const h1Texts = (doc) =>
  [...doc.querySelectorAll('h1, [role="heading"][aria-level="1"]')].filter((h) => !isOwn(h) && !isNotExposed(h)).map((h) => textOf(h)).filter(Boolean);

/* ---------- Collecte ---------- */

let docs = [];
let entries = [];
let byEl = new Map();

const docLabel = (doc) => {
  const f = doc.defaultView && doc.defaultView.frameElement;
  if (!f) return '';
  const t = clean(f.getAttribute('title') || f.getAttribute('aria-label') || '');
  return t ? `Iframe « ${cut(t, 50)} »` : `Iframe sans titre (${cut(clean(f.getAttribute('src') || 'srcdoc'), 40)})`;
};

const analyseDoc = (doc, label) => {
  const main = !label;
  const anchor = doc.head || doc.documentElement;
  const facts = factsOf(doc);
  const info = langInfo(doc);
  const page = [
    { kind: 'page', what: 'doctype', doc, el: anchor, crit: { '8.1': doctypeCrit(doc) } },
    { kind: 'page', what: 'valid', doc, el: anchor, facts, crit: { '8.2': validCrit(doc, facts) } },
    { kind: 'page', what: 'lang', doc, el: anchor, info, crit: langCrits(doc, info) },
  ];
  // Iframe : ligne Validité seulement s'il y a une erreur lisible (le validateur se passe sur la page).
  if (!main && page[1].crit['8.2'].status !== 'error') page.splice(1, 1);
  if (main) page.push({ kind: 'page', what: 'title', doc, el: anchor, crit: titleCrits(doc) });
  facts.forEach((f) => {
    f.doc = doc;
    f.crit = { '8.2': { status: 'error', text: f.text, extra: [] } };
  });
  [...page, ...facts].forEach((e) => {
    const all = Object.values(e.crit);
    e.status = all.every((c) => c.status === 'hidden') ? 'hidden' : lineStatus(e.crit);
  });
  return { doc, label, page, facts };
};

const LABEL = { doctype: 'Doctype', valid: 'Validité', lang: 'Langue', title: 'Titre' };

const pageLabel = (e) => {
  const d = e.doc;
  if (e.what === 'doctype') return d.doctype ? doctypeText(d.doctype) : 'aucun doctype';
  if (e.what === 'valid') {
    const n = e.crit['8.2'].status === 'error' ? e.facts.length + (titleEls(d).length > 1 ? 1 : 0) : 0;
    return n ? `${plural(n, 'erreur')} dans le code généré · valider au W3C` : 'valider au W3C';
  }
  if (e.what === 'lang') {
    const { lang, xml } = e.info;
    const code = lang || xml;
    if (!code) return lang === '' ? 'lang=""' : 'aucune langue sur html';
    const n = checkCode(code).name;
    return `${lang ? `lang="${lang}"` : `xml:lang="${xml}"`}${n ? ` (${n})` : ''}`;
  }
  const t = clean(d.title);
  return t ? `« ${t} »` : titleEls(d).length ? 'title vide' : 'aucun title';
};

const FACT_TAG = { id: 'id', obsolete: 'obsolète', nested: 'imbrication' };

const collect = () => {
  docs = allDocuments().map((doc, i) => analyseDoc(doc, i ? docLabel(doc) : ''));
  entries = docs.flatMap((d) => [...d.page, ...d.facts]);
  byEl = new Map();
  docs.forEach((d) => d.facts.forEach((f) => f.els.forEach((el) => !byEl.has(el) && byEl.set(el, f))));
  const items = [];
  docs.forEach((d, i) => {
    if (i) items.push({ section: true, label: d.label });
    d.page.forEach((e) => {
      const keys = KEYS.filter((k) => e.crit[k]);
      items.push({
        el: e.el,
        entry: e,
        status: e.status,
        prefix: `<span class="lvl">${LABEL[e.what]}</span>${pills(e.crit, keys)}`,
        label: pageLabel(e),
        filter: statusFilter(e.status),
      });
      if (e.what === 'valid') {
        e.facts.forEach((f) =>
          items.push({
            el: f.el,
            els: f.els,
            entry: f,
            status: 'error',
            indent: 1,
            prefix: `<span class="lvl">${FACT_TAG[f.kind]}</span>${pills(f.crit, ['8.2'])}`,
            label: f.text,
            filter: statusFilter('error'),
          }),
        );
      }
    });
  });
  const lines = entries;
  const err = lines.filter((e) => e.status === 'error').length;
  const warn = lines.filter((e) => e.status === 'warning').length;
  return {
    count: lines.length,
    items,
    summary:
      `${err ? icon('error') + ' ' : ''}${err} non conforme${err > 1 ? 's' : ''} · ${warn ? icon('warning') + ' ' : ''}${warn} à vérifier` +
      (docs.length > 1 ? ` · ${plural(docs.length - 1, 'iframe')} de même origine` : ''),
  };
};

/* ---------- Détail ---------- */

/** Ligne de la page choisie dans la liste (les lignes « Page » n'ont pas d'élément à survoler). */
let chosen = null;

const btn = (action, label, note) =>
  `<p class="note"><button type="button" class="act" data-action="${action}">${esc(label)}</button>${note ? ` <span class="small muted">${note}</span>` : ''}</p>`;

let message = '';

const doctypeDetail = (e) => {
  const d = e.doc;
  const dt = d.doctype;
  let html = row('Doctype', dt ? `<code>${esc(doctypeText(dt))}</code>` : '<span class="muted">aucun</span>');
  if (dt) html += row('Version', esc(doctypeVersion(dt) || 'non reconnue'));
  html += row('Mode du navigateur', esc(MODE[d.compatMode] || d.compatMode));
  if (d === document) {
    if (source.state === 'ok') {
      const s = sourceStart(source.text);
      html += row('Code source', s.before ? `contenu avant le doctype : « ${esc(cut(s.before, 80))} »` : s.found ? 'le doctype est en tête (commentaires et espaces acceptés)' : 'aucun doctype');
    } else if (source.state === 'error') html += row('Code source', `<span class="muted">lecture impossible (${esc(source.error)})</span>`);
    else if (source.state === 'loading') html += row('Code source', '<span class="muted">lecture en cours…</span>');
    if (source.state !== 'ok' && source.state !== 'loading') {
      html += btn('source', 'Relire le code source', 'pour vérifier ce qui précède le doctype (8.1.3) ; refait une requête à la même adresse');
    }
  }
  return html + critBlocks(e.crit, ['8.1']);
};

const validDetail = (e) => {
  const d = e.doc;
  let html = '';
  const http = /^https?:/.test(d.URL);
  html += critBlocks(e.crit, ['8.2']);
  html +=
    `<p class="note small">Le navigateur corrige le code avant que le bookmarklet ne le lise (guillemets, balises non fermées, attributs doublés) : ` +
    `seul le validateur vérifie la syntaxe.</p>` +
    btn('w3c-dom', 'Valider le code généré au W3C', '<strong>envoie le code de la page</strong> (après exécution des scripts) au validateur du W3C, dans un nouvel onglet') +
    btn('w3c-url', 'Valider l’adresse au W3C', http ? 'page publique seulement : valide le code envoyé par le serveur, avant scripts' : 'indisponible : la page n’a pas d’adresse http(s)') +
    btn('copy', 'Copier le code généré', 'pour un validateur local (intranet, contenu confidentiel)');
  if (message) html += `<p class="note small" role="status">${esc(message)}</p>`;
  return html;
};

const langDetail = (e) => {
  const { lang, xml, version, served } = e.info;
  let html = row('Attribut lang', lang === null ? '<span class="muted">absent</span>' : `<code>${esc(`lang="${lang}"`)}</code>`);
  if (xml !== null || /^XHTML/.test(version)) html += row('Attribut xml:lang', xml === null ? '<span class="muted">absent</span>' : `<code>${esc(`xml:lang="${xml}"`)}</code>`);
  html += row('Type de document', `${esc(version || (e.doc.doctype ? 'non reconnu' : 'sans doctype'))} ${src(`servi en ${served}`)}`);
  const code = lang || xml;
  if (code && checkCode(code).status !== 'error') {
    const r = checkCode(code);
    const exp = expectedScripts(code);
    html += row('Langue', `${esc(r.name || langName(r.primary) || 'inconnue du navigateur')}${exp ? ` ${src(`alphabet ${[...exp].map(scriptName).join(' / ')}`)}` : ''}`);
  }
  const ex = excerpt(e.doc);
  if (ex) html += row('Début du texte', `<span class="quote">« ${esc(ex)} »</span>`);
  return html + critBlocks(e.crit, ['8.3', '8.4']);
};

const titleDetail = (e) => {
  const d = e.doc;
  const t = clean(d.title);
  let html = row('Titre', t ? `« ${esc(t)} »` : '<span class="muted">aucun</span>');
  const h1 = h1Texts(d);
  html += row('Titre h1', h1.length ? h1.slice(0, 3).map((h) => `« ${esc(cut(h, 80))} »`).join(', ') : '<span class="muted">aucun</span>');
  html += row('Adresse', esc(cut(d.URL, 120)));
  if (t && h1.length) {
    const words = new Set(norm(t).split(' ').filter((w) => w.length > 3));
    if (words.size && !h1.some((h) => norm(h).split(' ').some((w) => words.has(w)))) {
      html += `<p class="note small muted">Le titre ne reprend aucun mot du h1 (information, pas une non-conformité).</p>`;
    }
  }
  if (history.length > 1) html += row('Pris pendant l’audit', list(history.map((h) => `${esc(h.at)} : « ${esc(cut(h.t, 80))} »`)));
  return html + critBlocks(e.crit, ['8.5', '8.6']);
};

const factDetail = (f) => {
  let html;
  if (f.kind === 'id') {
    html = row('id', `<code>${esc(f.id)}</code> ${src(`${f.els.length} éléments`)}`);
    html += list(f.els.slice(0, 8).map((el) => `<code>&lt;${esc(tagOf(el))}&gt;</code> ${esc(cut(textOf(el), 50))}`));
    html += row('Référencé par', f.refs.length ? esc(f.refs.join(', ')) : '<span class="muted">aucun attribut de la page</span>');
    if (f.refs.length) html += `<p class="note small muted">Seul le premier élément est trouvé par ces références : les autres perdent leur étiquette ou leur lien.</p>`;
  } else if (f.kind === 'obsolete') {
    html = row('Élément', `<code>&lt;${esc(f.tag)}&gt;</code> ${src(plural(f.els.length, 'fois', 'fois'))}`) + row('À remplacer par', esc(OBSOLETE[f.tag]));
  } else {
    html = row('Élément', `<code>&lt;${esc(tagOf(f.el))}&gt;</code> « ${esc(cut(textOf(f.el), 60))} »`) + row('Contient', `<code>&lt;${esc(tagOf(f.inner))}&gt;</code> « ${esc(cut(textOf(f.inner) || f.inner.getAttribute('aria-label') || '', 60))} »`);
    html += `<p class="note small muted">Un lien ou un bouton ne peut pas contenir d’élément interactif ni d’élément avec tabindex (le HTML l’interdit, et le clavier comme les lecteurs d’écran s’y perdent).</p>`;
  }
  return html + critBlocks(f.crit, ['8.2']);
};

const DETAIL = { doctype: doctypeDetail, valid: validDetail, lang: langDetail, title: titleDetail };

/* ---------- Actions ---------- */

/** Code généré, sans les panneaux ni les contours des bookmarklets. */
const generated = (doc) => {
  const clone = doc.documentElement.cloneNode(true);
  clone.querySelectorAll('[data-rgaa-bookmarklet]').forEach((n) => n.remove());
  clone.querySelectorAll('[style*="!important"]').forEach((n) => {
    const s = n.getAttribute('style').replace(/outline(-offset)?\s*:[^;]*!important;?/g, '').trim();
    if (s) n.setAttribute('style', s);
    else n.removeAttribute('style');
  });
  return `${doc.doctype ? `${doctypeText(doc.doctype)}\n` : ''}${clone.outerHTML}`;
};

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-rgaa-bookmarklet', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (err) {
      ok = false;
    }
    ta.remove();
    return ok;
  }
};

const postToW3C = (code) => {
  const f = document.createElement('form');
  f.setAttribute('data-rgaa-bookmarklet', '');
  f.method = 'post';
  f.enctype = 'multipart/form-data';
  f.action = 'https://validator.w3.org/nu/#textarea';
  f.target = '_blank';
  f.style.display = 'none';
  const add = (name, value, tag = 'input') => {
    const i = document.createElement(tag);
    i.name = name;
    if (tag === 'input') i.type = 'hidden';
    i.value = value;
    f.appendChild(i);
  };
  add('showsource', 'yes');
  add('content', code, 'textarea');
  (document.body || document.documentElement).appendChild(f);
  f.submit();
  f.remove();
};

const readSource = async () => {
  source = { state: 'loading' };
  if (ui) ui.redraw();
  try {
    const r = await fetch(document.URL.split('#')[0], { credentials: 'include', cache: 'force-cache' });
    if (!r.ok) throw new Error(`réponse ${r.status}`);
    source = { state: 'ok', text: await r.text() };
  } catch (err) {
    source = { state: 'error', error: /^réponse/.test(err.message) ? err.message : 'page locale, ou requête refusée' };
  }
  if (ui) ui.refresh();
};

/* ---------- Suivi du titre ---------- */

const now = () => new Date().toLocaleTimeString('fr-FR');
history.push({ t: clean(document.title), at: now() });
const watch = setInterval(() => {
  const t = clean(document.title);
  if (t === history[history.length - 1].t) return;
  history.push({ t, at: now() });
  if (ui) ui.refresh();
}, 500);

/* ---------- Lancement ---------- */

const DETAIL_CSS = `${CRIT_CSS}
.act{cursor:pointer;background:none;border:1px solid var(--rgaa-border);border-radius:3px;padding:2px 8px}
code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.95em;word-break:break-all}
`;
const LIST_CSS = `
.item > span:last-child{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 6px}
.lvl{font-weight:700;color:var(--rgaa-focus);min-width:4.5em}
.pills{order:3;flex-basis:100%;display:flex;flex-wrap:wrap;gap:3px;margin-top:2px}
.pill{font-size:var(--rgaa-fs-sm);border:1px solid currentColor;border-radius:3px;padding:0 3px;white-space:nowrap}
.pill--error{color:var(--rgaa-error)}
.pill--warning{color:var(--rgaa-warning)}
.pill--ok{color:var(--rgaa-ok)}
.pill--hidden{color:var(--rgaa-muted)}
`;

const ui = inspector({
  id: ID,
  css: DETAIL_CSS,
  maxWidth: 480,
  pinOnLocate: true,
  list: {
    title: 'Page',
    toolsOnTop: true,
    css: LIST_CSS,
    collect,
    filters: STATUS_FILTERS,
    beforeLocate: (el, it) => {
      chosen = it && it.entry && it.entry.kind === 'page' ? it.entry : null;
      message = '';
    },
    tools: [
      {
        label: () => (source.state === 'loading' ? 'Lecture du code source…' : source.state === 'ok' ? 'Relire le code source (lu)' : 'Relire le code source'),
        toggle: () => {
          if (source.state !== 'loading') readSource();
        },
      },
    ],
    footer:
      'Doctype (8.1), validité (8.2 : erreurs lisibles dans le code généré, validateur du W3C dans le détail), langue par défaut (8.3, 8.4) et titre (8.5, 8.6). ' +
      'Cliquer sur une ligne pour son détail. Les changements de langue, le sens de lecture et les balises de présentation sont dans RGAA 8 – Langues et balises.',
  },
  async onAction(name, target) {
    const e = chosen && chosen.el === target ? chosen : null;
    const doc = e ? e.doc : target.ownerDocument;
    if (name === 'source') return readSource();
    if (name === 'w3c-dom') {
      postToW3C(generated(doc));
      message = 'Code envoyé au validateur du W3C dans un nouvel onglet. Si rien ne s’ouvre (bloqueur de fenêtres, politique de sécurité de la page), utiliser « Copier le code généré ».';
    } else if (name === 'w3c-url') {
      if (!/^https?:/.test(doc.URL)) message = 'Cette page n’a pas d’adresse http(s) : utiliser « Copier le code généré ».';
      else {
        window.open(`https://validator.w3.org/nu/?doc=${encodeURIComponent(doc.URL.split('#')[0])}`, '_blank', 'noopener');
        message = 'Validateur ouvert dans un nouvel onglet (code envoyé par le serveur, sans les modifications des scripts).';
      }
    } else if (name === 'copy') {
      const code = generated(doc);
      message = (await copyText(code)) ? `Code généré copié (${code.length.toLocaleString('fr-FR')} caractères).` : 'Copie refusée par le navigateur.';
    }
  },
  onStop: () => clearInterval(watch),
  inspect(target) {
    if (chosen && target === chosen.el) {
      // Recalcul pour suivre le titre ou le code source relu.
      const fresh = entries.find((x) => x.kind === 'page' && x.what === chosen.what && x.doc === chosen.doc) || chosen;
      chosen = fresh;
      return { html: DETAIL[fresh.what](fresh), highlight: [] };
    }
    for (let el = target; el; el = el.parentElement || (el.parentNode && el.parentNode.host) || null) {
      const f = byEl.get(el);
      if (f) return { html: factDetail(f), highlight: f.els.map((x, i) => [x, i ? 'secondary' : 'primary']) };
    }
    return null;
  },
});

if (!ui) clearInterval(watch);
