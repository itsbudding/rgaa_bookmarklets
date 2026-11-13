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
 * (aria-labelledby, aria-describedby...). `text` calcule le texte de
 * chaque élément (texte visible par défaut).
 * @returns {{v: string[], s: string, els: Element[], missing: string[]} | null}
 */
export const idrefs = (el, attr, text = textOf) => {
  const ids = (el.getAttribute(attr) || '').trim();
  if (!ids) return null;
  const els = [];
  const missing = [];
  ids.split(/\s+/).forEach((id) => {
    const t = byId(el, id);
    if (t) els.push(t);
    else missing.push(id);
  });
  const v = els.map((t) => text(t)).filter(Boolean);
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
 * Résultats dans l'ordre du document : le contenu d'un Shadow DOM ou d'une
 * iframe vient juste après son hôte, avant les éléments qui le suivent.
 */
export const deepAll = (selector, root = document, out = []) => {
  const found = root.querySelectorAll(selector);
  let i = 0;
  root.querySelectorAll('*').forEach((el) => {
    if (el.matches(OWN)) return;
    let doc = null;
    if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
      try {
        doc = el.contentDocument;
      } catch (e) {
        /* origine différente : inaccessible */
      }
    }
    if (!el.shadowRoot && !doc) return;
    // Éléments trouvés avant l'hôte (ou l'hôte lui-même) : 4 = DOCUMENT_POSITION_FOLLOWING.
    while (i < found.length && (found[i] === el || found[i].compareDocumentPosition(el) & 4)) out.push(found[i++]);
    if (el.shadowRoot) deepAll(selector, el.shadowRoot, out);
    if (doc) deepAll(selector, doc, out);
  });
  while (i < found.length) out.push(found[i++]);
  return out;
};

/**
 * Chaîne d'ancrage d'un nœud, de la page principale jusqu'à lui : hôtes de
 * Shadow DOM et iframes traversés, puis le nœud. Deux nœuds se comparent au
 * premier ancrage qui diffère, qui est alors dans le même arbre.
 */
const anchors = (node) => {
  const chain = [node];
  for (let n = node; n; ) {
    const r = n.getRootNode();
    let up = r.host || null;
    if (!up && r.nodeType === 9) {
      try {
        up = r.defaultView && r.defaultView.frameElement;
      } catch (e) {
        up = null;
      }
    }
    if (up) chain.unshift(up);
    n = up;
  }
  return chain;
};

/** Comparateur pour sort() : ordre du document, Shadow DOM et iframes compris. */
export const domOrder = (a, b) => {
  if (a === b) return 0;
  const x = anchors(a);
  const y = anchors(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] === y[i]) continue;
    const p = x[i].compareDocumentPosition(y[i]);
    // 4 = y suit x, 2 = y précède x ; 1 = arbres sans lien : ordre conservé.
    return p & 4 ? -1 : p & 2 ? 1 : 0;
  }
  // L'un contient l'autre (hôte ou iframe et son contenu) : l'hôte d'abord.
  return x.length - y.length;
};

/** Trie une liste dans l'ordre du document, d'après l'élément que donne key. */
export const sortByDom = (list, key = (x) => x) => {
  const k = new Map(list.map((x) => [x, key(x)]));
  return [...list].sort((a, b) => domOrder(k.get(a), k.get(b)));
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
export const implicitRole = (e) => {
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
