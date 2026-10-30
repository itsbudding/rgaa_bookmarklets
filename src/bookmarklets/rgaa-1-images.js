/**
 * RGAA 1 – Images : au survol (ou au focus), affiche le nom accessible,
 * la description, la légende, l'éventuelle image CSS et, si l'image est dans
 * un lien, le nom accessible du lien.
 */
import { inspector } from '../lib/floating-panel.js';
import { row, value, src } from '../lib/dom.js';
import { idrefs, textOf } from '../lib/a11y.js';

const IMG = 'img,area,input[type="image"],svg,object[type^="image/"],embed[type^="image/"],canvas,[role="img"]';

/** Nom accessible d'une image. isCss : image de fond (pas de alt). */
const imgName = (e, isCss) => {
  const tag = e.tagName.toLowerCase();
  let n = idrefs(e, 'aria-labelledby');
  if (n) return n;
  if ((n = e.getAttribute('aria-label')) !== null) return n.trim() ? { v: [n], s: 'aria-label' } : null;
  if (!isCss && (['img', 'area'].includes(tag) || (tag === 'input' && e.type === 'image'))) {
    const a = e.getAttribute('alt');
    if (a && a.trim()) return { v: [a], s: 'alt' };
  }
  if (tag === 'svg') {
    const t = e.querySelector('title');
    if (t && textOf(t)) return { v: [textOf(t)], s: '<title>' };
  }
  if ((n = e.getAttribute('title')) !== null) return n.trim() ? { v: [n], s: 'title' } : null;
  return null;
};

/** Propriété CSS qui porte une image, sur l'élément ou ses pseudo-éléments. */
const cssImage = (e) => {
  const check = (cs) => {
    const has = (prop, ...needles) => {
      const v = cs.getPropertyValue(prop);
      return v && v !== 'none' && needles.some((n) => v.includes(n));
    };
    if (has('background-image', 'url(', '-gradient(')) return 'background-image';
    if (has('content', 'url(', 'image(')) return 'content (CSS)';
    if (has('mask-image', 'url(') || has('-webkit-mask-image', 'url(')) return 'mask-image';
    if (has('clip-path', 'url(')) return 'clip-path';
    if (has('list-style-image', 'url(')) return 'list-style-image';
    if (has('border-image-source', 'url(')) return 'border-image-source';
    return null;
  };
  let p = check(getComputedStyle(e));
  if (p) return { prop: p };
  if ((p = check(getComputedStyle(e, '::before')))) return { prop: `::before ${p}` };
  if ((p = check(getComputedStyle(e, '::after')))) return { prop: `::after ${p}` };
  return null;
};

/** Morceaux du nom d'un lien : textes + noms des images qu'il contient. */
const linkParts = (el) => {
  const parts = [];
  el.childNodes.forEach((c) => {
    if (c.nodeType === 3) {
      const t = c.textContent.trim();
      if (t) parts.push({ t, s: 'texte du lien' });
    } else if (c.nodeType === 1) {
      const css = cssImage(c);
      if (c.matches(IMG) || css) {
        const i = imgName(c, !!css);
        if (i) i.v.forEach((v) => parts.push({ t: v, s: `${i.s} (${css ? css.prop : c.tagName.toLowerCase()})` }));
      } else parts.push(...linkParts(c));
    }
  });
  return parts;
};

const linkName = (l) => {
  let n = idrefs(l, 'aria-labelledby');
  if (n) return n;
  if ((n = l.getAttribute('aria-label')) !== null) return n.trim() ? { v: [n], s: 'aria-label (lien)' } : null;
  const p = linkParts(l);
  if (p.length) return { v: p, s: '' };
  if ((n = l.getAttribute('title')) !== null) return n.trim() ? { v: [n], s: 'title (lien)' } : null;
  return null;
};

inspector({
  id: 'rgaa-1-images',
  inspect(target) {
    let t = target.closest(IMG);
    let css = null;
    if (!t) {
      for (let cur = target; cur && cur !== document.body; cur = cur.parentElement) {
        if ((css = cssImage(cur))) {
          t = cur;
          break;
        }
      }
    } else css = cssImage(t);
    if (!t) return null;

    const name = imgName(t, !!css);
    const longdesc = t.getAttribute('longdesc');
    const desc = idrefs(t, 'aria-describedby') || (longdesc ? { v: [longdesc], s: 'longdesc' } : null);
    const cap = t.closest('figure')?.querySelector('figcaption');
    const capText = cap ? textOf(cap) : '';
    const link = t.closest('a,[role="link"]');

    let html =
      row('Nom accessible', value(name)) +
      row('Description', value(desc)) +
      row('Image légendée', value(capText ? { v: [capText], s: 'figcaption' } : null));
    if (css) html += row('Image CSS', `Oui ${src(css.prop)}`);
    html += row('Image dans un lien', link ? 'Oui' : 'Non');
    if (link) html += row('Nom accessible du lien', value(linkName(link)));

    return { html, highlight: [[t, 'primary']] };
  },
});
