/**
 * Nom accessible et texte visible d'un élément (cas courants du calcul
 * accname), partagés par RGAA 6 – Liens et RGAA 7 – Composants ARIA.
 */
import { idrefs, norm, ariaHiddenAncestor } from './a11y.js';

export const clean = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
const tagOf = (e) => e.tagName.toLowerCase();
const roleOf = (e) => (e.getAttribute('role') || '').trim().split(/\s+/)[0].toLowerCase();

export const styleOf = (e, pseudo) => e.ownerDocument.defaultView.getComputedStyle(e, pseudo);
export const notRendered = (e) => {
  const cs = styleOf(e);
  return cs.display === 'none' || cs.visibility === 'hidden';
};

/** Texte généré par ::before / ::after (texte de remplacement après « / »), sans icônes de police. */
export const pseudoText = (e, which) => {
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

const FOCUSABLE = 'a[href],area[href],button,input,select,textarea,summary,[tabindex],[contenteditable=""],[contenteditable="true"]';

/**
 * role="presentation" / "none" réellement appliqué : il est ignoré (conflit
 * de rôle) sur un élément focusable ou nommé par l'auteur.
 */
const presentationApplies = (e, role = roleOf(e)) =>
  (role === 'presentation' || role === 'none') && !e.matches(FOCUSABLE) && !e.hasAttribute('aria-label') && !e.hasAttribute('aria-labelledby');

/** Élément masqué aux technologies d'assistance (lui ou un ancêtre). */
const hiddenRoot = (e) => {
  if (ariaHiddenAncestor(e) || styleOf(e).visibility !== 'visible') return true;
  for (let x = e; x && x.nodeType === 1; x = x.parentElement || (x.getRootNode().host ?? null)) {
    if (styleOf(x).display === 'none') return true;
  }
  return false;
};

/** Texte d'un élément écarté du nom (pour l'information « Contenu ignoré »). */
const ownText = (e) => {
  const t = clean(e.textContent);
  if (t) return t;
  const img = e.matches('img,input,area') ? e : e.querySelector('img[alt]');
  const svgTitle = e.matches('svg') ? e.querySelector(':scope > title') : e.querySelector('svg > title');
  return clean(e.getAttribute('aria-label')) || clean(img && img.getAttribute('alt')) || clean(svgTitle && svgTitle.textContent);
};
const ignore = (acc, t, why) => t && acc.ignored.push({ t, why });

/**
 * Parcourt le contenu d'un élément comme le calcul du nom accessible :
 * textes, alternatives des images, title des SVG, aria-label des descendants.
 * Le contenu masqué aux technologies d'assistance est écarté (aria-hidden,
 * display:none, visibility:hidden, images en role="presentation"), sauf si
 * acc.all : racine elle-même masquée et référencée directement (cible
 * d'aria-labelledby, label), dont tout le contenu compte (accname 1.2).
 */
const walk = (node, acc) => {
  const shown = acc.all || styleOf(node).visibility === 'visible';
  node.childNodes.forEach((c) => {
    if (c.nodeType === 3) {
      const t = clean(c.textContent);
      if (!t) return;
      if (!shown) return ignore(acc, t, 'visibility:hidden');
      acc.parts.push({ t, s: 'texte' });
      acc.text = true;
      return;
    }
    if (c.nodeType !== 1 || c === acc.skip) return;
    const tag = tagOf(c);
    const role = roleOf(c);
    const isImg = tag === 'img' || (tag === 'input' && c.type === 'image') || tag === 'svg' || role === 'img';
    if (SKIP.includes(tag)) return;
    if (!acc.all && c.getAttribute('aria-hidden') === 'true') {
      if (isImg || c.querySelector('img,svg')) acc.hiddenImg = true;
      ignore(acc, ownText(c), 'aria-hidden');
      return;
    }
    const cs = styleOf(c);
    if (!acc.all && cs.display === 'none') {
      ignore(acc, ownText(c), c.hasAttribute('hidden') ? 'attribut hidden' : 'display:none');
      return;
    }
    if (!acc.all && cs.visibility !== 'visible') {
      // Masqué, mais un descendant en visibility:visible compte de nouveau.
      if (isImg) ignore(acc, ownText(c), 'visibility:hidden');
      else walk(c, acc);
      return;
    }
    const kind = tag === 'svg' ? 'svg' : isImg ? 'img' : 'text';
    const pres = presentationApplies(c, role);
    const lb = idrefs(c, 'aria-labelledby', (t) => labelText(t, c, acc.ignored));
    const al = clean(c.getAttribute('aria-label'));
    if (!pres && ((lb && lb.v.length) || al)) {
      acc.parts.push(lb && lb.v.length ? { t: lb.v.join(' '), s: `aria-labelledby (${tag})` } : { t: al, s: `aria-label (${tag})` });
      acc[kind] = true;
      return;
    }
    if (isImg) {
      if (pres) {
        ignore(acc, ownText(c), `role="${role}"`);
        acc.decoImg = true;
        return;
      }
      if ((tag === 'img' || tag === 'input') && c.getAttribute('alt') !== null && !c.getAttribute('alt').trim()) {
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

/**
 * Texte d'une étiquette (<label>, <legend>, cible d'aria-labelledby ou
 * d'aria-describedby…) : tout son contenu, alternatives des images (alt,
 * aria-label, title des SVG…) comprises, contenu masqué aux technologies
 * d'assistance exclu. Si l'étiquette est elle-même masquée, tout son contenu
 * compte (exception accname). Le champ étiqueté, s'il est dans l'étiquette,
 * est ignoré. `ignored` reçoit le contenu écarté.
 */
export const labelText = (label, field, ignored) => {
  const acc = { parts: [], unnamed: [], ignored: ignored || [], skip: field, all: hiddenRoot(label) };
  const shown = acc.all || styleOf(label).visibility === 'visible';
  const before = shown ? pseudoText(label, '::before') : '';
  if (before) acc.parts.push({ t: before });
  walk(label, acc);
  const after = shown ? pseudoText(label, '::after') : '';
  if (after) acc.parts.push({ t: after });
  return clean(acc.parts.map((p) => p.t).join(' '));
};

/**
 * Texte d'un élément au sens du calcul du nom accessible (contenu,
 * alternatives des images, sans le contenu masqué) : à utiliser à la place
 * de textOf() pour un nom ou une description (cible d'aria-labelledby,
 * caption, figcaption, contenu d'un bouton…).
 */
export const accText = (el, ignored) => labelText(el, null, ignored);

/** Contenu écarté du nom, dédoublonné : « texte » (raison). */
export const ignoredList = (ignored) => [...new Set((ignored || []).map((i) => `« ${i.t.length > 80 ? `${i.t.slice(0, 79)}…` : i.t} » (${i.why})`))];

/**
 * Nom accessible : aria-labelledby, aria-label, (alt pour area), étiquette
 * <label> des champs, contenu, title. Avec fromContent: false, le contenu
 * n'est pas lu (rôles dont le nom ne vient que de l'auteur : dialog,
 * listbox, slider…).
 */
export const nameOf = (el, { fromContent = true } = {}) => {
  const acc = { parts: [], text: false, img: false, svg: false, unnamed: [], hiddenImg: false, decoImg: false, ignored: [], all: hiddenRoot(el) };
  const tag = tagOf(el);
  if (tag !== 'area' && fromContent) {
    const before = pseudoText(el, '::before');
    if (before) acc.parts.push({ t: before, s: 'CSS ::before' });
    walk(el, acc);
    const after = pseudoText(el, '::after');
    if (after) acc.parts.push({ t: after, s: 'CSS ::after' });
    if (before || after) acc.text = true;
  }
  const content = clean(acc.parts.map((p) => p.t).join(' '));
  const contentIgnored = acc.ignored;
  acc.ignored = [];
  const lb = idrefs(el, 'aria-labelledby', (t) => labelText(t, el, acc.ignored));
  const lbIgnored = acc.ignored;
  acc.ignored = [];
  const al = clean(el.getAttribute('aria-label'));
  const ti = clean(el.getAttribute('title'));
  const alt = tag === 'area' ? clean(el.getAttribute('alt')) : '';
  const lab = el.labels && el.labels.length ? clean([...el.labels].map((l) => labelText(l, el, acc.ignored)).join(' ')) : '';
  const labIgnored = acc.ignored;
  let name = '';
  let s = '';
  if (lb && lb.v.length) [name, s] = [clean(lb.v.join(' ')), 'aria-labelledby'];
  else if (al) [name, s] = [al, 'aria-label'];
  else if (alt) [name, s] = [alt, 'alt (area)'];
  else if (lab) [name, s] = [lab, 'label'];
  else if (tag === 'input' && ['button', 'submit', 'reset'].includes(el.type) && clean(el.value)) [name, s] = [clean(el.value), 'value'];
  else if (tag === 'input' && el.type === 'image' && clean(el.getAttribute('alt'))) [name, s] = [clean(el.getAttribute('alt')), 'alt'];
  else if (content) [name, s] = [content, [...new Set(acc.parts.map((p) => (p.s === 'texte' ? 'contenu' : p.s)))].join(' + ')];
  else if (ti) [name, s] = [ti, 'title'];
  // Contenu écarté de la source retenue pour le nom.
  acc.ignored = s === 'aria-labelledby' ? lbIgnored : s === 'label' ? labIgnored : name === content || !name ? contentIgnored : [];
  let nature = 'vide';
  if (tag === 'area') nature = 'zone d’image';
  else if (acc.text && (acc.img || acc.svg)) nature = 'composite';
  else if (acc.text) nature = 'texte';
  else if (acc.svg && !acc.img) nature = 'SVG';
  else if (acc.img || acc.svg) nature = 'image';
  else if (acc.hiddenImg) nature = 'icône masquée';
  else if (acc.decoImg) nature = 'image décorative';
  // Morceaux du contenu répétés (texte masqué sr-only qui double le texte
  // visible…) : le nom est restitué avec la répétition. `base` est le nom
  // sans répétition, pour comparer les intitulés entre eux.
  const repeats = [];
  let base = name;
  if (name && name === content) {
    const seen = new Map();
    acc.parts.forEach((p) => {
      const k = norm(p.t);
      if (!k) return;
      if (seen.has(k)) seen.get(k).n += 1;
      else seen.set(k, { t: p.t, n: 1 });
    });
    seen.forEach((v) => v.n > 1 && repeats.push(v));
    if (repeats.length) base = clean([...seen.values()].map((v) => v.t).join(' '));
  }
  return { name, s, acc, content, lb, al, ti, nature, repeats, base };
};

/** Texte visible : sans le texte masqué visuellement (classe sr-only…), aria-hidden compris. */
export const visibleText = (el) => {
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
