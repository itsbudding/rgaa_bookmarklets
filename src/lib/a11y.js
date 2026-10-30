/** Helpers d'accessibilité partagés : noms, visibilité, parcours profond. */

const OWN = '[data-rgaa-bookmarklet]';

/** Texte visible (ou textContent pour SVG et éléments non rendus). */
export const textOf = (el) => {
  const t = el.innerText;
  return (typeof t === 'string' && t.trim() ? t : el.textContent || '').replace(/\s+/g, ' ').trim();
};

/** Normalise un texte pour comparer deux intitulés. */
export const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** getElementById dans la racine de l'élément (document, iframe ou Shadow DOM). */
export const byId = (el, id) => {
  const root = el.getRootNode();
  return (root.getElementById ? root : el.ownerDocument).getElementById(id);
};

/**
 * Textes des éléments référencés par un attribut IDREFS
 * (aria-labelledby, aria-describedby...).
 * @returns {{v: string[], s: string, els: Element[], missing: string[]} | null}
 */
export const idrefs = (el, attr) => {
  const ids = (el.getAttribute(attr) || '').trim();
  if (!ids) return null;
  const els = [];
  const missing = [];
  ids.split(/\s+/).forEach((id) => {
    const t = byId(el, id);
    if (t) els.push(t);
    else missing.push(id);
  });
  const v = els.map(textOf).filter(Boolean);
  return { v, s: attr, els, missing };
};

/** Vrai si l'élément n'est pas rendu à l'écran. */
export const isHidden = (el) => {
  const cs = el.ownerDocument.defaultView.getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0;
};

/** Ancêtre (Shadow DOM compris) portant aria-hidden="true", ou null. */
export const ariaHiddenAncestor = (el) => {
  for (let e = el; e; e = e.parentElement || e.getRootNode().host) {
    if (e.getAttribute && e.getAttribute('aria-hidden') === 'true') return e;
  }
  return null;
};

/** Vrai si l'élément n'est pas restitué aux technologies d'assistance. */
export const isNotExposed = (el) => {
  if (ariaHiddenAncestor(el)) return 'aria-hidden';
  const cs = el.ownerDocument.defaultView.getComputedStyle(el);
  if (cs.display === 'none' || !el.getClientRects().length) return 'display:none';
  if (cs.visibility === 'hidden') return 'visibility:hidden';
  return null;
};

/** Rôle de présentation (role="presentation" ou role="none"). */
export const presentational = (el) => {
  const r = (el.getAttribute('role') || '').trim().split(/\s+/)[0];
  return r === 'presentation' || r === 'none' ? `role="${r}"` : null;
};

/** Vrai si l'élément fait partie d'un panneau de bookmarklet. */
export const isOwn = (el) => {
  if (!el || !el.getRootNode) return false;
  if (el.closest && el.closest(OWN)) return true;
  const host = el.getRootNode().host;
  return !!(host && host.closest && host.closest(OWN));
};

/**
 * Comme querySelectorAll, mais descend aussi dans les Shadow DOM ouverts et
 * les iframes de même origine. Ignore les panneaux des bookmarklets.
 */
export const deepAll = (selector, root = document, out = []) => {
  root.querySelectorAll(selector).forEach((e) => out.push(e));
  root.querySelectorAll('*').forEach((el) => {
    if (el.matches(OWN)) return;
    if (el.shadowRoot) deepAll(selector, el.shadowRoot, out);
    if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
      try {
        if (el.contentDocument) deepAll(selector, el.contentDocument, out);
      } catch (e) {
        /* origine différente : inaccessible */
      }
    }
  });
  return out;
};

/** Documents de la page : principal + iframes de même origine (récursif). */
export const allDocuments = (doc = document, out = []) => {
  out.push(doc);
  doc.querySelectorAll('iframe,frame').forEach((f) => {
    try {
      if (f.contentDocument) allDocuments(f.contentDocument, out);
    } catch (e) {
      /* origine différente */
    }
  });
  return out;
};

/** Position d'un point d'une iframe dans la fenêtre principale. */
export const toTopCoords = (view, x, y) => {
  let w = view;
  try {
    while (w && w !== window && w.frameElement) {
      const f = w.frameElement;
      const r = f.getBoundingClientRect();
      x += r.left + f.clientLeft;
      y += r.top + f.clientTop;
      w = w.parent;
    }
  } catch (e) {
    /* origine différente */
  }
  return [x, y];
};

/* ---- Rôle ARIA : explicite (attribut role) ou implicite (sémantique HTML) ---- */

const INPUT_ROLES = {
  text: 'textbox', email: 'textbox', tel: 'textbox', url: 'textbox', search: 'searchbox',
  number: 'spinbutton', range: 'slider', checkbox: 'checkbox', radio: 'radio',
  button: 'button', submit: 'button', reset: 'button', image: 'button',
};

/** Rôle implicite d'un élément d'après sa balise (HTML-AAM, cas courants). */
const implicitRole = (e) => {
  const tag = e.tagName.toLowerCase();
  switch (tag) {
    case 'input': {
      const t = e.type;
      if (['text', 'email', 'tel', 'url', 'search'].includes(t) && e.hasAttribute('list')) return 'combobox';
      return INPUT_ROLES[t] || null;
    }
    case 'select':
      return e.multiple || e.size > 1 ? 'listbox' : 'combobox';
    case 'textarea':
      return 'textbox';
    case 'button':
      return 'button';
    case 'fieldset':
      return 'group';
    case 'img':
      return e.getAttribute('alt') === '' ? 'presentation' : 'img';
    case 'area':
      return e.hasAttribute('href') ? 'link' : null;
    case 'a':
      return e.hasAttribute('href') ? 'link' : null;
    case 'figure':
      return 'figure';
    case 'option':
      return 'option';
    default:
      return null;
  }
};

/** Balise affichée comme source d'un rôle implicite : <input type="checkbox">. */
const tagLabel = (e) => {
  const tag = e.tagName.toLowerCase();
  if (tag === 'input') return `<input type="${e.type}">`;
  if (tag === 'img' && e.getAttribute('alt') === '') return '<img alt="">';
  return `<${tag}>`;
};

/**
 * Rôle de l'élément et sa source.
 * @returns {{role: string|null, from: 'attribut'|'balise'|null, source: string}}
 */
export const roleInfo = (e) => {
  const explicit = (e.getAttribute('role') || '').trim().split(/\s+/)[0];
  if (explicit) return { role: explicit, from: 'attribut', source: `attribut role` };
  const r = implicitRole(e);
  if (r) return { role: r, from: 'balise', source: `implicite, ${tagLabel(e)}` };
  return { role: null, from: null, source: tagLabel(e) };
};
