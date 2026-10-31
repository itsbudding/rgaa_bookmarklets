/**
 * Nom accessible et texte visible d'un élément (cas courants du calcul
 * accname), partagés par RGAA 6 – Liens et RGAA 7 – Composants ARIA.
 */
import { idrefs, textOf } from './a11y.js';

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

/**
 * Nom accessible : aria-labelledby, aria-label, (alt pour area), étiquette
 * <label> des champs, contenu, title. Avec fromContent: false, le contenu
 * n'est pas lu (rôles dont le nom ne vient que de l'auteur : dialog,
 * listbox, slider…).
 */
export const nameOf = (el, { fromContent = true } = {}) => {
  const acc = { parts: [], text: false, img: false, svg: false, unnamed: [], hiddenImg: false, decoImg: false };
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
  const lb = idrefs(el, 'aria-labelledby');
  const al = clean(el.getAttribute('aria-label'));
  const ti = clean(el.getAttribute('title'));
  const alt = tag === 'area' ? clean(el.getAttribute('alt')) : '';
  const lab = el.labels && el.labels.length ? clean([...el.labels].map(textOf).join(' ')) : '';
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
