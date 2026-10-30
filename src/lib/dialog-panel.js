/**
 * TEMPLATE « PANNEAU FIXE » (bookmarklets qui listent des éléments de la page).
 *
 * Boîte de dialogue non modale, en haut à droite, déplaçable par son en-tête
 * (souris ou flèches du clavier quand l'en-tête a le focus), fermable par
 * bouton ou touche Échap. Le focus est placé dans le panneau à l'ouverture et
 * rendu à l'élément d'origine à la fermeture.
 *
 * Usage :
 *   const dlg = dialog({ id: 'rgaa-2-cadres', title: 'Iframes trouvées : 3' });
 *   dlg.body.innerHTML = '...';
 */
import { mount, register, toggleOff } from './panel.js';
import { esc } from './dom.js';

const CSS = `
.panel{top:10px;right:10px;width:340px;max-width:calc(100vw - 20px);max-height:80vh;overflow-y:auto;padding:0}
.hdr{position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;gap:8px;
  padding:10px 12px;background:var(--rgaa-bg);border-bottom:1px solid var(--rgaa-sep);cursor:move;user-select:none}
.close{cursor:pointer;background:none;border:1px solid transparent;border-radius:3px;padding:2px 6px;font-weight:700}
.close:hover{border-color:var(--rgaa-border)}
.body{padding:10px 12px}
.items{list-style:none;margin:0;padding:0}
.item{display:flex;align-items:center;gap:8px;width:100%;padding:8px 0;border:0;border-bottom:1px solid var(--rgaa-sep);
  background:none;text-align:left;cursor:pointer}
.item:hover{background:#f5f5f5}
.footer{margin-top:10px;padding-top:8px;border-top:1px solid var(--rgaa-sep)}
`;

export const dialog = ({ id, title, css = '' }) => {
  if (toggleOff(id)) return null;

  const { host, panel } = mount(id, CSS + css);
  const titleId = `${id}-title`;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', titleId);
  panel.innerHTML =
    `<div class="hdr" tabindex="0" aria-label="Déplacer le panneau (flèches du clavier)">` +
    `<h2 class="title" id="${titleId}">${esc(title)}</h2>` +
    `<button type="button" class="close" aria-label="Fermer">✕</button></div>` +
    `<div class="body"></div>`;

  const hdr = panel.querySelector('.hdr');
  const body = panel.querySelector('.body');
  const returnFocus = document.activeElement;

  const moveTo = (x, y) => {
    panel.style.left = `${Math.max(0, Math.min(x, innerWidth - 40))}px`;
    panel.style.top = `${Math.max(0, Math.min(y, innerHeight - 40))}px`;
    panel.style.right = 'auto';
  };

  let drag = null;
  hdr.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.close')) return;
    drag = { dx: e.clientX - panel.offsetLeft, dy: e.clientY - panel.offsetTop };
    hdr.setPointerCapture(e.pointerId);
  });
  hdr.addEventListener('pointermove', (e) => drag && moveTo(e.clientX - drag.dx, e.clientY - drag.dy));
  hdr.addEventListener('pointerup', () => (drag = null));
  hdr.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 50 : 10;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d || e.target !== hdr) return;
    e.preventDefault();
    moveTo(panel.offsetLeft + d[0], panel.offsetTop + d[1]);
  });

  const onKey = (e) => {
    if (e.key === 'Escape') stop();
  };
  panel.addEventListener('keydown', onKey);
  panel.querySelector('.close').addEventListener('click', () => stop());

  const stop = register(id, () => {
    host.remove();
    if (returnFocus && returnFocus.focus && document.contains(returnFocus)) returnFocus.focus();
  });

  panel.querySelector('.close').focus();

  return {
    body,
    panel,
    close: stop,
    setTitle: (t) => (panel.querySelector(`#${titleId}`).textContent = t),
  };
};
