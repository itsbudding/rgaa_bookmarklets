/**
 * TEMPLATE « PANNEAU FLOTTANT » (bookmarklets d'inspection au survol).
 *
 * Le panneau suit la souris et affiche les informations de l'élément survolé.
 * Il fonctionne aussi au clavier : l'élément qui reçoit le focus est inspecté
 * et le panneau se place à côté de lui.
 *
 *  - 2e clic sur le bookmarklet ou touche Échap : arrêt complet ;
 *  - styles isolés (Shadow DOM) et base commune (theme.js) ;
 *  - mise en évidence des éléments avec restauration des styles d'origine.
 *
 * Usage :
 *   inspector({
 *     id: 'rgaa-1-images',
 *     css: '',                       // CSS spécifique (optionnel)
 *     inspect(target) {              // élément sous la souris / focus
 *       return null;                 // null : rien à afficher
 *       return { html, highlight: [[el, 'primary'], [lbl, 'secondary']] };
 *     },
 *   });
 */
import { mount, register, toggleOff, isOwn } from './panel.js';
import { createHighlighter } from './highlight.js';

const GAP = 15;

export const inspector = ({ id, css = '', inspect, minWidth = 320, maxWidth = 520 }) => {
  if (toggleOff(id)) return;

  const { host, panel } = mount(
    id,
    `.panel{pointer-events:none;min-width:${minWidth}px;max-width:min(${maxWidth}px,calc(100vw - 10px))}${css}`,
  );
  // Le panneau suit la souris : il n'est pas annoncé à chaque mouvement,
  // mais les lecteurs d'écran peuvent lire son contenu au focus clavier.
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

  const update = (target, x, y, anchor) => {
    if (!target || isOwn(target)) return hide();
    if (target !== last) {
      last = target;
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
    }
    if (!panel.hidden) place(x, y, anchor);
  };

  const onMove = (e) => update(e.target, e.clientX, e.clientY);
  const onFocus = (e) => {
    const t = e.composedPath ? e.composedPath()[0] : e.target;
    if (t instanceof Element) update(t, 0, 0, t.getBoundingClientRect());
  };
  const onKey = (e) => {
    if (e.key === 'Escape') stop();
  };
  const onScroll = () => hide();

  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('focusin', onFocus, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', onScroll, true);

  const stop = register(id, () => {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('focusin', onFocus, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', onScroll, true);
    hl.clear();
    host.remove();
  });
};
