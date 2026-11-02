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
 * 9.1.3 (passages de texte non balisés en titre) reste à l'auditeur : le
 * plan sur la page aide à repérer un titre visuel sans étiquette.
 *
 * Outils : Plan sur la page (Maj+H), Copier le plan.
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

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'svg', 'IFRAME', 'FRAME', 'OBJECT', 'SELECT', 'TEXTAREA', 'HEAD']);

/**
 * Parcourt un document (et ses Shadow DOM ouverts, mais pas ses iframes) dans
 * l'ordre : renvoie les titres et, pour chaque titre, le contenu de sa section (jusqu'au titre suivant).
 */
/** Éléments ignorés par le parcours mais qui sont du contenu de section. */
const MEDIA_TAGS = new Set(['SVG', 'svg', 'IFRAME', 'FRAME', 'OBJECT', 'SELECT', 'TEXTAREA']);

const walkDoc = (doc) => {
  const heads = [];
  let cur = null;
  const visit = (root) => {
    for (let c = root.firstChild; c; c = c.nextSibling) {
      // Texte de la section (masqué compris : un panneau replié reste du contenu).
      if (c.nodeType === 3) {
        if (cur) cur.sec.text += c.textContent.trim().length;
        continue;
      }
      if (c.nodeType !== 1 || c.matches(OWN)) continue;
      if (SKIP_TAGS.has(c.tagName)) {
        if (cur && MEDIA_TAGS.has(c.tagName)) cur.sec.other++;
        continue;
      }
      const role = roleOf(c);
      const isHx = HX.test(c.tagName);
      if (role === 'heading' || isHx) {
        const h = { el: c, isHx, role, sec: { p: 0, list: 0, table: 0, img: 0, other: 0, text: 0 }, order: heads.length };
        heads.push(h);
        // Le contenu d'un titre ne fait pas partie de sa section.
        if (c.shadowRoot) visit(c.shadowRoot);
        // Un h2 role="presentation" n'est plus un titre : sa section reste celle du titre précédent.
        if (!(isHx && role && role !== 'heading')) cur = h;
        else if (cur) cur.sec.text += c.textContent.trim().length;
        continue;
      }
      if (cur) {
        const t = c.tagName;
        if (t === 'P') cur.sec.p++;
        else if (t === 'UL' || t === 'OL' || t === 'DL') cur.sec.list++;
        else if (t === 'TABLE') cur.sec.table++;
        else if (t === 'IMG' || t === 'PICTURE' || t === 'VIDEO' || t === 'FIGURE') cur.sec.img++;
        else if (t === 'FORM' || t === 'FIELDSET' || t === 'INPUT' || t === 'BUTTON' || t === 'CANVAS' || t === 'AUDIO') cur.sec.other++;
      }
      if (c.shadowRoot) visit(c.shadowRoot);
      visit(c);
    }
  };
  if (doc.body) visit(doc.body);
  return { heads };
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
  if (h.empty) x.push(['warning', 'N’introduit aucun contenu avant le titre suivant : est-ce vraiment un titre ?']);
  if (h.dup) x.push(['warning', `Même texte que le titre ${h.dup.tag} précédent, de même niveau (titre en double)`]);
  const status = worst(['warning', ...x.map((a) => a[0])]);
  return { status, text: x.length ? 'À vérifier' : 'Pertinence à juger', extra: x, base: !x.length };
};

/* ---------- Inventaire ---------- */

let docs = [];
let entries = [];
let byEl = new Map();

const analyseDoc = (doc, label) => {
  const { heads } = walkDoc(doc);
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
    // Titre sans texte, image, liste ni sous-titre avant le titre suivant.
    const next = plan[i + 1];
    h.empty = !(next && next.level > h.level) && !Object.values(h.sec).some(Boolean);
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
  return { doc, label, plan, out, min };
};

const docLabel = (doc) => {
  const f = doc.defaultView && doc.defaultView.frameElement;
  if (!f) return '';
  const t = clean(f.getAttribute('title') || f.getAttribute('aria-label') || '');
  return t ? `Iframe « ${cut(t, 50)} »` : `Iframe sans titre (${cut(clean(f.getAttribute('src') || 'srcdoc'), 40)})`;
};

const PILL_LABEL = { error: 'non conforme', warning: 'à vérifier', ok: 'conforme', hidden: 'non concerné' };
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
  byEl = new Map(entries.map((e) => [e.el, e]));
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
        meta: [h.jump ? `saut ${h.jump}` : '', h.sr ? 'caché visuellement' : '', revealed.has(h.el) ? `affiché par le bookmarklet (${revealed.get(h.el)})` : '']
          .filter(Boolean)
          .join(' · '),
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

/* ---------- Afficher les titres cachés ou masqués ---------- */

/** Élément → attribut style d'origine (null : pas d'attribut), pour tout rétablir. */
const touched = new Map();
/** Titres affichés par le bookmarklet → raison d'origine (« display:none », « clip »…). */
const revealed = new Map();
const INLINE = /^(A|ABBR|B|BDI|BDO|CITE|CODE|DFN|EM|I|KBD|MARK|Q|S|SAMP|SMALL|SPAN|STRONG|SUB|SUP|TIME|U|VAR|LABEL)$/;
const DISPLAY = { LI: 'list-item', TABLE: 'table', TR: 'table-row', TD: 'table-cell', TH: 'table-cell', THEAD: 'table-header-group', TBODY: 'table-row-group', TFOOT: 'table-footer-group', CAPTION: 'table-caption', SUMMARY: 'list-item' };

const force = (el, props) => {
  if (!touched.has(el)) touched.set(el, el.getAttribute('style'));
  Object.entries(props).forEach(([k, v]) => el.style.setProperty(k, v, 'important'));
};

/** Ancêtres de l'élément (Shadow DOM compris), du plus proche au <body>. */
const chain = (el) => {
  const out = [];
  for (let e = el; e && e.nodeType === 1; e = e.parentElement || (e.getRootNode().host || null)) {
    out.push(e);
    if (e === el.ownerDocument.body) break;
  }
  return out;
};

const SR_RESET = {
  position: 'static', clip: 'auto', 'clip-path': 'none', width: 'auto', height: 'auto', overflow: 'visible',
  margin: '0', 'white-space': 'normal', transform: 'none', left: 'auto', top: 'auto', 'text-indent': '0',
};

/** Force l'affichage d'un titre : lui et, si besoin, ses parents (display, visibility, opacity, sr-only, zone repliée). */
const reveal = (h) => {
  if (revealed.has(h.el) || isOwn(h.el)) return;
  const why = h.hidden || h.sr || 'masqué';
  const el = h.el;
  // De haut en bas : un parent masqué empêche de mesurer ses enfants.
  chain(el)
    .reverse()
    .forEach((e) => {
      const cs = styleOf(e);
      if (cs.display === 'none') force(e, { display: DISPLAY[e.tagName] || (INLINE.test(e.tagName) ? 'inline' : 'block') });
      if (Number(cs.opacity) === 0) force(e, { opacity: '1' });
      if (/rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)/.test(cs.clip) || cs.clipPath === 'inset(50%)') force(e, SR_RESET);
      else if (e !== el && /hidden|clip/.test(cs.overflow) && e.getBoundingClientRect().height < 2) force(e, { height: 'auto', 'max-height': 'none', overflow: 'visible' });
    });
  if (styleOf(el).visibility !== 'visible') force(el, { visibility: 'visible' });
  const r = el.getBoundingClientRect();
  const win = el.ownerDocument.defaultView;
  if (r.width <= 1 || r.height <= 1 || r.right + win.scrollX <= 0 || r.bottom + win.scrollY <= 0) force(el, SR_RESET);
  revealed.set(el, why);
};

/** Rétablit un titre (ou tous) : styles d'origine des éléments modifiés. */
const unreveal = (el) => {
  const els = el ? [el] : [...revealed.keys()];
  els.forEach((e) => revealed.delete(e));
  // Un parent partagé n'est rétabli que si plus aucun titre affiché ne se trouve dedans.
  [...touched.keys()].forEach((t) => {
    if ([...revealed.keys()].some((x) => t === x || t.contains(x) || (x.getRootNode().host && t.contains(x.getRootNode().host)))) return;
    const orig = touched.get(t);
    if (orig === null) t.removeAttribute('style');
    else t.setAttribute('style', orig);
    touched.delete(t);
  });
};

/** Titres que l'on peut afficher : masqués par CSS, ou cachés visuellement. */
const revealable = () =>
  entries.filter((h) => !h.removed && !revealed.has(h.el) && ((h.hidden && h.hidden !== 'aria-hidden') || h.sr || (h.hidden === 'aria-hidden' && !h.el.getClientRects().length)));

let revealAll = false;
const toggleRevealAll = () => {
  revealAll = !revealAll;
  if (revealAll) revealable().forEach(reveal);
  else unreveal();
  if (ui) ui.refresh();
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
  if (parts.length) return `${kids}${parts.join(', ')} avant le titre suivant`;
  if (s.text) return `${kids}du texte (${s.text} caractères) avant le titre suivant`;
  return `${kids}<span class="muted">aucun contenu avant le titre suivant</span>`;
};

/** Bouton du détail épinglé : afficher le titre, ou le masquer à nouveau. */
const revealButton = (h) => {
  if (revealed.has(h.el)) return `<p class="note"><button type="button" class="act" data-action="unreveal">Masquer à nouveau</button></p>`;
  if (!((h.hidden && h.el.getClientRects().length === 0) || h.sr || (h.hidden && h.hidden !== 'aria-hidden'))) return '';
  return (
    `<p class="note"><button type="button" class="act" data-action="reveal">Afficher ce titre</button> ` +
    `<span class="small muted">(force son affichage et, si besoin, celui de ses parents)</span></p>`
  );
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
      `<p class="note">${flag('hidden', `Masqué (${h.hidden}) : non restitué, non concerné`)}</p>` +
      revealButton(h)
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
  html += row(
    'Visibilité',
    revealed.has(h.el)
      ? `affiché par le bookmarklet <span class="muted small">(à l’origine : ${esc(revealed.get(h.el))})</span>`
      : h.sr
        ? `caché visuellement ${src(h.sr)} <span class="muted small">compte comme présent (glossaire RGAA)</span>`
        : 'affiché',
  );
  html += revealButton(h);
  html += '<div class="crits">';
  ['9.1.1', '9.1.2'].forEach((k) => (html += critBlock(k, h.crit[k])));
  html += '</div>';
  return html;
};

/* ---------- Outil « Plan sur la page » ---------- */

// Une couleur par niveau, toujours la même (texte blanc ≥ 4,5:1). Un point à
// vérifier ou une erreur est indiqué par « ! » ou « × » dans l'étiquette.
const LEVEL_COLORS = ['#0d47a1', '#1e7b34', '#4527a0', '#00695c', '#5d4037', '#37474f'];
const OVERLAY_CSS = `
:host{all:initial}
.box{position:fixed;z-index:${Number(THEME.zIndex) - 1};pointer-events:none;border:2px solid;border-radius:2px;box-sizing:border-box}
.tag{position:fixed;z-index:${Number(THEME.zIndex) - 1};pointer-events:none;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
font:700 11px/1.3 ${THEME.font};color:#fff;padding:1px 4px;border-radius:2px}
`;
const MAX_TAGS = 2000;
let overlay = null;

/**
 * Le titre est-il visible à l'écran, et non recouvert par un autre élément
 * (menu ouvert, bandeau fixe, fenêtre) ? On teste quelques points du titre.
 */
const visibleOnScreen = (el, r) => {
  const win = el.ownerDocument.defaultView;
  // Dans une iframe : le cadre lui-même doit être visible et non recouvert.
  const frame = win.frameElement;
  if (frame && !visibleOnScreen(frame, frame.getBoundingClientRect())) return false;
  const root = el.getRootNode();
  const hitRoot = root.elementFromPoint ? root : el.ownerDocument;
  const pts = [
    [r.left + Math.min(8, r.width / 2), r.top + r.height / 2],
    [r.left + r.width / 2, r.top + r.height / 2],
    [r.left + Math.min(8, r.width / 2), r.top + Math.min(6, r.height / 2)],
  ];
  return pts.some(([x, y]) => {
    if (x < 0 || y < 0 || x >= win.innerWidth || y >= win.innerHeight) return false;
    const hit = hitRoot.elementFromPoint(x, y);
    return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
  });
};

let refreshTimer = null;
/** Recalcule la liste et le plan (titres apparus ou disparus : menu ouvert…). */
const scheduleRefresh = () => {
  if (refreshTimer) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    if (overlay && ui) ui.refresh();
  }, 250);
};

/** Mutation due à la page elle-même (et non aux contours et panneaux des bookmarklets). */
const pageMutation = (m) => {
  const own = (n) => n && n.nodeType === 1 && (n.matches(OWN) || isOwn(n));
  if (own(m.target)) return false;
  if (m.type === 'childList') return [...m.addedNodes, ...m.removedNodes].some((n) => !own(n));
  if (m.attributeName === 'style') {
    // Contours posés par les bookmarklets : seule la déclaration outline change.
    const strip = (v) => String(v || '').replace(/outline(-offset)?\s*:[^;]*;?/g, '').replace(/\s+/g, '');
    return strip(m.oldValue) !== strip(m.target.getAttribute('style'));
  }
  return true;
};

const setPlan = (on) => {
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
  host.id = `${ID}-plan`;
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${OVERLAY_CSS}</style>`;
  const items = docs
    .flatMap((d) => d.plan)
    .slice(0, MAX_TAGS)
    .map((h) => {
      const st = worst([h.crit['9.1.1'].status, h.crit['9.1.2'].base ? 'ok' : h.crit['9.1.2'].status]);
      const color = LEVEL_COLORS[Math.min(h.level, 6) - 1];
      const box = document.createElement('div');
      box.className = 'box';
      box.style.borderColor = color;
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.style.background = color;
      tag.textContent = `${st === 'error' ? '× ' : st === 'warning' ? '! ' : ''}h${h.level}${h.sr ? ' caché' : ''}${h.jump ? ` (saut ${h.jump})` : ''} ${cut(h.name || 'vide', 40)}`;
      root.append(box, tag);
      return { h, box, tag };
    });
  const hidden = docs.flatMap((d) => d.out).filter((h) => h.hidden);
  const place = () => {
    overlay.raf = 0;
    let changed = false;
    items.forEach(({ h, box, tag }) => {
      const el = h.el;
      const r = el.getBoundingClientRect();
      if (!el.isConnected || !el.getClientRects().length) {
        box.hidden = tag.hidden = true;
        changed = true;
        return;
      }
      const [x, y] = toTopCoords(el.ownerDocument.defaultView, r.left, r.top);
      // Titre caché visuellement : seule l'étiquette, à sa place. Sinon : rien s'il est hors de l'écran ou recouvert.
      const shown = h.sr ? y + r.height >= 0 && y <= window.innerHeight : visibleOnScreen(el, r);
      box.hidden = !shown || !!h.sr;
      tag.hidden = !shown;
      if (!shown) return;
      Object.assign(box.style, { left: `${x - 2}px`, top: `${y - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px` });
      tag.style.left = `${Math.max(0, Math.min(x, window.innerWidth - 60))}px`;
      tag.style.top = `${Math.max(0, y - 17)}px`;
    });
    // Un titre masqué au lancement est maintenant affiché (menu ouvert au survol) : nouvelle liste.
    if (changed || hidden.some((h) => h.el.isConnected && !isNotExposed(h.el))) scheduleRefresh();
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
      attributeFilter: ['class', 'style', 'hidden', 'open', 'role', 'aria-hidden', 'aria-level', 'aria-expanded'],
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
.act{cursor:pointer;background:none;border:1px solid var(--rgaa-border);border-radius:3px;padding:2px 8px}
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
const togglePlan = () => setPlan(!overlay);

const ui = inspector({
  id: ID,
  css: DETAIL_CSS,
  maxWidth: 480,
  pinOnLocate: true,
  list: {
    title: 'Titres',
    toolsOnTop: true,
    collect() {
      const r = collect();
      // Après « Actualiser », les outils affichés suivent la nouvelle liste.
      if (overlay) setPlan(true);
      return r;
    },
    filters: [
      { id: 'erreurs', label: 'Erreurs' },
      { id: 'verifier', label: 'À vérifier' },
    ],
    tools: [
      { label: 'Plan sur la page', pressed: () => !!overlay, toggle: togglePlan },
      { label: () => copied || 'Copier le plan', toggle: copyPlan },
      {
        label: () => {
          const n = revealable().length;
          return `Afficher les titres cachés${!revealAll && n ? ` (${n})` : ''}`;
        },
        pressed: () => revealAll,
        toggle: toggleRevealAll,
      },
    ],
    footer:
      'Plan dans l’ordre du document, en retrait selon le niveau (h3* : niveau donné par role="heading" ou aria-level). ' +
      'Les sauts de niveau et l’absence de h1 n’invalident pas le critère. ' +
      'Plan sur la page (affiché au lancement, Maj+H pour le masquer ou l’afficher) : niveau de chaque titre, suivi en direct (menus ouverts…).',
  },
  onKey(e) {
    if (!keyOk(e)) return false;
    const k = e.key.toLowerCase();
    if (k !== 'h') return false;
    togglePlan();
    return true;
  },
  onAction(name, target) {
    const e = findEntry(target);
    if (!e) return;
    if (name === 'reveal') reveal(e);
    else if (name === 'unreveal') unreveal(e.el);
    if (ui) ui.refresh();
  },
  onStop: () => {
    unreveal();
    clearTimeout(refreshTimer);
    setPlan(false);
  },
  inspect(target) {
    const e = findEntry(target);
    if (!e) return null;
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
// Le plan sur la page est affiché dès le lancement.
if (ui) {
  setPlan(true);
  ui.redraw();
}
