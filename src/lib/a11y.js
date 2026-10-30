/** Helpers de calcul de nom/description accessibles partagés. */

const text = (el) => (el.innerText ?? el.textContent ?? '').trim() || (el.textContent || '').trim();

/**
 * Textes des éléments référencés par un attribut IDREFS
 * (aria-labelledby, aria-describedby...).
 * @returns {{v: string[], s: string} | null}
 */
export const idrefs = (el, attr) => {
  const ids = (el.getAttribute(attr) || '').trim();
  if (!ids) return null;
  const v = ids
    .split(/\s+/)
    .map((id) => document.getElementById(id))
    .filter(Boolean)
    .map(text)
    .filter(Boolean);
  return v.length ? { v, s: attr } : null;
};

/** Texte visible (ou textContent pour SVG et éléments non rendus). */
export const textOf = text;

/** Vrai si l'élément n'est pas rendu à l'écran. */
export const isHidden = (el) => {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0;
};
