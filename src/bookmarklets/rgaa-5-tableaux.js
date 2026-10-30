/**
 * RGAA 5 – Tableaux : inventaire des tableaux et vérification selon leur type.
 *
 * Le panneau liste donne un tableau par ligne (<table>, role="table", "grid",
 * "treegrid"), avec une pastille par critère. C'est l'auditeur qui dit si un
 * tableau est de données ou de mise en forme : au clic sur une ligne, le
 * détail s'épingle avec le choix « Données / Présentation » et la case
 * « Complexe », pré-remplis par une supposition. Les critères appliqués
 * suivent ce choix :
 *  - données : 5.1 résumé (si complexe), 5.2 sa pertinence, 5.4 titre,
 *    5.5 sa pertinence, 5.6 en-têtes déclarés, 5.7 association cellules /
 *    en-têtes (scope, headers / id) ;
 *  - mise en forme : 5.3 role="presentation" et contenu linéarisé,
 *    5.8 aucun élément propre aux tableaux de données.
 * Au survol d'une cellule d'un tableau de données, le détail donne les
 * en-têtes qui lui sont associés (entourés en orange sur la page).
 *
 * Les choix sont gardés tant que le bookmarklet tourne (« Actualiser »
 * compris), et perdus à l'arrêt. Les tableaux en <div> sans rôle ne sont pas
 * détectés : l'auditeur les repère par leur absence de la liste.
 *
 * Boutons : « Structure » (Maj+S) étiquette les cellules et les en-têtes,
 * « Linéariser » (Maj+L) affiche les tableaux de mise en forme dans l'ordre
 * de lecture.
 */
import { inspector } from '../lib/floating-panel.js';
import { row, esc, src, icon, list } from '../lib/dom.js';
import { idrefs, textOf, norm, deepAll, isNotExposed, presentational, byId, toTopCoords, allDocuments } from '../lib/a11y.js';
import { THEME } from '../lib/theme.js';

const ID = 'rgaa-5-tableaux';

/** Constat avec icône ; ∅ se lit « Non concerné » (et non « Masqué »). */
const flag = (type, text) =>
  `<span class="flag flag--${type}">${icon(type, type === 'hidden' ? 'Non concerné' : undefined)}<span>${esc(text)}</span></span>`;

const RANK = { error: 3, warning: 2, ok: 1, hidden: 0 };
const worst = (l) => l.reduce((w, s) => (RANK[s] > RANK[w] ? s : w), 'hidden');
const tagOf = (e) => e.tagName.toLowerCase();
const roleOf = (e) => (e.getAttribute('role') || '').trim().split(/\s+/)[0].toLowerCase();
const plural = (n, s, p = `${s}s`) => `${n} ${n > 1 ? p : s}`;
const cut = (t, n = 120) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

const TABLE_SEL = 'table,[role="table"],[role="grid"],[role="treegrid"]';
const ARIA_TABLE = ['table', 'grid', 'treegrid'];
const CELL_ROLES = ['cell', 'gridcell', 'columnheader', 'rowheader'];
const SCOPES = ['col', 'row', 'colgroup', 'rowgroup'];
const GENERIC_TITLE = /^(tableau|table|tableau \d+|table \d+|donnees|data|liste|resultats?|sans titre|untitled|titre)$/;
/* Attributs ARIA globaux qui annulent role="presentation" (WAI-ARIA, conflits de rôle). */
const GLOBAL_ARIA = ['aria-label', 'aria-labelledby', 'aria-describedby', 'aria-details', 'aria-live', 'aria-owns', 'aria-controls', 'aria-keyshortcuts', 'aria-roledescription'];

/* ---------- Choix de l'auditeur (gardé tant que le bookmarklet tourne) ---------- */

/** table → { type: 'data'|'layout', complex: bool, confirmed: bool } */
const choices = new Map();

/* ---------- Grille d'un tableau ---------- */

/** Table (ou élément ARIA) dont dépend une ligne ou une cellule. */
const ownerTable = (el) => {
  for (let e = el.parentElement; e; e = e.parentElement) {
    if (e.tagName === 'TABLE' || ARIA_TABLE.includes(roleOf(e))) return e;
  }
  return null;
};

/** Est-ce une cellule d'en-tête ? Pour HTML : th, ou rôle columnheader / rowheader. */
const isHeaderEl = (c) => {
  const r = roleOf(c);
  if (r === 'columnheader' || r === 'rowheader') return true;
  if (r && CELL_ROLES.includes(r)) return false;
  return c.tagName === 'TH';
};

/**
 * Construit la grille : liste des cellules avec leur position (r, c) et leur
 * étendue (rs, cs), en tenant compte des cellules fusionnées.
 */
const buildGrid = (t) => {
  const html = t.tagName === 'TABLE';
  let rows;
  let cellsOf;
  if (html) {
    rows = [...t.rows];
    cellsOf = (tr) => [...tr.cells];
  } else {
    rows = [...t.querySelectorAll('[role="row"]')].filter((r) => ownerTable(r) === t);
    cellsOf = (tr) => [...tr.querySelectorAll(CELL_ROLES.map((r) => `[role="${r}"]`).join(','))].filter((c) => c.closest('[role="row"]') === tr);
  }
  const taken = [];
  const cells = [];
  let width = 0;
  rows.forEach((tr, r) => {
    let c = 0;
    cellsOf(tr).forEach((el) => {
      while (taken[r] && taken[r][c]) c++;
      const cs = Math.max(1, parseInt(html ? el.colSpan : el.getAttribute('aria-colspan'), 10) || 1);
      let rs = Math.max(0, parseInt(html ? el.rowSpan : el.getAttribute('aria-rowspan'), 10) || 1);
      if (rs === 0) rs = rows.length - r; // rowspan="0" : jusqu'à la fin
      rs = Math.min(rs, rows.length - r);
      for (let i = 0; i < rs; i++) {
        taken[r + i] = taken[r + i] || [];
        for (let j = 0; j < cs; j++) taken[r + i][c + j] = true;
      }
      const role = roleOf(el);
      const header = isHeaderEl(el);
      const scopeAttr = el.hasAttribute('scope') ? (el.getAttribute('scope') || '').trim().toLowerCase() : null;
      cells.push({ el, r, c, rs, cs, header, role, scopeAttr, section: tr.parentElement, tr });
      c += cs;
      width = Math.max(width, c);
    });
  });
  // Sens de chaque en-tête : rôle, scope, sinon déduit de sa position.
  cells.forEach((x) => {
    if (!x.header) return;
    if (x.role === 'columnheader') x.dir = 'col';
    else if (x.role === 'rowheader') x.dir = 'row';
    else if (x.scopeAttr && SCOPES.includes(x.scopeAttr)) {
      x.dir = x.scopeAttr;
      x.dirFrom = 'scope';
    } else {
      const sameRow = cells.filter((y) => y.r === x.r);
      const inThead = x.section && x.section.tagName === 'THEAD';
      x.dir = inThead || sameRow.every((y) => y.header) ? 'col' : 'row';
      x.dirFrom = 'implicite';
    }
  });
  return { rows, cells, width, height: rows.length, html };
};

/**
 * En-têtes associés à une cellule, dans l'ordre de restitution :
 * attribut headers d'abord, sinon scope / position (colonne puis ligne).
 * @returns {{list: Array<{cell, s}>, missing: string[], notHeader: Element[], via: string}}
 */
const headersOf = (g, x) => {
  const attr = (x.el.getAttribute('headers') || '').trim();
  if (attr && g.html) {
    const list = [];
    const missing = [];
    const notHeader = [];
    attr.split(/\s+/).forEach((id) => {
      const el = byId(x.el, id);
      const cell = el && g.cells.find((y) => y.el === el);
      if (!cell) return missing.push(id);
      if (!cell.header) notHeader.push(el);
      list.push({ cell, s: `headers → #${id}` });
    });
    return { list, missing, notHeader, via: 'headers' };
  }
  const out = [];
  const add = (cell, s) => cell !== x && !out.some((o) => o.cell === cell) && out.push({ cell, s });
  // En-têtes de colonne : au-dessus, dans les colonnes couvertes.
  g.cells
    .filter((h) => h.header && (h.dir === 'col' || h.dir === 'colgroup') && h.r < x.r && h.c < x.c + x.cs && h.c + h.cs > x.c)
    .sort((a, b) => a.r - b.r)
    .forEach((h) => add(h, h.dirFrom === 'implicite' ? 'implicite, colonne' : h.role ? `role=${h.role}` : `scope=${h.scopeAttr}`));
  // En-têtes de ligne : à gauche, dans les lignes couvertes.
  g.cells
    .filter((h) => h.header && h.dir === 'row' && h.c < x.c && h.r < x.r + x.rs && h.r + h.rs > x.r)
    .sort((a, b) => a.c - b.c)
    .forEach((h) => add(h, h.dirFrom === 'implicite' ? 'implicite, ligne' : h.role ? `role=${h.role}` : 'scope=row'));
  // scope="rowgroup" : s'applique au groupe de lignes, à partir de sa ligne.
  g.cells
    .filter((h) => h.header && h.dir === 'rowgroup' && h.section === x.section && h.r <= x.r && h.c < x.c)
    .forEach((h) => add(h, 'scope=rowgroup'));
  return { list: out, missing: [], notHeader: [], via: 'position' };
};

/** Texte d'une cellule d'en-tête (ou son nom ARIA). */
const cellText = (el) => el.getAttribute('aria-label') || textOf(el);
const isBold = (el) => {
  const w = parseInt(el.ownerDocument.defaultView.getComputedStyle(el).fontWeight, 10) || 400;
  if (w >= 600) return true;
  const kids = [...el.children];
  return kids.length === 1 && /^(STRONG|B)$/.test(kids[0].tagName) && textOf(kids[0]) === textOf(el);
};

/* ---------- Supposition : données ou mise en forme ---------- */

/** Éléments et attributs propres aux tableaux de données, dans ce tableau seulement. */
const dataMarkers = (t, g) => {
  const own = (sel) => [...t.querySelectorAll(sel)].filter((e) => e.closest('table') === t);
  const out = [];
  const push = (n, what) => n && out.push(`${n} ${what}`);
  if (g.html) {
    push(own('caption').length, 'caption');
    push(g.cells.filter((x) => x.el.tagName === 'TH').length, 'th');
    push(own('thead').length, 'thead');
    push(own('tfoot').length, 'tfoot');
    push(own('colgroup').length, 'colgroup');
    push(g.cells.filter((x) => x.role === 'columnheader' || x.role === 'rowheader').length, 'rôle d’en-tête');
    push(g.cells.filter((x) => x.el.hasAttribute('scope')).length, 'scope');
    push(g.cells.filter((x) => x.el.hasAttribute('headers')).length, 'headers');
    push(g.cells.filter((x) => x.el.hasAttribute('axis')).length, 'axis');
    if (t.hasAttribute('summary')) out.push('summary');
  }
  return out;
};

const guessType = (t, g) => {
  const pres = presentational(t);
  if (pres) return { type: 'layout', reason: pres };
  const r = roleOf(t);
  if (ARIA_TABLE.includes(r)) return { type: 'data', reason: `role="${r}"` };
  const marks = dataMarkers(t, g);
  if (marks.length) return { type: 'data', reason: `contient ${marks.join(', ')}` };
  const inner = [...t.querySelectorAll('table,h1,h2,h3,h4,h5,h6,form,nav,input,select,textarea')].filter((e) => (e.tagName === 'TABLE' ? e.parentElement.closest('table') : e.closest('table')) === t);
  if (inner.some((e) => e.tagName === 'TABLE')) return { type: 'layout', reason: 'contient un autre tableau' };
  if (inner.length) return { type: 'layout', reason: `contient ${[...new Set(inner.map(tagOf))].join(', ')}` };
  if (g.height <= 1 || g.width <= 1) return { type: 'layout', reason: g.height <= 1 ? 'une seule ligne' : 'une seule colonne' };
  return { type: 'data', reason: 'aucun indice, supposition prudente' };
};

/** Tableau complexe (RGAA) : en-têtes hors de la 1re ligne / 1re colonne, ou fusionnés. */
const guessComplex = (g) => {
  const hs = g.cells.filter((x) => x.header);
  if (hs.some((x) => x.r > 0 && x.c > 0)) return 'en-têtes hors de la première ligne et de la première colonne';
  if (hs.some((x) => x.cs > 1 || x.rs > 1)) return 'en-tête fusionné (colspan / rowspan)';
  return '';
};

/* ---------- Titre, résumé ---------- */

const titleOf = (t) => {
  const cap = t.tagName === 'TABLE' && t.caption;
  if (cap && textOf(cap)) return { v: textOf(cap), s: 'caption', el: cap };
  const lb = idrefs(t, 'aria-labelledby');
  if (lb && lb.v.length) return { v: lb.v.join(' '), s: 'aria-labelledby', el: lb.els[0], missing: lb.missing };
  const al = (t.getAttribute('aria-label') || '').trim();
  if (al) return { v: al, s: 'aria-label' };
  const ti = (t.getAttribute('title') || '').trim();
  if (ti) return { v: ti, s: 'title' };
  return null;
};

/** Titre visible probable juste avant le tableau (ou figcaption de la figure). */
const nearTitle = (t) => {
  let n = t;
  // Remonte les conteneurs dont le tableau est le seul enfant.
  while (n.parentElement && n.parentElement !== n.ownerDocument.body && n.parentElement.children.length === 1) n = n.parentElement;
  const fig = t.closest('figure');
  const fc = fig && fig.querySelector(':scope > figcaption');
  if (fc && textOf(fc)) return { v: textOf(fc), s: 'figcaption de la figure', el: fc };
  let p = n.previousElementSibling;
  while (p && (isNotExposed(p) || !textOf(p))) p = p.previousElementSibling;
  if (!p) return null;
  const txt = textOf(p);
  if (/^H[1-6]$/.test(p.tagName)) return { v: txt, s: `${tagOf(p)} qui précède`, el: p };
  if (txt.length <= 100 && isBold(p)) return { v: txt, s: `${tagOf(p)} en gras qui précède`, el: p };
  return null;
};

const summaryOf = (t) => {
  const db = idrefs(t, 'aria-describedby');
  if (db && db.v.length) return { v: db.v.join(' '), s: 'aria-describedby', el: db.els[0], status: 'ok' };
  const cap = t.tagName === 'TABLE' && t.caption;
  if (cap) {
    const txt = textOf(cap);
    const blocks = cap.querySelector('p,div,details,br,span[id]');
    const sentences = txt.split(/[.!?…]\s+(?=\S)/).length;
    if (blocks || sentences >= 2) return { v: txt, s: 'caption détaillé', el: cap, status: 'ok' };
  }
  const sum = (t.getAttribute('summary') || '').trim();
  if (sum) return { v: sum, s: 'summary, obsolète en HTML5', status: 'warning' };
  if (db && db.missing.length) return { missing: db.missing };
  return null;
};

/* ---------- Critères ---------- */

const dataCriteria = (t, g, complex) => {
  const c = {};
  const title = titleOf(t);
  // 5.1 / 5.2 : résumé d'un tableau complexe.
  if (complex) {
    const s = summaryOf(t);
    if (s && s.v) {
      c['5.1'] = { status: s.status, text: s.status === 'ok' ? `Résumé trouvé (${s.s})` : `Résumé dans l’attribut summary (obsolète en HTML5, mal restitué)`, el: s.el };
      c['5.2'] = { status: 'warning', text: 'Pertinence du résumé à vérifier', quote: s.v, s: s.s };
    } else {
      c['5.1'] = {
        status: 'error',
        text: 'Tableau complexe sans résumé (aria-describedby ou caption détaillé)',
        extra: s && s.missing ? [['error', `aria-describedby : id introuvable (${s.missing.join(', ')})`]] : [],
      };
    }
  } else {
    c['5.1'] = { status: 'hidden', text: 'Tableau simple : résumé non exigé', na: true };
  }
  // 5.4 / 5.5 : titre.
  if (title) {
    c['5.4'] = {
      status: 'ok',
      text: `Titre associé (${title.s})`,
      el: title.el,
      extra: title.missing && title.missing.length ? [['error', `aria-labelledby : id introuvable (${title.missing.join(', ')})`]] : [],
    };
    c['5.5'] = GENERIC_TITLE.test(norm(title.v))
      ? { status: 'warning', text: `Titre générique « ${title.v} »`, quote: title.v, s: title.s }
      : { status: 'warning', text: 'Pertinence du titre à vérifier', quote: title.v, s: title.s };
  } else {
    const near = nearTitle(t);
    c['5.4'] = near
      ? { status: 'warning', text: `Titre visible probable non associé : « ${cut(near.v, 60)} » (${near.s})`, el: near.el }
      : { status: 'warning', text: 'Aucun titre : vérifier qu’aucun titre n’est affiché près du tableau' };
  }
  // 5.6 : en-têtes déclarés.
  const hs = g.cells.filter((x) => x.header);
  const extra6 = [];
  if (!g.html) {
    const stray = [...t.querySelectorAll(CELL_ROLES.map((r) => `[role="${r}"]`).join(','))].filter(
      (e) => ownerTable(e) === t && !g.cells.some((x) => x.el === e),
    );
    if (!g.rows.length) extra6.push(['error', 'Aucun élément role="row" : structure ARIA incomplète']);
    if (stray.length) extra6.push(['error', `${plural(stray.length, 'cellule')} hors d’un role="row"`]);
  }
  const empty = hs.filter((x) => !cellText(x.el));
  if (empty.length) extra6.push(['warning', `${plural(empty.length, 'en-tête vide', 'en-têtes vides')}`]);
  // td qui ressemblent à des en-têtes (gras en première ligne ou colonne).
  const firstRow = g.cells.filter((x) => x.r === 0 && !x.header && textOf(x.el));
  if (g.height > 1 && firstRow.length && !g.cells.some((x) => x.r === 0 && x.header) && firstRow.every((x) => isBold(x.el))) {
    extra6.push(['warning', 'Première ligne en td et en gras : en-têtes probables']);
  }
  const firstCol = g.cells.filter((x) => x.c === 0 && x.r > 0 && !x.header && textOf(x.el));
  if (g.width > 1 && firstCol.length > 1 && !g.cells.some((x) => x.c === 0 && x.r > 0 && x.header) && firstCol.every((x) => isBold(x.el))) {
    extra6.push(['warning', 'Première colonne en td et en gras : en-têtes probables']);
  }
  const nCol = hs.filter((x) => x.dir === 'col' || x.dir === 'colgroup').length;
  const nRow = hs.length - nCol;
  c['5.6'] = hs.length
    ? { status: worst(['ok', ...extra6.map((e) => e[0])]), text: `${plural(nCol, 'en-tête')} de colonne, ${plural(nRow, 'en-tête')} de ligne`, extra: extra6 }
    : { status: 'error', text: 'Aucun en-tête déclaré (th, columnheader, rowheader)', extra: extra6 };
  // 5.7 : association cellules / en-têtes.
  const extra7 = [];
  const badScope = g.cells.filter((x) => x.header && x.scopeAttr !== null && !SCOPES.includes(x.scopeAttr) && !x.role);
  if (badScope.length) extra7.push(['error', `scope invalide : ${[...new Set(badScope.map((x) => `"${x.scopeAttr}"`))].join(', ')}`]);
  const tdScope = g.cells.filter((x) => !x.header && x.scopeAttr !== null);
  if (tdScope.length) extra7.push(['warning', `${plural(tdScope.length, 'td')} avec scope (réservé aux th)`]);
  let missing = [];
  let notHeader = 0;
  let orphans = 0;
  g.cells.forEach((x) => {
    const h = headersOf(g, x);
    missing = missing.concat(h.missing);
    notHeader += h.notHeader.length;
    if (!x.header && textOf(x.el) && !h.list.length) orphans++;
  });
  if (missing.length) extra7.push(['error', `headers : id introuvable (${[...new Set(missing)].slice(0, 5).join(', ')})`]);
  if (notHeader) extra7.push(['error', `headers : ${plural(notHeader, 'référence')} vers une cellule qui n’est pas un en-tête`]);
  const dupIds = g.cells.filter((x) => x.el.id && byId(x.el, x.el.id) !== x.el).map((x) => x.el.id);
  if (dupIds.length) extra7.push(['error', `id en double : ${[...new Set(dupIds)].slice(0, 5).join(', ')}`]);
  if (hs.length && orphans) extra7.push(['warning', `${plural(orphans, 'cellule')} sans en-tête associé`]);
  const usesHeaders = g.cells.some((x) => x.el.hasAttribute('headers'));
  if (complex && g.html && !usesHeaders) extra7.push(['warning', 'Tableau complexe sans attribut headers : vérifier l’association de chaque cellule']);
  if (!hs.length) c['5.7'] = { status: 'error', text: 'Aucun en-tête : aucune association possible', extra: extra7 };
  else {
    const how = usesHeaders ? 'headers / id' : g.cells.some((x) => x.dirFrom === 'scope') ? 'scope' : g.html ? 'position des th (portée déduite)' : 'rôles ARIA';
    c['5.7'] = { status: worst(['ok', ...extra7.map((e) => e[0])]), text: `Association par ${how}`, extra: extra7 };
  }
  return c;
};

const layoutCriteria = (t, g) => {
  const c = {};
  const lin = ['warning', 'Contenu linéarisé à vérifier (bouton « Linéariser »)'];
  if (!g.html) c['5.3'] = { status: 'warning', text: lin[1] };
  else {
    const pres = presentational(t);
    const cancel = GLOBAL_ARIA.filter((a) => t.hasAttribute(a));
    if (t.hasAttribute('tabindex')) cancel.push('tabindex');
    if (!pres) c['5.3'] = { status: 'error', text: 'role="presentation" absent (test 5.3.1)', extra: [lin] };
    else if (cancel.length) c['5.3'] = { status: 'error', text: `${pres} annulé par ${cancel.join(', ')}`, extra: [lin] };
    else c['5.3'] = { status: 'warning', text: lin[1], extra: [['ok', `${pres} présent`]] };
  }
  const marks = dataMarkers(t, g);
  const r = roleOf(t);
  if (ARIA_TABLE.includes(r)) marks.unshift(`role="${r}"`);
  c['5.8'] = marks.length
    ? { status: 'error', text: `Éléments de tableau de données : ${marks.join(', ')}` }
    : { status: 'ok', text: 'Aucun élément propre aux tableaux de données' };
  return c;
};

const DATA_CRIT = ['5.1', '5.2', '5.4', '5.5', '5.6', '5.7'];
const LAYOUT_CRIT = ['5.3', '5.8'];

/* ---------- Inventaire ---------- */

let entries = [];

const analyse = (t, i) => {
  const g = buildGrid(t);
  const guess = guessType(t, g);
  const complexWhy = guessComplex(g);
  const choice = choices.get(t);
  const type = choice ? choice.type : guess.type;
  const complex = choice ? choice.complex : !!complexWhy;
  const hidden = isNotExposed(t);
  const e = { el: t, idx: i, g, guess, complexWhy, type, complex, confirmed: !!(choice && choice.confirmed), hidden, title: titleOf(t) };
  let level = 0;
  for (let p = ownerTable(t); p; p = ownerTable(p)) level++;
  e.level = level;
  if (hidden) {
    e.status = 'hidden';
    e.crit = {};
    return e;
  }
  e.crit = type === 'data' ? dataCriteria(t, g, complex) : layoutCriteria(t, g);
  e.status = worst(Object.values(e.crit).filter((x) => !x.na).map((x) => x.status));
  return e;
};

const PILL_LABEL = { error: 'erreur', warning: 'à vérifier', ok: 'conforme', hidden: 'non concerné' };
const GLYPH = { error: '×', warning: '!', ok: '✓', hidden: '∅' };

const pills = (e) => {
  if (e.status === 'hidden') return '';
  const keys = (e.type === 'data' ? DATA_CRIT : LAYOUT_CRIT).filter((k) => e.crit[k] && !e.crit[k].na);
  return `<span class="pills">${keys
    .map((k) => {
      const s = e.crit[k].status;
      return `<span class="pill pill--${s}"><span aria-hidden="true">${k} ${GLYPH[s]}</span><span class="sr-only">${k} ${PILL_LABEL[s]},</span></span>`;
    })
    .join('')}</span>`;
};

const typeLabel = (e) => `${e.type === 'data' ? 'Données' : 'Présentation'}${e.type === 'data' && e.complex ? ' complexe' : ''}${e.confirmed ? '' : ' ?'}`;

const labelOf = (e) => {
  const base = e.title ? e.title.v : textOf(e.el) || '(tableau vide)';
  return `${e.level ? '↳ ' : ''}${base}`;
};

const collect = () => {
  const found = deepAll(TABLE_SEL);
  entries = found.map(analyse);
  // Oublie les choix des tableaux retirés de la page.
  [...choices.keys()].forEach((t) => !t.isConnected && choices.delete(t));
  const sorted = [...entries].sort((a, b) => RANK[b.status] - RANK[a.status] || a.idx - b.idx);
  const shown = entries.filter((e) => !e.hidden);
  const data = shown.filter((e) => e.type === 'data');
  const cplx = data.filter((e) => e.complex).length;
  const layout = shown.length - data.length;
  const toConfirm = shown.filter((e) => !e.confirmed).length;
  const err = shown.filter((e) => e.status === 'error').length;
  const hidden = entries.length - shown.length;
  return {
    items: sorted.map((e) => ({
      el: e.el,
      status: e.status,
      label: e.hidden ? `${labelOf(e)} (masqué : ${e.hidden})` : labelOf(e),
      meta: e.hidden ? 'non concerné' : `${typeLabel(e)} · ${e.g.height} × ${e.g.width}`,
      prefix: pills(e),
      filter: e.hidden ? [] : [e.type, ...(e.confirmed ? [] : ['confirmer'])],
    })),
    summary:
      `${plural(shown.length, 'tableau', 'tableaux')} · ${data.length} données${cplx ? ` (${cplx} complexe${cplx > 1 ? 's' : ''})` : ''} · ${layout} présentation · ` +
      `${toConfirm ? icon('warning') + ' ' : ''}${plural(toConfirm, 'type')} à confirmer · ` +
      `${err ? icon('error') + ' ' : ''}${err} en erreur` +
      (hidden ? ` · ${hidden} masqué${hidden > 1 ? 's' : ''}` : ''),
  };
};

/** Remonte d'un élément (iframe de même origine comprise) en appelant fn sur chaque ancêtre. */
const climb = (target, fn) => {
  for (let el = target; el; ) {
    const hit = fn(el);
    if (hit) return hit;
    if (el.parentElement) el = el.parentElement;
    else if (el.getRootNode && el.getRootNode().host) el = el.getRootNode().host;
    else {
      const win = el.ownerDocument && el.ownerDocument.defaultView;
      try {
        el = win && win.frameElement;
      } catch (err) {
        el = null;
      }
    }
  }
  return null;
};
const findEntry = (target) => climb(target, (el) => entries.find((e) => e.el === el));
/** Cellule survolée et son tableau (le plus proche). */
const findCell = (target) =>
  climb(target, (el) => {
    const e = entries.find((x) => x.el === el);
    if (e) return { e, cell: null };
    for (const x of entries) {
      const cell = x.g.cells.find((y) => y.el === el);
      if (cell) return { e: x, cell };
    }
    return null;
  });

/* ---------- Détail ---------- */

const critBlock = (num, r) =>
  `<div class="crit"><span class="crit-num">${num}</span><div class="crit-body">${flag(r.status, r.text)}` +
  `${r.quote ? `<div class="quote">« ${esc(cut(r.quote, 300))} » ${src(r.s)}</div>` : ''}` +
  `${(r.extra || []).map(([t, txt]) => `<div>${flag(t, txt)}</div>`).join('')}</div></div>`;

const choiceHtml = (e) => {
  const n = `t${e.idx}`;
  const isData = e.type === 'data';
  return (
    `<fieldset class="choice"><legend>Type de tableau</legend>` +
    `<label><input type="radio" name="${n}" data-action="type-data"${isData ? ' checked' : ''}> Données</label>` +
    `<label><input type="radio" name="${n}" data-action="type-layout"${isData ? '' : ' checked'}> Présentation</label>` +
    (isData ? `<label class="cx"><input type="checkbox" data-action="complex"${e.complex ? ' checked' : ''}> Tableau complexe (5.1)</label>` : '') +
    `<div class="small muted">Supposition : ${e.guess.type === 'data' ? 'données' : 'présentation'}, ${esc(e.guess.reason)}` +
    `${e.complexWhy ? ` · complexe : ${esc(e.complexWhy)}` : ''}</div>` +
    (e.confirmed
      ? `<div class="small">${flag('ok', 'Type confirmé par l’auditeur')}</div>`
      : `<button type="button" class="act" data-action="confirm">Confirmer</button> <span class="small muted">(ou cliquer la ligne du tableau dans la liste pour épingler ce détail)</span>`) +
    `</fieldset>`
  );
};

const tableDetail = (e) => {
  const t = e.el;
  const g = e.g;
  let html = '';
  if (e.hidden) return row('Tableau', `${esc(tagOf(t))}${roleOf(t) ? ` ${src(`role="${roleOf(t)}"`)}` : ''}`) + `<p class="note">${flag('hidden', `Masqué (${e.hidden}) : non concerné`)}</p>`;
  html += choiceHtml(e);
  html += row('Élément', `&lt;${esc(tagOf(t))}&gt;${roleOf(t) ? ` ${src(`role="${roleOf(t)}"`)}` : ''}${e.level ? ` <span class="muted">imbriqué (niveau ${e.level})</span>` : ''}`);
  const merged = g.cells.filter((x) => x.cs > 1 || x.rs > 1).length;
  html += row('Taille', esc(`${plural(g.height, 'ligne')} × ${plural(g.width, 'colonne')}${merged ? ` · ${plural(merged, 'cellule fusionnée', 'cellules fusionnées')}` : ''}`));
  if (e.title) html += row('Titre', `${esc(cut(e.title.v))} ${src(e.title.s)}`);
  const keys = e.type === 'data' ? DATA_CRIT : LAYOUT_CRIT;
  html += '<div class="crits">';
  keys.forEach((k) => e.crit[k] && (html += critBlock(k, e.crit[k])));
  html += '</div>';
  if (e.type === 'data') html += '<p class="note small muted">Survoler une cellule pour voir ses en-têtes associés (5.7). Bouton « Structure » : étiquettes sur toutes les cellules.</p>';
  else html += '<p class="note small muted">5.3 : lire le contenu dans l’ordre avec le bouton « Linéariser » (Maj+L).</p>';
  return html;
};

const cellKind = (x) => {
  if (!x.header) return x.role ? `cellule ${src(`role="${x.role}"`)}` : `cellule ${src('td')}`;
  const what = x.dir === 'row' || x.dir === 'rowgroup' ? 'en-tête de ligne' : 'en-tête de colonne';
  const how = x.role ? `role="${x.role}"` : x.dirFrom === 'scope' ? `th scope="${x.scopeAttr}"` : 'th, portée déduite';
  return `${what} ${src(how)}`;
};

const cellDetail = (e, x) => {
  const g = e.g;
  let html = row('Tableau', `${esc(cut(labelOf(e), 60))} <span class="muted">· ${esc(typeLabel(e))}</span>`);
  html += row('Cellule', cellKind(x));
  html += row('Position', esc(`ligne ${x.r + 1}, colonne ${x.c + 1}${x.cs > 1 ? ` (sur ${x.cs} colonnes)` : ''}${x.rs > 1 ? ` (sur ${x.rs} lignes)` : ''}`));
  const h = headersOf(g, x);
  const checks = [];
  if (x.header && x.scopeAttr !== null && !SCOPES.includes(x.scopeAttr) && !x.role) checks.push(['error', `scope="${x.scopeAttr}" invalide (col, row, colgroup, rowgroup)`]);
  if (!x.header && x.scopeAttr !== null) checks.push(['warning', 'scope sur un td (réservé aux th)']);
  if (h.missing.length) checks.push(['error', `headers : id introuvable (${h.missing.join(', ')})`]);
  if (h.notHeader.length) checks.push(['error', `headers : ${plural(h.notHeader.length, 'référence')} vers un td`]);
  if (x.el.id && byId(x.el, x.el.id) !== x.el) checks.push(['error', `id « ${x.el.id} » en double`]);
  if (!x.header && textOf(x.el) && !h.list.length) checks.push(['warning', 'Aucun en-tête associé']);
  html += row(
    'En-têtes associés',
    h.list.length
      ? list(h.list.map((o) => `${esc(cut(cellText(o.cell.el), 80) || '(vide)')} ${src(o.s)}${o.cell.header ? '' : ` ${flag('error', 'pas un en-tête')}`}`))
      : '<span class="muted">aucun</span>',
  );
  if (x.header) {
    const covered = g.cells.filter((y) => y !== x && headersOf(g, y).list.some((o) => o.cell === x)).length;
    html += row('Cellules couvertes', esc(String(covered)));
  }
  if (checks.length) html += `<ul class="checks">${checks.map(([t, txt]) => `<li>${flag(t, txt)}</li>`).join('')}</ul>`;
  return { html, hl: h.list.map((o) => [o.cell.el, 'secondary']) };
};

/* ---------- Outils ---------- */

const OVERLAY_CSS = `
:host{all:initial}
.box{position:fixed;z-index:${Number(THEME.zIndex) - 1};pointer-events:none;box-sizing:border-box}
.box--h{background:rgba(0,90,156,.18);border:2px solid ${THEME.color.focus}}
.box--d{border:1px dashed #767676}
.tag{position:absolute;right:0;bottom:0;opacity:.9;font:700 9px/1.2 ${THEME.font};color:#fff;background:${THEME.color.focus};padding:1px 3px;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.box--d .tag{background:#595959}
.box--ko .tag{background:${THEME.color.error}}
`;
let structHost = null;
let structItems = [];
const MAX_CELLS = 3000;

const placeStruct = () => {
  structItems.forEach(({ el, box }) => {
    const r = el.getBoundingClientRect();
    const [x, y] = toTopCoords(el.ownerDocument.defaultView, r.left, r.top);
    box.hidden = !el.isConnected || r.width === 0;
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
    box.style.width = `${r.width}px`;
    box.style.height = `${r.height}px`;
  });
};

const cellTag = (g, x) => {
  const bits = [];
  if (x.header) bits.push(x.role ? x.role : `th${x.dirFrom === 'scope' ? ` ${x.scopeAttr}` : x.scopeAttr !== null ? ` scope="${x.scopeAttr}"` : ''}`);
  else bits.push(x.role || 'td');
  if (x.el.id) bits.push(`#${x.el.id}`);
  const hd = (x.el.getAttribute('headers') || '').trim();
  if (hd) bits.push(`→ ${hd}`);
  const h = headersOf(g, x);
  const ko = h.missing.length || h.notHeader.length || (x.header && x.scopeAttr !== null && !SCOPES.includes(x.scopeAttr) && !x.role);
  return { text: bits.join(' '), ko };
};

const setStruct = (on) => {
  if (structHost) {
    structHost.remove();
    structHost = null;
    structItems = [];
    allDocuments().forEach((d) => d.removeEventListener('scroll', placeStruct, true));
    window.removeEventListener('resize', placeStruct);
  }
  if (!on) return;
  structHost = document.createElement('div');
  structHost.setAttribute('data-rgaa-bookmarklet', '');
  const root = structHost.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${OVERLAY_CSS}</style>`;
  entries
    .filter((e) => !e.hidden)
    .forEach((e) =>
      e.g.cells.forEach((x) => {
        if (structItems.length >= MAX_CELLS) return;
        const { text, ko } = cellTag(e.g, x);
        const box = document.createElement('div');
        box.className = `box ${x.header ? 'box--h' : 'box--d'}${ko ? ' box--ko' : ''}`;
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = text;
        box.appendChild(tag);
        root.appendChild(box);
        structItems.push({ el: x.el, box });
      }),
    );
  (document.body || document.documentElement).appendChild(structHost);
  placeStruct();
  allDocuments().forEach((d) => d.addEventListener('scroll', placeStruct, true));
  window.addEventListener('resize', placeStruct);
};

/** « Linéariser » : display:block sur le tableau et ses lignes et cellules. */
const linState = new Map(); // élément → cssText d'origine
let linOn = false;
const LIN_PROPS = [
  ['display', 'block'],
  ['width', 'auto'],
  ['height', 'auto'],
];
const setLin = (on, only) => {
  linState.forEach((css, el) => {
    if (css === null) el.removeAttribute('style');
    else el.style.cssText = css;
  });
  linState.clear();
  linOn = on;
  if (!on) return;
  const targets = only ? [only] : entries.filter((e) => !e.hidden && e.type === 'layout');
  targets.forEach((e) => {
    if (!e.g.html) return;
    const els = [e.el, ...[...e.el.querySelectorAll('caption,thead,tbody,tfoot,tr,td,th')].filter((x) => x.closest('table') === e.el)];
    els.forEach((el) => {
      if (linState.has(el)) return;
      linState.set(el, el.hasAttribute('style') ? el.style.cssText : null);
      LIN_PROPS.forEach(([p, v]) => el.style.setProperty(p, v, 'important'));
    });
  });
  if (structHost) placeStruct();
};

/* ---------- Lancement ---------- */

const DETAIL_CSS = `
.choice{border:1px solid var(--rgaa-border);border-radius:3px;margin:0 0 8px;padding:4px 8px 6px;display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center}
.choice legend{font-weight:700;padding:0 4px}
.choice label{display:inline-flex;align-items:center;gap:4px;cursor:pointer}
.choice .cx{flex-basis:100%}
.choice > div{flex-basis:100%}
.crits{margin-top:8px;border-top:1px solid var(--rgaa-sep)}
.crit{display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--rgaa-sep)}
.crit-num{flex:0 0 2.6em;font-weight:700}
.crit-body{min-width:0;display:flex;flex-direction:column;gap:3px}
.quote{font-style:italic}
.act{cursor:pointer;background:none;border:1px solid var(--rgaa-border);border-radius:3px;padding:2px 8px}
.note{margin:8px 0 0}
`;
const LIST_CSS = `
.item > span:last-child{display:flex;flex-direction:column;gap:2px}
.pills{order:2;display:flex;flex-wrap:wrap;gap:3px;margin-top:2px}
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
const toggleStruct = () => setStruct(!structHost);
const toggleLin = () => {
  const cur = ui && ui.current() ? findEntry(ui.current()) : null;
  setLin(!linOn, cur && !cur.hidden && cur.type === 'layout' ? cur : null);
};
/** Après un changement de type : recalcul de la liste et des étiquettes. */
const afterChange = () => {
  if (ui) ui.refresh();
  if (structHost) setStruct(true);
};

const ui = inspector({
  id: ID,
  css: DETAIL_CSS,
  maxWidth: 480,
  pinOnLocate: true,
  list: {
    title: 'Tableaux',
    collect,
    filters: [
      { id: 'data', label: 'Données' },
      { id: 'layout', label: 'Présentation' },
      { id: 'confirmer', label: 'À confirmer' },
    ],
    tools: [
      { label: 'Structure', pressed: () => !!structHost, toggle: toggleStruct },
      { label: 'Linéariser', pressed: () => linOn, toggle: toggleLin },
    ],
    footer:
      'Un tableau visible absent de cette liste n’a pas de structure de tableau (5.6, 5.7). ' +
      'Structure (Maj+S) : étiquette cellules et en-têtes. Linéariser (Maj+L) : ordre de lecture des tableaux de mise en forme (ou du tableau épinglé).',
  },
  onKey(e) {
    if (!keyOk(e)) return false;
    const k = e.key.toLowerCase();
    if (k === 's') toggleStruct();
    else if (k === 'l') toggleLin();
    else return false;
    return true;
  },
  onAction(name, target) {
    const e = findEntry(target);
    if (!e) return;
    const cur = { type: e.type, complex: e.complex, confirmed: true };
    if (name === 'type-data') {
      cur.type = 'data';
      if (e.type !== 'data') cur.complex = !!e.complexWhy;
    } else if (name === 'type-layout') cur.type = 'layout';
    else if (name === 'complex') cur.complex = !e.complex;
    else if (name !== 'confirm') return;
    choices.set(e.el, cur);
    afterChange();
  },
  onStop: () => {
    setStruct(false);
    setLin(false);
  },
  inspect(target) {
    const hit = findCell(target);
    if (!hit) return null;
    const { e, cell } = hit;
    if (cell && !e.hidden && e.type === 'data') {
      const d = cellDetail(e, cell);
      return { html: d.html, highlight: [[cell.el, 'primary'], ...d.hl] };
    }
    const hl = [[e.el, 'primary']];
    Object.values(e.crit || {}).forEach((r) => r.el && hl.push([r.el, 'secondary']));
    return { html: tableDetail(e), highlight: hl };
  },
});

// Pastilles de la liste : ajoutées au Shadow DOM du panneau liste.
const listHost = document.getElementById(`${ID}-liste`);
if (ui && listHost && listHost.shadowRoot) {
  const st = document.createElement('style');
  st.textContent = LIST_CSS;
  listHost.shadowRoot.appendChild(st);
}
