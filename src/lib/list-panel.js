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
 *     tools: [{                                       // boutons à bascule (optionnel)
 *       label: 'Estomper les images',
 *       pressed: () => dimmed,
 *       toggle: () => setDim(!dimmed),
 *     }],
 *     filters: [                                      // filtres de la liste (optionnel) ;
 *       { id: 'texte', label: 'Textes' },             // chaque élément porte alors
 *     ],                                              // filter: 'texte'
 *   }
 *
 * beforeLocate(el) (optionnel) : appelé juste avant le défilement (ex. afficher
 * temporairement un élément masqué).
 * onLocate(el) (optionnel) : appelé après le clic sur une ligne, une fois le
 * défilement lancé (le panneau flottant s'en sert pour épingler le détail).
 *
 * Un élément peut aussi porter :
 *   els: [el1, el2...]  plusieurs éléments regroupés (chaque clic passe au suivant) ;
 *   prefix: '<span>'    HTML déjà échappé affiché avant le libellé (pastilles...) ;
 *   indent: 2           retrait (niveaux), pour une liste arborescente ;
 *   section: true       ligne de titre non cliquable (label seul), affichée
 *                       seulement sans filtre.
 *
 * collect() peut aussi renvoyer count : nombre affiché dans le titre (par
 * défaut, le nombre de lignes).
 * Un outil sans pressed() est un simple bouton (pas d'aria-pressed) ;
 * son label peut être une fonction. toolsOnTop: true place les outils et
 * « Actualiser » en haut du panneau, sous le compteur. css : styles en plus
 * (pastilles...). La légende des statuts est affichée en bas de chaque liste.
 */
import { dialog } from './dialog-panel.js';
import { createHighlighter } from './highlight.js';
import { icon, esc } from './dom.js';

const STATUS_LABEL = { error: 'Non conforme', warning: 'À vérifier', ok: 'Conforme', hidden: 'Non concerné' };

/** Légende commune à toutes les listes. */
const LEGEND =
  '<ul class="legend muted" aria-hidden="true">' +
  [['ok', 'conforme'], ['warning', 'à vérifier'], ['error', 'non conforme'], ['hidden', 'non concerné']]
    .map(([t, l]) => `<li>${icon(t)}${l}</li>`)
    .join('') +
  '</ul>';
const MAX_LABEL = 60;

const CSS = `
.list-summary{margin:0 0 8px}
.item{padding:6px 0;align-items:flex-start}
.item .icon{margin-top:2px}
.num{color:var(--rgaa-muted);min-width:2.2em;text-align:right;flex-shrink:0}
.meta{color:var(--rgaa-muted);font-size:var(--rgaa-fs-sm);font-style:italic;white-space:nowrap}
.tools{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px}
.tools--top{margin:0 0 8px}
.refresh,.tool{white-space:nowrap}
.toolset,.filters{display:flex;flex-wrap:wrap;gap:6px}
.filters{margin:0 0 8px}
.refresh,.tool,.filter{cursor:pointer;background:none;border:1px solid var(--rgaa-border);border-radius:3px;padding:2px 8px}
.tool[aria-pressed="true"],.filter[aria-pressed="true"]{background:var(--rgaa-focus);border-color:var(--rgaa-focus);color:#fff}
.section{padding:8px 0 4px;font-weight:700;border-bottom:1px solid var(--rgaa-sep)}
.footer .legend{margin:0 0 6px;gap:4px 10px}
`;

const short = (s) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > MAX_LABEL ? `${t.slice(0, MAX_LABEL - 1)}…` : t;
};

export const createListPanel = ({ id, title, collect, footer = '', tools = [], filters = [], toolsOnTop = false, css = '', beforeLocate, onClose, onLocate }) => {
  const dlg = dialog({
    id: `${id}-liste`,
    title,
    css: CSS + css,
    managed: true,
    focus: false,
    closeLabel: 'Fermer et désactiver le bookmarklet',
    // Fermé par son bouton ou par Échap : on nettoie ses propres contours
    // avant de prévenir le bookmarklet (qui s'arrête alors entièrement).
    onClose: () => {
      cleanup();
      if (onClose) onClose();
    },
  });
  const hl = createHighlighter();
  let res = { summary: '', items: [] };
  let items = [];
  let filter = 'all';
  let timer;
  const cleanup = () => {
    clearTimeout(timer);
    hl.clear();
  };

  /** Affiche la liste à partir du dernier résultat de collect(). */
  const draw = () => {
    // Garde le focus sur le bouton activé, qui est recréé par le rendu.
    const active = dlg.panel.getRootNode().activeElement;
    const keep =
      active && active.dataset && (active.dataset.tool || active.dataset.filter || (active.classList.contains('refresh') && 'refresh'));
    const allFilters = filters.length ? [{ id: 'all', label: 'Tout' }, ...filters] : [];
    items = res.items.filter((it) => (it.section ? filter === 'all' : filter === 'all' || [].concat(it.filter).includes(filter)));
    dlg.setTitle(`${title} : ${res.count ?? res.items.length}`);
    let n = 0;
    const line = (it) => {
      const i = items.indexOf(it);
      const pad = it.indent ? ` style="padding-left:${it.indent * 14}px"` : '';
      if (it.section) return `<li class="section"${pad}>${it.prefix || ''}${esc(it.label)}</li>`;
      return (
        `<li${pad}><button type="button" class="item" data-idx="${i}">` +
        `<span class="num" aria-hidden="true">${++n}.</span>${icon(it.status, STATUS_LABEL[it.status])}` +
        `<span>${it.prefix || ''}${esc(short(it.label))}${it.meta ? ` <span class="meta">${esc(it.meta)}</span>` : ''}</span>` +
        `</button></li>`
      );
    };
    const mainHtml = items.length
      ? `<ul class="items">${items.map(line).join('')}</ul>`
      : '<p class="muted" style="margin:0;font-style:italic">Aucun élément détecté.</p>';
    const toolsHtml = `<div class="tools${toolsOnTop ? ' tools--top' : ''}"><span class="toolset">${tools
        .map(
          (t, i) =>
            `<button type="button" class="tool" data-tool="${i}"${t.pressed ? ` aria-pressed="${!!t.pressed()}"` : ''}>${esc(typeof t.label === 'function' ? t.label() : t.label)}</button>`,
        )
        .join('')}</span><button type="button" class="refresh">Actualiser</button></div>`;
    dlg.body.innerHTML =
      `<p class="list-summary small">${res.summary}</p>` +
      (toolsOnTop ? toolsHtml : '') +
      (allFilters.length
        ? `<div class="filters" role="group" aria-label="Filtrer la liste">${allFilters
            .map((f) => `<button type="button" class="filter" data-filter="${esc(f.id)}" aria-pressed="${f.id === filter}">${esc(f.label)}</button>`)
            .join('')}</div>`
        : '') +
      mainHtml +
      `<div class="footer small">${LEGEND}<div class="muted">${footer ? `${footer}<br>` : ''}` +
      `${onLocate ? 'Cliquer sur une ligne pour accéder à l’élément et épingler son détail (clic ailleurs ou Échap pour le libérer).' : 'Cliquer sur une ligne pour accéder à l\'élément.'} Survoler un élément de la page pour le détail.</div>` +
      (toolsOnTop ? '' : toolsHtml) +
      '</div>';
    if (keep) {
      const sel =
        keep === 'refresh' ? '.refresh' : active.dataset.tool ? `[data-tool="${keep}"]` : `[data-filter="${keep}"]`;
      const b = dlg.body.querySelector(sel);
      if (b) b.focus();
    }
  };

  const render = () => {
    res = collect();
    draw();
  };

  dlg.body.addEventListener('click', (e) => {
    if (e.target.closest('.refresh')) return render();
    const tool = e.target.closest('.tool');
    if (tool) {
      tools[tool.dataset.tool].toggle();
      return draw();
    }
    const f = e.target.closest('.filter');
    if (f) {
      filter = f.dataset.filter;
      return draw();
    }
    const btn = e.target.closest('.item');
    if (!btn) return;
    const it = items[btn.dataset.idx];
    if (!it) return;
    // Groupe d'éléments : chaque clic passe à l'élément suivant.
    const els = it.els || [it.el];
    const el = els[(it.cursor = ((it.cursor ?? -1) + 1) % els.length)];
    if (!el || !el.isConnected) return render();
    clearTimeout(timer);
    if (beforeLocate) beforeLocate(el);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Focus si l'élément est focalisable : le panneau flottant s'ouvre à côté.
    if (el.tabIndex >= 0 && typeof el.focus === 'function') el.focus({ preventScroll: true });
    hl.set([[el, 'locate']]);
    timer = setTimeout(() => hl.clear(), 2500);
    if (onLocate) onLocate(el);
  });

  render();

  return {
    refresh: render,
    redraw: draw,
    close: () => {
      cleanup();
      dlg.close();
    },
  };
};
