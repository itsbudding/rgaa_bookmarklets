/**
 * RGAA 6 – Liens : inventaire des liens et vérification de leur intitulé.
 *
 * Le panneau liste donne un lien par ligne (a[href], area[href],
 * role="link"), avec son intitulé tel qu'une aide technique le restitue hors
 * contexte, sa nature (texte, image, composite, SVG) et une pastille par
 * critère :
 *  - 6.2 : le lien a-t-il un intitulé (nom accessible) ?
 *  - 6.1 : l'intitulé est-il explicite ? Un intitulé générique (« lire la
 *    suite », « cliquez ici »…) ou partagé par des liens vers des
 *    destinations différentes est « à juger en contexte » ; le détail donne
 *    ce contexte (phrase, paragraphe, item de liste, cellule et en-têtes,
 *    titre qui précède) pour que l'auditeur juge. Le test 6.1.5 (nom
 *    accessible qui contient l'intitulé visible) est vérifié dans le code.
 * D'autres constats sont signalés sans verdict RGAA : title qui ne reprend
 * pas l'intitulé, nouvelle fenêtre non signalée, href="#" ou javascript:
 * (bouton déguisé), ancre introuvable, fichier sans format.
 *
 * Bouton « Intitulés » (Maj+N) : affiche l'intitulé de chaque lien sur la page.
 */
import { inspector } from '../lib/floating-panel.js';
import { row, esc, src, icon, list } from '../lib/dom.js';
import { idrefs, textOf, norm, deepAll, isNotExposed, isOwn, byId, toTopCoords, allDocuments } from '../lib/a11y.js';
import { THEME } from '../lib/theme.js';

const ID = 'rgaa-6-liens';

/** Constat avec icône ; ∅ se lit « Non concerné » (et non « Masqué »). */
const flag = (type, text) =>
  `<span class="flag flag--${type}">${icon(type, type === 'hidden' ? 'Non concerné' : undefined)}<span>${esc(text)}</span></span>`;

const RANK = { error: 3, warning: 2, ok: 1, hidden: 0 };
const worst = (l) => l.reduce((w, s) => (RANK[s] > RANK[w] ? s : w), 'hidden');
const tagOf = (e) => e.tagName.toLowerCase();
const roleOf = (e) => (e.getAttribute('role') || '').trim().split(/\s+/)[0].toLowerCase();
const plural = (n, s, p = `${s}s`) => `${n} ${n > 1 ? p : s}`;
const cut = (t, n = 120) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const clean = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();

const LINK_SEL = 'a[href],area[href],[role="link"]';
/** Sources du nom qui remplacent le contenu du lien. */
const OVERRIDE = ['aria-labelledby', 'aria-label', 'title'];

/** Intitulés génériques, à juger dans leur contexte (comparés après norm()). */
const VAGUE = new Set(
  [
    'ici', 'cliquez ici', 'cliquer ici', 'cliquez', 'click here', 'here', 'lire la suite', 'la suite', 'suite', 'lire plus',
    'en lire plus', 'lire', 'en savoir plus', 'en savoir', 'savoir plus', 'plus', 'plus d’infos', 'plus d’info',
    'plus d’informations', 'plus d’information', 'pour en savoir plus', 'voir', 'voir plus', 'voir la suite', 'voir le détail',
    'voir les détails', 'voir tout', 'tout voir', 'détails', 'détail', 'découvrir', 'je découvre', 'consulter', 'accéder',
    'continuer', 'lien', 'ce lien', 'cette page', 'page', 'télécharger', 'info', 'infos', 'article', 'retour', 'suivant',
    'précédent', 'more', 'read more', 'learn more', 'see more', 'more info', 'link', 'go', 'ok', 'next', 'previous', 'pdf',
  ].map(norm),
);
const NEW_WINDOW = /nouvel(le)?\s+(fen[eê]tre|onglet)|new\s+(window|tab)|externe|external/i;
const FILE_EXT = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|csv|zip|rar|7z|epub|mp3|mp4|txt)$/i;

/* ---------- Intitulé (nom accessible) ---------- */

const styleOf = (e, pseudo) => e.ownerDocument.defaultView.getComputedStyle(e, pseudo);
const notRendered = (e) => {
  const cs = styleOf(e);
  return cs.display === 'none' || cs.visibility === 'hidden';
};

/** Texte généré par ::before / ::after (texte de remplacement après « / »), sans icônes de police. */
const pseudoText = (e, which) => {
  const c = styleOf(e, which).content;
  if (!c || c === 'none' || c === 'normal') return '';
  const parts = c.split(/\s\/\s/);
  const use = parts[parts.length - 1];
  return clean(
    [...use.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
      .map((m) => m[1].replace(/\\(.)/g, '$1'))
      .join('')
      .replace(/[-]/g, ''),
  );
};

const SKIP = ['script', 'style', 'template', 'noscript', 'iframe', 'object', 'embed', 'video', 'audio', 'select', 'textarea'];

/**
 * Parcourt le contenu d'un lien comme le calcul du nom accessible :
 * textes, alternatives des images, title des SVG, aria-label des descendants.
 */
const walk = (node, acc) => {
  node.childNodes.forEach((c) => {
    if (c.nodeType === 3) {
      const t = clean(c.textContent);
      if (t) {
        acc.parts.push({ t, s: 'texte' });
        acc.text = true;
      }
      return;
    }
    if (c.nodeType !== 1) return;
    const tag = tagOf(c);
    const role = roleOf(c);
    const isImg = tag === 'img' || (tag === 'input' && c.type === 'image') || tag === 'svg' || role === 'img';
    if (c.getAttribute('aria-hidden') === 'true') {
      if (isImg || c.querySelector('img,svg')) acc.hiddenImg = true;
      return;
    }
    if (SKIP.includes(tag) || notRendered(c)) return;
    const kind = tag === 'svg' ? 'svg' : isImg ? 'img' : 'text';
    const pres = role === 'presentation' || role === 'none';
    const lb = idrefs(c, 'aria-labelledby');
    const al = clean(c.getAttribute('aria-label'));
    if (!pres && ((lb && lb.v.length) || al)) {
      acc.parts.push(lb && lb.v.length ? { t: lb.v.join(' '), s: `aria-labelledby (${tag})` } : { t: al, s: `aria-label (${tag})` });
      acc[kind] = true;
      return;
    }
    if (isImg) {
      if (pres || ((tag === 'img' || tag === 'input') && c.getAttribute('alt') !== null && !c.getAttribute('alt').trim())) {
        acc.decoImg = true;
        return;
      }
      acc[kind] = true;
      if (tag === 'svg') {
        const ti = c.querySelector(':scope > title');
        if (ti && clean(ti.textContent)) acc.parts.push({ t: clean(ti.textContent), s: 'title (svg)' });
        else acc.unnamed.push(c);
      } else if (tag === 'img' || tag === 'input') {
        const alt = c.getAttribute('alt');
        const ti = clean(c.getAttribute('title'));
        if (alt === null) {
          if (ti) acc.parts.push({ t: ti, s: `title (${tag})` });
          else acc.unnamed.push(c);
        } else acc.parts.push({ t: clean(alt), s: `alt (${tag})` });
      } else acc.unnamed.push(c); // role="img" sans nom : ses enfants ne comptent pas
      return;
    }
    const before = pseudoText(c, '::before');
    if (before) acc.parts.push({ t: before, s: 'CSS ::before' });
    walk(c, acc);
    const after = pseudoText(c, '::after');
    if (after) acc.parts.push({ t: after, s: 'CSS ::after' });
    if (before || after) acc.text = true;
  });
};

/** Nom accessible du lien : aria-labelledby, aria-label, (alt pour area), contenu, title. */
const nameOf = (el) => {
  const acc = { parts: [], text: false, img: false, svg: false, unnamed: [], hiddenImg: false, decoImg: false };
  const tag = tagOf(el);
  if (tag !== 'area') {
    const before = pseudoText(el, '::before');
    if (before) acc.parts.push({ t: before, s: 'CSS ::before' });
    walk(el, acc);
    const after = pseudoText(el, '::after');
    if (after) acc.parts.push({ t: after, s: 'CSS ::after' });
    if (before || after) acc.text = true;
  }
  const content = clean(acc.parts.map((p) => p.t).join(' '));
  const lb = idrefs(el, 'aria-labelledby');
  const al = clean(el.getAttribute('aria-label'));
  const ti = clean(el.getAttribute('title'));
  const alt = tag === 'area' ? clean(el.getAttribute('alt')) : '';
  let name = '';
  let s = '';
  if (lb && lb.v.length) [name, s] = [clean(lb.v.join(' ')), 'aria-labelledby'];
  else if (al) [name, s] = [al, 'aria-label'];
  else if (alt) [name, s] = [alt, 'alt (area)'];
  else if (content) [name, s] = [content, [...new Set(acc.parts.map((p) => (p.s === 'texte' ? 'contenu' : p.s)))].join(' + ')];
  else if (ti) [name, s] = [ti, 'title'];
  let nature = 'vide';
  if (tag === 'area') nature = 'zone d’image';
  else if (acc.text && (acc.img || acc.svg)) nature = 'composite';
  else if (acc.text) nature = 'texte';
  else if (acc.svg && !acc.img) nature = 'SVG';
  else if (acc.img || acc.svg) nature = 'image';
  else if (acc.hiddenImg) nature = 'icône masquée';
  else if (acc.decoImg) nature = 'image décorative';
  return { name, s, acc, content, lb, al, ti, nature };
};

/** Texte visible du lien : sans le texte masqué visuellement (classe sr-only…), aria-hidden compris. */
const visibleText = (el) => {
  const out = [];
  const go = (node) => {
    node.childNodes.forEach((c) => {
      if (c.nodeType === 3) return out.push(c.textContent);
      if (c.nodeType !== 1 || SKIP.includes(tagOf(c)) || tagOf(c) === 'svg' || notRendered(c)) return;
      const cs = styleOf(c);
      const r = c.getBoundingClientRect();
      if ((r.width <= 1 && r.height <= 1) || /rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)/.test(cs.clip) || cs.clipPath === 'inset(50%)') return;
      out.push(` ${pseudoText(c, '::before')} `);
      go(c);
      out.push(` ${pseudoText(c, '::after')} `);
    });
  };
  if (tagOf(el) !== 'area') {
    out.push(pseudoText(el, '::before'));
    go(el);
    out.push(pseudoText(el, '::after'));
  }
  return clean(out.join(' '));
};

/** Raison pour laquelle un intitulé est peu explicite hors contexte, ou ''. */
const vagueReason = (name) => {
  const n = norm(name);
  if (!n) return 'aucune lettre ni aucun chiffre';
  if (/^(https?:\/\/|www\.)\S+$/i.test(name.trim())) return 'adresse web';
  if (VAGUE.has(n)) return 'intitulé générique';
  if (n.length <= 2) return 'intitulé très court';
  return '';
};

/* ---------- Destination et autres constats ---------- */

const destOf = (el) => {
  if (!el.hasAttribute('href')) return { raw: null, key: null };
  const raw = el.getAttribute('href').trim();
  let key = el.href || raw;
  if (/^javascript:/i.test(raw) || raw === '#') key = null;
  else key = key.replace(/\/(?=[?#]|$)/, '');
  return { raw, key };
};

const otherChecks = (e) => {
  const el = e.el;
  const out = [];
  const { raw } = e.dest;
  const n = e.n;
  if (raw !== null) {
    if (raw === '') out.push(['warning', 'href vide : le lien recharge la page']);
    else if (raw === '#') out.push(['warning', 'href="#" : pas de destination, bouton déguisé probable (rôle à vérifier, 7.1)']);
    else if (/^javascript:/i.test(raw)) out.push(['warning', 'href="javascript:…" : action en JavaScript, bouton déguisé probable (7.1)']);
    else if (raw.startsWith('#') && raw !== '#top') {
      let id = raw.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch (err) {
        /* id tel quel */
      }
      if (!byId(el, id) && !el.ownerDocument.getElementsByName(id).length) out.push(['warning', `Ancre « ${raw} » introuvable dans la page`]);
    }
  }
  if (e.role === 'link' && tagOf(el) !== 'a' && tagOf(el) !== 'area' && !el.hasAttribute('tabindex')) {
    out.push(['error', 'role="link" sans tabindex : non atteignable au clavier (7.3)']);
  } else if (e.role === 'link' && tagOf(el) !== 'a' && tagOf(el) !== 'area') {
    out.push(['warning', 'Lien ARIA : vérifier l’activation avec la touche Entrée (7.3)']);
  }
  const desc = idrefs(el, 'aria-describedby');
  const said = `${e.name} ${n.ti} ${desc ? desc.v.join(' ') : ''}`;
  const target = (el.getAttribute('target') || '').trim().toLowerCase();
  const blank = (target && !['_self', '_parent', '_top'].includes(target)) || /window\.open/.test(el.getAttribute('onclick') || '');
  if (blank && !NEW_WINDOW.test(said)) out.push(['warning', 'Ouvre une nouvelle fenêtre sans le signaler (intitulé ou title, bonne pratique)']);
  if (n.ti && n.s !== 'title' && e.name && !norm(n.ti).includes(norm(e.name))) {
    out.push(['warning', 'Le title ne reprend pas l’intitulé du lien (il doit le reprendre et le compléter)']);
  }
  let path = '';
  try {
    path = raw && !/^(javascript|mailto|tel):/i.test(raw) ? new URL(el.href).pathname : '';
  } catch (err) {
    /* adresse invalide */
  }
  const ext = (path.match(FILE_EXT) || [])[1];
  if (ext && !new RegExp(`\\b${ext}\\b|\\d\\s*(k|m|g)?o\\b|\\d\\s*(k|m|g)b\\b`, 'i').test(said)) {
    out.push(['warning', `Lien vers un fichier ${ext.toUpperCase()} : indiquer le format et le poids (bonne pratique)`]);
  }
  return out;
};

/* ---------- Critères ---------- */

const criteria = (e) => {
  const c = {};
  const n = e.n;
  if (e.name) {
    const x = [];
    if (n.s === 'title') x.push(['warning', 'Intitulé donné par le seul attribut title : restitution inégale selon les aides techniques']);
    if (n.lb && n.lb.missing.length) x.push(['warning', `aria-labelledby : id introuvable (${n.lb.missing.join(', ')})`]);
    c['6.2'] = { status: worst(['ok', ...x.map((a) => a[0])]), text: `Intitulé présent (${n.s})`, extra: x };
  } else {
    const x = [];
    n.acc.unnamed.forEach((img) =>
      x.push(['error', tagOf(img) === 'svg' ? 'SVG sans title ni aria-label' : roleOf(img) === 'img' ? 'role="img" sans nom' : `${tagOf(img)} sans attribut alt`]),
    );
    if (n.acc.decoImg) x.push(['error', 'Image décorative (alt vide) et aucun autre contenu']);
    if (n.acc.hiddenImg) x.push(['error', 'Icône masquée par aria-hidden et aucun autre contenu']);
    if (n.lb && n.lb.missing.length) x.push(['error', `aria-labelledby : id introuvable (${n.lb.missing.join(', ')})`]);
    c['6.2'] = { status: 'error', text: 'Lien sans intitulé', extra: x };
  }
  if (!e.name) {
    c['6.1'] = { status: 'hidden', text: 'Sans intitulé : voir 6.2', na: true };
    return c;
  }
  const x = [];
  const vt = e.visible;
  if (vt && norm(vt) && OVERRIDE.includes(n.s)) {
    if (!norm(e.name).includes(norm(vt))) x.push(['error', `Le nom accessible ne contient pas l’intitulé visible « ${cut(vt, 60)} » (test 6.1.5)`]);
    else x.push(['ok', 'L’intitulé visible est repris dans le nom accessible (test 6.1.5)']);
  }
  const dup = e.dupName.length;
  let main;
  if (e.vague) main = ['warning', `Peu explicite hors contexte (${e.vague}) : juger avec le contexte`];
  else if (dup) main = ['warning', `Même intitulé que ${plural(dup, 'autre lien')} vers une autre destination : juger avec le contexte`];
  else main = ['ok', 'Intitulé non générique (pertinence à juger)'];
  if (e.vague && dup) x.push(['warning', `Même intitulé que ${plural(dup, 'autre lien')} vers une autre destination`]);
  c['6.1'] = { status: worst([main[0], ...x.map((a) => a[0])]), text: main[1], quote: e.name, s: n.s, extra: x };
  return c;
};

const CRIT = ['6.1', '6.2'];

/* ---------- Inventaire ---------- */

let entries = [];
let byEl = new Map();

const isLink = (el) => {
  const r = roleOf(el);
  return !r || r === 'link' || r === 'none' || r === 'presentation';
};

const analyse = (el, idx) => {
  const e = { el, idx, role: roleOf(el), dupName: [], dupDest: [] };
  e.n = nameOf(el);
  e.name = e.n.name;
  e.dest = destOf(el);
  e.hidden = isNotExposed(el);
  // Lien focalisable et visible, mais masqué par aria-hidden : atteint au clavier sans intitulé.
  e.trap = e.hidden === 'aria-hidden' && el.tabIndex >= 0 && el.getClientRects().length > 0;
  if (!e.hidden) {
    e.visible = visibleText(el);
    e.vague = e.name ? vagueReason(e.name) : '';
  }
  return e;
};

const collect = () => {
  const found = deepAll(LINK_SEL).filter(isLink);
  entries = found.map(analyse);
  byEl = new Map(entries.map((e) => [e.el, e]));
  // Doublons : même intitulé vers des destinations différentes, et inversement.
  const shown = entries.filter((e) => !e.hidden);
  const named = shown.filter((e) => e.name && e.dest.key);
  named.forEach((e) => {
    const k = norm(e.name);
    named.forEach((o) => {
      if (o === e) return;
      if (norm(o.name) === k && o.dest.key !== e.dest.key) e.dupName.push(o);
      if (o.dest.key === e.dest.key && norm(o.name) !== k) e.dupDest.push(o);
    });
  });
  entries.forEach((e) => {
    if (e.hidden) {
      e.status = e.trap ? 'warning' : 'hidden';
      e.crit = {};
      return;
    }
    e.crit = criteria(e);
    e.other = otherChecks(e);
    e.status = worst([...Object.values(e.crit).filter((x) => !x.na).map((x) => x.status), ...e.other.map((o) => o[0])]);
  });
  const sorted = [...entries].sort((a, b) => RANK[b.status] - RANK[a.status] || a.idx - b.idx);
  const noName = shown.filter((e) => !e.name).length;
  const toJudge = shown.filter((e) => e.name && (e.vague || e.dupName.length)).length;
  const dups = shown.filter((e) => e.dupName.length).length;
  const err = shown.filter((e) => e.status === 'error').length;
  const hidden = entries.length - shown.length;
  return {
    items: sorted.map((e) => ({
      el: e.el,
      status: e.status,
      label: e.hidden ? `${e.name || '(sans intitulé)'} (masqué : ${e.hidden})` : e.name || '(sans intitulé)',
      meta: e.hidden ? (e.trap ? 'focalisable malgré aria-hidden' : 'non concerné') : `${e.n.nature}${e.name ? ` · ${e.n.s}` : ''}`,
      prefix: pills(e),
      filter: e.hidden
        ? []
        : [
            ...(e.name ? [] : ['sans']),
            ...(e.name && (e.vague || e.dupName.length) ? ['juger'] : []),
            ...(e.dupName.length || e.dupDest.length ? ['doublon'] : []),
            ...(['image', 'SVG', 'composite', 'zone d’image', 'icône masquée', 'image décorative'].includes(e.n.nature) ? ['image'] : []),
          ],
    })),
    summary:
      `${plural(shown.length, 'lien')} · ${noName ? icon('error') + ' ' : ''}${noName} sans intitulé · ` +
      `${toJudge ? icon('warning') + ' ' : ''}${toJudge} à juger en contexte · ` +
      `${plural(dups, 'intitulé')} en double · ${err ? icon('error') + ' ' : ''}${err} en erreur` +
      (hidden ? ` · ${hidden} masqué${hidden > 1 ? 's' : ''}` : ''),
  };
};

const PILL_LABEL = { error: 'erreur', warning: 'à vérifier', ok: 'conforme', hidden: 'non concerné' };
const GLYPH = { error: '×', warning: '!', ok: '✓', hidden: '∅' };

function pills(e) {
  if (e.hidden) return '';
  const keys = CRIT.filter((k) => e.crit[k] && !e.crit[k].na);
  return `<span class="pills">${keys
    .map((k) => {
      const s = e.crit[k].status;
      return `<span class="pill pill--${s}"><span aria-hidden="true">${k} ${GLYPH[s]}</span><span class="sr-only">${k} ${PILL_LABEL[s]},</span></span>`;
    })
    .join('')}</span>`;
}

/** Lien qui contient l'élément survolé (iframes de même origine et Shadow DOM compris). */
const findEntry = (target) => {
  for (let el = target; el; ) {
    const e = byEl.get(el);
    if (e) return e;
    if (el.parentElement) el = el.parentElement;
    else if (el.getRootNode && el.getRootNode().host) el = el.getRootNode().host;
    else el = null;
  }
  return null;
};

/* ---------- Contexte du lien (calculé au survol) ---------- */

const CONTEXT = { P: 'paragraphe', LI: 'item de liste', TD: 'cellule de tableau', TH: 'en-tête de tableau', DD: 'définition', DT: 'terme', BLOCKQUOTE: 'citation', FIGCAPTION: 'légende', CAPTION: 'titre de tableau', LEGEND: 'légende du groupe', LABEL: 'étiquette' };
const CONTEXT_SEL = Object.keys(CONTEXT).join(',').toLowerCase();

/** Titre (h1–h6, role="heading") qui précède le lien dans l'ordre du document. */
const prevHeading = (el) => {
  const root = el.getRootNode();
  const doc = el.ownerDocument;
  const w = doc.createTreeWalker(root.nodeType === 11 ? root : doc.body || doc.documentElement, 1);
  w.currentNode = el;
  for (let n = w.previousNode(); n; n = w.previousNode()) {
    if (n.matches('h1,h2,h3,h4,h5,h6,[role="heading"]') && !isOwn(n) && !isNotExposed(n)) return n;
  }
  return null;
};

/** Phrase qui contient le lien, si le bloc en a plusieurs. */
const sentenceOf = (block, link) => {
  const t = textOf(block);
  const lt = textOf(link);
  const i = lt ? t.indexOf(lt) : -1;
  if (i < 0) return '';
  const start = Math.max(t.lastIndexOf('. ', i), t.lastIndexOf('! ', i), t.lastIndexOf('? ', i));
  const ends = ['. ', '! ', '? '].map((p) => t.indexOf(p, i + lt.length)).filter((x) => x >= 0);
  const end = ends.length ? Math.min(...ends) + 1 : t.length;
  const s = t.slice(start < 0 ? 0 : start + 2, end).trim();
  return s.length < t.length - 1 ? s : '';
};

/** En-têtes d'une cellule : attribut headers, sinon th de la colonne et de la ligne. */
const cellHeaders = (cell) => {
  const out = [];
  const h = idrefs(cell, 'headers');
  if (h && h.els.length) return h.els.map((el) => ({ t: textOf(el), s: 'en-tête (headers)', el }));
  const tr = cell.parentElement;
  const table = cell.closest('table');
  if (!tr || !table) return out;
  const col = table.rows[0] && table.rows[0].cells[cell.cellIndex];
  if (col && col !== cell && col.tagName === 'TH') out.push({ t: textOf(col), s: 'en-tête de colonne', el: col });
  const first = tr.cells[0];
  if (first && first !== cell && first.tagName === 'TH') out.push({ t: textOf(first), s: 'en-tête de ligne', el: first });
  return out;
};

const contextOf = (e) => {
  const el = e.el;
  const out = [];
  const nn = norm(e.name);
  const add = (t, s, ctx) => {
    t = clean(t);
    if (t && norm(t) !== nn && !out.some((o) => o.t === t)) out.push({ t, s, el: ctx });
  };
  const block = el.parentElement && el.parentElement.closest(CONTEXT_SEL);
  if (block) {
    const ph = sentenceOf(block, el);
    if (ph) add(ph, 'phrase', block);
    add(textOf(block), CONTEXT[block.tagName] || tagOf(block), block);
    if (block.tagName === 'LI') {
      const parent = block.parentElement && block.parentElement.closest('li');
      if (parent) add(textOf(parent), 'item de liste parent', parent);
    }
    if (block.tagName === 'TD' || block.tagName === 'TH') cellHeaders(block).forEach((h) => add(h.t, h.s, h.el));
  } else if (el.parentElement && textOf(el.parentElement).length <= 300) {
    add(textOf(el.parentElement), `élément parent <${tagOf(el.parentElement)}>`, el.parentElement);
  }
  const h = prevHeading(el);
  if (h) add(textOf(h), `titre ${h.getAttribute('role') === 'heading' ? 'role="heading"' : tagOf(h)} qui précède`, h);
  return out;
};

/* ---------- Détail ---------- */

const critBlock = (num, r) =>
  `<div class="crit"><span class="crit-num">${num}</span><div class="crit-body">${flag(r.status, r.text)}` +
  `${r.quote ? `<div class="quote">« ${esc(cut(r.quote, 200))} » ${src(r.s)}</div>` : ''}` +
  `${(r.extra || []).map(([t, txt]) => `<div>${flag(t, txt)}</div>`).join('')}</div></div>`;

const elementLabel = (e) => `&lt;${esc(tagOf(e.el))}&gt;${e.role ? ` ${src(`role="${e.role}"`)}` : ''}`;

const linkDetail = (e) => {
  const n = e.n;
  const ctx = [];
  if (e.hidden) {
    let html = row('Lien', elementLabel(e)) + row('Intitulé', e.name ? `${esc(cut(e.name))} ${src(n.s)}` : '<span class="muted">aucun</span>');
    html += `<p class="note">${
      e.trap
        ? flag('warning', 'Masqué par aria-hidden mais visible et focalisable : atteint au clavier sans être restitué')
        : flag('hidden', `Masqué (${e.hidden}) : non concerné`)
    }</p>`;
    return { html, ctx };
  }
  let html = row('Élément', elementLabel(e));
  html += row('Nature', esc(n.nature));
  html += row('Intitulé', e.name ? `${esc(cut(e.name, 200))} ${src(n.s)}` : icon('error', 'Absent') + ' <span class="text-error">aucun</span>');
  if (n.acc.parts.length > 1 && n.content === e.name) html += row('Composé de', list(n.acc.parts.map((p) => `${esc(cut(p.t, 80))} ${src(p.s === 'texte' ? 'texte' : p.s)}`)));
  if (OVERRIDE.includes(n.s) && n.content) html += row('Contenu', esc(cut(n.content)));
  if (e.visible && norm(e.visible) !== norm(e.name)) html += row('Texte visible', esc(cut(e.visible)));
  if (n.ti && n.s !== 'title') html += row('title', `${esc(cut(n.ti))}${norm(n.ti) === norm(e.name) ? ' <span class="muted small">(identique à l’intitulé : inutile)</span>' : ''}`);
  const desc = idrefs(e.el, 'aria-describedby');
  if (desc && desc.v.length) html += row('Description', `${esc(cut(desc.v.join(' ')))} ${src('aria-describedby')}`);
  const tgt = e.el.getAttribute('target');
  html += row(
    'Destination',
    e.dest.raw === null ? '<span class="muted">aucun href</span>' : `${esc(cut(e.dest.raw || '(vide)', 100))}${tgt ? ` ${src(`target="${tgt}"`)}` : ''}`,
  );
  if (e.name) {
    const c = contextOf(e);
    c.forEach((x) => x.el && ctx.push(x.el));
    html += row('Contexte', c.length ? list(c.map((x) => `${esc(cut(x.t, 200))} ${src(x.s)}`)) : '<span class="muted">aucun (lien seul)</span>');
  }
  html += '<div class="crits">';
  CRIT.forEach((k) => e.crit[k] && (html += critBlock(k, e.crit[k])));
  html += '</div>';
  if (e.dupName.length) {
    const dests = [...new Set(e.dupName.map((o) => o.dest.raw))];
    html += row('Même intitulé vers', list(dests.slice(0, 5).map((d) => esc(cut(d, 80)))) + (dests.length > 5 ? `<span class="muted">… et ${dests.length - 5} autres</span>` : ''));
  }
  if (e.dupDest.length) {
    const names = [...new Set(e.dupDest.map((o) => o.name))];
    html += row('Même destination, autre intitulé', list(names.slice(0, 5).map((d) => esc(cut(d, 80)))));
  }
  if (e.other.length) html += `<ul class="checks">${e.other.map(([t, txt]) => `<li>${flag(t, txt)}</li>`).join('')}</ul>`;
  return { html, ctx };
};

/* ---------- Outil « Intitulés » : l'intitulé de chaque lien affiché sur la page ---------- */

const OVERLAY_CSS = `
:host{all:initial}
.tag{position:fixed;z-index:${Number(THEME.zIndex) - 1};pointer-events:none;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
font:700 10px/1.3 ${THEME.font};color:#fff;background:${THEME.color.focus};padding:1px 4px;border-radius:2px;opacity:.92}
.tag--warning{background:${THEME.color.warning}}
.tag--error{background:${THEME.color.error}}
`;
let namesHost = null;
let namesItems = [];
const MAX_TAGS = 2000;

const placeNames = () => {
  namesItems.forEach(({ el, tag }) => {
    const r = el.getBoundingClientRect();
    const [x, y] = toTopCoords(el.ownerDocument.defaultView, r.left, r.top);
    tag.hidden = !el.isConnected || r.width === 0;
    tag.style.left = `${Math.max(0, x)}px`;
    tag.style.top = `${Math.max(0, y - 14)}px`;
  });
};

const setNames = (on) => {
  if (namesHost) {
    namesHost.remove();
    namesHost = null;
    namesItems = [];
    allDocuments().forEach((d) => d.removeEventListener('scroll', placeNames, true));
    window.removeEventListener('resize', placeNames);
  }
  if (!on) return;
  namesHost = document.createElement('div');
  namesHost.setAttribute('data-rgaa-bookmarklet', '');
  const root = namesHost.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${OVERLAY_CSS}</style>`;
  entries
    .filter((e) => !e.hidden)
    .slice(0, MAX_TAGS)
    .forEach((e) => {
      const tag = document.createElement('span');
      const s = e.crit['6.2'].status === 'error' || e.crit['6.1'].status === 'error' ? 'error' : e.crit['6.1'].status === 'warning' ? 'warning' : 'ok';
      tag.className = `tag tag--${s}`;
      tag.textContent = e.name ? cut(e.name, 50) : '∅ sans intitulé';
      root.appendChild(tag);
      namesItems.push({ el: e.el, tag });
    });
  (document.body || document.documentElement).appendChild(namesHost);
  placeNames();
  allDocuments().forEach((d) => d.addEventListener('scroll', placeNames, true));
  window.addEventListener('resize', placeNames);
};

/* ---------- Lancement ---------- */

const DETAIL_CSS = `
.crits{margin-top:8px;border-top:1px solid var(--rgaa-sep)}
.crit{display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--rgaa-sep)}
.crit-num{flex:0 0 2.6em;font-weight:700}
.crit-body{min-width:0;display:flex;flex-direction:column;gap:3px}
.quote{font-style:italic}
.note{margin:8px 0 0}
.crits + .row{margin-top:8px}
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
const toggleNames = () => setNames(!namesHost);

const ui = inspector({
  id: ID,
  css: DETAIL_CSS,
  maxWidth: 480,
  pinOnLocate: true,
  list: {
    title: 'Liens',
    collect,
    filters: [
      { id: 'sans', label: 'Sans intitulé' },
      { id: 'juger', label: 'À juger' },
      { id: 'doublon', label: 'Doublons' },
      { id: 'image', label: 'Liens image' },
    ],
    tools: [{ label: 'Intitulés', pressed: () => !!namesHost, toggle: toggleNames }],
    footer:
      'La liste montre les intitulés hors contexte, comme la liste des liens d’un lecteur d’écran. ' +
      'Intitulés (Maj+N) : affiche l’intitulé de chaque lien sur la page.',
  },
  onKey(e) {
    if (!keyOk(e) || e.key.toLowerCase() !== 'n') return false;
    toggleNames();
    return true;
  },
  onStop: () => setNames(false),
  inspect(target) {
    const e = findEntry(target);
    if (!e) return null;
    const d = linkDetail(e);
    const hl = [[e.el, 'primary']];
    d.ctx.forEach((el) => hl.push([el, 'secondary']));
    if (e.n.lb) e.n.lb.els.forEach((el) => hl.push([el, 'secondary']));
    return { html: d.html, highlight: hl };
  },
});

// Pastilles de la liste : ajoutées au Shadow DOM du panneau liste.
const listHost = document.getElementById(`${ID}-liste`);
if (ui && listHost && listHost.shadowRoot) {
  const st = document.createElement('style');
  st.textContent = LIST_CSS;
  listHost.shadowRoot.appendChild(st);
}
