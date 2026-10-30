/**
 * TEMPLATE « PANNEAU FLOTTANT » (bookmarklets d'inspection au survol).
 *
 * Le panneau suit la souris et affiche les informations de l'élément survolé.
 * Il fonctionne aussi au clavier : l'élément qui reçoit le focus est inspecté
 * et le panneau se place à côté de lui. Les éléments situés dans un Shadow DOM
 * ouvert ou dans une iframe de même origine sont inspectés aussi.
 *
 *  - 2e clic sur le bookmarklet ou touche Échap : arrêt complet ;
 *  - styles isolés (Shadow DOM) et base commune (theme.js) ;
 *  - mise en évidence des éléments avec restauration des styles d'origine.
 *
 * Usage :
 *   inspector({
 *     id: 'rgaa-1-images',
 *     css: '',                       // CSS spécifique (optionnel)
 *     list: {                        // panneau liste (optionnel), voir
 *       title, collect, footer,      // list-panel.js : compteur de page et
 *     },                             // accès rapide aux éléments
 *     onKey(e) {                     // raccourci clavier (optionnel) :
 *       return false;                // true si la touche est traitée
 *     },
 *     onStop() {},                   // nettoyage (optionnel)
 *     inspect(target) {              // élément sous la souris / focus
 *       return null;                 // null : rien à afficher
 *       return { html, highlight: [[el, 'primary'], [lbl, 'secondary']] };
 *     },
 *   });
 */
import { mount, register, toggleOff } from './panel.js';
import { createHighlighter } from './highlight.js';
import { createListPanel } from './list-panel.js';
import { isOwn, allDocuments, toTopCoords } from './a11y.js';

const GAP = 15;

export const inspector = ({ id, css = '', inspect, list, onKey, onStop, minWidth = 320, maxWidth = 520 }) => {
  if (toggleOff(id)) return;

  const { host, panel } = mount(
    id,
    `.panel{pointer-events:none;min-width:${minWidth}px;max-width:min(${maxWidth}px,calc(100vw - 10px))}${css}`,
  );
  panel.setAttribute('role', 'status');
  panel.hidden = true;

  const hl = createHighlighter();
  let last = null;

  const hide = () => {
    panel.hidden = true;
    hl.clear();
    last = null;
  };

  const place = (x, y, anchor) => {
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left;
    let top;
    if (anchor) {
      // Focus clavier : sous l'élément, sinon au-dessus.
      left = anchor.left;
      top = anchor.bottom + 8 + h > vh ? anchor.top - h - 8 : anchor.bottom + 8;
    } else {
      left = x + GAP + w > vw ? x - w - GAP : x + GAP;
      top = y + GAP + h > vh ? y - h - GAP : y + GAP;
    }
    panel.style.left = `${Math.max(5, Math.min(left, vw - w - 5))}px`;
    panel.style.top = `${Math.max(5, Math.min(top, vh - h - 5))}px`;
  };

  const render = (target) => {
    let res = null;
    try {
      res = inspect(target);
    } catch (err) {
      console.error(`[${id}]`, err);
    }
    if (!res) return hide();
    panel.innerHTML = res.html;
    hl.set(res.highlight);
    panel.hidden = false;
  };

  const update = (target, x, y, anchor) => {
    if (!target || target.nodeType !== 1 || isOwn(target)) return hide();
    if (target !== last) {
      last = target;
      render(target);
    }
    if (!panel.hidden) place(x, y, anchor);
  };

  // composedPath()[0] : l'élément réel, même dans un Shadow DOM.
  const realTarget = (e) => (e.composedPath ? e.composedPath()[0] : e.target);

  const onMove = (e) => {
    const [x, y] = toTopCoords(e.view, e.clientX, e.clientY);
    update(realTarget(e), x, y);
  };
  const onFocus = (e) => {
    const t = realTarget(e);
    if (!t || t.nodeType !== 1) return;
    const r = t.getBoundingClientRect();
    const [left, top] = toTopCoords(t.ownerDocument.defaultView, r.left, r.top);
    update(t, 0, 0, { left, top, bottom: top + r.height });
  };
  const onKeyDown = (e) => {
    if (e.key === 'Escape') return stop();
    if (onKey && onKey(e)) {
      e.preventDefault();
      // Réaffiche l'élément courant avec le nouvel état.
      if (last && !panel.hidden) render(last);
      if (listPanel) listPanel.refresh();
    }
  };
  const onScroll = () => hide();

  let listPanel = null;
  if (list) {
    try {
      listPanel = createListPanel({ id, ...list, onClose: () => (listPanel = null) });
    } catch (err) {
      console.error(`[${id}]`, err);
    }
  }

  const docs = allDocuments();
  docs.forEach((d) => {
    d.addEventListener('mousemove', onMove, true);
    d.addEventListener('focusin', onFocus, true);
    d.addEventListener('keydown', onKeyDown, true);
    d.addEventListener('scroll', onScroll, true);
  });

  const stop = register(id, () => {
    docs.forEach((d) => {
      d.removeEventListener('mousemove', onMove, true);
      d.removeEventListener('focusin', onFocus, true);
      d.removeEventListener('keydown', onKeyDown, true);
      d.removeEventListener('scroll', onScroll, true);
    });
    hl.clear();
    host.remove();
    if (listPanel) listPanel.close();
    if (onStop) onStop();
  });
};
