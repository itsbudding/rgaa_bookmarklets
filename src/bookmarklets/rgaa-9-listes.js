/**
 * RGAA 9 – Listes : inventaire et structure des listes de la page (critère 9.3).
 *
 * Le panneau liste montre chaque liste dans l'ordre du document, les listes
 * imbriquées en retrait sous leur parente. Une pastille par test :
 *  - 9.3.1 liste non ordonnée (ul, menu, role="list") ;
 *  - 9.3.2 liste ordonnée (ol, role="list") ;
 *  - 9.3.3 liste de description (dl).
 * Les verdicts ne viennent que du code : enfant interdit (×), élément de
 * liste hors liste (×), dt sans dd (×), aria-posinset invalide (×), rôle de
 * liste retiré, liste d'un seul élément, ul numérotée dans le texte (!).
 * Une liste bien codée est conforme.
 *
 * Hors liste (toujours « à vérifier ») :
 *  - lignes à puces écrites à la main : au moins deux lignes qui se suivent
 *    et commencent par le même marqueur écrit (•, -, *…) ou par une
 *    numérotation qui se suit (1. 2.), ou une puce CSS ::before ;
 *  - liens d'une nav (ou role="navigation") qui ne sont dans aucune liste.
 * Les autres suites visuelles (cartes, menus en div hors nav) restent à
 * repérer à l'œil avec le calque « Listes sur la page ».
 *
 * Outils : Listes sur la page (Maj+U), Afficher les listes cachées.
 */
import { inspector } from '../lib/floating-panel.js';
import { row, esc, src, icon, flag } from '../lib/dom.js';
import { isNotExposed, toTopCoords, allDocuments, textOf } from '../lib/a11y.js';
import { THEME } from '../lib/theme.js';
import { nameOf, clean, styleOf, pseudoText } from '../lib/name.js';
import { pills, critBlocks, lineStatus, fromChecks, CRIT_CSS } from '../lib/criteria.js';
import { visibleOnScreen, pageMutation, createRevealer } from '../lib/live.js';

const ID = 'rgaa-9-listes';
const OWN = '[data-rgaa-bookmarklet]';

const tagOf = (e) => e.tagName.toLowerCase();
const roleOf = (e) => (e.getAttribute('role') || '').trim().split(/\s+/)[0].toLowerCase();
const plural = (n, s, p = `${s}s`) => `${n} ${n > 1 ? p : s}`;
const cut = (t, n = 120) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const parentOf = (e) => e.parentElement || (e.parentNode && e.parentNode.host) || null;

const NATIVE = new Set(['UL', 'OL', 'MENU']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'HEAD', 'IFRAME', 'FRAME', 'OBJECT', 'svg', 'SVG', 'math', 'MATH']);
/** Contenus où des lignes « - » ou « 1. » ne sont pas une liste. */
const NO_HAND = new Set(['PRE', 'CODE', 'TEXTAREA', 'SELECT', 'OPTION', 'KBD', 'SAMP', 'BUTTON']);
const IGNORED_CHILD = new Set(['SCRIPT', 'TEMPLATE', 'STYLE']);
const PRESENTATION = new Set(['presentation', 'none']);
const generic = (e) => (e.tagName === 'DIV' || e.tagName === 'SPAN') && !roleOf(e);

/** Clé de pastille selon le type de liste. */
const KEYS = { ul: ['9.3.1'], menu: ['9.3.1'], ol: ['9.3.2'], dl: ['9.3.3'], aria: ['9.3.1', '9.3.2'] };
const KEY_ORDER = ['9.3.1', '9.3.2', '9.3.3'];

/** Élément parent d'une liste au sens du code (ul, ol, menu ou role="list"). */
const isListParent = (p) => !!p && (NATIVE.has(p.tagName) || roleOf(p) === 'list');

/* ---------- Marqueurs écrits à la main ---------- */

const SYMBOL = /^([•·◦▪▫■□►▶▸‣⁃✓✔→➤])\s*(?=\S)/u;
const DASH = /^([-–—*>+])\s+(?=\S)/;
const NUM = /^(\d{1,3})[.)]\s+(?=\S)/;
const LETTER = /^([a-z])[.)]\s+(?=\S)/i;
const ROMAN = /^(i{1,3}|iv|vi{0,3}|ix|x)[.)]\s+(?=\S)/i;
const ROMANS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];

/** Marqueurs possibles en tête d'un texte : [{ seq, key, n }]. */
const markersOf = (text, css) => {
  const t = text.replace(/^\s+/, '');
  const out = [];
  if (css) out.push({ seq: 'bullet', key: css, css: true });
  let m = t.match(SYMBOL) || t.match(DASH);
  if (m) out.push({ seq: 'bullet', key: m[1] });
  if ((m = t.match(NUM))) out.push({ seq: 'num', n: Number(m[1]), key: `${m[1]}${t[m[1].length]}` });
  if ((m = t.match(ROMAN))) out.push({ seq: 'roman', n: ROMANS.indexOf(m[1].toLowerCase()) + 1, key: m[0].trim() });
  if ((m = t.match(LETTER))) out.push({ seq: 'letter', n: m[1].toLowerCase().charCodeAt(0) - 96, key: m[0].trim() });
  return out;
};

/** Le marqueur courant continue-t-il la série ? Renvoie les possibilités qui continuent. */
const follows = (prev, cur) =>
  cur.filter((c) => prev.some((p) => p.seq === c.seq && (c.seq === 'bullet' ? c.key === p.key : c.n === p.n + 1)));

/**
 * Séries d'au moins deux lignes qui se suivent avec le même marqueur (ou une
 * numérotation qui se suit). lines : [{ text, css, el? }].
 */
const runsOf = (lines) => {
  const runs = [];
  let run = null;
  let poss = [];
  lines.forEach((l, i) => {
    const cur = l ? markersOf(l.text, l.css) : [];
    const next = run ? follows(poss, cur) : [];
    if (run && next.length) {
      run.lines.push(l);
      poss = next;
      run.seq = next;
      return;
    }
    if (run && run.lines.length >= 2) runs.push(run);
    run = cur.length ? { lines: [l], first: i } : null;
    poss = cur;
    if (run) run.seq = cur;
  });
  if (run && run.lines.length >= 2) runs.push(run);
  return runs.map((r) => {
    const kind = r.seq.find((s) => s.seq !== 'bullet') && !r.seq.some((s) => s.seq === 'bullet') ? 'ordered' : 'bullet';
    return { lines: r.lines, kind, marker: r.seq[0].key, css: !!r.seq[0].css };
  });
};

/** Puce dessinée en CSS (::before), si c'est un seul symbole de liste. */
const cssBullet = (el) => {
  const t = pseudoText(el, '::before');
  return t && /^[•·◦▪▫■□►▶▸‣⁃✓✔→➤\-–—*>+]$/u.test(t.trim()) ? t.trim() : '';
};

const BLOCKY = 'p,div,ul,ol,li,dl,table,section,article,h1,h2,h3,h4,h5,h6,br,nav,form';
const LINE_TAGS = new Set(['P', 'DIV', 'SPAN', 'A']);

/** Lignes à puces faites de blocs frères (<p>• …</p><p>• …</p>). */
const siblingRuns = (parent) => {
  const lines = [...parent.children].map((k) => {
    if (!LINE_TAGS.has(k.tagName) || k.matches(OWN) || k.querySelector(BLOCKY)) return null;
    const text = clean(k.textContent).slice(0, 12);
    const css = cssBullet(k);
    if (!text && !css) return null;
    return { text, css, el: k };
  });
  return runsOf(lines).filter((r) => r.lines.every((l) => l.el.getClientRects().length && !isNotExposed(l.el)));
};

/** Lignes à puces séparées par <br> dans un même bloc. */
const brRuns = (block) => {
  if (![...block.children].some((c) => c.tagName === 'BR')) return [];
  const lines = [];
  let buf = '';
  block.childNodes.forEach((n) => {
    if (n.nodeType === 1 && n.tagName === 'BR') {
      lines.push(buf);
      buf = '';
    } else if (n.nodeType === 1 || n.nodeType === 3) buf += n.textContent;
  });
  lines.push(buf);
  return runsOf(lines.map((t) => (clean(t) ? { text: clean(t), css: '' } : null)));
};

/* ---------- Analyse d'une liste ---------- */

const issueCounter = () => {
  const m = new Map();
  return {
    add: (type, text, el) => {
      const k = `${type}|${text}`;
      const v = m.get(k) || { type, text, n: 0, els: [] };
      v.n++;
      if (el) v.els.push(el);
      m.set(k, v);
    },
    list: () => [...m.values()],
  };
};

/** Texte d'un élément de liste, sans celui de ses sous-listes. */
const itemText = (el) => {
  if (!el.querySelector('ul,ol,menu,dl,[role="list"]')) return cut(clean(textOf(el)), 60);
  const parts = [];
  const go = (n) =>
    n.childNodes.forEach((c) => {
      if (c.nodeType === 3) parts.push(c.textContent);
      else if (c.nodeType === 1 && !(NATIVE.has(c.tagName) || c.tagName === 'DL' || roleOf(c) === 'list') && !SKIP.has(c.tagName)) go(c);
    });
  go(el);
  return cut(clean(parts.join(' ')), 60);
};

/** Vérifie aria-setsize / aria-posinset sur les éléments. */
const setsizeChecks = (items, add) => {
  const vals = items.map((it) => ({ it, pos: it.el.getAttribute('aria-posinset'), size: it.el.getAttribute('aria-setsize') }));
  const used = vals.filter((v) => v.pos !== null || v.size !== null);
  if (!used.length) return null;
  used.forEach(({ it, pos, size }) => {
    const p = pos === null ? null : pos.trim();
    const s = size === null ? null : size.trim();
    if (p !== null && !(/^\d+$/.test(p) && Number(p) >= 1)) add('error', `aria-posinset="${pos}" invalide (entier de 1 ou plus attendu)`, it.el);
    if (s !== null && !(/^\d+$/.test(s) && Number(s) >= 1) && s !== '-1') add('error', `aria-setsize="${size}" invalide (entier de 1 ou plus, ou -1)`, it.el);
    if (p !== null && s !== null && /^\d+$/.test(p) && /^\d+$/.test(s) && Number(p) > Number(s)) add('error', `aria-posinset="${p}" supérieur à aria-setsize="${s}"`, it.el);
  });
  const sizes = used.map((v) => v.size).filter((s) => s !== null && /^\d+$/.test(s.trim()));
  const max = sizes.length ? Math.max(...sizes.map(Number)) : null;
  if (max !== null && max < items.length) add('error', `aria-setsize="${max}" inférieur au nombre d’éléments présents (${items.length})`);
  return max !== null ? `aria-setsize="${max}"${max > items.length ? ` (${items.length} présents dans la page)` : ''}` : 'aria-posinset seul';
};

/** ul / ol / menu / role="list" : enfants, rôles, numérotation. */
const analyseList = (e) => {
  const el = e.el;
  const issues = issueCounter();
  const items = [];
  let masked = 0;
  const aria = e.type === 'list*';
  const addItem = (k) => items.push({ el: k, tag: tagOf(k), text: itemText(k) });
  const childText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  if (childText) issues.add('error', 'Texte directement dans la liste, hors d’un élément de liste');
  [...el.children].forEach((k) => {
    if (IGNORED_CHILD.has(k.tagName) || k.matches(OWN)) return;
    if (isNotExposed(k)) {
      masked++;
      return;
    }
    const r = roleOf(k);
    if (r === 'listitem' || (k.tagName === 'LI' && !r)) return addItem(k);
    if (k.tagName === 'LI' && PRESENTATION.has(r)) {
      issues.add('error', `Élément retiré de la liste (li role="${r}")`, k);
      return items.push({ el: k, tag: tagOf(k), text: itemText(k), issue: `role="${r}" : retiré de la liste` });
    }
    if (k.tagName === 'LI') {
      issues.add('error', `li role="${r}" : n’est plus un élément de liste`, k);
      return items.push({ el: k, tag: tagOf(k), text: itemText(k), issue: `role="${r}"` });
    }
    if (aria && generic(k) && [...k.children].some((c) => roleOf(c) === 'listitem' || c.tagName === 'LI')) {
      issues.add('warning', `Élément <${tagOf(k)}> sans rôle entre la liste et ses éléments : restitution variable selon les navigateurs`, k);
      [...k.children].filter((c) => roleOf(c) === 'listitem' || c.tagName === 'LI').forEach(addItem);
      return;
    }
    const nested = NATIVE.has(k.tagName) || roleOf(k) === 'list';
    const msg = nested
      ? 'Liste imbriquée directement dans la liste, hors d’un élément de liste'
      : aria
        ? `Enfant <${tagOf(k)}> sans role="listitem" : non restitué comme élément de liste`
        : `Enfant <${tagOf(k)}> : non restitué comme élément de liste (li attendu)`;
    issues.add('error', msg, k);
    items.push({ el: k, tag: tagOf(k) + (r ? ` role="${r}"` : ''), text: itemText(k), issue: nested ? 'liste hors li' : 'pas un élément de liste' });
  });
  const valid = items.filter((it) => !it.issue);
  e.setsize = setsizeChecks(valid, issues.add);
  e.items = items;
  e.count = valid.length;
  e.masked = masked;
  if (valid.length === 1 && items.length === 1 && !e.setsize) issues.add('warning', 'Un seul élément : est-ce vraiment une liste ?');
  // ul numérotée dans le texte : liste ordonnée attendue ?
  let numbered = false;
  if (e.type !== 'ol' && valid.length >= 2) {
    const runs = runsOf(valid.map((it) => ({ text: clean(it.el.textContent).slice(0, 12), css: '' })));
    numbered = runs.some((r) => r.kind === 'ordered' && r.lines.length === valid.length);
  }
  const x = issues.list().map((i) => [i.type, i.n > 1 ? `${i.text} (×${i.n})` : i.text]);
  e.issueEls = issues.list().flatMap((i) => i.els);
  const res = fromChecks(x, { ok: e.type === 'list*' ? 'Structure correcte (role="list" et role="listitem")' : `Structure correcte (${e.type} et li)` });
  e.crit = {};
  KEYS[e.kindKey].forEach((k) => (e.crit[k] = res));
  if (numbered) {
    e.crit['9.3.2'] = { status: 'warning', text: 'Éléments numérotés dans le texte : liste ordonnée (ol) attendue ?', extra: [] };
  }
  if (!valid.length && !x.length) e.empty = true;
};

/** dl : dt, dd, div de groupe. */
const analyseDl = (e) => {
  const issues = issueCounter();
  const seq = [];
  const pairs = [];
  let hasDiv = false;
  let hasBare = false;
  let masked = 0;
  const token = (k) => {
    seq.push({ t: k.tagName === 'DT' ? 'dt' : 'dd', el: k });
  };
  [...e.el.children].forEach((k) => {
    if (IGNORED_CHILD.has(k.tagName) || k.matches(OWN)) return;
    if (isNotExposed(k)) {
      masked++;
      return;
    }
    if (k.tagName === 'DT' || k.tagName === 'DD') {
      hasBare = true;
      return token(k);
    }
    if (k.tagName === 'DIV' && !roleOf(k)) {
      hasDiv = true;
      const kids = [...k.children].filter((c) => !IGNORED_CHILD.has(c.tagName) && !isNotExposed(c));
      const pattern = kids.map((c) => (c.tagName === 'DT' ? 't' : c.tagName === 'DD' ? 'd' : 'x')).join('');
      if (!/^t+d+$/.test(pattern)) issues.add('error', 'Groupe <div> mal formé (un ou plusieurs dt, puis un ou plusieurs dd attendus)', k);
      kids.filter((c) => c.tagName === 'DT' || c.tagName === 'DD').forEach(token);
      return;
    }
    issues.add('error', `Enfant <${tagOf(k)}> interdit dans une liste de description (dt, dd ou div attendus)`, k);
    pairs.push({ el: k, tag: tagOf(k), text: itemText(k), issue: 'interdit dans dl' });
  });
  if (hasDiv && hasBare) issues.add('warning', 'Mélange de groupes <div> et de dt/dd directs dans la même liste');
  seq.forEach((s, i) => {
    if (s.t === 'dd' && (i === 0 || !seq.slice(0, i).some((p) => p.t === 'dt'))) issues.add('error', 'Description (dd) sans terme (dt) avant elle', s.el);
    if (s.t === 'dt' && (!seq[i + 1] || (seq[i + 1].t !== 'dt' && seq[i + 1].t !== 'dd'))) issues.add('error', 'Terme (dt) sans description (dd) après lui', s.el);
  });
  seq.forEach((s) => pairs.push({ el: s.el, tag: s.t, text: itemText(s.el) }));
  e.items = pairs;
  e.terms = seq.filter((s) => s.t === 'dt').length;
  e.descs = seq.filter((s) => s.t === 'dd').length;
  e.count = seq.length;
  e.masked = masked;
  const x = issues.list().map((i) => [i.type, i.n > 1 ? `${i.text} (×${i.n})` : i.text]);
  e.issueEls = issues.list().flatMap((i) => i.els);
  e.crit = { '9.3.3': fromChecks(x, { ok: 'Structure correcte (dl, dt et dd)' }) };
  if (!seq.length && !x.length) e.empty = true;
};

/* ---------- Inventaire ---------- */

let docs = [];
let entries = [];
let byEl = new Map();
const rv = createRevealer();

const nameText = (el) => {
  const n = nameOf(el, { fromContent: false });
  return n.name && ['aria-labelledby', 'aria-label'].includes(n.s) ? n.name : '';
};

/** Région qui contient la liste (nav, en-tête, pied de page…) et son nom. */
const REGIONS = [
  ['nav,[role="navigation"]', 'navigation'],
  ['header,[role="banner"]', 'en-tête'],
  ['footer,[role="contentinfo"]', 'pied de page'],
  ['aside,[role="complementary"]', 'contenu complémentaire'],
  ['form,[role="search"]', 'formulaire'],
  ['main,[role="main"]', 'contenu principal'],
];
const regionOf = (el) => {
  for (const [sel, label] of REGIONS) {
    const r = el.parentElement && el.parentElement.closest(sel);
    if (r) {
      const n = nameText(r);
      return { el: r, text: `${label}${n ? ` « ${cut(n, 40)} »` : ''}`, nav: label === 'navigation' };
    }
  }
  return null;
};

/** Type d'une liste et ses particularités (rôle retiré, remplacé, redondant). */
const listInfo = (el) => {
  const tag = el.tagName;
  const r = roleOf(el);
  const native = NATIVE.has(tag) || tag === 'DL';
  const info = { type: native ? tagOf(el) : 'list*', kindKey: native ? tagOf(el) : 'aria', role: r };
  if (!native) info.source = 'role="list"';
  else if (r === 'list' && tag !== 'DL') info.source = 'role="list" redondant (accepté)';
  else if (r === 'list' && tag === 'DL') info.replacedDl = true;
  else if (PRESENTATION.has(r)) info.removed = `role="${r}"`;
  else if (r) info.component = `role="${r}"`;
  if (tag === 'OL') {
    const extra = [el.hasAttribute('start') && `start="${el.getAttribute('start')}"`, el.hasAttribute('reversed') && 'reversed', el.getAttribute('type') && `type="${el.getAttribute('type')}"`].filter(Boolean);
    info.source = ['liste ordonnée', ...extra].join(', ');
  } else if (tag === 'UL' && !info.source) info.source = 'liste non ordonnée';
  else if (tag === 'MENU' && !info.source) info.source = 'équivalent de ul';
  else if (tag === 'DL' && !info.source) info.source = 'liste de description';
  return info;
};

const analyseEntry = (el, depth, doc) => {
  const info = listInfo(el);
  const e = { kind: 'list', el, els: [el], doc, depth, ...info, crit: {}, items: [], count: 0 };
  e.name = nameText(el);
  e.region = regionOf(el);
  e.hidden = isNotExposed(el);
  if (info.component) {
    e.status = 'hidden';
    return e;
  }
  if (info.removed) {
    const kids = [...el.children].filter((k) => !IGNORED_CHILD.has(k.tagName));
    e.items = kids.map((k) => ({ el: k, tag: tagOf(k), text: itemText(k) }));
    e.count = kids.length;
    KEYS[e.kindKey].forEach(
      (k) =>
        (e.crit[k] = {
          status: 'warning',
          text: `Rôle de liste retiré (${info.removed}) : la liste n’est plus restituée ; non conforme si ces éléments sont présentés comme une liste`,
          extra: [],
        }),
    );
  } else if (info.replacedDl) {
    analyseDl(e);
    e.crit['9.3.3'] = {
      status: 'warning',
      text: 'role="list" remplace la liste de description : dt et dd ne sont plus restitués comme termes et descriptions',
      extra: [],
    };
  } else if (el.tagName === 'DL') analyseDl(e);
  else analyseList(e);
  if (e.hidden) e.status = 'hidden';
  else if (e.empty) e.status = 'hidden';
  else e.status = lineStatus(e.crit);
  return e;
};

/** Élément de liste orphelin (li, listitem, dt, dd hors de leur liste), ou ''. */
const orphanType = (c) => {
  const p = parentOf(c);
  const r = roleOf(c);
  if (c.tagName === 'LI' && (!r || r === 'listitem')) {
    if (isListParent(p)) return '';
    // role="list" > div > li : toléré (signalé « à vérifier » sur la liste).
    let q = p;
    for (let i = 0; i < 3 && q && generic(q); i++) q = parentOf(q);
    return q && roleOf(q) === 'list' && q !== p ? '' : 'li';
  }
  if (r === 'listitem') {
    // Un élément sans rôle (div) entre la liste et l'élément est toléré.
    let q = p;
    for (let i = 0; i < 3 && q && generic(q); i++) q = parentOf(q);
    return isListParent(q) || isListParent(p) ? '' : 'listitem';
  }
  if ((c.tagName === 'DT' || c.tagName === 'DD') && !r) {
    if (p && p.tagName === 'DL') return '';
    if (p && p.tagName === 'DIV' && parentOf(p) && parentOf(p).tagName === 'DL') return '';
    return 'dt/dd';
  }
  return '';
};

const ORPHAN = {
  li: { keys: ['9.3.1', '9.3.2'], text: (n) => `${n > 1 ? `${n} li` : 'li'} hors de ul, ol ou menu : non restitué${n > 1 ? 's' : ''} comme élément${n > 1 ? 's' : ''} de liste` },
  listitem: { keys: ['9.3.1', '9.3.2'], text: (n) => `${n > 1 ? `${n} éléments` : 'Élément'} role="listitem" hors d’un role="list"` },
  'dt/dd': { keys: ['9.3.3'], text: (n) => `${n > 1 ? `${n} dt/dd` : 'dt ou dd'} hors d’une dl : non restitué${n > 1 ? 's' : ''} comme liste de description` },
};

const walkDoc = (doc) => {
  const lists = [];
  const hand = [];
  const navs = [];
  const visit = (root, depth, noHand) => {
    for (const c of root.children) {
      if (c.matches(OWN) || SKIP.has(c.tagName)) continue;
      let d = depth;
      const isList = NATIVE.has(c.tagName) || c.tagName === 'DL' || roleOf(c) === 'list';
      if (isList) {
        lists.push(analyseEntry(c, depth, doc));
        d = depth + 1;
      } else {
        const o = orphanType(c);
        if (o && !isNotExposed(c)) {
          const last = lists[lists.length - 1];
          if (last && last.kind === 'orphan' && last.otype === o && last.parent === parentOf(c)) last.els.push(c);
          else lists.push({ kind: 'orphan', otype: o, el: c, els: [c], parent: parentOf(c), doc, depth });
        }
      }
      if (c.tagName === 'NAV' || roleOf(c) === 'navigation') navs.push(c);
      const nh = noHand || NO_HAND.has(c.tagName) || c.isContentEditable;
      if (!nh && !isNotExposed(c)) {
        siblingRuns(c).forEach((r) => hand.push({ ...r, parent: c, doc }));
        if (!isList && c.tagName !== 'LI') brRuns(c).forEach((r) => hand.push({ ...r, block: c, doc }));
      }
      if (c.shadowRoot) visit(c.shadowRoot, d, nh);
      visit(c, d, nh);
    }
  };
  if (doc.body) visit(doc.body, 0, false);
  return { lists, hand, navs };
};

const finishOrphan = (o) => {
  const t = ORPHAN[o.otype];
  const res = { status: 'error', text: t.text(o.els.length), extra: [] };
  o.crit = {};
  t.keys.forEach((k) => (o.crit[k] = res));
  o.status = 'error';
  o.type = o.otype;
  o.items = o.els.map((el) => ({ el, tag: tagOf(el), text: itemText(el) }));
  o.region = regionOf(o.el);
};

const finishHand = (h) => {
  const n = h.lines.length;
  const key = h.kind === 'ordered' ? '9.3.2' : '9.3.1';
  const how = h.css ? `puce CSS ::before « ${h.marker} »` : h.kind === 'ordered' ? `numérotées (${h.lines[0].text.match(/^\S+/)[0]} …)` : `« ${h.marker} »`;
  h.kind = 'hand';
  h.ordered = key === '9.3.2';
  h.how = how;
  h.els = h.block ? [h.block] : h.lines.map((l) => l.el);
  h.el = h.els[0];
  h.texts = h.lines.map((l) => l.text);
  if (!h.block) h.texts = h.lines.map((l) => itemText(l.el));
  else {
    const all = [];
    let buf = '';
    h.block.childNodes.forEach((nd) => {
      if (nd.nodeType === 1 && nd.tagName === 'BR') {
        all.push(clean(buf));
        buf = '';
      } else if (nd.nodeType === 1 || nd.nodeType === 3) buf += nd.textContent;
    });
    all.push(clean(buf));
    h.texts = all.filter((t) => h.lines.some((l) => t.startsWith(l.text.slice(0, 8)))).map((t) => cut(t, 60));
  }
  h.crit = {
    [key]: {
      status: 'warning',
      text: `${n} lignes ${h.ordered ? 'numérotées' : 'à puces'} hors liste${h.block ? ' (séparées par <br>)' : ''} : liste ${h.ordered ? 'ordonnée (ol)' : 'non ordonnée (ul)'} attendue ?`,
      extra: [],
    },
  };
  h.status = 'warning';
  h.region = regionOf(h.el);
};

const navEntry = (nav, doc) => {
  if (isNotExposed(nav)) return null;
  const links = [...nav.querySelectorAll('a[href],[role="link"]')].filter((a) => {
    if (a.closest('nav,[role="navigation"]') !== nav || isNotExposed(a)) return false;
    const li = a.closest('li,[role="listitem"],dt,dd');
    return !(li && nav.contains(li));
  });
  if (links.length < 2) return null;
  const name = nameText(nav);
  return {
    kind: 'nav',
    el: nav,
    els: links,
    doc,
    name,
    texts: links.map((a) => itemText(a) || '(lien sans texte)'),
    status: 'warning',
    crit: { '9.3.1': { status: 'warning', text: `${links.length} liens de navigation hors liste : menu à structurer en liste (ul) ?`, extra: [] } },
  };
};

const docLabel = (doc) => {
  const f = doc.defaultView && doc.defaultView.frameElement;
  if (!f) return '';
  const t = clean(f.getAttribute('title') || f.getAttribute('aria-label') || '');
  return t ? `Iframe « ${cut(t, 50)} »` : `Iframe sans titre (${cut(clean(f.getAttribute('src') || 'srcdoc'), 40)})`;
};

const analyseDoc = (doc, label) => {
  const { lists, hand, navs } = walkDoc(doc);
  lists.filter((o) => o.kind === 'orphan').forEach(finishOrphan);
  hand.forEach(finishHand);
  // Une série de lignes déjà comptée dans une plus grande (même bloc) n'est pas répétée.
  const outside = [...hand, ...navs.map((n) => navEntry(n, doc)).filter(Boolean)];
  const shown = lists.filter((e) => e.status !== 'hidden');
  const out = lists.filter((e) => e.status === 'hidden');
  return { doc, label, shown, out, outside };
};

const typeTag = (e) => `<span class="lvl">${esc(e.type)}</span>`;
const keysOf = (e) => KEY_ORDER.filter((k) => e.crit[k]);
const pillsOf = (e) => pills(e.crit, keysOf(e));

const countText = (e) => {
  if (e.type === 'dl' && !e.removed) return `${plural(e.terms || 0, 'terme')} / ${plural(e.descs || 0, 'description')}`;
  return plural(e.count, 'élément');
};

const listLabel = (e) => {
  if (e.name) return `« ${e.name} »`;
  const first = e.items.filter((it) => !it.issue && it.text).slice(0, 2).map((it) => it.text);
  if (first.length) return `« ${first.join(', ')}${e.items.length > 2 ? '…' : ''} »`;
  const t = clean(e.el.textContent);
  return t ? `« ${cut(t, 50)} »` : '(sans texte)';
};

const filterOf = (s) => [...(s === 'error' ? ['erreurs'] : []), ...(['error', 'warning'].includes(s) ? ['verifier'] : [])];

const collect = () => {
  docs = allDocuments().map((doc, i) => analyseDoc(doc, i ? docLabel(doc) : ''));
  entries = docs.flatMap((d) => [...d.shown, ...d.outside, ...d.out]);
  byEl = new Map();
  entries.forEach((e) => {
    if (e.kind === 'list' || e.kind === 'nav') byEl.set(e.el, e);
    else e.els.forEach((el) => !byEl.has(el) && byEl.set(el, e));
  });
  // Les listes priment sur la navigation qui les contient.
  entries.filter((e) => e.kind === 'list').forEach((e) => byEl.set(e.el, e));
  const items = [];
  docs.forEach((d, i) => {
    if (i && !d.shown.length && !d.outside.length && !d.out.length) return;
    if (i) items.push({ section: true, label: `${d.label} : ${plural(d.shown.filter((e) => e.kind === 'list').length, 'liste')}` });
    d.shown.forEach((e) => {
      if (e.kind === 'orphan') {
        items.push({
          el: e.el,
          els: e.els,
          status: 'error',
          indent: e.depth,
          prefix: typeTag(e) + pillsOf(e),
          label: `hors liste « ${e.items.map((it) => it.text).filter(Boolean).slice(0, 2).join(', ')} »`,
          meta: plural(e.els.length, 'élément'),
          filter: filterOf('error'),
        });
        return;
      }
      items.push({
        el: e.el,
        status: e.status,
        indent: e.depth,
        prefix: typeTag(e) + pillsOf(e),
        label: listLabel(e),
        meta: [countText(e), e.region && e.region.nav ? e.region.text : '', e.removed ? `rôle retiré (${e.removed})` : '', rv.revealed.has(e.el) ? 'affichée par le bookmarklet' : '']
          .filter(Boolean)
          .join(' · '),
        filter: filterOf(e.status),
      });
    });
    if (d.outside.length) {
      items.push({ section: true, label: `Hors liste : ${plural(d.outside.length, 'passage')} à vérifier` });
      d.outside.forEach((e) =>
        items.push({
          el: e.el,
          status: 'warning',
          prefix: `<span class="lvl">${e.kind === 'nav' ? 'nav' : '¶'}</span>${pillsOf(e)}`,
          label: e.kind === 'nav' ? `${e.name ? `« ${e.name} » : ` : ''}« ${e.texts.slice(0, 2).join(', ')}… »` : `« ${e.texts[0] || ''} »`,
          meta: e.kind === 'nav' ? plural(e.els.length, 'lien') + ' hors liste' : `${e.texts.length} lignes ${e.how}`,
          filter: filterOf('warning'),
        }),
      );
    }
  });
  // Masquées, vides, composants : en fin de liste.
  docs.forEach((d) =>
    d.out.forEach((e) =>
      items.push({
        el: e.el,
        status: 'hidden',
        prefix: typeTag(e),
        label: listLabel(e),
        meta: e.component ? `rôle remplacé (${e.component}) : composant, voir RGAA 7` : e.hidden ? `masquée : ${e.hidden}` : 'liste vide',
      }),
    ),
  );
  const shown = docs.flatMap((d) => d.shown);
  const lists = shown.filter((e) => e.kind === 'list');
  const err = shown.filter((e) => e.status === 'error').length;
  const warn = shown.filter((e) => e.status === 'warning').length;
  const hand = docs.flatMap((d) => d.outside).filter((e) => e.kind === 'hand').length;
  const navs = docs.flatMap((d) => d.outside).filter((e) => e.kind === 'nav').length;
  const out = docs.flatMap((d) => d.out).length;
  return {
    count: lists.length,
    items,
    summary:
      `${plural(lists.length, 'liste')} · ${err ? icon('error') + ' ' : ''}${err} non conforme${err > 1 ? 's' : ''} · ${warn ? icon('warning') + ' ' : ''}${warn} à vérifier` +
      (hand ? ` · ${plural(hand, 'série')} de lignes à puces hors liste` : '') +
      (navs ? ` · ${plural(navs, 'navigation')} hors liste` : '') +
      (out ? ` · ${out} non restituée${out > 1 ? 's' : ''} ou composant${out > 1 ? 's' : ''}` : ''),
  };
};

/** Entrée (liste, élément orphelin, lignes, navigation) qui contient l'élément survolé. */
const findEntry = (target) => {
  for (let el = target; el; el = parentOf(el)) {
    const e = byEl.get(el);
    if (e) return e;
  }
  return null;
};

/* ---------- Afficher les listes cachées ---------- */

const revealable = () => entries.filter((e) => e.kind === 'list' && e.hidden && !e.component && !rv.revealed.has(e.el) && (e.hidden !== 'aria-hidden' || !e.el.getClientRects().length));

let revealAll = false;
const toggleRevealAll = () => {
  revealAll = !revealAll;
  if (revealAll) revealable().forEach((e) => rv.reveal(e.el, e.hidden));
  else rv.unreveal();
  if (ui) ui.refresh();
};

const revealButton = (e) => {
  if (rv.revealed.has(e.el)) return `<p class="note"><button type="button" class="act" data-action="unreveal">Masquer à nouveau</button></p>`;
  if (!(e.kind === 'list' && e.hidden && !e.component && (e.hidden !== 'aria-hidden' || !e.el.getClientRects().length))) return '';
  return (
    `<p class="note"><button type="button" class="act" data-action="reveal">Afficher cette liste</button> ` +
    `<span class="small muted">(force son affichage et, si besoin, celui de ses parents)</span></p>`
  );
};

/* ---------- Détail ---------- */

const MAX_ITEMS = 10;

const itemsHtml = (items) => {
  const li = items
    .slice(0, MAX_ITEMS)
    .map((it) => `<li><span class="it-tag">${esc(it.tag)}</span> ${esc(it.text || '(vide)')}${it.issue ? ` ${flag('error', it.issue)}` : ''}</li>`)
    .join('');
  return `<ul class="list items">${li}</ul>${items.length > MAX_ITEMS ? `<p class="small muted note">… et ${items.length - MAX_ITEMS} autres</p>` : ''}`;
};

const markerOf = (e) => {
  const first = (e.items.find((it) => !it.issue) || {}).el;
  if (!first) return '';
  const cs = styleOf(first);
  const before = cssBullet(first) || pseudoText(first, '::before');
  const type = cs.display === 'list-item' ? cs.listStyleType : 'aucun (pas affiché comme élément de liste)';
  return { type, image: cs.listStyleImage !== 'none', before, none: (cs.display !== 'list-item' || cs.listStyleType === 'none') && cs.listStyleImage === 'none' };
};

const contextRows = (e) => {
  let html = '';
  if (e.region) html += row('Contexte', esc(e.region.text));
  const parentItem = e.el.parentElement && e.el.parentElement.closest('li,[role="listitem"],dd');
  if (parentItem) {
    const own = clean([...parentItem.childNodes].filter((n) => n.nodeType === 3 || (n.nodeType === 1 && !NATIVE.has(n.tagName) && n !== e.el && !n.contains(e.el))).map((n) => n.textContent).join(' '));
    html += row('Sous-liste', `de l’élément « ${esc(cut(own || itemText(parentItem), 50))} » ${src(`niveau ${e.depth + 1}`)}`);
  }
  return html;
};

const listDetail = (e) => {
  let html = row('Type', `${esc(e.type)} ${src(e.component || e.removed ? `${e.source || ''}${e.source ? ', ' : ''}${e.component ? `rôle remplacé par ${e.component}` : `rôle retiré par ${e.removed}`}` : e.source)}`);
  if (e.name) html += row('Nom', esc(e.name));
  html += contextRows(e);
  if (e.component) {
    return (
      html +
      `<p class="note">${flag('hidden', `Rôle remplacé (${e.component}) : composant, sa structure relève du RGAA 7 (les rôles menu, tablist, tree, listbox… ne sont pas des listes)`)}</p>`
    );
  }
  if (e.hidden || e.empty) {
    html += `<p class="note">${flag('hidden', e.hidden ? `Masquée (${e.hidden}) : non restituée, non concernée` : 'Liste vide : non restituée, non concernée')}</p>`;
    return html + revealButton(e);
  }
  const m = e.type === 'dl' ? null : markerOf(e);
  if (m && (e.type !== 'list*' || m.before)) {
    html += row('Marqueur', `${esc(m.type)}${m.image ? ' (image)' : ''}${m.before ? ` · CSS ::before « ${esc(cut(m.before, 20))} »` : ''}`);
  }
  html += row('Éléments', `${countText(e)}${e.masked ? ` <span class="muted small">(+ ${e.masked} masqué${e.masked > 1 ? 's' : ''})</span>` : ''}${e.setsize ? ` ${src(e.setsize)}` : ''}`);
  if (e.items.length) html += itemsHtml(e.items);
  if (rv.revealed.has(e.el)) html += row('Visibilité', `affichée par le bookmarklet <span class="muted small">(à l’origine : ${esc(rv.revealed.get(e.el))})</span>`);
  html += revealButton(e);
  html += critBlocks(e.crit, keysOf(e));
  if (m && m.none && !e.removed && e.role !== 'list' && e.type !== 'list*') {
    html += `<p class="note small muted">Sans puce affichée : Safari et VoiceOver peuvent ne pas annoncer la liste (role="list" corrige). Ce n’est pas une non-conformité.</p>`;
  }
  return html;
};

const outsideDetail = (e) => {
  let html;
  if (e.kind === 'orphan') {
    html = row('Éléments', `${esc(e.type)} ${src(`parent : <${tagOf(e.parent)}>`)}`) + contextRows(e) + itemsHtml(e.items);
  } else if (e.kind === 'nav') {
    html = row('Navigation', `${esc(tagOf(e.el))}${e.name ? ` « ${esc(e.name)} »` : ''}`) + row('Liens hors liste', String(e.els.length));
    html += itemsHtml(e.texts.map((t) => ({ tag: 'a', text: t })));
    html += `<p class="note small muted">Le glossaire du RGAA cite le menu de navigation comme exemple de liste sans marqueur visuel.</p>`;
  } else {
    html = row('Lignes', `${e.texts.length} ${esc(e.how)}${e.block ? ` ${src('séparées par <br>')}` : ''}`) + contextRows(e);
    html += itemsHtml(e.texts.map((t) => ({ tag: e.block ? 'ligne' : tagOf(e.els[0]), text: t })));
    html += row('Balisage attendu', `<code>&lt;${e.ordered ? 'ol' : 'ul'}&gt;</code> avec ${e.texts.length} <code>&lt;li&gt;</code>`);
  }
  return html + critBlocks(e.crit, keysOf(e));
};

/* ---------- Outil « Listes sur la page » ---------- */

const COLORS = { ok: '#0d47a1', warning: '#8a4b00', error: '#c40000', hand: '#6a1b9a' };
const OVERLAY_CSS = `
:host{all:initial}
.box{position:fixed;z-index:${Number(THEME.zIndex) - 1};pointer-events:none;border:2px solid;border-radius:2px;box-sizing:border-box}
.box--hand{border-style:dashed}
.tag{position:fixed;z-index:${Number(THEME.zIndex) - 1};pointer-events:none;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
font:700 11px/1.3 ${THEME.font};color:#fff;padding:1px 4px;border-radius:2px}
.mark{position:fixed;transform:translateX(-100%);z-index:${Number(THEME.zIndex) - 1};pointer-events:none;font:700 10px/1.2 ${THEME.font};color:#fff;padding:0 3px;border-radius:2px;opacity:.9}
`;
const MAX_TAGS = 2000;
const GLYPH = { error: '× ', warning: '! ', ok: '' };
let overlay = null;
let refreshTimer = null;

const scheduleRefresh = () => {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    if (overlay && ui) ui.refresh();
  }, 250);
};

/** Rectangle qui englobe des éléments d'un même document. */
const unionRect = (els) => {
  const rs = els.filter((el) => el.isConnected && el.getClientRects().length).map((el) => el.getBoundingClientRect());
  if (!rs.length) return null;
  const left = Math.min(...rs.map((r) => r.left));
  const top = Math.min(...rs.map((r) => r.top));
  const right = Math.max(...rs.map((r) => r.right));
  const bottom = Math.max(...rs.map((r) => r.bottom));
  return { left, top, width: right - left, height: bottom - top, right, bottom };
};

const overlayText = (e) => {
  if (e.kind === 'hand') return `! ${e.texts.length} lignes ${e.ordered ? 'numérotées' : 'à puces'} hors liste`;
  if (e.kind === 'nav') return `! ${e.els.length} liens hors liste`;
  if (e.kind === 'orphan') return `× ${e.type} hors liste`;
  return `${GLYPH[e.status] || ''}${e.type} · ${e.type === 'dl' ? `${e.terms || 0}/${e.descs || 0}` : e.count}`;
};

const markText = (e, it, i) => {
  if (e.type === 'dl') return it.tag;
  if (e.type === 'ol') {
    const start = Number(e.el.getAttribute('start')) || 1;
    return String(e.el.hasAttribute('reversed') ? (e.el.getAttribute('start') ? start : e.count) - i : start + i);
  }
  return '•';
};

const setOverlay = (on) => {
  if (overlay) {
    overlay.host.remove();
    overlay.mo.forEach((mo) => mo.disconnect());
    allDocuments().forEach((d) => {
      d.removeEventListener('scroll', overlay.schedule, true);
      d.removeEventListener('pointermove', overlay.schedule, true);
    });
    window.removeEventListener('resize', overlay.schedule);
    cancelAnimationFrame(overlay.raf);
    overlay = null;
  }
  if (!on) return;
  const host = document.createElement('div');
  host.setAttribute('data-rgaa-bookmarklet', '');
  host.id = `${ID}-calque`;
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${OVERLAY_CSS}</style>`;
  let budget = MAX_TAGS;
  const items = docs
    .flatMap((d) => [...d.shown, ...d.outside])
    .slice(0, MAX_TAGS)
    .map((e) => {
      const color = e.kind === 'hand' || e.kind === 'nav' ? COLORS.hand : COLORS[e.status] || COLORS.ok;
      const box = document.createElement('div');
      box.className = `box${e.kind === 'hand' || e.kind === 'nav' ? ' box--hand' : ''}`;
      box.style.borderColor = color;
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.style.background = color;
      tag.textContent = overlayText(e);
      root.append(box, tag);
      const marks = [];
      if (e.kind === 'list') {
        e.items
          .filter((it) => !it.issue)
          .forEach((it, i) => {
            if (budget-- <= 0) return;
            const m = document.createElement('span');
            m.className = 'mark';
            m.style.background = color;
            m.textContent = markText(e, it, i);
            root.append(m);
            marks.push({ el: it.el, m });
          });
      }
      return { e, box, tag, marks, els: e.kind === 'list' ? [e.el] : e.els };
    });
  const hidden = docs.flatMap((d) => d.out).filter((e) => e.hidden);
  const place = () => {
    overlay.raf = 0;
    let changed = false;
    // 1. Lectures (positions), puis 2. écritures : sinon chaque écriture force un recalcul de la mise en page.
    const pos = items.map(({ e, marks, els }) => {
      const r = unionRect(els);
      if (!r) {
        if (e.kind === 'list') changed = true;
        return null;
      }
      const win = e.el.ownerDocument.defaultView;
      // Grande liste : visible si l'un de ses éléments l'est (arrêt au premier trouvé).
      const probe = e.kind === 'list' ? [e.el, ...e.items.map((it) => it.el)] : els;
      const shown = r.top < win.innerHeight && r.bottom > 0 && probe.some((el) => el.isConnected && visibleOnScreen(el));
      if (!shown) return null;
      return {
        xy: toTopCoords(win, r.left, r.top),
        r,
        marks: marks.map(({ el }) => {
          const ir = el.isConnected && el.getClientRects().length ? el.getBoundingClientRect() : null;
          return ir && toTopCoords(win, ir.left, ir.top);
        }),
      };
    });
    items.forEach(({ box, tag, marks }, i) => {
      const q = pos[i];
      box.hidden = tag.hidden = !q;
      if (!q) return marks.forEach(({ m }) => (m.hidden = true));
      const [x, y] = q.xy;
      Object.assign(box.style, { left: `${x - 2}px`, top: `${y - 2}px`, width: `${q.r.width + 4}px`, height: `${q.r.height + 4}px` });
      tag.style.left = `${Math.max(0, Math.min(x, window.innerWidth - 60))}px`;
      tag.style.top = `${Math.max(0, y - 17)}px`;
      marks.forEach(({ m }, k) => {
        const mp = q.marks[k];
        m.hidden = !mp;
        if (!mp) return;
        // À gauche de l'élément, sur la puce d'origine, sans cacher le texte.
        m.style.left = `${Math.max(0, mp[0] - 3)}px`;
        m.style.top = `${Math.max(0, mp[1])}px`;
      });
    });
    // Une liste masquée au lancement est maintenant affichée (sous-menu ouvert) : nouvelle liste.
    if (changed || hidden.some((e) => e.el.isConnected && !isNotExposed(e.el))) scheduleRefresh();
  };
  const schedule = () => {
    if (overlay && !overlay.raf) overlay.raf = requestAnimationFrame(place);
  };
  const mo = allDocuments().map((d) => {
    const o = new MutationObserver((list) => list.some(pageMutation) && scheduleRefresh());
    o.observe(d.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['class', 'style', 'hidden', 'open', 'role', 'aria-hidden', 'aria-expanded'],
    });
    return o;
  });
  overlay = { host, schedule, mo, raf: 0 };
  (document.body || document.documentElement).appendChild(host);
  place();
  allDocuments().forEach((d) => {
    d.addEventListener('scroll', schedule, true);
    d.addEventListener('pointermove', schedule, true);
  });
  window.addEventListener('resize', schedule);
};

/* ---------- Lancement ---------- */

const DETAIL_CSS = `${CRIT_CSS}
.act{cursor:pointer;background:none;border:1px solid var(--rgaa-border);border-radius:3px;padding:2px 8px}
.items{margin:4px 0 0}
.it-tag{font-weight:700;color:var(--rgaa-focus)}
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
const toggleOverlay = () => setOverlay(!overlay);

const ui = inspector({
  id: ID,
  css: DETAIL_CSS,
  maxWidth: 480,
  pinOnLocate: true,
  list: {
    title: 'Listes',
    toolsOnTop: true,
    css: LIST_CSS,
    collect() {
      const r = collect();
      if (overlay) setOverlay(true);
      return r;
    },
    filters: [
      { id: 'erreurs', label: 'Non conformes' },
      { id: 'verifier', label: 'À vérifier' },
    ],
    tools: [
      { label: 'Listes sur la page', pressed: () => !!overlay, toggle: toggleOverlay },
      {
        label: () => {
          const n = revealable().length;
          return `Afficher les listes cachées${!revealAll && n ? ` (${n})` : ''}`;
        },
        pressed: () => revealAll,
        toggle: toggleRevealAll,
      },
    ],
    footer:
      'Listes dans l’ordre du document, les sous-listes en retrait (list* : role="list"). ' +
      'Hors liste : lignes commençant par une puce ou une numérotation écrite, liens d’une nav hors liste (à vérifier). ' +
      'Les autres suites visuelles (cartes, menus en div) sont à repérer à l’œil. ' +
      'Listes sur la page (affiché au lancement, Maj+U pour le masquer ou l’afficher), suivi en direct (sous-menus ouverts…).',
  },
  onKey(e) {
    if (!keyOk(e) || e.key.toLowerCase() !== 'u') return false;
    toggleOverlay();
    return true;
  },
  onAction(name, target) {
    const e = findEntry(target);
    if (!e) return;
    if (name === 'reveal') rv.reveal(e.el, e.hidden || 'masquée');
    else if (name === 'unreveal') rv.unreveal(e.el);
    if (ui) ui.refresh();
  },
  onStop: () => {
    rv.unreveal();
    clearTimeout(refreshTimer);
    setOverlay(false);
  },
  inspect(target) {
    const e = findEntry(target);
    if (!e) return null;
    const hl = [[e.kind === 'list' ? e.el : e.els[0], 'primary']];
    if (e.kind !== 'list') e.els.slice(1).forEach((el) => hl.push([el, 'secondary']));
    (e.issueEls || []).forEach((el) => hl.push([el, 'secondary']));
    return { html: e.kind === 'list' ? listDetail(e) : outsideDetail(e), highlight: hl };
  },
});

// Les listes sont affichées sur la page dès le lancement.
if (ui) {
  setOverlay(true);
  ui.redraw();
}
