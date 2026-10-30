/**
 * TEMPLATE « PANNEAU LISTE » : aperçu de la page pour un bookmarklet à
 * panneau flottant. Affiche le compteur de page et la liste des éléments
 * concernés ; un clic sur une ligne fait défiler jusqu'à l'élément, l'entoure
 * et lui donne le focus s'il est focalisable (le panneau flottant s'affiche
 * alors à côté de lui avec toutes les informations).
 *
 * Usage (via inspector({ list: {...} })) :
 *   list: {
 *     title: 'Images',
 *     collect() {                     // appelé à l'ouverture et sur « Actualiser »
 *       return {
 *         summary: '12 images · 2 sans alternative',   // HTML échappé
 *         items: [{ el, status: 'error', label: 'Sans alternative', meta: 'img' }],
 *       };
 *     },
 *     footer: 'Maj+I : estomper les images',          // HTML échappé (optionnel)
 *   }
 */
import { dialog } from './dialog-panel.js';
import { createHighlighter } from './highlight.js';
import { icon, esc } from './dom.js';

const STATUS_LABEL = { error: 'Erreur', warning: 'À vérifier', ok: 'Conforme', hidden: 'Décoratif ou masqué' };
const MAX_LABEL = 60;

const CSS = `
.list-summary{margin:0 0 8px}
.item{padding:6px 0;align-items:flex-start}
.item .icon{margin-top:2px}
.num{color:var(--rgaa-muted);min-width:2.2em;text-align:right;flex-shrink:0}
.meta{color:var(--rgaa-muted);font-size:var(--rgaa-fs-sm);font-style:italic;white-space:nowrap}
.tools{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px}
.refresh{cursor:pointer;background:none;border:1px solid var(--rgaa-border);border-radius:3px;padding:2px 8px}
`;

const short = (s) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > MAX_LABEL ? `${t.slice(0, MAX_LABEL - 1)}…` : t;
};

export const createListPanel = ({ id, title, collect, footer = '', onClose }) => {
  const dlg = dialog({ id: `${id}-liste`, title, css: CSS, managed: true, focus: false, onClose });
  const hl = createHighlighter();
  let items = [];
  let timer;

  const render = () => {
    const res = collect();
    items = res.items;
    dlg.setTitle(`${title} : ${items.length}`);
    dlg.body.innerHTML =
      `<p class="list-summary small">${res.summary}</p>` +
      (items.length
        ? `<ul class="items">${items
            .map(
              (it, i) =>
                `<li><button type="button" class="item" data-idx="${i}">` +
                `<span class="num" aria-hidden="true">${i + 1}.</span>${icon(it.status, STATUS_LABEL[it.status])}` +
                `<span>${esc(short(it.label))}${it.meta ? ` <span class="meta">${esc(it.meta)}</span>` : ''}</span>` +
                `</button></li>`,
            )
            .join('')}</ul>`
        : '<p class="muted" style="margin:0;font-style:italic">Aucun élément détecté.</p>') +
      `<div class="footer small"><div class="muted">${footer ? `${footer}<br>` : ''}` +
      `Cliquer sur une ligne pour accéder à l'élément. Survoler un élément de la page pour le détail.</div>` +
      `<div class="tools"><span></span><button type="button" class="refresh">Actualiser</button></div></div>`;
  };

  dlg.body.addEventListener('click', (e) => {
    if (e.target.closest('.refresh')) return render();
    const btn = e.target.closest('.item');
    if (!btn) return;
    const el = items[btn.dataset.idx] && items[btn.dataset.idx].el;
    if (!el || !el.isConnected) return render();
    clearTimeout(timer);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Focus si l'élément est focalisable : le panneau flottant s'ouvre à côté.
    if (el.tabIndex >= 0 && typeof el.focus === 'function') el.focus({ preventScroll: true });
    hl.set([[el, 'locate']]);
    timer = setTimeout(() => hl.clear(), 2500);
  });

  render();

  return {
    refresh: render,
    close: () => {
      clearTimeout(timer);
      hl.clear();
      dlg.close();
    },
  };
};

