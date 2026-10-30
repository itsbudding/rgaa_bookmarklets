/**
 * RGAA 3 – Couleurs : calcule le contraste des textes (3.2), des composants
 * d'interface et des éléments graphiques (3.3).
 *  - Liste : compteur de la page et paires de couleurs, du pire ratio au
 *    meilleur, avec un filtre Textes / Composants et graphiques.
 *  - Survol ou focus : couleurs, origine du fond, seuil, ratio et constats,
 *    mesurés dans l'état affiché (survol, focus).
 *  - Bouton « Niveaux de gris » ou Maj+G : page en niveaux de gris, pour
 *    repérer l'information donnée par la couleur seule (3.1).
 *  - Bouton « Pipette » ou Maj+C : ratio entre deux couleurs choisies à la
 *    main (texte sur image...).
 *
 * Le fond est calculé à partir de la pile réelle des éléments sous le texte
 * (elementsFromPoint), avec transparence et opacité. Les dégradés donnent une
 * fourchette ; les images de fond rendent le calcul indicatif (« à vérifier »).
 */
import { inspector } from '../lib/floating-panel.js';
import { dialog } from '../lib/dialog-panel.js';
import { row, esc, flag, checks, icon, src } from '../lib/dom.js';
import { deepAll, isOwn } from '../lib/a11y.js';
import { withoutHighlight } from '../lib/highlight.js';
import { parseColor, colorsIn, fade, over, ratio, fmtRatio, hex, label, TRANSPARENT, WHITE } from '../lib/color.js';

const ID = 'rgaa-3-couleurs';

/* ---------- Utilitaires DOM ---------- */

let styles = new WeakMap();
const cs = (el) => {
  let s = styles.get(el);
  if (!s) styles.set(el, (s = el.ownerDocument.defaultView.getComputedStyle(el)));
  return s;
};
const pseudoCs = (el, p) => el.ownerDocument.defaultView.getComputedStyle(el, p);
/** Parent, en traversant les Shadow DOM. */
const up = (e) => e.parentElement || (e.getRootNode && e.getRootNode().host) || null;
const contains = (a, b) => {
  for (let e = b; e; e = up(e)) if (e === a) return true;
  return false;
};
const tagOf = (e) => e.localName;
/** « <div#id.classe> » pour indiquer l'origine d'un fond. */
const describe = (e) => {
  const cls = typeof e.className === 'string' && e.className.trim() ? `.${e.className.trim().split(/\s+/)[0]}` : '';
  return `<${tagOf(e)}${e.id ? `#${e.id}` : ''}${cls}>`;
};
const num = (v) => parseFloat(v) || 0;
const fmtNum = (v) => String(Math.round(v * 100) / 100).replace('.', ',');

const SKIP = new Set(['script', 'style', 'noscript', 'template', 'title', 'option', 'optgroup', 'datalist', 'head', 'meta', 'link']);
const REPLACED = new Set(['img', 'video', 'canvas', 'iframe', 'embed', 'object', 'picture', 'svg', 'math']);
const TEXT_INPUTS = ['text', 'email', 'tel', 'url', 'search', 'number', 'password', 'date', 'time', 'datetime-local', 'month', 'week'];
const BUTTON_INPUTS = ['button', 'submit', 'reset'];
const NATIVE = ['checkbox', 'radio', 'range', 'color', 'file'];
const ICON_FONT = /icon|awesome|material|glyph|symbol|dashicons|feather/i;

const SVG_NS = 'http://www.w3.org/2000/svg';
const inSvg = (e) => e.namespaceURI === SVG_NS;

/** Texte visible des nœuds texte enfants directs. */
const ownText = (el) =>
  [...el.childNodes]
    .filter((n) => n.nodeType === 3)
    .map((n) => n.data)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Vrai si l'élément n'est pas visible à l'écran. */
const invisible = (el) => {
  const s = cs(el);
  if (s.visibility !== 'visible' || !el.getClientRects().length) return true;
  const r = el.getBoundingClientRect();
  if (r.width <= 1 || r.height <= 1) return true;
  if (/rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)/.test(s.clip) || s.clipPath === 'inset(50%)') return true;
  for (let e = el; e; e = up(e)) if (num(cs(e).opacity) === 0) return true;
  return false;
};

const disabled = (el) =>
  !!el.closest('button:disabled,input:disabled,select:disabled,textarea:disabled,fieldset:disabled,[aria-disabled="true"]');
const logo = (el) => !!el.closest('[class*="logo" i],[id*="logo" i],[aria-label*="logo" i],[alt*="logo" i]');

/* ---------- Pile de peinture et calcul du fond ---------- */

/** Couleur du canevas d'un document (fond de html, sinon de body), ou null pour une iframe transparente. */
const canvasOf = (doc) => {
  const html = doc.documentElement;
  const scheme = cs(html).colorScheme || '';
  const dark = /dark/.test(scheme) && (!/light/.test(scheme) || doc.defaultView.matchMedia('(prefers-color-scheme: dark)').matches);
  const base = dark ? { r: 18, g: 18, b: 18, a: 1 } : WHITE;
  const hb = parseColor(cs(html).backgroundColor);
  if (hb && hb.a > 0) return { color: over(hb, base), from: html, skipBody: false };
  const bb = doc.body && parseColor(cs(doc.body).backgroundColor);
  if (bb && bb.a > 0) return { color: over(bb, base), from: doc.body, skipBody: true };
  if (doc.defaultView.frameElement) return null;
  return { color: base, from: null, skipBody: false };
};

/** Ancêtres (élément compris) dont l'opacité est inférieure à 1, du plus externe au plus proche. */
const groupsOf = (el) => {
  const out = [];
  for (let e = el; e; e = up(e)) {
    const o = num(cs(e).opacity);
    if (o < 1) out.unshift({ el: e, o });
  }
  return out;
};

/** Couches de fond d'un élément, de bas en haut. */
const layersOf = (e, target, groups) => {
  const s = cs(e);
  const set = new Set(groups.map((g) => g.el));
  let f = 1;
  for (let x = e; x && !set.has(x); x = up(x)) f *= num(cs(x).opacity);
  const depth = groups.filter((g) => contains(g.el, e)).length;
  const out = [];
  const bg = parseColor(s.backgroundColor);
  if (bg && bg.a > 0) out.push({ el: e, color: fade(bg, f), depth });
  // Images de fond : la première déclarée est au-dessus.
  const imgs = [];
  let level = 0;
  let cur = '';
  for (const ch of s.backgroundImage || '') {
    if (ch === '(') level++;
    if (ch === ')') level--;
    if (ch === ',' && !level) {
      imgs.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  imgs.push(cur.trim());
  imgs.reverse().forEach((v) => {
    if (/gradient\(/.test(v)) {
      const stops = colorsIn(v).map((c) => fade(c, f));
      if (stops.length) out.push({ el: e, stops, depth });
    } else if (/url\(|image\(|image-set\(|element\(/.test(v)) out.push({ el: e, image: 'image de fond', depth });
  });
  if (REPLACED.has(tagOf(e)) && !contains(e, target)) out.push({ el: e, image: `contenu de <${tagOf(e)}>`, depth });
  if (tagOf(e) === 'input' && e.type === 'image') out.push({ el: e, image: 'input image', depth });
  return out;
};

/** Effets que le calcul ne sait pas reproduire. */
const effects = (e) => {
  const s = cs(e);
  const out = [];
  if (s.mixBlendMode && s.mixBlendMode !== 'normal') out.push(`mix-blend-mode sur ${describe(e)}`);
  if (s.filter && s.filter !== 'none') out.push(`filter sur ${describe(e)}`);
  const bf = s.backdropFilter || s.webkitBackdropFilter;
  if (bf && bf !== 'none') out.push(`backdrop-filter sur ${describe(e)}`);
  return out;
};

/** Pseudo-élément ::before/::after avec un fond (absent de elementsFromPoint). */
const pseudoBg = (e) =>
  ['::before', '::after'].some((p) => {
    const s = pseudoCs(e, p);
    if (!s.content || s.content === 'none' || s.content === 'normal') return false;
    const bg = parseColor(s.backgroundColor);
    return (bg && bg.a > 0) || (s.backgroundImage && s.backgroundImage !== 'none');
  });

const inView = (view, x, y) => x >= 0 && y >= 0 && x < view.innerWidth && y < view.innerHeight;

/**
 * Pile sous l'élément au point (x, y) : éléments de bas en haut, en partant de
 * el (compris si self) vers le bas. null si el n'est pas sous ce point,
 * { covered } si un élément opaque le recouvre.
 */
const stackAt = (el, x, y, self) => {
  const root = el.getRootNode();
  const scope = root.elementsFromPoint ? root : el.ownerDocument;
  const st = scope.elementsFromPoint(x, y).filter((e) => !isOwn(e));
  const i = st.indexOf(el);
  if (i < 0) return null;
  for (let k = 0; k < i; k++) {
    const e = st[k];
    if (contains(el, e)) continue;
    const bg = parseColor(cs(e).backgroundColor);
    if ((bg && bg.a >= 1) || REPLACED.has(tagOf(e))) return { covered: e };
  }
  return { els: st.slice(self ? i : i + 1).reverse() };
};

/** Pile déduite des seuls ancêtres (élément hors de l'écran ou introuvable). */
const stackByAncestors = (el, self) => {
  const out = [];
  for (let e = self ? el : up(el); e && e.ownerDocument === el.ownerDocument; e = up(e)) out.unshift(e);
  return { els: out, approx: true };
};

/** Fond du canevas, en remontant dans la page parente pour une iframe transparente. */
const canvasColor = (doc) => {
  const c = canvasOf(doc);
  if (c) return c;
  const frame = doc.defaultView.frameElement;
  const res = solve(frame, null, { self: true });
  return { color: res.bgMin, from: res.from, skipBody: false };
};

/**
 * Calcule les couleurs finales au-dessus de la pile.
 * paints : couleurs posées au-dessus du fond (texte, bordure...), dans le
 * groupe d'opacité le plus proche de l'élément.
 * Renvoie { bg: [couleurs du fond], top: [couleurs finales de paints] } pour
 * chaque combinaison d'arrêts de dégradés.
 */
const compose = (layers, groups, canvas, paints) => {
  const grads = layers.filter((l) => l.stops);
  let combos = [new Map()];
  grads.forEach((g) => {
    const stops = combos.length * g.stops.length > 24 ? [g.stops[0], g.stops[g.stops.length - 1]] : g.stops;
    combos = combos.flatMap((m) => stops.map((s) => new Map(m).set(g, s)));
  });
  return combos.map((combo) => {
    const run = (top) => {
      let c = canvas;
      const saved = [];
      let depth = 0;
      const enter = () => {
        saved.push(c);
        c = { ...TRANSPARENT };
        depth++;
      };
      layers.forEach((l) => {
        while (l.depth > depth) enter();
        const col = l.color || combo.get(l);
        if (col) c = over(col, c);
      });
      while (depth < groups.length) enter();
      top.forEach((p) => (c = over(p, c)));
      while (saved.length) {
        c = over(fade(c, groups[depth - 1].o), saved.pop());
        depth--;
      }
      return c;
    };
    return { bg: run([]), top: paints.map((p) => run(p)) };
  });
};

/**
 * Analyse le fond sous el aux points donnés.
 * opts.self : inclure le fond de el (texte) ou non (composant : fond autour).
 * opts.paints : listes de couleurs à poser au-dessus (une liste par mesure).
 * opts.groups : groupes d'opacité à utiliser (par défaut ceux de el).
 */
const solve = (el, points, opts) => {
  const doc = el.ownerDocument;
  const view = doc.defaultView;
  const groups = opts.groups || groupsOf(opts.self ? el : up(el));
  const paints = opts.paints || [];
  const notes = new Set();
  const images = new Set();
  let approx = false;
  let covered = null;
  const stacks = [];
  (points || []).forEach(([x, y]) => {
    if (!inView(view, x, y)) return;
    const s = stackAt(el, x, y, opts.self);
    if (s && s.covered) covered = s.covered;
    else if (s) stacks.push(s);
  });
  if (!stacks.length) {
    approx = true;
    stacks.push(stackByAncestors(el, opts.self));
  }
  const canvas = canvasColor(doc);
  const results = [];
  let from = null;
  let gradient = false;
  stacks.forEach((st) => {
    const els = st.els.filter((e) => e !== doc.documentElement && !(canvas.skipBody && e === doc.body));
    const layers = els.flatMap((e) => layersOf(e, el, groups));
    els.forEach((e) => {
      effects(e).forEach((n) => notes.add(n));
      if (e !== doc.body && pseudoBg(e)) notes.add(`pseudo-élément avec fond sur ${describe(e)}`);
    });
    layers.forEach((l) => {
      if (l.image) images.add(`${l.image} (${describe(l.el)})`);
      if (l.stops) gradient = true;
    });
    const top = [...layers].reverse().find((l) => l.color || l.stops);
    if (!from && top) from = top.el;
    results.push(...compose(layers, groups, canvas.color, paints));
  });
  if (!from) from = canvas.from;
  // Effets sur les ancêtres de l'élément (filtre appliqué au texte aussi).
  for (let e = el; e; e = up(e)) effects(e).forEach((n) => notes.add(n));
  const bgs = results.map((r) => r.bg);
  const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const sorted = [...bgs].sort((a, b) => lum(a) - lum(b));
  return {
    results,
    bgMin: sorted[0],
    bgMax: sorted[sorted.length - 1],
    from,
    approx,
    covered,
    gradient,
    images: [...images],
    notes: [...notes],
  };
};

/* ---------- Textes (3.2) ---------- */

/** Texte affiché par un champ ou un bouton : { text, placeholder }. */
const controlText = (el) => {
  const t = tagOf(el);
  if (t === 'select') return el.selectedOptions && el.selectedOptions[0] ? { text: el.selectedOptions[0].text } : null;
  if (t === 'input' && BUTTON_INPUTS.includes(el.type)) return { text: el.value || el.type };
  if (t === 'textarea' || (t === 'input' && TEXT_INPUTS.includes(el.type))) {
    if (el.value) return { text: el.type === 'password' ? '••••••' : el.value };
    if (el.placeholder) return { text: el.placeholder, placeholder: true };
  }
  return null;
};

const isControl = (el) => ['input', 'select', 'textarea'].includes(tagOf(el));
const iconFont = (s) => ICON_FONT.test(s.fontFamily || '');

/** Points de mesure : centres des lignes du texte (début, milieu, fin). */
const textPoints = (el) => {
  let rects = [];
  if (isControl(el)) {
    const r = el.getBoundingClientRect();
    rects = [{ left: r.left + Math.min(12, r.width / 4), top: r.top, width: 1, height: r.height }, r];
  } else {
    const range = el.ownerDocument.createRange();
    el.childNodes.forEach((n) => {
      if (n.nodeType !== 3 || !n.data.trim()) return;
      range.selectNodeContents(n);
      rects.push(...[...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0));
    });
  }
  if (!rects.length) return [];
  const pick = [rects[0], rects[Math.floor(rects.length / 2)], rects[rects.length - 1]];
  return [...new Set(pick)].map((r) => [r.left + r.width / 2, r.top + r.height / 2]);
};

/** Analyse complète d'un texte : couleurs, seuil, ratio, statut. */
const analyzeText = (el) => {
  const s = cs(el);
  const ctl = isControl(el) ? controlText(el) : null;
  const text = ctl ? ctl.text : ownText(el);
  let fg;
  let fgSrc = 'color';
  if (ctl && ctl.placeholder) {
    const ps = pseudoCs(el, '::placeholder');
    fg = fade(parseColor(ps.color) || parseColor(s.color), num(ps.opacity || 1));
    fgSrc = '::placeholder';
  } else {
    const fill = parseColor(s.webkitTextFillColor);
    fg = fill || parseColor(s.color);
    if (fill && s.webkitTextFillColor !== s.color) fgSrc = '-webkit-text-fill-color';
  }
  if (!fg) return null;
  const size = num(s.fontSize);
  const weight = num(s.fontWeight);
  const bold = weight >= 700;
  const large = size >= 24 || (bold && size >= 18.5);
  const thr = large ? 3 : 4.5;
  const sol = solve(el, textPoints(el), { self: true, paints: [[fg]] });
  const pairs = sol.results.map((r) => ({ bg: r.bg, fg: r.top[0], r: ratio(r.top[0], r.bg) }));
  pairs.sort((a, b) => a.r - b.r);
  const min = pairs[0];
  const max = pairs[pairs.length - 1];
  const notes = [...sol.notes];
  const clipText = /text/.test(s.backgroundClip || s.webkitBackgroundClip || '');
  if (fg.a === 0 && clipText) notes.push('texte rempli par un fond (background-clip: text)');
  if (s.textShadow && s.textShadow !== 'none') notes.push('ombre portée (text-shadow) non prise en compte');
  if (num(s.webkitTextStrokeWidth) > 0) notes.push('contour du texte (-webkit-text-stroke) non pris en compte');
  const uncertain = sol.images.length > 0 || sol.notes.some((n) => /blend|filter/.test(n)) || (fg.a === 0 && clipText);
  let status;
  if (disabled(el)) status = 'hidden';
  else if (min.r >= thr) status = uncertain ? 'warning' : 'ok';
  else if (max.r >= thr || uncertain) status = 'warning';
  else status = 'error';
  const isLogo = status !== 'ok' && status !== 'hidden' && logo(el);
  if (isLogo) status = 'warning';
  return { kind: 'text', el, text, fg, fgSrc, placeholder: !!(ctl && ctl.placeholder), size, weight, bold, large, thr, min, max, sol, notes, status, isLogo };
};

/* ---------- Composants d'interface (3.3) ---------- */

const COMPONENTS =
  'input,select,textarea,button,[role="button"],[role="checkbox"],[role="radio"],[role="switch"],[role="textbox"],[role="combobox"],[role="slider"],[role="searchbox"],[role="spinbutton"],[contenteditable=""],[contenteditable="true"]';

const isButton = (el) =>
  tagOf(el) === 'button' || el.getAttribute('role') === 'button' || (tagOf(el) === 'input' && BUTTON_INPUTS.includes(el.type));

/** Couleurs de bordure visibles d'un style calculé. */
const borders = (s) =>
  ['top', 'right', 'bottom', 'left']
    .map((side) => {
      const w = num(s.getPropertyValue(`border-${side}-width`));
      const st = s.getPropertyValue(`border-${side}-style`);
      const c = parseColor(s.getPropertyValue(`border-${side}-color`));
      return w >= 1 && st !== 'none' && st !== 'hidden' && c && c.a > 0 ? c : null;
    })
    .filter(Boolean);

const center = (el) => {
  const r = el.getBoundingClientRect();
  return [[r.left + r.width / 2, r.top + r.height / 2]];
};

/** Analyse de la limite visible d'un composant : bordure, fond, pseudo-éléments. */
const analyzeComponent = (el) => {
  const s = cs(el);
  const t = tagOf(el);
  const base = { kind: 'ui', el };
  if (disabled(el)) return { ...base, status: 'hidden', reason: 'Composant désactivé (non concerné)' };
  const appearance = s.appearance || s.webkitAppearance;
  if ((t === 'input' && NATIVE.includes(el.type)) || ['progress', 'meter'].includes(t)) {
    if (appearance && appearance !== 'none') return { ...base, status: 'hidden', reason: 'Apparence native du navigateur (non concerné)' };
  }
  const o = num(s.opacity);
  const own = parseColor(s.backgroundColor) || TRANSPARENT;
  const fill = fade(own, o);
  const cands = [{ part: 'fond', paints: [fill] }];
  borders(s).forEach((c) => cands.push({ part: 'bordure', color: c, paints: [fade(over(c, own), o)] }));
  colorsIn(s.boxShadow).forEach((c) => cands.push({ part: 'ombre (box-shadow)', color: c, paints: [fill, fade(c, o)] }));
  ['::before', '::after'].forEach((p) => {
    const ps = pseudoCs(el, p);
    if (!ps.content || ps.content === 'none' || ps.content === 'normal') return;
    borders(ps).forEach((c) => cands.push({ part: `bordure ${p}`, color: c, paints: [fill, fade(c, o)] }));
    const pb = parseColor(ps.backgroundColor);
    if (pb && pb.a > 0) cands.push({ part: `fond ${p}`, color: pb, paints: [fill, fade(pb, o)] });
  });
  const sol = solve(el, center(el), { self: false, paints: cands.map((c) => c.paints) });
  let best = null;
  cands.forEach((c, i) => {
    const r = Math.min(...sol.results.map((res) => ratio(res.top[i], res.bg)));
    if (!best || r > best.r) best = { ...c, r, final: sol.results[0].top[i] };
  });
  const uncertain = sol.images.length > 0 || sol.notes.some((n) => /blend|filter/.test(n));
  let status;
  let reason = '';
  if (best.r >= 3) status = uncertain ? 'warning' : 'ok';
  else if (isButton(el)) {
    status = 'hidden';
    reason = 'Bouton sans limite visible : identifié par son texte ou son icône (voir 3.2 et graphiques)';
  } else status = uncertain ? 'warning' : 'error';
  return { ...base, status, reason, best, sol, bg: sol.bgMin };
};

/** Indicateur de focus de l'élément (s'il a le focus). */
const focusIndicator = (el) => {
  if (!el.matches(':focus')) return null;
  return withoutHighlight(el, () => {
    const s = el.ownerDocument.defaultView.getComputedStyle(el);
    const w = num(s.outlineWidth);
    if (s.outlineStyle === 'auto') return { native: true };
    const c = s.outlineStyle !== 'none' && w > 0 ? parseColor(s.outlineColor) : null;
    const shadow = colorsIn(s.boxShadow)[0];
    const col = c && c.a > 0 ? c : shadow;
    if (!col) return { none: true };
    const sol = solve(el, center(el), { self: false, paints: [[col]] });
    const r = Math.min(...sol.results.map((res) => ratio(res.top[0], res.bg)));
    return { color: col, part: c && c.a > 0 ? 'outline' : 'box-shadow', r, bg: sol.bgMin };
  });
};

/* ---------- Éléments graphiques (3.3) ---------- */

/** SVG à analyser : role="img", ou seul contenu d'un lien ou d'un bouton. */
const svgCandidate = (svg) => {
  if (svg.getAttribute('role') === 'img') return true;
  const act = svg.closest('a[href],button,[role="button"],[role="link"]');
  return !!(act && !(act.innerText || '').trim());
};

/** Couleurs peintes par un SVG (remplissages et contours). */
const svgColors = (svg) => {
  const out = new Map();
  svg.querySelectorAll('path,circle,rect,ellipse,polygon,polyline,line,text,use').forEach((sh) => {
    const s = cs(sh);
    if (s.display === 'none' || s.visibility !== 'visible') return;
    const add = (v, k) => {
      const c = parseColor(v);
      if (c && c.a * k > 0) out.set(hex(c), fade(c, k));
    };
    // Remplissage noir par défaut d'un tracé qui n'a qu'un contour : ignoré.
    const stroked = s.stroke !== 'none' && num(s.strokeWidth) > 0;
    const defaultFill = s.fill === 'rgb(0, 0, 0)' && !sh.closest('[fill]') && !/fill/.test(sh.getAttribute('style') || '');
    if (s.fill !== 'none' && !/url\(/.test(s.fill) && !(stroked && defaultFill)) add(s.fill, num(s.fillOpacity || 1) * num(s.opacity || 1));
    if (s.stroke !== 'none' && num(s.strokeWidth) > 0 && !/url\(/.test(s.stroke)) add(s.stroke, num(s.strokeOpacity || 1) * num(s.opacity || 1));
  });
  return [...out.values()].slice(0, 6);
};

/** Icône de police (::before avec une police d'icônes, ou ligature). */
const iconPseudo = (el) => {
  for (const p of ['::before', '::after']) {
    const s = pseudoCs(el, p);
    if (s.content && s.content !== 'none' && s.content !== 'normal' && iconFont(s)) return { p, s };
  }
  return null;
};

const analyzeGraphic = (el) => {
  const base = { kind: 'graphic', el };
  let colors;
  let what;
  if (inSvg(el)) {
    colors = svgColors(el);
    what = 'SVG';
  } else {
    const ip = iconPseudo(el);
    colors = [parseColor((ip ? ip.s : cs(el)).color)].filter(Boolean);
    what = `icône de police${ip ? ` (${ip.p})` : ''}`;
  }
  if (!colors.length) return null;
  const sol = solve(el, center(el), { self: !inSvg(el), paints: colors.map((c) => [c]), groups: groupsOf(el) });
  const parts = colors.map((c, i) => ({ color: c, r: Math.min(...sol.results.map((res) => ratio(res.top[i], res.bg))) }));
  const uncertain = sol.images.length > 0 || sol.notes.some((n) => /blend|filter/.test(n));
  const best = Math.max(...parts.map((p) => p.r));
  let status;
  if (disabled(el)) status = 'hidden';
  else if (best < 3) status = uncertain ? 'warning' : 'error';
  else status = parts.length > 1 || uncertain ? 'warning' : 'ok';
  return { ...base, what, parts, best, sol, bg: sol.bgMin, status };
};

/* ---------- Collecte de la page ---------- */

const textCandidate = (el) => {
  if (isOwn(el) || SKIP.has(tagOf(el)) || inSvg(el)) return false;
  if (isControl(el)) return !!controlText(el);
  return !!ownText(el) && !iconFont(cs(el));
};

const graphicCandidates = () => {
  const svgs = deepAll('svg').filter((s) => !isOwn(s) && !(s.parentElement && s.parentElement.closest('svg')) && svgCandidate(s));
  const icons = deepAll('i,span,em,b').filter((e) => !isOwn(e) && ((iconFont(cs(e)) && ownText(e)) || (!ownText(e) && iconPseudo(e))));
  return [...svgs, ...icons];
};

const safe = (fn, el) => {
  try {
    return fn(el);
  } catch (err) {
    console.error(`[${ID}]`, err);
    return null;
  }
};

const STATUS_ORDER = { error: 0, warning: 1, ok: 2, hidden: 3 };
const swatches = (fg, bg) =>
  `<span class="pair" aria-hidden="true" style="color:${hex(fg)};background:${hex(bg)}">Aa</span> `;

/**
 * Analyse un élément de la page principale situé hors de l'écran : la page
 * défile un instant jusqu'à lui pour mesurer la pile réelle sous l'élément.
 * La position d'origine est rétablie à la fin de la collecte, avant tout
 * affichage : l'auditeur ne voit pas le défilement.
 */
const measure = (fn) => (el) => {
  if (el.ownerDocument === document) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (s.position !== 'fixed' && (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth)) {
      scrollTo({ left: scrollX + r.left - 20, top: scrollY + r.top - innerHeight / 3, behavior: 'instant' });
    }
  }
  return safe(fn, el);
};

const collect = () => {
  styles = new WeakMap();
  const [x0, y0] = [scrollX, scrollY];
  let texts;
  let uis;
  let graphics;
  try {
    const all = deepAll('*');
    texts = all.filter((e) => textCandidate(e) && !invisible(e)).map(measure(analyzeText)).filter(Boolean);
    uis = deepAll(COMPONENTS)
      .filter((e) => !isOwn(e) && !(tagOf(e) === 'input' && e.type === 'hidden') && !invisible(e))
      .map(measure(analyzeComponent))
      .filter(Boolean);
    graphics = graphicCandidates().filter((e) => !invisible(e)).map(measure(analyzeGraphic)).filter(Boolean);
  } finally {
    scrollTo({ left: x0, top: y0, behavior: 'instant' });
  }

  // Regroupe les éléments qui ont la même paire de couleurs et le même résultat.
  const groups = new Map();
  const add = (key, item, el) => {
    if (!groups.has(key)) groups.set(key, { ...item, els: [] });
    groups.get(key).els.push(el);
  };
  texts.forEach((t) => {
    const key = `t|${t.status}|${hex(t.min.fg)}|${hex(t.min.bg)}|${t.max.r}|${t.thr}`;
    add(key, {
      filter: 'texte',
      status: t.status,
      r: t.min.r,
      label: `« ${t.text} »`,
      prefix: swatches(t.min.fg, t.min.bg),
      ratioTxt: `${t.min.r !== t.max.r ? `${fmtRatio(t.min.r)} à ${fmtRatio(t.max.r)}` : fmtRatio(t.min.r)} (seuil ${fmtNum(t.thr)})`,
    }, t.el);
  });
  uis.forEach((u) => {
    const key = `u|${u.status}|${u.reason}|${u.best ? `${hex(u.best.final)}|${u.best.r}` : tagOf(u.el)}|${u.bg ? hex(u.bg) : ''}`;
    add(key, {
      filter: 'ui',
      status: u.status,
      r: u.best ? u.best.r : 99,
      label: u.reason && u.status === 'hidden' ? u.reason.replace(/ \(.*$/, '') : `Limite : ${u.best.part}`,
      prefix: u.best ? swatches(u.best.final, u.bg) : '',
      ratioTxt: u.best && u.status !== 'hidden' ? `${fmtRatio(u.best.r)} (seuil 3)` : tagOf(u.el),
    }, u.el);
  });
  graphics.forEach((g) => {
    const key = `g|${g.status}|${g.parts.map((p) => hex(p.color)).join(',')}|${hex(g.bg)}`;
    add(key, {
      filter: 'ui',
      status: g.status,
      r: g.best,
      label: g.parts.length > 1 ? `${g.what} : ${g.parts.length} couleurs` : g.what,
      prefix: swatches(g.parts[0].color, g.bg),
      ratioTxt: `${fmtRatio(g.best)} (seuil 3)`,
    }, g.el);
  });
  const items = [...groups.values()]
    .map((g) => ({ ...g, el: g.els[0], meta: `${g.ratioTxt}${g.els.length > 1 ? ` · ${g.els.length} éléments` : ''}` }))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.r - b.r);

  const count = (list, st) => list.filter((x) => x.status === st).length;
  const part = (n, word, list) => {
    const e = count(list, 'error');
    const w = count(list, 'warning');
    return `${n} ${word} : ${e ? icon('error') + ' ' : ''}${e} en erreur · ${w ? icon('warning') + ' ' : ''}${w} à vérifier`;
  };
  const ui = [...uis, ...graphics];
  return {
    items,
    summary: `${part(texts.length, texts.length > 1 ? 'textes' : 'texte', texts)}<br>${part(ui.length, ui.length > 1 ? 'composants et graphiques' : 'composant ou graphique', ui)}`,
  };
};

/* ---------- Niveaux de gris (3.1) ---------- */

const GRAY_ID = `${ID}-gris`;
let gray = false;
const setGray = (on) => {
  gray = on;
  document.getElementById(GRAY_ID)?.remove();
  if (!on) return;
  const s = document.createElement('style');
  s.id = GRAY_ID;
  s.textContent = 'html{filter:grayscale(1)!important}';
  (document.head || document.documentElement).appendChild(s);
};

/* ---------- Pipette ---------- */

let picker = null;
let api = null;
const PICKER_CSS = `
.pick{display:grid;grid-template-columns:auto auto 1fr;gap:6px 8px;align-items:center;margin:0 0 8px}
.pick input[type=color]{width:36px;height:24px;padding:0;border:1px solid var(--rgaa-border)}
.pick input[type=text]{width:6.5em;font:inherit;padding:1px 4px;border:1px solid var(--rgaa-border);border-radius:3px}
.drop{cursor:pointer;background:none;border:1px solid var(--rgaa-border);border-radius:3px;padding:2px 8px}
.pv{display:inline-block;padding:4px 10px;border:1px solid #999;border-radius:3px;font-size:16px;margin:0 0 8px}
`;

const togglePicker = () => {
  if (picker) {
    picker.close();
    return;
  }
  const dlg = dialog({ id: `${ID}-pipette`, title: 'Pipette', css: PICKER_CSS, managed: true, onClose: () => {
    picker = null;
    if (api) api.redraw();
  } });
  dlg.panel.style.right = '370px';
  const eye = typeof window.EyeDropper === 'function';
  const field = (k, lbl, v) =>
    `<label for="${k}-c">${lbl}</label><span><input type="color" id="${k}-c" value="${v}"> ` +
    `<input type="text" id="${k}-t" value="${v}" aria-label="${lbl} (hexadécimal)" spellcheck="false"></span>` +
    `<span>${eye ? `<button type="button" class="drop" data-k="${k}">Prélever à l’écran</button>` : ''}</span>`;
  dlg.body.innerHTML =
    `<div class="pick">${field('fg', 'Texte', '#767676')}${field('bg', 'Fond', '#ffffff')}</div><div class="out" aria-live="polite"></div>` +
    `<div class="footer small muted">${eye ? 'Le bouton « Prélever à l’écran » ouvre la pipette du navigateur : cliquer sur la couleur voulue.' : 'Pipette du navigateur indisponible (Chrome et Edge seulement) : saisir les couleurs.'}</div>`;
  const $ = (sel) => dlg.body.querySelector(sel);
  const update = () => {
    const fg = parseColor($('#fg-c').value);
    const bg = parseColor($('#bg-c').value);
    const r = ratio(fg, bg);
    const v = (thr) => (r >= thr ? flag('ok', `Conforme (≥ ${fmtNum(thr)}:1)`) : flag('error', `Insuffisant (< ${fmtNum(thr)}:1)`));
    $('.out').innerHTML =
      `<span class="pv" style="color:${hex(fg)};background:${hex(bg)}">Exemple de texte</span>` +
      row('Ratio', `<strong>${fmtRatio(r)}</strong>`) +
      row('Texte normal', v(4.5)) +
      row('Grand texte, composants, graphiques', v(3));
  };
  const set = (k, value) => {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return;
    $(`#${k}-c`).value = value.toLowerCase();
    $(`#${k}-t`).value = value.toLowerCase();
    update();
  };
  dlg.body.addEventListener('input', (e) => {
    const m = /^(fg|bg)-([ct])$/.exec(e.target.id);
    if (m) set(m[1], e.target.value.trim().replace(/^([0-9a-f]{6})$/i, '#$1'));
  });
  dlg.body.addEventListener('click', async (e) => {
    const b = e.target.closest('.drop');
    if (!b) return;
    try {
      const res = await new window.EyeDropper().open();
      set(b.dataset.k, res.sRGBHex.startsWith('#') ? res.sRGBHex : hex(parseColor(res.sRGBHex)));
    } catch (err) {
      /* pipette annulée */
    }
  });
  update();
  picker = dlg;
};

/* ---------- Panneau de détail ---------- */

const CSS = `
.sec{margin:8px 0 6px;padding-top:6px;border-top:1px solid var(--rgaa-sep);font-weight:700}
.sec:first-child{margin-top:0;padding-top:0;border-top:0}
.sw{display:inline-block;width:12px;height:12px;border:1px solid #333;vertical-align:middle}
.pv{display:inline-block;padding:2px 8px;border:1px solid #999;border-radius:3px}
`;
const LIST_CSS = `.pair{display:inline-block;padding:0 4px;border:1px solid #999;border-radius:2px;font-weight:700;font-size:11px;line-height:14px;margin-right:2px}`;

const sw = (c) => `<span class="sw" aria-hidden="true" style="background:${hex(c)}"></span> ${esc(label(c))}`;

const verdict = (status, r, thr) => {
  if (status === 'ok') return flag('ok', `Conforme (≥ ${fmtNum(thr)}:1)`);
  if (status === 'error') return flag('error', `Insuffisant (< ${fmtNum(thr)}:1)`);
  if (status === 'hidden') return flag('hidden', 'Non concerné');
  return flag('warning', r >= thr ? 'À vérifier' : `À vérifier (< ${fmtNum(thr)}:1)`);
};

/** Constats communs au calcul du fond. */
const solveChecks = (sol) => [
  ...sol.images.map((i) => ['warning', `Sous l'élément : ${i}. Ratio indicatif, vérifier à la pipette.`]),
  sol.gradient && ['warning', 'Fond en dégradé : fourchette de ratios entre les couleurs du dégradé.'],
  ...sol.notes.map((n) => ['warning', `Calcul incertain : ${n}`]),
  sol.approx && ['warning', 'Calcul approché (élément hors de l’écran ou introuvable) : fond déduit des éléments parents.'],
  sol.covered && ['warning', `Élément recouvert par ${describe(sol.covered)} à cet endroit.`],
];

const bgRow = (sol, minBg, maxBg) =>
  row(
    'Fond',
    (hex(minBg) !== hex(maxBg) ? `${sw(minBg)} à ${sw(maxBg)}` : sw(minBg)) +
      (sol.from ? ` ${src(describe(sol.from))}` : ` ${src('canevas de la page')}`),
  );

const state = (el) => {
  const st = [];
  if (el.matches(':focus')) st.push('focus');
  if (el.matches(':hover')) st.push('survol');
  return st.length ? st.join(' + ') : 'repos';
};

const textSection = (t) => {
  let html = `<p class="sec">Texte (3.2)${t.placeholder ? ' : placeholder' : ''}</p>`;
  html += row('Aperçu', `<span class="pv" style="color:${hex(t.min.fg)};background:${hex(t.min.bg)};font-weight:${t.weight}">${esc(t.text.slice(0, 30)) || 'Aa'}</span>`);
  html += row('Texte', `${sw(t.fg)} ${src(t.fgSrc)}`);
  html += bgRow(t.sol, t.min.bg, t.max.bg);
  html += row('Taille', `${fmtNum(t.size)}px, graisse ${t.weight} ${src(t.large ? 'grand texte' : 'texte normal')}`);
  const r = t.min.r !== t.max.r ? `${fmtRatio(t.min.r)} à ${fmtRatio(t.max.r)}` : fmtRatio(t.min.r);
  html += row('Ratio', `<strong>${r}</strong> ${verdict(t.status, t.min.r, t.thr)}`);
  const found = [
    t.isLogo && ['warning', 'Logo probable : les logos sont dispensés (3.2).'],
    disabled(t.el) && ['hidden', 'Composant désactivé : non concerné.'],
    ...solveChecks(t.sol),
    ...t.notes.filter((n) => !t.sol.notes.includes(n)).map((n) => ['warning', n]),
  ];
  return html + checks(found);
};

const uiSection = (u) => {
  let html = `<p class="sec">Composant d’interface (3.3) : ${esc(describe(u.el))}</p>`;
  if (u.best && u.status !== 'hidden') {
    html += row('Limite', `${sw(u.best.final)} ${src(u.best.part)}`);
    html += row('Fond autour', `${sw(u.bg)}${u.sol.from ? ` ${src(describe(u.sol.from))}` : ''}`);
    html += row('Ratio', `<strong>${fmtRatio(u.best.r)}</strong> ${verdict(u.status, u.best.r, 3)}`);
  }
  const found = [u.reason && [u.status === 'error' ? 'error' : 'hidden', u.reason], ...(u.sol ? solveChecks(u.sol) : [])];
  const f = focusIndicator(u.el);
  if (f) {
    if (f.native) html += row('Focus', `contour natif du navigateur ${src('outline: auto')}`);
    else if (f.none) found.push(['warning', 'Aucun contour de focus détecté : vérifier la visibilité du focus (10.7).']);
    else html += row('Focus', `${sw(f.color)} ${src(f.part)} <strong>${fmtRatio(f.r)}</strong> ${verdict(f.r >= 3 ? 'ok' : 'error', f.r, 3)}`);
  }
  return html + checks(found);
};

const graphicSection = (g) => {
  let html = `<p class="sec">Élément graphique (3.3) : ${esc(g.what)}</p>`;
  g.parts.forEach((p) => {
    html += row('Couleur', `${sw(p.color)} <strong>${fmtRatio(p.r)}</strong>`);
  });
  html += bgRow(g.sol, g.sol.bgMin, g.sol.bgMax);
  html += row('Verdict', verdict(g.status, g.best, 3));
  const found = [
    g.parts.length > 1 && ['warning', 'Plusieurs couleurs : vérifier celles nécessaires à la compréhension (3:1).'],
    ...solveChecks(g.sol),
  ];
  return html + checks(found);
};

api = inspector({
  id: ID,
  css: CSS,
  list: {
    title: 'Couleurs',
    collect,
    filters: [
      { id: 'texte', label: 'Textes (3.2)' },
      { id: 'ui', label: 'Composants et graphiques (3.3)' },
    ],
    tools: [
      { label: 'Niveaux de gris', pressed: () => gray, toggle: () => setGray(!gray) },
      { label: 'Pipette', pressed: () => !!picker, toggle: togglePicker },
    ],
    footer:
      'Ratios tronqués au centième. Si un fond ne peut pas être mesuré (zone défilante, iframe hors de l’écran), il est déduit des éléments parents et le détail l’indique. ' +
      'Niveaux de gris (Maj+G) : repérer l’information donnée par la couleur seule (3.1). Pipette (Maj+C) : texte sur image.',
  },
  onKey(e) {
    const tag = e.target && e.target.tagName;
    if (!e.shiftKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target.isContentEditable) return false;
    const k = e.key.toLowerCase();
    if (k === 'g') setGray(!gray);
    else if (k === 'c') togglePicker();
    else return false;
    return true;
  },
  onStop: () => {
    setGray(false);
    if (picker) picker.close();
  },
  inspect(target) {
    styles = new WeakMap();
    let html = '';
    const hl = [];
    let main = null;
    if (inSvg(target)) {
      const svg = [...svgAncestors(target)].pop();
      const g = svg && svgCandidate(svg) && !invisible(svg) ? analyzeGraphic(svg) : null;
      if (g) {
        main = svg;
        html += graphicSection(g);
        hl.push([svg, 'primary']);
      }
    } else if (textCandidate(target) && !invisible(target)) {
      const t = analyzeText(target);
      if (t) {
        main = target;
        html += textSection(t);
        hl.push([target, 'primary']);
        if (t.sol.from && t.sol.from !== target && !['html', 'body'].includes(tagOf(t.sol.from))) hl.push([t.sol.from, 'secondary']);
      }
    } else if (!ownText(target) && iconPseudo(target)) {
      const g = analyzeGraphic(target);
      if (g) {
        main = target;
        html += graphicSection(g);
        hl.push([target, 'primary']);
      }
    }
    const comp = target.closest(COMPONENTS);
    if (comp && !isOwn(comp) && !invisible(comp)) {
      const u = analyzeComponent(comp);
      if (u) {
        main = main || comp;
        html += uiSection(u);
        if (!hl.length) hl.push([comp, 'primary']);
      }
    }
    if (!main) return null;
    return { html: row('État mesuré', esc(state(main))) + html, highlight: hl };
  },
});

/** Éléments <svg> qui contiennent un nœud SVG (du plus proche au plus externe). */
function* svgAncestors(n) {
  for (let e = n; e && inSvg(e); e = e.parentElement) if (tagOf(e) === 'svg') yield e;
}

// Pastilles de la liste : ajoutées au Shadow DOM du panneau liste.
const listHost = document.getElementById(`${ID}-liste`);
if (listHost && listHost.shadowRoot) {
  const st = document.createElement('style');
  st.textContent = LIST_CSS;
  listHost.shadowRoot.appendChild(st);
}
