/**
 * RGAA 8 – Langues et balises : changements de langue, sens de lecture et
 * balises utilisées à des fins de présentation (critères 8.7 à 8.10).
 *
 * Trois sections par document (page, puis chaque iframe de même origine),
 * dans l'ordre du document :
 *  - Langues : chaque élément qui porte lang (ou xml:lang), code valide (×
 *    sinon) et pertinence à confirmer (8.8) ; textes et attributs écrits dans
 *    un autre alphabet que celui de la langue qui s'applique, sans lang (8.7,
 *    toujours « à vérifier » : nom propre possible). Un changement de langue
 *    dans le même alphabet (anglais dans du français) n'est pas détecté ;
 *  - Sens de lecture (8.10) : chaque attribut dir (rtl ou ltr, sinon × ;
 *    auto « à vérifier »), texte d'un sens différent sans dir qui l'indique
 *    (×, lecture stricte du test 8.10.1, même pour un mot isolé) ;
 *  - Balises de présentation (8.9, toujours « à vérifier ») : <br> à la
 *    suite, paragraphes vides, blockquote, balises de présentation obsolètes.
 * Rien n'est deviné d'après la mise en page : tout se lit dans le code
 * (attributs, balises, alphabet des caractères).
 *
 * Outils : Langues sur la page (Maj+E, affiché au lancement), Balises sur la
 * page (Maj+B).
 */
import { inspector } from '../lib/floating-panel.js';
import { row, esc, src, icon, flag } from '../lib/dom.js';
import { pills, critBlocks, lineStatus, CRIT_CSS, STATUS_FILTERS, statusFilter } from '../lib/criteria.js';
import { allDocuments, isOwn, isNotExposed, textOf, sortByDom, toTopCoords } from '../lib/a11y.js';
import { THEME } from '../lib/theme.js';
import { clean, styleOf } from '../lib/name.js';
import { visibleOnScreen, pageMutation } from '../lib/live.js';
import { checkCode, expectedScripts, scriptCounts, scriptName, dirCounts, RTL_SCRIPTS, ownLang, langName } from '../lib/lang.js';

const ID = 'rgaa-8-langues';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

const tagOf = (e) => e.tagName.toLowerCase();
const plural = (n, s, p = `${s}s`) => `${n} ${n > 1 ? p : s}`;
const cut = (t, n = 120) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const up = (e) => e.parentElement || (e.parentNode && e.parentNode.host) || null;

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'HEAD', 'IFRAME', 'FRAME', 'OBJECT']);
/** Contenus où le texte n'est pas de la langue naturelle (code, saisie). */
const CODE = new Set(['CODE', 'PRE', 'KBD', 'SAMP', 'VAR', 'TEXTAREA', 'SELECT', 'OPTION']);
const ATTRS = ['title', 'alt', 'aria-label', 'placeholder', 'aria-description'];

/* ---------- Langue et sens qui s'appliquent ---------- */

/** Langue qui s'applique (attribut le plus proche, Shadow DOM compris) : chaîne (peut être vide), ou null. */
const langAbove = (el) => {
  for (let e = el; e; e = up(e)) {
    const v = ownLang(e);
    if (v !== null) return v.trim();
  }
  return null;
};

/** Élément qui porte la langue qui s'applique, ou null. */
const langHolder = (el) => {
  for (let e = el; e; e = up(e)) if (ownLang(e) !== null) return e;
  return null;
};

const DIRS = new Set(['rtl', 'ltr', 'auto']);
/** Sens qui s'applique : { value: 'rtl'|'ltr'|'auto', el } du parent le plus proche avec un dir valide, ou { value: 'ltr', el: null } par défaut. */
const dirAbove = (el) => {
  for (let e = el; e; e = up(e)) {
    if (!e.hasAttribute('dir')) continue;
    const v = e.getAttribute('dir').trim().toLowerCase();
    if (DIRS.has(v)) return { value: v, el: e };
  }
  return { value: 'ltr', el: null };
};

const dirCache = new Map();
/** Élément dont le dir ne correspond à aucune lettre de son texte (signalé sur l'attribut lui-même, pas à chaque passage). */
const misdirected = (el) => {
  if (!el) return false;
  if (!dirCache.has(el)) {
    const c = dirCounts(textOf(el));
    const v = el.getAttribute('dir').trim().toLowerCase();
    dirCache.set(el, (v === 'rtl' && !c.rtl) || (v === 'ltr' && !c.ltr));
  }
  return dirCache.get(el);
};

const expCache = new Map();
const expected = (code) => {
  const k = code.toLowerCase();
  if (!expCache.has(k)) expCache.set(k, checkCode(code).status === 'error' ? null : expectedScripts(code));
  return expCache.get(k);
};

/** Alphabets d'un texte absents de ceux attendus pour la langue : [[code, n]] (au moins 2 lettres). */
const foreignScripts = (text, lang) => {
  const exp = lang ? expected(lang) : null;
  if (!exp) return [];
  return [...scriptCounts(text)].filter(([k, n]) => k !== 'Zyyy' && n >= 2 && !exp.has(k));
};

/** Bloc qui contient l'élément (premier parent qui n'est pas affiché en ligne). */
const blockOf = (el) => {
  for (let e = el; e; e = up(e)) {
    const d = styleOf(e).display;
    if (!/^inline/.test(d) && d !== 'contents') return e;
  }
  return el;
};

/* ---------- Parcours d'un document ---------- */

const PRESENTATIONAL = { font: 'CSS', center: 'CSS', big: 'CSS', tt: 'code, kbd, samp ou CSS', strike: 's ou del', marquee: 'CSS (ou rien)', blink: 'CSS (ou rien)', basefont: 'CSS', spacer: 'CSS', nobr: 'CSS (white-space)' };
const EMBEDDED = 'img,svg,video,audio,iframe,canvas,object,embed,input,select,textarea,button,picture,math';
/** Balises sémantiques dont l'absence de contenu est signalée (8.9). */
const EMPTY_TAGS = new Set(
  ('h1 h2 h3 h4 h5 h6 p strong em b i u s small mark q cite abbr dfn code kbd samp var sub sup del ins time ' +
    'li dt dd ul ol dl menu blockquote section article aside nav header footer main figure figcaption address caption legend pre summary').split(' '),
);
const EMPTY_TEXT = /[\s\u00a0\u200b\u200c\u200d\ufeff]/g;
/** Contenu CSS (::before / ::after) d'un élément, ou ''. */
const pseudoContent = (el) => {
  const win = el.ownerDocument.defaultView;
  return ['::before', '::after']
    .map((p) => {
      const c = win.getComputedStyle(el, p).content;
      return c && c !== 'none' && c !== 'normal' ? c : '';
    })
    .filter(Boolean)
    .join(' ');
};

const walkDoc = (doc) => {
  const langs = [];
  const dirs = [];
  const passages = new Map(); // clé → passage (8.7 ou 8.10)
  const tags = [];
  const brs = [];
  const empties = new Map(); // parent → Map(balise → [els])
  const presentational = new Map(); // balise → [els]

  const addPassage = (key, make) => {
    if (!passages.has(key)) passages.set(key, make());
    return passages.get(key);
  };

  const visitText = (n, el, code) => {
    const t = n.data;
    if (!/\p{L}/u.test(t) || code) return;
    // 8.7 : autre alphabet que celui de la langue qui s'applique.
    const lang = langAbove(el);
    const holder = langHolder(el);
    foreignScripts(t, lang).forEach(([k, cnt]) => {
      // Passage dont l'élément porte une langue, mais pas la bonne : signalé en 8.8 sur cet élément.
      if (holder && holder !== doc.documentElement && scriptHint(textOf(holder), lang) === k) return;
      const block = blockOf(el);
      const p = addPassage(`${k}|lang`, () => new Map());
      const one = p.get(block) || { kind: 'script', script: k, el: block, els: [block], lang, n: 0, texts: [] };
      one.n += cnt;
      one.texts.push(clean(t));
      p.set(block, one);
    });
    // 8.10 : sens différent de celui qui s'applique, sans dir qui l'indique.
    const d = dirAbove(el);
    if (d.value === 'auto' || misdirected(d.el)) return;
    const c = dirCounts(t);
    const other = d.value === 'ltr' ? c.rtl : c.ltr;
    if (!other) return;
    const block = blockOf(el);
    const p = addPassage(`dir|${d.value}`, () => new Map());
    const one = p.get(block) || { kind: 'dir', base: d.value, from: d.el, el: block, els: [block], n: 0, texts: [], scripts: new Map() };
    one.n += other;
    one.texts.push(clean(t));
    scriptCounts(t).forEach((cnt, k) => {
      if ((d.value === 'ltr') === RTL_SCRIPTS.has(k)) one.scripts.set(k, (one.scripts.get(k) || 0) + cnt);
    });
    p.set(block, one);
  };

  const visit = (root, code, pre) => {
    let run = 0;
    let runs = 0;
    let max = 0;
    const flushBr = (parent) => {
      if (run >= 2) {
        runs++;
        max = Math.max(max, run);
      }
      run = 0;
      if (parent && runs && !pre) brs.push({ kind: 'br', el: parent, els: [parent], runs, max });
    };
    for (const c of root.childNodes) {
      if (c.nodeType === 3) {
        if (c.data.trim()) run = run >= 2 ? (runs++, (max = Math.max(max, run)), 0) : 0;
        if (root.nodeType === 1 || root.host) visitText(c, root.nodeType === 1 ? root : root.host, code);
        continue;
      }
      if (c.nodeType !== 1 || SKIP.has(c.tagName) || c.matches('[data-rgaa-bookmarklet]')) continue;
      if (c.tagName === 'BR') {
        run++;
        continue;
      }
      if (run >= 2) {
        runs++;
        max = Math.max(max, run);
      }
      run = 0;
      const hidden = !!isNotExposed(c);
      const t = tagOf(c);
      if (ownLang(c) !== null && c !== doc.documentElement) langs.push({ kind: 'lang', el: c, els: [c], hidden });
      if (c.hasAttribute('dir')) dirs.push({ kind: 'dirattr', el: c, els: [c], hidden });
      if (!hidden) {
        if (c.namespaceURI === XHTML_NS && PRESENTATIONAL[t]) {
          if (!presentational.has(t)) presentational.set(t, []);
          presentational.get(t).push(c);
        }
        if (t === 'blockquote') tags.push({ kind: 'blockquote', el: c, els: [c] });
        if (c.namespaceURI === XHTML_NS && EMPTY_TAGS.has(t) && !c.textContent.replace(EMPTY_TEXT, '') && !c.querySelector(EMBEDDED)) {
          const par = up(c);
          if (!empties.has(par)) empties.set(par, new Map());
          const byTag = empties.get(par);
          if (!byTag.has(t)) byTag.set(t, []);
          byTag.get(t).push(c);
        }
        if (!code && !CODE.has(c.tagName)) {
          const lang = langAbove(c);
          ATTRS.forEach((a) => {
            const v = c.getAttribute(a);
            if (!v || !v.trim()) return;
            foreignScripts(v, lang).forEach(([k]) => {
              const p = addPassage(`${k}|attr|${a}`, () => new Map());
              p.set(c, { kind: 'attr', attr: a, script: k, el: c, els: [c], lang, value: v.trim() });
            });
          });
        }
      }
      if (hidden) continue;
      const isCode = code || CODE.has(c.tagName);
      const isPre = pre || /^(PRE|ADDRESS|TEXTAREA|CODE)$/.test(c.tagName);
      if (c.shadowRoot && !isOwn(c)) visit(c.shadowRoot, isCode, isPre);
      visit(c, isCode, isPre);
    }
    flushBr(root.nodeType === 1 ? root : root.host || null);
  };
  if (doc.documentElement) {
    const html = doc.documentElement;
    if (html.hasAttribute('dir')) dirs.push({ kind: 'dirattr', el: html, els: [html], hidden: false });
    if (doc.body) visit(doc.body, false, false);
    if (doc.body && doc.body.hasAttribute('dir') && !dirs.some((d) => d.el === doc.body)) dirs.push({ kind: 'dirattr', el: doc.body, els: [doc.body], hidden: false });
    if (doc.body && ownLang(doc.body) !== null && !langs.some((l) => l.el === doc.body)) langs.push({ kind: 'lang', el: doc.body, els: [doc.body], hidden: false });
  }
  const pass = [...passages.values()].flatMap((m) => [...m.values()]);
  empties.forEach((byTag, par) =>
    byTag.forEach((els, t) => tags.push({ kind: 'empty', tag: t, el: els[0], els, parent: par, pseudo: els.map(pseudoContent).find(Boolean) || '' })),
  );
  presentational.forEach((els, t) => tags.push({ kind: 'presentational', tag: t, el: els[0], els }));
  return { langs, dirs, pass, tags: [...tags, ...brs] };
};

/* ---------- Verdicts ---------- */

const shortText = (el) => cut(textOf(el), 60);

/** Pertinence d'un code valide : l'alphabet du passage correspond-il ? */
const scriptHint = (text, code) => {
  const exp = expected(code);
  if (!exp) return null;
  const c = scriptCounts(text);
  const total = [...c.values()].reduce((a, b) => a + b, 0);
  const foreign = [...c].filter(([k]) => k !== 'Zyyy' && !exp.has(k));
  const n = foreign.reduce((a, [, x]) => a + x, 0);
  if (total >= 3 && n / total >= 0.6) return foreign.sort((a, b) => b[1] - a[1])[0][0];
  return null;
};

const finishLang = (e) => {
  const el = e.el;
  const v = ownLang(el).trim();
  const lang = el.getAttribute('lang');
  const xml = el.getAttribute('xml:lang');
  e.code = v;
  e.r = checkCode(v);
  const parent = up(el) ? langAbove(up(el)) : null;
  e.parent = parent;
  if (e.hidden) {
    e.crit = { '8.8': { status: 'hidden', text: `Masqué (${isNotExposed(el)}) : non concerné`, extra: [] } };
    return;
  }
  const x = [];
  if (e.r.status === 'error') x.push(['error', `Code de langue invalide : ${e.r.why}`]);
  else if (e.r.status === 'empty') x.push(['warning', 'lang="" : langue non précisée (passage dont la langue ne peut pas être déterminée ?)']);
  else {
    if (e.r.status === 'warning') x.push(['warning', e.r.why]);
    if (lang !== null && xml !== null && lang.trim().toLowerCase() !== xml.trim().toLowerCase()) x.push(['warning', `lang="${lang}" et xml:lang="${xml}" différents : lequel est juste ?`]);
    const k = scriptHint(textOf(el), v);
    if (k) x.push(['warning', `Texte en alphabet ${scriptName(k)} alors que « ${v} » (${e.r.name || v}) s’écrit autrement : la langue est-elle la bonne ?`]);
    if (parent !== null && parent.toLowerCase() === v.toLowerCase() && !x.length) {
      e.same = true;
      e.crit = { '8.8': { status: 'hidden', text: `Même langue que le parent (${v}) : attribut redondant, sans effet`, extra: [] } };
      return;
    }
    x.push(['warning', `Langue : ${e.r.name || v}. Vérifier que le passage est bien dans cette langue`]);
  }
  const sorted = x.sort((a, b) => (a[0] === 'error' ? -1 : b[0] === 'error' ? 1 : 0));
  e.crit = { '8.8': { status: sorted[0][0], text: sorted[0][1], extra: sorted.slice(1) } };
};

const finishDir = (e) => {
  const el = e.el;
  const raw = el.getAttribute('dir');
  const v = raw.trim().toLowerCase();
  e.value = raw;
  if (e.hidden) {
    e.crit = { '8.10': { status: 'hidden', text: `Masqué (${isNotExposed(el)}) : non concerné`, extra: [] } };
    return;
  }
  const c = dirCounts(textOf(el));
  let r;
  if (v === 'auto') r = { status: 'warning', text: 'dir="auto" : accepté par le HTML, mais le RGAA attend rtl ou ltr (8.10.2)' };
  else if (!DIRS.has(v)) r = { status: 'error', text: `dir="${raw}" : valeur invalide, rtl ou ltr attendu (8.10.2)` };
  else if (v === 'rtl' && !c.rtl && c.ltr) r = { status: 'warning', text: 'dir="rtl" sur un texte sans lettre qui s’écrit de droite à gauche : sens pertinent ? (8.10.2)' };
  else if (v === 'ltr' && c.rtl && !c.ltr) r = { status: 'warning', text: 'dir="ltr" sur un texte qui s’écrit de droite à gauche : sens pertinent ? (8.10.2)' };
  else r = { status: 'ok', text: `dir="${v}" ${v === 'rtl' ? '(de droite à gauche)' : '(de gauche à droite)'} : valeur conforme` };
  e.crit = { '8.10': { ...r, extra: [] } };
};

const finishPassage = (e) => {
  if (e.kind === 'dir') {
    const k = [...e.scripts].sort((a, b) => b[1] - a[1])[0];
    const name = k ? scriptName(k[0]) : e.base === 'ltr' ? 'de droite à gauche' : 'de gauche à droite';
    e.scriptLabel = name;
    e.crit = {
      '8.10': {
        status: 'error',
        text:
          e.base === 'ltr'
            ? `Texte en alphabet ${name} (de droite à gauche) sans dir="rtl" ${e.from ? `(le parent porte dir="${e.from.getAttribute('dir')}")` : '(sens par défaut : de gauche à droite)'} (8.10.1)`
            : `Texte en alphabet ${name} (de gauche à droite) dans un passage dir="rtl", sans dir="ltr" (8.10.1)`,
        extra: [],
      },
    };
    return;
  }
  const where = e.lang ? `la langue qui s’applique est « ${e.lang} »${langName(e.lang) ? ` (${langName(e.lang)})` : ''}` : '';
  e.crit = {
    '8.7': {
      status: 'warning',
      text:
        e.kind === 'attr'
          ? `Attribut ${e.attr} en alphabet ${scriptName(e.script)} : indiquer la langue (lang sur l’élément), sauf nom propre`
          : `Texte en alphabet ${scriptName(e.script)} sans lang : changement de langue à indiquer, sauf nom propre`,
      extra: where ? [['warning', `Alors que ${where}`]] : [],
    },
  };
};

const emptyText = (e) => {
  const n = e.els.length;
  const what = n > 1 ? `${n} <${e.tag}> vides` : `<${e.tag}> vide`;
  if (e.tag === 'p') return `${what} : ${n > 1 ? 'servent' : 'sert'} d’espacement ? À retirer (l’espacement relève de la CSS)`;
  if (e.pseudo) return `${what} : contenu ajouté en CSS seulement (icône ?), balise sans texte à retirer ou à remplacer`;
  return `${what} : balise${n > 1 ? 's' : ''} sans contenu, à retirer`;
};

const finishTag = (e) => {
  let text;
  if (e.kind === 'br') text = `${e.runs > 1 ? `${e.runs} suites de <br> (jusqu’à ${e.max})` : `${e.max} <br> à la suite`} : paragraphes simulés ?`;
  else if (e.kind === 'empty') text = emptyText(e);
  else if (e.kind === 'blockquote') text = 'blockquote : est-ce une citation (et non un simple retrait) ?';
  else text = `<${e.tag}> : balise de présentation (obsolète en HTML5, voir aussi 8.2)`;
  e.crit = { '8.9': { status: 'warning', text, extra: [] } };
};

/* ---------- Collecte ---------- */

let docs = [];
let entries = [];
/** Élément → entrées (un même élément peut porter lang et dir). */
let byEl = new Map();

const docLabel = (doc) => {
  const f = doc.defaultView && doc.defaultView.frameElement;
  if (!f) return '';
  const t = clean(f.getAttribute('title') || f.getAttribute('aria-label') || '');
  return t ? `Iframe « ${cut(t, 50)} »` : `Iframe sans titre (${cut(clean(f.getAttribute('src') || 'srcdoc'), 40)})`;
};

const pageLang = (doc) => {
  const v = ownLang(doc.documentElement);
  return v === null ? null : v.trim();
};

const analyseDoc = (doc, label) => {
  const w = walkDoc(doc);
  w.langs.forEach(finishLang);
  w.dirs.forEach(finishDir);
  w.pass.forEach(finishPassage);
  w.tags.forEach(finishTag);
  const all = [...w.langs, ...w.dirs, ...w.pass, ...w.tags];
  all.forEach((e) => {
    e.doc = doc;
    e.status = Object.values(e.crit).every((c) => c.status === 'hidden') ? 'hidden' : lineStatus(e.crit);
  });
  const lang = pageLang(doc);
  const r = lang ? checkCode(lang) : null;
  const page = {
    kind: 'page',
    doc,
    el: doc.head || doc.documentElement,
    els: [],
    lang,
    crit: {
      '8.7': {
        status: 'warning',
        text: 'Lire la page : un passage dans une autre langue écrite dans le même alphabet (anglais dans du français…) n’est pas détecté',
        extra: lang ? [] : [['warning', 'Pas de langue par défaut sur html : voir RGAA 8 – Page (8.3)']],
      },
    },
  };
  page.status = 'warning';
  page.r = r;
  return {
    doc,
    label,
    page,
    langs: sortByDom([...w.langs, ...w.pass.filter((p) => p.kind !== 'dir')], (e) => e.el),
    dirs: sortByDom([...w.dirs, ...w.pass.filter((p) => p.kind === 'dir')], (e) => e.el),
    tags: sortByDom(w.tags, (e) => e.el),
  };
};

const LANG_TAG = { lang: 'lang', script: '¶', attr: 'attr' };

const itemOf = (e, theme) => {
  const keys = Object.keys(e.crit);
  let prefix;
  let label;
  let meta = '';
  if (e.kind === 'lang') {
    prefix = `<span class="lvl">${esc(tagOf(e.el))}</span>`;
    label = `lang="${e.code}" « ${shortText(e.el)} »`;
    meta = e.r.name || '';
  } else if (e.kind === 'script') {
    prefix = `<span class="lvl">¶</span>`;
    label = `« ${cut(e.texts.join(' '), 60)} »`;
    meta = `${scriptName(e.script)}, sans lang`;
  } else if (e.kind === 'attr') {
    prefix = `<span class="lvl">${esc(e.attr)}</span>`;
    label = `« ${cut(e.value, 60)} »`;
    meta = `${scriptName(e.script)}, sans lang`;
  } else if (e.kind === 'dirattr') {
    prefix = `<span class="lvl">${esc(tagOf(e.el))}</span>`;
    label = `dir="${e.value}" « ${shortText(e.el)} »`;
  } else if (e.kind === 'dir') {
    prefix = `<span class="lvl">¶</span>`;
    label = `« ${cut(e.texts.join(' '), 60)} »`;
    meta = `${e.scriptLabel}, sans dir`;
  } else if (e.kind === 'br') {
    prefix = `<span class="lvl">br</span>`;
    label = `${e.runs > 1 ? `${e.runs} suites de <br>` : `${e.max} <br> à la suite`} « ${shortText(e.el)} »`;
  } else if (e.kind === 'empty') {
    prefix = `<span class="lvl">${e.tag}</span>`;
    const n = e.els.length;
    label = e.tag === 'p' ? (n > 1 ? `${n} paragraphes vides` : 'paragraphe vide') : `${n > 1 ? `${n} balises vides` : 'balise vide'}${e.pseudo ? ' (contenu CSS seul)' : ''}`;
    label += ', à retirer';
  } else if (e.kind === 'blockquote') {
    prefix = `<span class="lvl">blockquote</span>`;
    label = `« ${shortText(e.el)} »`;
  } else {
    prefix = `<span class="lvl">${esc(e.tag)}</span>`;
    label = `« ${shortText(e.el)} »`;
    meta = e.els.length > 1 ? `${e.els.length} fois` : '';
  }
  if (e.hidden) meta = `masqué${meta ? ` · ${meta}` : ''}`;
  else if (e.same) meta = `même langue que le parent${meta ? ` · ${meta}` : ''}`;
  return { el: e.el, els: e.els.length > 1 ? e.els : undefined, entry: e, status: e.status, prefix: prefix + pills(e.crit, keys), label, meta, filter: [...statusFilter(e.status), theme] };
};

const collect = () => {
  expCache.clear();
  dirCache.clear();
  docs = allDocuments().map((doc, i) => analyseDoc(doc, i ? docLabel(doc) : ''));
  entries = docs.flatMap((d) => [d.page, ...d.langs, ...d.dirs, ...d.tags]);
  byEl = new Map();
  entries.forEach((e) =>
    e.els.forEach((el) => {
      if (!byEl.has(el)) byEl.set(el, []);
      if (!byEl.get(el).includes(e)) byEl.get(el).push(e);
    }),
  );
  const items = [];
  docs.forEach((d, i) => {
    const pre = i ? `${d.label} · ` : '';
    const { page } = d;
    const name = page.r && page.r.name;
    items.push({
      el: page.el,
      entry: page,
      status: page.status,
      prefix: `<span class="lvl">${i ? 'Iframe' : 'Page'}</span>${pills(page.crit, ['8.7'])}`,
      label: i ? `${d.label} : ${page.lang ? `lang="${page.lang}"` : 'aucune langue'}` : page.lang ? `lang="${page.lang}"${name ? ` (${name})` : ''}` : 'aucune langue par défaut',
      filter: [...statusFilter(page.status), 'langues'],
    });
    items.push({ section: true, label: `${pre}Langues (${d.langs.length})` });
    d.langs.forEach((e) => items.push(itemOf(e, 'langues')));
    items.push({ section: true, label: `${pre}Sens de lecture (${d.dirs.length})` });
    d.dirs.forEach((e) => items.push(itemOf(e, 'sens')));
    items.push({ section: true, label: `${pre}Balises de présentation (${d.tags.length})` });
    d.tags.forEach((e) => items.push(itemOf(e, 'balises')));
  });
  const lines = entries;
  const err = lines.filter((e) => e.status === 'error').length;
  const warn = lines.filter((e) => e.status === 'warning').length;
  const n = (k) => docs.reduce((a, d) => a + d[k].length, 0);
  return {
    count: lines.length,
    items,
    summary:
      `${err ? icon('error') + ' ' : ''}${err} non conforme${err > 1 ? 's' : ''} · ${warn ? icon('warning') + ' ' : ''}${warn} à vérifier · ` +
      `${n('langs')} langue${n('langs') > 1 ? 's' : ''}, ${n('dirs')} sens de lecture, ${plural(n('tags'), 'balise')} de présentation` +
      (!docs.some((d) => d.dirs.length) ? ' · 8.10 non concerné (ni dir ni texte de droite à gauche)' : ''),
  };
};

/* ---------- Détail ---------- */

let chosen = null;

const excerptOf = (el) => cut(textOf(el), 200);

const detailOf = (e) => {
  let html = '';
  if (e.kind === 'page') {
    const lang = e.lang;
    html += row('Langue de la page', lang ? `<code>lang="${esc(lang)}"</code>${e.r && e.r.name ? ` ${esc(e.r.name)}` : ''}` : '<span class="muted">aucune (voir RGAA 8 – Page)</span>');
    const exp = lang ? expected(lang) : null;
    if (exp) html += row('Alphabet attendu', esc([...exp].map(scriptName).join(' / ')));
    const d = docs.find((x) => x.doc === e.doc);
    if (d) {
      const used = [...new Set(d.langs.filter((x) => x.kind === 'lang' && !x.hidden).map((x) => x.code.toLowerCase()))];
      html += row('Langues balisées', used.length ? esc(used.map((c) => `${c}${langName(c) ? ` (${langName(c)})` : ''}`).join(', ')) : '<span class="muted">aucune</span>');
    }
    html += `<p class="note small muted">Seuls les textes écrits dans un autre alphabet sont repérés. Avec « Langues sur la page », parcourir la page : tout passage dans une autre langue qui n’est pas entouré est à signaler (sauf nom propre, mot du dictionnaire, langue indéterminable).</p>`;
    return html + critBlocks(e.crit, ['8.7']);
  }
  const el = e.el;
  if (e.kind === 'lang') {
    html += row('Élément', `<code>&lt;${esc(tagOf(el))}&gt;</code>`);
    html += row('Attribut', `<code>${esc(el.hasAttribute('lang') ? `lang="${el.getAttribute('lang')}"` : `xml:lang="${e.code}"`)}</code>${el.hasAttribute('lang') && el.hasAttribute('xml:lang') ? ` <code>${esc(`xml:lang="${el.getAttribute('xml:lang')}"`)}</code>` : ''}`);
    if (e.r.status !== 'error' && e.r.status !== 'empty') {
      const exp = expected(e.code);
      html += row('Langue', `${esc(e.r.name || 'inconnue du navigateur')}${exp ? ` ${src(`alphabet ${[...exp].map(scriptName).join(' / ')}`)}` : ''}`);
    }
    html += row('Langue du parent', e.parent === null ? '<span class="muted">aucune</span>' : `<code>${esc(e.parent || '""')}</code>`);
    html += row('Texte', `<span class="quote">« ${esc(excerptOf(el))} »</span>`);
    return html + critBlocks(e.crit, ['8.8']);
  }
  if (e.kind === 'script' || e.kind === 'attr') {
    if (e.kind === 'attr') html += row('Attribut', `<code>${esc(e.attr)}</code> de <code>&lt;${esc(tagOf(el))}&gt;</code> : « ${esc(cut(e.value, 150))} »`);
    else html += row('Texte', `<span class="quote">« ${esc(cut(e.texts.join(' '), 200))} »</span>`);
    html += row('Alphabet', esc(scriptName(e.script)));
    html += row('Langue qui s’applique', e.lang ? `<code>${esc(e.lang)}</code>${langName(e.lang) ? ` ${esc(langName(e.lang))}` : ''}` : '<span class="muted">aucune</span>');
    html += `<p class="note small muted">Non applicable (cas particuliers du 8.7) : nom propre, langue indéterminable, langue morte sans synthèse vocale, terme saisi par l’utilisateur et rappelé dans la page.</p>`;
    return html + critBlocks(e.crit, ['8.7']);
  }
  if (e.kind === 'dirattr') {
    const c = dirCounts(textOf(el));
    html += row('Élément', `<code>&lt;${esc(tagOf(el))}&gt;</code> <code>${esc(`dir="${e.value}"`)}</code>`);
    html += row('Lettres', `${c.rtl} de droite à gauche, ${c.ltr} de gauche à droite`);
    const lang = langAbove(el);
    if (lang) html += row('Langue', `<code>${esc(lang)}</code>${langName(lang) ? ` ${esc(langName(lang))}` : ''}`);
    html += row('Texte', `<span class="quote">« ${esc(excerptOf(el))} »</span>`);
    return html + critBlocks(e.crit, ['8.10']);
  }
  if (e.kind === 'dir') {
    html += row('Texte', `<span class="quote">« ${esc(cut(e.texts.join(' '), 200))} »</span>`);
    html += row('Sens qui s’applique', e.from ? `<code>${esc(`dir="${e.from.getAttribute('dir')}"`)}</code> sur <code>&lt;${esc(tagOf(e.from))}&gt;</code>` : 'de gauche à droite (par défaut, aucun dir)');
    html += row('Balisage attendu', `le passage dans un élément avec <code>dir="${e.base === 'ltr' ? 'rtl' : 'ltr'}"</code> (et sa langue avec lang)`);
    return html + critBlocks(e.crit, ['8.10']);
  }
  if (e.kind === 'br') {
    html += row('Élément', `<code>&lt;${esc(tagOf(el))}&gt;</code> « ${esc(cut(textOf(el), 80))} »`);
    html += row('Suites de <br>', `${e.runs} (jusqu’à ${e.max} à la suite)`);
    html += `<p class="note small muted">Le glossaire du RGAA (« Uniquement à des fins de présentation », note 1) : des &lt;br&gt; qui créent visuellement des paragraphes invalident le critère. Des &lt;br&gt; dans une adresse ou un poème sont acceptés.</p>`;
  } else if (e.kind === 'empty') {
    html += row('Balises vides', `${e.els.length} <code>&lt;${esc(e.tag)}&gt;</code> dans <code>&lt;${esc(tagOf(e.parent || el))}&gt;</code>`);
    if (e.pseudo) html += row('Contenu CSS', `<code>${esc(cut(e.pseudo, 60))}</code>`);
    html += `<p class="note small muted">Une balise sémantique vide (titre, paragraphe, liste, emphase…) est restituée par certains lecteurs d’écran (« titre niveau 2 », « vide », « liste de 0 éléments ») sans rien porter : elle est à retirer. L’espacement et les icônes relèvent de la CSS (ou d’une image avec alternative).</p>`;
  } else if (e.kind === 'blockquote') {
    html += row('Texte', `<span class="quote">« ${esc(excerptOf(el))} »</span>`);
    if (el.getAttribute('cite')) html += row('Source (cite)', esc(el.getAttribute('cite')));
    html += `<p class="note small muted">Le glossaire cite le blockquote utilisé pour mettre un paragraphe en retrait comme exemple de balise de présentation.</p>`;
  } else {
    html += row('Balise', `<code>&lt;${esc(e.tag)}&gt;</code> ${src(plural(e.els.length, 'fois', 'fois'))}`);
    html += row('À remplacer par', esc(PRESENTATIONAL[e.tag]));
  }
  return html + critBlocks(e.crit, ['8.9']);
};

/* ---------- Calques sur la page ---------- */

const COLORS = { ok: '#0d47a1', warning: '#8a4b00', error: '#c40000', hidden: '#595959', script: '#6a1b9a', tag: '#00695c', inline: '#4527a0' };
const OVERLAY_CSS = `
:host{all:initial}
.box{position:fixed;z-index:${Number(THEME.zIndex) - 1};pointer-events:none;border:2px solid;border-radius:2px;box-sizing:border-box}
.box--thin{border-width:1px;border-style:dotted}
.box--inline{border-style:solid}
.box--dashed{border-style:dashed}
.tag{position:fixed;z-index:${Number(THEME.zIndex) - 1};pointer-events:none;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
font:700 11px/1.3 ${THEME.font};color:#fff;padding:1px 4px;border-radius:2px}
.tag--small{font-size:10px;padding:0 3px;opacity:.92}
`;
const MAX_BOXES = 2000;

/** Calque : boîtes et étiquettes posées sur des éléments, replacées au défilement. */
/** Position de repli d'un élément sans boîte (display: contents…) : celle de son premier parent qui en a une. */
const emptyRect = (el) => {
  for (let e = up(el); e; e = up(e)) if (e.getClientRects && e.getClientRects().length) return e.getBoundingClientRect();
  return null;
};

const createLayer = (name, specsOf) => {
  const host = document.createElement('div');
  host.setAttribute('data-rgaa-bookmarklet', '');
  host.id = `${ID}-${name}`;
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${OVERLAY_CSS}</style>`;
  const items = specsOf()
    .slice(0, MAX_BOXES)
    .map((s) => {
      const box = document.createElement('div');
      box.className = `box${s.thin ? ' box--thin' : ''}${s.inline ? ' box--inline' : ''}${s.dashed ? ' box--dashed' : ''}`;
      box.style.borderColor = s.color;
      const tag = document.createElement('span');
      tag.className = `tag${s.thin ? ' tag--small' : ''}`;
      tag.style.background = s.color;
      tag.textContent = s.text;
      root.append(box, tag);
      return { s, box, tag };
    });
  let raf = 0;
  const place = () => {
    raf = 0;
    // Lectures d'abord, écritures ensuite (une seule mise en page).
    const pos = items.map(({ s }) => {
      const el = s.el;
      if (!el.isConnected) return null;
      // Balise vide : marquée même sans taille (repère minimal à sa place).
      const empty = s.empty && (!el.getClientRects().length || !el.offsetWidth || !el.offsetHeight);
      if (!empty && !el.getClientRects().length) return null;
      let r = el.getBoundingClientRect();
      if (empty && !el.getClientRects().length) r = emptyRect(el);
      if (!r) return null;
      if (empty) r = { left: r.left, top: r.top, width: Math.max(r.width, 10), height: Math.max(r.height, 10), right: r.left + Math.max(r.width, 10), bottom: r.top + Math.max(r.height, 10) };
      const win = el.ownerDocument.defaultView;
      if (r.bottom < 0 || r.top > win.innerHeight || r.right < 0 || r.left > win.innerWidth) return null;
      if (!empty && !visibleOnScreen(el, r)) return null;
      return { r, xy: toTopCoords(win, r.left, r.top) };
    });
    // Étiquettes : au-dessus des blocs, sous les éléments en ligne, décalées
    // vers la droite quand elles en chevaucheraient une autre (éléments imbriqués).
    const placed = [];
    items.forEach(({ s, box, tag }, i) => {
      const q = pos[i];
      box.hidden = tag.hidden = !q;
      if (!q) return;
      const [x, y] = q.xy;
      Object.assign(box.style, { left: `${x - 2}px`, top: `${y - 2}px`, width: `${q.r.width + 4}px`, height: `${q.r.height + 4}px` });
      const w = Math.min(260, s.text.length * (s.thin ? 6 : 6.8) + 10);
      const h = s.thin ? 14 : 16;
      let lx = Math.max(0, Math.min(x, window.innerWidth - w));
      const ly = s.inline ? y + q.r.height + 1 : Math.max(0, y - h);
      for (let k = 0; k < 20; k++) {
        const hit = placed.find((o) => lx < o.x + o.w && lx + w > o.x && ly < o.y + o.h && ly + h > o.y);
        if (!hit) break;
        lx = hit.x + hit.w + 2;
      }
      placed.push({ x: lx, y: ly, w, h });
      tag.style.left = `${lx}px`;
      tag.style.top = `${ly}px`;
    });
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(place);
  };
  (document.body || document.documentElement).appendChild(host);
  place();
  const docsNow = allDocuments();
  docsNow.forEach((d) => {
    d.addEventListener('scroll', schedule, true);
    d.addEventListener('pointermove', schedule, true);
  });
  window.addEventListener('resize', schedule);
  return {
    remove: () => {
      cancelAnimationFrame(raf);
      host.remove();
      docsNow.forEach((d) => {
        d.removeEventListener('scroll', schedule, true);
        d.removeEventListener('pointermove', schedule, true);
      });
      window.removeEventListener('resize', schedule);
    },
  };
};

const GLYPH = { error: '× ', warning: '', ok: '', hidden: '' };

/** Calque « Langues sur la page » : lang et dir balisés, passages repérés. */
const langSpecs = () => {
  const out = [];
  docs.forEach((d) => {
    const attrs = new Map();
    [...d.langs, ...d.dirs].forEach((e) => {
      if (e.hidden) return;
      if (e.kind === 'lang' || e.kind === 'dirattr') {
        const a = attrs.get(e.el) || { el: e.el, parts: [], status: 'ok' };
        a.parts.push(e.kind === 'lang' ? `${e.r.status === 'error' ? '× ' : ''}${e.code || 'lang=""'}` : `${e.status === 'error' ? '× ' : e.status === 'warning' ? '! ' : ''}${e.value}`);
        if (e.status === 'error' || (e.kind === 'dirattr' && e.status === 'warning')) a.status = e.status === 'error' || a.status === 'error' ? 'error' : 'warning';
        if (e.same) a.same = true;
        attrs.set(e.el, a);
        return;
      }
      out.push({
        el: e.el,
        dashed: true,
        color: e.kind === 'dir' ? COLORS.error : COLORS.script,
        text: e.kind === 'dir' ? `× ${e.scriptLabel} sans dir` : e.kind === 'attr' ? `! ${e.attr} ${scriptName(e.script)} sans lang` : `! ${scriptName(e.script)} sans lang`,
      });
    });
    attrs.forEach((a) => out.push({ el: a.el, color: a.same && a.status === 'ok' ? COLORS.hidden : COLORS[a.status], text: a.parts.join(' · ') }));
  });
  // Un seul cadre par élément : étiquettes réunies, la couleur la plus grave l'emporte.
  const RANK = [COLORS.error, COLORS.script, COLORS.warning, COLORS.ok, COLORS.hidden];
  const byEl = new Map();
  out.forEach((s) => {
    const m = byEl.get(s.el);
    if (!m) return byEl.set(s.el, { ...s });
    m.text = `${m.text} · ${s.text}`;
    m.dashed = m.dashed || s.dashed;
    if (RANK.indexOf(s.color) < RANK.indexOf(m.color)) m.color = s.color;
  });
  return [...byEl.values()];
};

/** Balises sans sémantique ou sans rendu : non étiquetées (div et span le sont s'ils portent un rôle). */
const NOT_SEMANTIC = new Set(['div', 'span', 'br', 'wbr', 'script', 'style', 'template', 'noscript', 'link', 'meta', 'slot', 'source', 'track', 'param', 'option', 'optgroup', 'datalist', 'colgroup', 'col', 'area', 'map', 'head', 'title', 'base']);
const HTML_NS = 'http://www.w3.org/1999/xhtml';

/** Nom affiché d'une balise sémantique (avec son rôle ARIA éventuel), ou '' si elle n'est pas étiquetée. */
const semanticLabel = (el) => {
  const role = (el.getAttribute('role') || '').trim().split(/\s+/)[0];
  if (el.namespaceURI !== HTML_NS) return el.localName === 'svg' || el.localName === 'math' ? `${el.localName}${role ? ` role=${role}` : ''}` : '';
  const t = tagOf(el);
  if (t.includes('-')) return role ? `${t} role=${role}` : '';
  if (NOT_SEMANTIC.has(t)) return role && (t === 'div' || t === 'span') ? `${t} role=${role}` : '';
  return role ? `${t} role=${role}` : t;
};

/** Élément affiché en ligne (strong dans un h3…) : son étiquette va sous lui, d'une autre couleur. */
const inlineEl = (el) => /^inline/.test(styleOf(el).display);

/**
 * Calque « Balises sur la page » : nom de chaque balise sémantique (toutes
 * sauf div et span sans rôle), et constats 8.9. Les éléments en bloc ont leur
 * étiquette au-dessus, les éléments en ligne en dessous, d'une autre couleur,
 * pour qu'un strong dans un h3 ne se confonde pas avec le h3.
 */
const tagSpecs = () => {
  const out = [];
  const flagged = new Map();
  docs.forEach((d) =>
    d.tags.forEach((e) =>
      e.els.forEach((el) => flagged.set(el, e.kind === 'br' ? `! ${e.max} br` : e.kind === 'empty' ? `! ${e.tag} vide` : `! ${e.kind === 'blockquote' ? 'blockquote' : e.tag}`)),
    ),
  );
  allDocuments().forEach((doc) => {
    const visit = (root) =>
      root.querySelectorAll('*').forEach((el) => {
        if (el.shadowRoot && !isOwn(el)) visit(el.shadowRoot);
        if (out.length >= MAX_BOXES || isOwn(el) || (el.namespaceURI !== HTML_NS && el.closest('svg,math') !== el)) return;
        const warn = flagged.get(el);
        const label = warn || semanticLabel(el);
        const empty = !!warn && / vide$/.test(warn);
        if (!label || (!empty && !el.getClientRects().length)) return;
        const inline = inlineEl(el);
        out.push({ el, thin: true, inline, empty, dashed: !!warn, color: warn ? COLORS.warning : inline ? COLORS.inline : COLORS.tag, text: label });
      });
    if (doc.body) visit(doc.body);
  });
  return out;
};

const layers = { langues: null, balises: null };
const SPECS = { langues: langSpecs, balises: tagSpecs };
let mos = [];
let refreshTimer = null;

const scheduleRefresh = () => {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    if (ui) ui.refresh();
  }, 300);
};

const watch = (on) => {
  mos.forEach((m) => m.disconnect());
  mos = [];
  if (!on) return;
  mos = allDocuments().map((d) => {
    const o = new MutationObserver((l) => l.some(pageMutation) && scheduleRefresh());
    o.observe(d.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true, attributeFilter: ['lang', 'xml:lang', 'dir', 'hidden', 'style', 'class'] });
    return o;
  });
};

const setLayer = (name, on) => {
  if (layers[name]) layers[name].remove();
  layers[name] = on ? createLayer(name, SPECS[name]) : null;
  watch(layers.langues || layers.balises);
};

/** Recrée les calques affichés (après un nouveau calcul). */
const redrawLayers = () => Object.keys(layers).forEach((k) => layers[k] && setLayer(k, true));

/* ---------- Lancement ---------- */

const DETAIL_CSS = `${CRIT_CSS}
code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.95em;word-break:break-all}
.sep{border:0;border-top:2px solid var(--rgaa-sep);margin:10px 0}
`;
const LIST_CSS = `
.item > span:last-child{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 6px}
.lvl{font-weight:700;color:var(--rgaa-focus);min-width:2em}
.pills{order:3;flex-basis:100%;display:flex;flex-wrap:wrap;gap:3px;margin-top:2px}
.pill{font-size:var(--rgaa-fs-sm);border:1px solid currentColor;border-radius:3px;padding:0 3px;white-space:nowrap}
.pill--error{color:var(--rgaa-error)}
.pill--warning{color:var(--rgaa-warning)}
.pill--ok{color:var(--rgaa-ok)}
.pill--hidden{color:var(--rgaa-muted)}
`;

const keyOk = (e) => {
  const tag = e.target && e.target.tagName;
  return e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !e.target.isContentEditable;
};

const ui = inspector({
  id: ID,
  css: DETAIL_CSS,
  maxWidth: 480,
  pinOnLocate: true,
  list: {
    title: 'Langues et balises',
    toolsOnTop: true,
    css: LIST_CSS,
    collect() {
      const r = collect();
      redrawLayers();
      return r;
    },
    filters: [...STATUS_FILTERS, { id: 'langues', label: 'Langues' }, { id: 'sens', label: 'Sens' }, { id: 'balises', label: 'Balises' }],
    beforeLocate: (el, it) => {
      chosen = it && it.entry && it.entry.kind === 'page' ? it.entry : null;
    },
    tools: [
      { label: 'Langues sur la page', pressed: () => !!layers.langues, toggle: () => setLayer('langues', !layers.langues) },
      { label: 'Balises sur la page', pressed: () => !!layers.balises, toggle: () => setLayer('balises', !layers.balises) },
    ],
    footer:
      'Langues : attributs lang (8.8) et textes dans un autre alphabet sans lang (8.7). Sens de lecture : attributs dir et textes de sens différent sans dir (8.10). ' +
      'Balises de présentation (8.9) : &lt;br&gt; à la suite, paragraphes vides, blockquote, balises obsolètes. ' +
      'Langues sur la page (affiché au lancement, Maj+E). Balises sur la page (Maj+B) : toutes les balises sémantiques, étiquette au-dessus d’un bloc, en dessous d’un élément en ligne.',
  },
  onKey(e) {
    if (!keyOk(e)) return false;
    const k = e.key.toLowerCase();
    if (k === 'e') setLayer('langues', !layers.langues);
    else if (k === 'b') setLayer('balises', !layers.balises);
    else return false;
    return true;
  },
  onStop: () => {
    clearTimeout(refreshTimer);
    Object.keys(layers).forEach((k) => setLayer(k, false));
    watch(false);
  },
  inspect(target) {
    if (chosen && target === chosen.el) {
      const fresh = entries.find((x) => x.kind === 'page' && x.doc === chosen.doc) || chosen;
      chosen = fresh;
      return { html: detailOf(fresh), highlight: [] };
    }
    for (let el = target; el; el = up(el)) {
      const list = (byEl.get(el) || []).filter((e) => e.kind !== 'page');
      if (list.length) {
        const hl = [[el, 'primary']];
        list.forEach((e) => e.els.forEach((x) => x !== el && hl.push([x, 'secondary'])));
        return { html: list.map(detailOf).join('<hr class="sep">'), highlight: hl };
      }
    }
    return null;
  },
});

// Les langues sont affichées sur la page dès le lancement.
if (ui) {
  setLayer('langues', true);
  ui.redraw();
}
