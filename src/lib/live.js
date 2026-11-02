/**
 * Outils partagés par les calques affichés sur la page (plan des titres,
 * listes) : élément visible et non recouvert, mutations de la page à suivre
 * en direct, et affichage forcé d'éléments masqués ou cachés visuellement.
 */
import { isOwn } from './a11y.js';
import { styleOf } from './name.js';

const OWN = '[data-rgaa-bookmarklet]';
const CLIP = /rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)/;

/** Restitué mais caché visuellement (sr-only, clip, hors écran), ou ''. */
export const visuallyHidden = (el) => {
  const r = el.getBoundingClientRect();
  if (r.width <= 1 || r.height <= 1) return 'taille de 1px';
  const win = el.ownerDocument.defaultView;
  if (r.right + win.scrollX <= 0 || r.bottom + win.scrollY <= 0) return 'hors écran';
  for (let e = el; e && e.nodeType === 1; e = e.parentElement || (e.getRootNode().host || null)) {
    const cs = styleOf(e);
    if (CLIP.test(cs.clip) || cs.clipPath === 'inset(50%)') return 'clip';
    if (Number(cs.opacity) === 0) return 'opacity:0';
    if (e === el.ownerDocument.body) break;
  }
  return '';
};

/**
 * L'élément est-il visible à l'écran, et non recouvert par un autre élément
 * (menu ouvert, bandeau fixe, fenêtre) ? On teste quelques points de l'élément.
 */
export const visibleOnScreen = (el, r = el.getBoundingClientRect()) => {
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

/** Mutation due à la page elle-même (et non aux contours et panneaux des bookmarklets). */
export const pageMutation = (m) => {
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

const INLINE = /^(A|ABBR|B|BDI|BDO|CITE|CODE|DFN|EM|I|KBD|MARK|Q|S|SAMP|SMALL|SPAN|STRONG|SUB|SUP|TIME|U|VAR|LABEL)$/;
const DISPLAY = {
  LI: 'list-item', TABLE: 'table', TR: 'table-row', TD: 'table-cell', TH: 'table-cell', THEAD: 'table-header-group',
  TBODY: 'table-row-group', TFOOT: 'table-footer-group', CAPTION: 'table-caption', SUMMARY: 'list-item',
};
const SR_RESET = {
  position: 'static', clip: 'auto', 'clip-path': 'none', width: 'auto', height: 'auto', overflow: 'visible',
  margin: '0', 'white-space': 'normal', transform: 'none', left: 'auto', top: 'auto', 'text-indent': '0',
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

/**
 * Affichage forcé d'éléments masqués (display:none, hidden, visibility,
 * opacity) ou cachés visuellement (sr-only, clip, hors écran), et de leurs
 * parents si besoin (menu fermé, panneau replié). Tout est rétabli à l'identique.
 *   const rv = createRevealer();
 *   rv.reveal(el, 'display:none');  rv.revealed.get(el) → 'display:none'
 *   rv.unreveal(el);                rv.unreveal() : tout rétablir
 */
export const createRevealer = () => {
  /** Élément → attribut style d'origine (null : pas d'attribut). */
  const touched = new Map();
  /** Éléments affichés → raison d'origine (« display:none », « clip »…). */
  const revealed = new Map();

  const force = (el, props) => {
    if (!touched.has(el)) touched.set(el, el.getAttribute('style'));
    Object.entries(props).forEach(([k, v]) => el.style.setProperty(k, v, 'important'));
  };

  const reveal = (el, why = 'masqué') => {
    if (revealed.has(el) || isOwn(el)) return;
    // De haut en bas : un parent masqué empêche de mesurer ses enfants.
    chain(el)
      .reverse()
      .forEach((e) => {
        const cs = styleOf(e);
        if (cs.display === 'none') force(e, { display: DISPLAY[e.tagName] || (INLINE.test(e.tagName) ? 'inline' : 'block') });
        if (Number(cs.opacity) === 0) force(e, { opacity: '1' });
        if (CLIP.test(cs.clip) || cs.clipPath === 'inset(50%)') force(e, SR_RESET);
        else if (e !== el && /hidden|clip/.test(cs.overflow) && e.getBoundingClientRect().height < 2) force(e, { height: 'auto', 'max-height': 'none', overflow: 'visible' });
      });
    if (styleOf(el).visibility !== 'visible') force(el, { visibility: 'visible' });
    const r = el.getBoundingClientRect();
    const win = el.ownerDocument.defaultView;
    if (r.width <= 1 || r.height <= 1 || r.right + win.scrollX <= 0 || r.bottom + win.scrollY <= 0) force(el, SR_RESET);
    revealed.set(el, why);
  };

  const unreveal = (el) => {
    const els = el ? [el] : [...revealed.keys()];
    els.forEach((e) => revealed.delete(e));
    // Un parent partagé n'est rétabli que si plus aucun élément affiché ne se trouve dedans.
    [...touched.keys()].forEach((t) => {
      if ([...revealed.keys()].some((x) => t === x || t.contains(x) || (x.getRootNode().host && t.contains(x.getRootNode().host)))) return;
      const orig = touched.get(t);
      if (orig === null) t.removeAttribute('style');
      else t.setAttribute('style', orig);
      touched.delete(t);
    });
  };

  return { reveal, unreveal, revealed };
};
