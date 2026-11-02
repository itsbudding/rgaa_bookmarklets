/**
 * RGAA 9 – Titres : plan des titres de la page (critère 9.1).
 *
 * Le panneau liste montre le plan dans l'ordre du document, en retrait selon
 * le niveau, comme la liste des titres d'un lecteur d'écran (h1–h6 et
 * role="heading"). Chaque document (page, iframe de même origine) a son
 * propre plan. Une pastille par test :
 *  - 9.1.1 hiérarchie : aria-level manquant ou invalide (×), saut de niveau,
 *    plan qui ne commence pas au plus haut niveau, titre affiché plus gros
 *    que son titre parent (!). D'après le glossaire du RGAA, les sauts de
 *    niveau et l'absence de h1 n'invalident pas le critère : jamais d'erreur ;
 *  - 9.1.2 contenu : titre vide ou image sans alternative (×), titre
 *    générique, très long, en double, nom qui remplace le texte affiché (!).
 *    La pertinence reste à juger : la pastille est toujours « ! », mais la
 *    ligne est ✓ quand rien d'autre n'est signalé.
 * 9.1.3 : les passages qui ressemblent à un titre (texte court en gras ou
 * plus grand que le texte courant, suivi de contenu) sont rangés dans
 * l'accordéon « Titres probables », fermé par défaut.
 *
 * Outils : Plan sur la page (Maj+H), Titres probables (Maj+P), Copier le plan.
 */
import { inspector } from '../lib/floating-panel.js';
import { row, esc, src, icon, list } from '../lib/dom.js';
import { norm, isNotExposed, isOwn, toTopCoords, allDocuments, textOf } from '../lib/a11y.js';
import { THEME } from '../lib/theme.js';
import { nameOf, visibleText, clean, styleOf } from '../lib/name.js';

const ID = 'rgaa-9-titres';
const OWN = '[data-rgaa-bookmarklet]';

/** Constat avec icône ; ∅ se lit « Non concerné » (et non « Masqué »). */
const flag = (type, text) =>
  `<span class="flag flag--${type}">${icon(type, type === 'hidden' ? 'Non concerné' : undefined)}<span>${esc(text)}</span></span>`;

const RANK = { error: 3, warning: 2, ok: 1, hidden: 0 };
const worst = (l) => l.reduce((w, s) => (RANK[s] > RANK[w] ? s : w), 'ok');
const tagOf = (e) => e.tagName.toLowerCase();
const roleOf = (e) => (e.getAttribute('role') || '').trim().split(/\s+/)[0].toLowerCase();
const plural = (n, s, p = `${s}s`) => `${n} ${n > 1 ? p : s}`;
const cut = (t, n = 120) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const px = (v) => `${Math.round(v * 10) / 10}px`;
const HX = /^H[1-6]$/;

/** Titres génériques (comparés après norm()). */
const GENERIC = new Set(
  [
    'titre', 'sans titre', 'titre de la page', 'titre de section', 'sous titre', 'rubrique', 'section', 'contenu', 'texte',
    'en savoir plus', 'savoir plus', 'lire la suite', 'plus', 'voir plus', 'détails', 'informations', 'infos', 'divers',
    'lorem ipsum', 'heading', 'title', 'untitled', 'new section', 'nouveau titre', 'titre 1', 'titre 2', 'titre 3',
  ].map(norm),
);
const LONG = 120;

/* ---------- Visibilité ---------- */

/** Titre restitué mais caché visuellement (sr-only, clip, hors écran), ou ''. */
const visuallyHidden = (el) => {
  const r = el.getBoundingClientRect();
  if (r.width <= 1 || r.height <= 1) return 'taille de 1px';
  const win = el.ownerDocument.defaultView;
  if (r.right + win.scrollX <= 0 || r.bottom + win.scrollY <= 0) return 'hors écran';
  for (let e = el; e && e.nodeType === 1; e = e.parentElement || (e.getRootNode().host || null)) {
    const cs = styleOf(e);
    if (/rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)/.test(cs.clip) || cs.clipPath === 'inset(50%)') return 'clip';
    if (Number(cs.opacity) === 0) return 'opacity:0';
    if (e === el.ownerDocument.body) break;
  }
  return '';
};

/* ---------- Parcours : titres et passages candidats, dans l'ordre ---------- */

const NOT_PROBABLE =
  'h1,h2,h3,h4,h5,h6,[role="heading"],a,button,label,legend,caption,summary,select,textarea,option,td,th,nav,' +
  '[role="navigation"],[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="option"],[role="tooltip"],' +
  '[role="status"],[role="alert"],[aria-live],figcaption,blockquote,pre,code';
const CANDIDATE_TAGS = new Set(['P', 'DIV', 'DT', 'SPAN', 'STRONG', 'B']);
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'svg', 'IFRAME', 'FRAME', 'OBJECT', 'SELECT', 'TEXTAREA', 'HEAD']);

/**
 * Parcourt un document (et ses Shadow DOM ouverts, mais pas ses iframes) dans
 * l'ordre : renvoie les titres, les passages candidats et, pour chaque
 * titre, le contenu de sa section (jusqu'au titre suivant).
 */
const walkDoc = (doc) => {
  const heads = [];
  const cands = [];
  let cur = null;
  const visit = (root) => {
    for (let c = root.firstElementChild; c; c = c.nextElementSibling) {
      if (c.matches(OWN) || SKIP_TAGS.has(c.tagName)) continue;
      const role = roleOf(c);
      const isHx = HX.test(c.tagName);
      if (role === 'heading' || isHx) {
        const h = { el: c, isHx, role, sec: { p: 0, list: 0, table: 0, img: 0, other: 0 }, order: heads.length };
        heads.push(h);
        // Le contenu d'un titre ne fait pas partie de sa section.
        if (c.shadowRoot) visit(c.shadowRoot);
        // Un h2 role="presentation" n'est plus un titre : sa section reste celle du titre précédent.
        if (!(isHx && role && role !== 'heading')) cur = h;
        continue;
      }
      if (cur) {
        const t = c.tagName;
        if (t === 'P') cur.sec.p++;
        else if (t === 'UL' || t === 'OL' || t === 'DL') cur.sec.list++;
        else if (t === 'TABLE') cur.sec.table++;
        else if (t === 'IMG' || t === 'PICTURE' || t === 'VIDEO' || t === 'FIGURE') cur.sec.img++;
        else if (t === 'FORM' || t === 'FIELDSET') cur.sec.other++;
      }
      if (CANDIDATE_TAGS.has(c.tagName)) cands.push({ el: c, after: heads.length });
      if (c.shadowRoot) visit(c.shadowRoot);
      visit(c);
    }
  };
  if (doc.body) visit(doc.body);
  return { heads, cands };
};

/* ---------- Analyse d'un titre ---------- */

/** Niveau restitué et sa source, avec les erreurs d'aria-level. */
const levelOf = (el, isHx) => {
  const raw = el.getAttribute('aria-level');
  const tagLevel = isHx ? Number(el.tagName[1]) : null;
  const out = { level: tagLevel || 2, src: isHx ? tagOf(el) : '', issues: [] };
  if (raw !== null) {
    const v = raw.trim();
    if (/^\d+$/.test(v) && Number(v) >= 1) {
      out.level = Number(v);
      out.src = !isHx ? `role="heading" aria-level="${v}"` : out.level === tagLevel ? tagOf(el) : `aria-level="${v}", remplace ${tagOf(el)}`;
      if (out.level > 6) out.issues.push(['warning', `Niveau ${out.level} : au-delà de 6, restitution variable selon les lecteurs d’écran`]);
      return out;
    }
    out.issues.push([
      isHx ? 'warning' : 'error',
      `aria-level="${raw}" invalide (entier de 1 ou plus attendu)${isHx ? ` : niveau de la balise ${tagOf(el)} utilisé` : ' : niveau 2 par défaut'}`,
    ]);
    if (!isHx) out.src = `role="heading", aria-level invalide`;
  } else if (!isHx) {
    out.src = 'role="heading" sans aria-level';
    out.issues.push(['error', 'role="heading" sans aria-level (exigé par le test 9.1.1) : niveau 2 par défaut']);
  }
  return out;
};

const fontOf = (el) => {
  // Le texte peut être dans un enfant (<h2><span class="grand">…) : on prend la plus grande taille.
  let size = parseFloat(styleOf(el).fontSize) || 0;
  let weight = Number(styleOf(el).fontWeight) || 400;
  el.querySelectorAll('*').forEach((c) => {
    if (!c.firstChild || ![...c.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
    const cs = styleOf(c);
    const s = parseFloat(cs.fontSize) || 0;
    if (s > size) [size, weight] = [s, Number(cs.fontWeight) || weight];
  });
  return { size, weight };
};

/** Contrôles du contenu (9.1.2). */
const contentCheck = (h) => {
  const x = [];
  const n = h.n;
  if (!h.name) {
    if (n.acc.unnamed.length) x.push(['error', 'Titre fait d’une image sans alternative']);
    else if (n.acc.decoImg) x.push(['error', 'Titre fait d’une image décorative (alt vide) : titre vide']);
    else if (n.acc.hiddenImg || (clean(h.el.textContent) && h.el.querySelector('[aria-hidden="true"]'))) x.push(['error', 'Contenu masqué par aria-hidden : titre vide']);
    return { status: 'error', text: 'Titre vide (aucun nom accessible)', extra: x };
  }
  if (n.acc.unnamed.length) x.push(['warning', 'Contient une image sans alternative']);
  if (GENERIC.has(norm(h.name))) x.push(['warning', 'Titre générique : décrit-il la section ?']);
  if (h.name.length > LONG) x.push(['warning', `Titre très long (${h.name.length} caractères) : paragraphe balisé en titre ?`]);
  if (h.visible && norm(h.visible) && ['aria-labelledby', 'aria-label'].includes(n.s) && norm(h.visible) !== norm(h.name)) {
    x.push(['warning', `Le nom (${n.s}) remplace le texte affiché « ${cut(h.visible, 60)} »`]);
  }
  if (h.dup) x.push(['warning', `Même texte que le titre ${h.dup.tag} précédent, de même niveau (titre en double)`]);
  const status = worst(['warning', ...x.map((a) => a[0])]);
  return { status, text: x.length ? 'À vérifier' : 'Pertinence à juger', extra: x, base: !x.length };
};

/* ---------- Inventaire ---------- */

let docs = [];
let entries = [];
let probables = [];
let byEl = new Map();

/** Taille du texte courant d'un document : la plus fréquente, pondérée par la longueur du texte. */
const baseSize = (doc) => {
  const sizes = new Map();
  const w = doc.createTreeWalker(doc.body || doc.documentElement, 4);
  let i = 0;
  for (let t = w.nextNode(); t && i < 4000; t = w.nextNode(), i++) {
    const len = t.textContent.trim().length;
    const p = t.parentElement;
    if (!len || !p || SKIP_TAGS.has(p.tagName) || p.closest(`${OWN},pre,code,kbd,samp,h1,h2,h3,h4,h5,h6,[role="heading"]`)) continue;
    const s = parseFloat(styleOf(p).fontSize);
    if (s) sizes.set(s, (sizes.get(s) || 0) + len);
  }
  let best = 16;
  let max = 0;
  sizes.forEach((v, k) => v > max && ([best, max] = [k, v]));
  return best;
};

const BLOCK = /^(block|flex|grid|list-item|table-caption|flow-root)$/;

/** Le passage est-il un « titre probable » (9.1.3) ? Renvoie la raison, ou null. */
const probable = (c, base) => {
  const el = c.el;
  const raw = el.textContent.trim();
  if (!raw || raw.length > 200) return null;
  if (el.closest(NOT_PROBABLE) || isOwn(el) || el.querySelector('a,button,input,select,textarea,label,img,svg')) return null;
  const cs = styleOf(el);
  // strong / b / span : seulement s'il porte tout le texte de son bloc parent (qui est alors testé à sa place).
  if (!BLOCK.test(cs.display)) return null;
  // Bloc « feuille » : aucun enfant de type bloc.
  for (const k of el.children) if (BLOCK.test(styleOf(k).display) || k.tagName === 'BR') return null;
  const text = textOf(el);
  if (!text || text.length > 80 || /[.!?…;,]$/.test(text) || !/\p{L}/u.test(text)) return null;
  if (isNotExposed(el) || visuallyHidden(el)) return null;
  // Taille et graisse du texte : chaque nœud texte doit être en gras, ou tous assez grands.
  const nodes = [];
  const w = el.ownerDocument.createTreeWalker(el, 4);
  for (let t = w.nextNode(); t; t = w.nextNode()) if (t.textContent.trim()) nodes.push(styleOf(t.parentElement));
  if (!nodes.length) return null;
  const bold = nodes.every((s) => Number(s.fontWeight) >= 600);
  const size = Math.min(...nodes.map((s) => parseFloat(s.fontSize) || 0));
  const big = size >= base * 1.2 && size >= base + 2;
  if (!bold && !big) return null;
  // Suivi d'un contenu dans le même conteneur.
  let next = el.nextElementSibling;
  while (next && (SKIP_TAGS.has(next.tagName) || isNotExposed(next) || !textOf(next))) next = next.nextElementSibling;
  if (!next || HX.test(next.tagName) || roleOf(next) === 'heading') return null;
  const nt = textOf(next);
  const nextKind = { UL: 'une liste', OL: 'une liste', DL: 'une liste', TABLE: 'un tableau', FORM: 'un formulaire', FIELDSET: 'un formulaire' }[next.tagName];
  if (!nextKind && nt.length < Math.max(40, text.length + 10)) return null;
  // Le suivant ne doit pas avoir le même style (suite de libellés en gras).
  const ns = styleOf(next);
  if (bold && !big && Number(ns.fontWeight) >= 600 && parseFloat(ns.fontSize) === size) return null;
  const why = [bold ? 'gras' : '', big ? px(size) : ''].filter(Boolean).join(', ');
  return { text, why, size, bold, next, nextKind: nextKind || (next.tagName === 'P' ? 'un paragraphe' : `un bloc <${tagOf(next)}>`) };
};

const analyseDoc = (doc, label) => {
  const { heads, cands } = walkDoc(doc);
  const plan = [];
  const out = [];
  heads.forEach((h) => {
    const role = h.role;
    h.doc = doc;
    h.tag = h.isHx ? tagOf(h.el) : 'role="heading"';
    // h2 role="presentation" (ou autre rôle) : n'est plus un titre.
    if (h.isHx && role && role !== 'heading') {
      h.removed = `role="${role}"`;
      h.status = 'hidden';
      h.name = textOf(h.el);
      out.push(h);
      return;
    }
    h.hidden = isNotExposed(h.el);
    h.n = nameOf(h.el);
    h.name = h.n.name;
    if (h.hidden) {
      h.status = 'hidden';
      out.push(h);
      // Titre masqué : son contenu revient au titre restitué précédent.
      const last = plan[plan.length - 1];
      if (last) Object.keys(h.sec).forEach((k) => (last.sec[k] += h.sec[k]));
      return;
    }
    h.lv = levelOf(h.el, h.isHx);
    h.level = h.lv.level;
    h.sr = h.name ? visuallyHidden(h.el) : '';
    h.visible = visibleText(h.el);
    h.font = fontOf(h.el);
    plan.push(h);
  });
  // Hiérarchie : parents, sauts, niveau visuel, doublons.
  const min = plan.length ? Math.min(...plan.map((h) => h.level)) : 0;
  const stack = [];
  plan.forEach((h, i) => {
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
    h.parents = [...stack];
    h.parent = stack[stack.length - 1] || null;
    stack.push(h);
    h.prev = plan[i - 1] || null;
    h.children = 0;
    if (h.parent) h.parent.children++;
    const x = [...h.lv.issues];
    if (i === 0 && h.level > min) x.push(['warning', `Le plan commence au niveau ${h.level}, puis descend au niveau ${min} : cohérence à vérifier`]);
    if (h.prev && h.level > h.prev.level + 1) {
      h.jump = `h${h.prev.level} → h${h.level}`;
      x.push(['warning', `Saut de niveau ${h.jump} : n’invalide pas le critère si la hiérarchie reste cohérente`]);
    }
    const p = h.parent;
    if (p && !h.sr && !p.sr && h.font.size > p.font.size + 0.5) {
      x.push(['warning', `Titre de niveau ${h.level} plus grand que son titre parent de niveau ${p.level} (${px(h.font.size)} contre ${px(p.font.size)}) : niveau choisi pour l’apparence ?`]);
    }
    h.h1 = h.level === 1;
    if (h.prev && h.prev.level === h.level && h.name && norm(h.prev.name) === norm(h.name)) h.dup = h.prev;
    const status = worst(['ok', ...x.map((a) => a[0])]);
    h.crit = {
      '9.1.1': { status, text: x.length ? (status === 'error' ? 'Erreur dans le code' : 'À vérifier') : 'Niveau cohérent avec le titre précédent', extra: x },
    };
    h.crit['9.1.2'] = contentCheck(h);
    h.status = worst([status, h.crit['9.1.2'].base ? 'ok' : h.crit['9.1.2'].status]);
    h.indent = h.level - min;
  });
  // Titres probables.
  const base = baseSize(doc);
  const probs = [];
  const seen = new Set();
  cands.forEach((c) => {
    const r = probable(c, base);
    if (!r) return;
    // Un bloc qui contient un autre candidat retenu : on garde le plus petit.
    if ([...seen].some((s) => c.el.contains(s) || s.contains(c.el))) return;
    seen.add(c.el);
    const before = plan.filter((h) => h.order < c.after).pop() || null;
    probs.push({ el: c.el, doc, ...r, prevHead: before, would: before ? Math.min(before.level + 1, 6) : Math.max(min, 1), base, probable: true, status: 'warning' });
  });
  return { doc, label, plan, out, probs, min, base };
};

const docLabel = (doc) => {
  const f = doc.defaultView && doc.defaultView.frameElement;
  if (!f) return '';
  const t = clean(f.getAttribute('title') || f.getAttribute('aria-label') || '');
  return t ? `Iframe « ${cut(t, 50)} »` : `Iframe sans titre (${cut(clean(f.getAttribute('src') || 'srcdoc'), 40)})`;
};

const PILL_LABEL = { error: 'erreur', warning: 'à vérifier', ok: 'conforme', hidden: 'non concerné' };
const GLYPH = { error: '×', warning: '!', ok: '✓', hidden: '∅' };
const pill = (k, s) =>
  `<span class="pill pill--${s}"><span aria-hidden="true">${k} ${GLYPH[s]}</span><span class="sr-only">${k} ${PILL_LABEL[s]},</span></span>`;
const pills = (h) => `<span class="pills">${['9.1.1', '9.1.2'].map((k) => pill(k, h.crit[k].status)).join('')}</span>`;
const lvlTag = (h) => `<span class="lvl">h${h.level}${h.isHx && !h.lv.src.startsWith('aria-level') ? '' : '*'}</span>`;

const docSummary = (d) => {
  const h1 = d.plan.filter((h) => h.level === 1).length;
  return h1 ? plural(h1, 'h1', 'h1') : 'pas de h1';
};

const collect = () => {
  const all = allDocuments();
  docs = all.map((doc, i) => analyseDoc(doc, i ? docLabel(doc) : ''));
  entries = docs.flatMap((d) => [...d.plan, ...d.out]);
  probables = docs.flatMap((d) => d.probs);
  byEl = new Map([...probables.map((p) => [p.el, p]), ...entries.map((e) => [e.el, e])]);
  const items = [];
  docs.forEach((d, i) => {
    if (i && !d.plan.length && !d.out.length) return;
    if (i) items.push({ section: true, label: `${d.label} : ${plural(d.plan.length, 'titre')}, ${docSummary(d)}` });
    d.plan.forEach((h) =>
      items.push({
        el: h.el,
        status: h.status,
        indent: h.indent,
        prefix: lvlTag(h) + pills(h),
        label: h.name || '(titre vide)',
        meta: [h.jump ? `saut ${h.jump}` : '', h.sr ? 'caché visuellement' : ''].filter(Boolean).join(' · '),
        filter: [...(h.status === 'error' ? ['erreurs'] : []), ...(h.status !== 'ok' ? ['verifier'] : [])],
      }),
    );
  });
  // Masqués et rôles retirés : en fin de liste, hors du plan.
  docs.forEach((d) =>
    d.out.forEach((h) =>
      items.push({
        el: h.el,
        status: 'hidden',
        label: `${h.tag} ${h.name || '(vide)'}`,
        meta: h.removed ? `rôle titre retiré (${h.removed})` : `masqué : ${h.hidden}`,
      }),
    ),
  );
  probables.forEach((p) =>
    items.push({
      el: p.el,
      status: 'warning',
      accordion: 'probables',
      prefix: `<span class="pills">${pill('9.1.3', 'warning')}</span>`,
      label: p.text,
      meta: p.why,
      filter: ['verifier'],
    }),
  );
  const main = docs[0];
  const plan = docs.flatMap((d) => d.plan);
  const err = plan.filter((h) => h.status === 'error').length;
  const jumps = plan.filter((h) => h.jump).length;
  const hidden = entries.length - plan.length;
  return {
    count: plan.length,
    items,
    summary:
      (main.plan.length ? `${plural(main.plan.length, 'titre')}` : `${icon('error')} aucun titre dans la page`) +
      ` · ${err ? icon('error') + ' ' : ''}${plural(err, 'erreur')} · ${jumps ? icon('warning') + ' ' : ''}${plural(jumps, 'saut')} de niveau · ${docSummary(main)}` +
      (hidden ? ` · ${plural(hidden, 'non restitué')}` : '') +
      (docs.length > 1 && plan.length > main.plan.length ? ` · ${plan.length - main.plan.length} dans des iframes` : ''),
  };
};

/** Titre ou passage qui contient l'élément survolé. */
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

/* ---------- Détail ---------- */

const critBlock = (num, r) =>
  `<div class="crit"><span class="crit-num">${num}</span><div class="crit-body">${flag(r.status, r.text)}` +
  `${(r.extra || []).map(([t, txt]) => `<div>${flag(t, txt)}</div>`).join('')}</div></div>`;

const crumb = (h) => `h${h.level} ${esc(cut(h.name || '(vide)', 50))}`;

const sectionText = (h) => {
  const s = h.sec;
  const parts = [
    s.p && plural(s.p, 'paragraphe'),
    s.list && plural(s.list, 'liste'),
    s.table && plural(s.table, 'tableau', 'tableaux'),
    s.img && plural(s.img, 'image ou média', 'images ou médias'),
    s.other && plural(s.other, 'formulaire'),
  ].filter(Boolean);
  const kids = h.children ? `${plural(h.children, 'sous-titre')} · ` : '';
  return parts.length ? `${kids}${parts.join(', ')} avant le titre suivant` : `${kids}<span class="muted">aucun paragraphe, liste ni tableau avant le titre suivant</span>`;
};

const headingDetail = (h) => {
  if (h.removed) {
    return (
      row('Élément', `&lt;${esc(h.tag)}&gt; ${src(h.removed)}`) +
      row('Texte', esc(cut(h.name || '(vide)'))) +
      `<p class="note">${flag('hidden', `Rôle titre retiré par ${h.removed} : ce texte n’est pas restitué comme un titre`)}</p>` +
      `<p class="note">${flag('warning', 'Si ce texte est un titre, il doit être balisé comme tel (9.1.3)')}</p>`
    );
  }
  if (h.hidden) {
    return (
      row('Élément', `&lt;${esc(tagOf(h.el))}&gt;`) +
      row('Titre', esc(cut(h.name || '(vide)'))) +
      `<p class="note">${flag('hidden', `Masqué (${h.hidden}) : non restitué, non concerné`)}</p>`
    );
  }
  const n = h.n;
  let html = row('Niveau', `${h.level} ${src(h.lv.src)}`);
  html += row('Titre', h.name ? `${esc(cut(h.name, 200))} ${src(n.s)}` : `${icon('error', 'Absent')} <span class="text-error">vide</span>`);
  if (h.visible && norm(h.visible) !== norm(h.name)) html += row('Texte visible', esc(cut(h.visible)));
  if (h.parents.length) html += row('Titres parents', h.parents.map(crumb).join(' › '));
  else html += row('Titres parents', '<span class="muted">aucun (premier niveau du plan)</span>');
  if (h.prev && h.prev !== h.parent) html += row('Titre précédent', crumb(h.prev));
  html += row('Section', sectionText(h));
  html += row(
    'Apparence',
    `${px(h.font.size)}${h.font.weight >= 600 ? ', gras' : ''}${h.parent && !h.parent.sr ? ` <span class="muted small">(titre parent : ${px(h.parent.font.size)})</span>` : ''}`,
  );
  html += row('Visibilité', h.sr ? `caché visuellement ${src(h.sr)} <span class="muted small">compte comme présent (glossaire RGAA)</span>` : 'affiché');
  html += '<div class="crits">';
  ['9.1.1', '9.1.2'].forEach((k) => (html += critBlock(k, h.crit[k])));
  html += '</div>';
  return html;
};

const probableDetail = (p) => {
  let html = row('Passage', `&lt;${esc(tagOf(p.el))}&gt; « ${esc(cut(p.text, 100))} »`);
  html += row('Ressemble à un titre', `${esc(p.why)} <span class="muted small">(texte courant : ${px(p.base)})</span>`);
  html += row('Suivi de', esc(p.nextKind));
  html += row('Serait', p.prevHead ? `un h${p.would} sous « ${esc(cut(p.prevHead.name || '(vide)', 50))} »` : `un h${p.would} (aucun titre avant)`);
  html += `<div class="crits">${critBlock('9.1.3', {
    status: 'warning',
    text: 'Titre probable non balisé : si c’est un titre, utiliser h1–h6 ou role="heading" + aria-level',
  })}</div>`;
  return html;
};

/* ---------- Outils sur la page : plan et titres probables ---------- */

const LEVEL_COLORS = ['#0d47a1', '#1e7b34', '#4527a0', '#00695c', '#5d4037', '#37474f']; // texte blanc ≥ 4,5:1
const PROBABLE_COLOR = '#ad1457';
const OVERLAY_CSS = `
:host{all:initial}
.box{position:fixed;z-index:${Number(THEME.zIndex) - 1};pointer-events:none;border:2px solid;border-radius:2px;box-sizing:border-box}
.box--dashed{border-style:dashed}
.tag{position:fixed;z-index:${Number(THEME.zIndex) - 1};pointer-events:none;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
font:700 11px/1.3 ${THEME.font};color:#fff;padding:1px 4px;border-radius:2px}
`;
const overlays = { plan: null, probables: null };
const MAX_TAGS = 2000;

const makeOverlay = (key, list) => {
  const host = document.createElement('div');
  host.setAttribute('data-rgaa-bookmarklet', '');
  host.id = `${ID}-${key}`;
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${OVERLAY_CSS}</style>`;
  const items = list.slice(0, MAX_TAGS).map(({ el, text, color, dashed }) => {
    const box = document.createElement('div');
    box.className = `box${dashed ? ' box--dashed' : ''}`;
    box.style.borderColor = color;
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.style.background = color;
    tag.textContent = text;
    root.append(box, tag);
    return { el, box, tag };
  });
  const place = () =>
    items.forEach(({ el, box, tag }) => {
      const r = el.getBoundingClientRect();
      const [x, y] = toTopCoords(el.ownerDocument.defaultView, r.left, r.top);
      const off = !el.isConnected || (!r.width && !r.height);
      box.hidden = off || r.width <= 1 || r.height <= 1;
      // Étiquette masquée quand le titre est hors de l'écran (sinon elles s'empilent en haut).
      tag.hidden = off || y + r.height < 0 || y > window.innerHeight;
      Object.assign(box.style, { left: `${x - 2}px`, top: `${y - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px` });
      // Titre caché visuellement : l'étiquette reste visible à sa place (ramenée dans l'écran).
      tag.style.left = `${Math.max(0, Math.min(x, window.innerWidth - 60))}px`;
      tag.style.top = `${Math.max(0, y - 17)}px`;
    });
  (document.body || document.documentElement).appendChild(host);
  place();
  allDocuments().forEach((d) => d.addEventListener('scroll', place, true));
  window.addEventListener('resize', place);
  overlays[key] = { host, place };
};

const removeOverlay = (key) => {
  const o = overlays[key];
  if (!o) return;
  o.host.remove();
  allDocuments().forEach((d) => d.removeEventListener('scroll', o.place, true));
  window.removeEventListener('resize', o.place);
  overlays[key] = null;
};

const setPlan = (on) => {
  removeOverlay('plan');
  if (!on) return;
  makeOverlay(
    'plan',
    docs
      .flatMap((d) => d.plan)
      .map((h) => {
        const bad = h.status === 'error' || h.crit['9.1.1'].status === 'error';
        const warn = h.crit['9.1.1'].status === 'warning';
        return {
          el: h.el,
          text: `h${h.level}${h.sr ? ' caché' : ''}${h.jump ? ` (saut ${h.jump})` : ''} ${cut(h.name || '∅ vide', 40)}`,
          color: bad ? THEME.color.error : warn ? THEME.color.warning : LEVEL_COLORS[Math.min(h.level, 6) - 1],
        };
      }),
  );
};

const setProbables = (on) => {
  removeOverlay('probables');
  if (on) makeOverlay('probables', probables.map((p) => ({ el: p.el, text: `titre probable ? (${p.why})`, color: PROBABLE_COLOR, dashed: true })));
};

/* ---------- Copier le plan ---------- */

const planText = () =>
  docs
    .filter((d, i) => !i || d.plan.length)
    .map((d, i) => {
      const lines = d.plan.map((h) => `${'  '.repeat(h.indent)}h${h.level} ${h.name || '(titre vide)'}${h.sr ? ' [caché visuellement]' : ''}`);
      return (i ? `\n${d.label}\n` : '') + (lines.length ? lines.join('\n') : '(aucun titre)');
    })
    .join('\n');

let copied = '';
const copyPlan = () => {
  const text = planText();
  const done = (ok) => {
    copied = ok ? 'Plan copié' : 'Copie impossible';
    if (ui) ui.redraw();
    setTimeout(() => {
      copied = '';
      if (ui) ui.redraw();
    }, 2000);
  };
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-rgaa-bookmarklet', '');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      /* refusé */
    }
    ta.remove();
    done(ok);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => done(true), fallback);
  else fallback();
};

/* ---------- Lancement ---------- */

const DETAIL_CSS = `
.crits{margin-top:8px;border-top:1px solid var(--rgaa-sep)}
.crit{display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--rgaa-sep)}
.crit-num{flex:0 0 2.8em;font-weight:700}
.crit-body{min-width:0;display:flex;flex-direction:column;gap:3px}
.note{margin:8px 0 0}
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
const togglePlan = () => setPlan(!overlays.plan);
const toggleProbables = () => setProbables(!overlays.probables);

const ui = inspector({
  id: ID,
  css: DETAIL_CSS,
  maxWidth: 480,
  pinOnLocate: true,
  list: {
    title: 'Titres',
    collect() {
      const r = collect();
      // Après « Actualiser », les outils affichés suivent la nouvelle liste.
      if (overlays.plan) setPlan(true);
      if (overlays.probables) setProbables(true);
      return r;
    },
    filters: [
      { id: 'erreurs', label: 'Erreurs' },
      { id: 'verifier', label: 'À vérifier' },
    ],
    accordions: [
      {
        id: 'probables',
        label: 'Titres probables',
        intro: 'Passages courts en gras ou plus grands que le texte courant, suivis de contenu (9.1.3). Liste indicative : d’autres passages peuvent être des titres.',
      },
    ],
    tools: [
      { label: 'Plan sur la page', pressed: () => !!overlays.plan, toggle: togglePlan },
      { label: 'Titres probables', pressed: () => !!overlays.probables, toggle: toggleProbables },
      { label: () => copied || 'Copier le plan', toggle: copyPlan },
    ],
    footer:
      'Plan dans l’ordre du document, en retrait selon le niveau (h3* : niveau donné par role="heading" ou aria-level). ' +
      'Les sauts de niveau et l’absence de h1 n’invalident pas le critère. ' +
      'Plan sur la page (Maj+H), titres probables (Maj+P).',
  },
  onKey(e) {
    if (!keyOk(e)) return false;
    const k = e.key.toLowerCase();
    if (k === 'h') togglePlan();
    else if (k === 'p') toggleProbables();
    else return false;
    return true;
  },
  onStop: () => {
    removeOverlay('plan');
    removeOverlay('probables');
  },
  inspect(target) {
    const e = findEntry(target);
    if (!e) return null;
    if (e.probable) return { html: probableDetail(e), highlight: [[e.el, 'primary'], ...(e.prevHead ? [[e.prevHead.el, 'secondary']] : [])] };
    const hl = [[e.el, 'primary']];
    if (e.parent) hl.push([e.parent.el, 'secondary']);
    if (e.prev && e.prev !== e.parent) hl.push([e.prev.el, 'secondary']);
    if (e.n && e.n.lb) e.n.lb.els.forEach((el) => hl.push([el, 'secondary']));
    return { html: headingDetail(e), highlight: hl };
  },
});

// Styles de la liste (niveaux, pastilles) : ajoutés au Shadow DOM du panneau liste.
const listHost = document.getElementById(`${ID}-liste`);
if (ui && listHost && listHost.shadowRoot) {
  const st = document.createElement('style');
  st.textContent = LIST_CSS;
  listHost.shadowRoot.appendChild(st);
}
