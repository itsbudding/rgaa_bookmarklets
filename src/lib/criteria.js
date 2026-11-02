/**
 * Affichage commun des critères : pastilles de la liste (« 1.1 ✓ ») et blocs
 * de critère du détail. Même vocabulaire partout :
 *   ✓ conforme · ! à vérifier · × non conforme · ∅ non concerné.
 *
 * Un critère est un objet { status, text, extra: [[type, texte]...], base }.
 * base: true signale une « pertinence à juger » sans autre constat : la
 * pastille est « ! », mais la ligne de la liste reste ✓ (voir lineStatus).
 * na: true : critère non applicable, ni pastille ni bloc.
 */
import { flag } from './dom.js';

export const STATUS_WORD = { error: 'non conforme', warning: 'à vérifier', ok: 'conforme', hidden: 'non concerné' };
const GLYPH = { error: '×', warning: '!', ok: '✓', hidden: '∅' };
const RANK = { error: 3, warning: 2, ok: 1, hidden: 0 };

/** Pire statut d'une liste (ok si vide). */
export const worst = (l) => l.reduce((w, s) => (RANK[s] > RANK[w] ? s : w), 'ok');

/** Pastille d'un critère. */
export const pill = (k, s) =>
  `<span class="pill pill--${s}"><span aria-hidden="true">${k} ${GLYPH[s]}</span><span class="sr-only">${k} ${STATUS_WORD[s]},</span></span>`;

/** Pastilles des critères applicables, dans l'ordre de keys. */
export const pills = (crit, keys) =>
  `<span class="pills">${keys
    .filter((k) => crit[k] && !crit[k].na)
    .map((k) => pill(k, crit[k].status))
    .join('')}</span>`;

/** Statut de la ligne : pire des critères, une pertinence à juger seule compte comme ✓. */
export const lineStatus = (crit) =>
  worst(
    Object.values(crit)
      .filter((c) => c && !c.na)
      .map((c) => (c.base ? 'ok' : c.status)),
  );

/**
 * Critère à partir de constats [[type, texte]...]. Sans constat : texte ok
 * (ou judge, pertinence à juger : « ! »). Avec constats : le plus grave sert
 * de verdict, les autres sont listés dessous.
 */
export const fromChecks = (x, { ok = 'Conforme', judge } = {}) => {
  if (!x.length) return judge ? { status: 'warning', text: judge, extra: [], base: true } : { status: 'ok', text: ok, extra: [] };
  const sorted = [...x].sort((a, b) => RANK[b[0]] - RANK[a[0]]);
  return { status: sorted[0][0], text: sorted[0][1], extra: sorted.slice(1) };
};

/** Bloc d'un critère dans le détail. */
export const critBlock = (num, r) =>
  `<div class="crit"><span class="crit-num">${num}</span><div class="crit-body">${flag(r.status, r.text)}` +
  `${(r.extra || []).map(([t, txt]) => `<div>${flag(t, txt)}</div>`).join('')}</div></div>`;

/** Blocs des critères applicables. */
export const critBlocks = (crit, keys) =>
  `<div class="crits">${keys
    .filter((k) => crit[k] && !crit[k].na)
    .map((k) => critBlock(k, crit[k]))
    .join('')}</div>`;

/** Styles du détail (blocs de critère). */
export const CRIT_CSS = `
.crits{margin-top:8px;border-top:1px solid var(--rgaa-sep)}
.crit{display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--rgaa-sep)}
.crit-num{flex:0 0 2.8em;font-weight:700}
.crit-body{min-width:0;display:flex;flex-direction:column;gap:3px}
.note{margin:8px 0 0}
`;

/** Styles de la liste (pastilles sous le libellé). */
export const PILL_CSS = `
.item > span:last-child{display:flex;flex-direction:column;gap:2px}
.pills{order:2;display:flex;flex-wrap:wrap;gap:3px;margin-top:2px}
.pill{font-size:var(--rgaa-fs-sm);border:1px solid currentColor;border-radius:3px;padding:0 3px;white-space:nowrap}
.pill--error{color:var(--rgaa-error)}
.pill--warning{color:var(--rgaa-warning)}
.pill--ok{color:var(--rgaa-ok)}
.pill--hidden{color:var(--rgaa-muted)}
`;
