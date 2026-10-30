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
 *     summary() {                    // compteur de page (optionnel), affiché
 *       return '3 images, 1 sans alternative'; // en tête du panneau
 *     },
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
import { isOwn, allDocuments, toTopCoords } from './a11y.js';

const GAP = 15;

export const inspector = ({ id, css = '', inspect, summary, onKey, onStop, minWidth = 320, maxWidth = 520 }) => {
  if (toggleOff(id)) return;

  const { host, panel } = mount(
    id,
    `.panel{pointer-events:none;min-width:${minWidth}px;max-width:min(${maxWidth}px,calc(100vw - 10px))}` +
      `.summary{margin:-4px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--rgaa-sep);color:var(--rgaa-muted)}${css}`,
  );
  panel.setAttribute('role', 'status');
  panel.hidden = true;

  const hl = createHighlighter();
  let last = null;

  // Compteur de page : recalculé au plus une fois par seconde.
  let sum = '';
  let sumAt = 0;
  const header = () => {
    if (!summary) return '';
    if (Date.now() - sumAt > 1000) {
      try {
        sum = summary();
      } catch (err) {
        console.error(`[${id}]`, err);
        sum = '';
      }
      sumAt = Date.now();
    }
    return sum ? `<div class="summary small">${sum}</div>` : '';
  };

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
    panel.innerHTML = header() + res.html;
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
    }
  };
  const onScroll = () => hide();

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
    if (onStop) onStop();
  });
};
