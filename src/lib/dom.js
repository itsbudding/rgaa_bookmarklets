/**
 * Petits utilitaires de rendu HTML partagés par tous les bookmarklets.
 * Tout texte venant de la page DOIT passer par esc() avant d'être injecté.
 */

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Échappe une chaîne pour l'insérer dans du HTML. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ENTITIES[ch]);

const ICONS = {
  error: { glyph: '×', label: 'Erreur' },
  warning: { glyph: '!', label: 'Attention' },
  ok: { glyph: '✓', label: 'Conforme' },
  hidden: { glyph: '∅', label: 'Masqué' },
};

/**
 * Icône de statut : pictogramme décoratif + texte pour les lecteurs d'écran.
 * @param {'error'|'warning'|'ok'|'hidden'} type
 * @param {string} [label] texte alternatif (par défaut, celui du type)
 */
export const icon = (type, label) =>
  `<span class="icon icon--${type}" aria-hidden="true">${ICONS[type].glyph}</span>` +
  `<span class="sr-only">${esc(label || ICONS[type].label)}</span>`;

/** Source d'une valeur, affichée en petit et en italique : « (aria-label) ». */
export const src = (s) => (s ? `<span class="src">(${esc(s)})</span>` : '');

/** Liste à puces à partir de fragments HTML déjà échappés. */
export const list = (items) => `<ul class="list">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

/** Ligne « Libellé : valeur ». valueHtml doit déjà être échappé. */
export const row = (label, valueHtml) =>
  `<div class="row"><span class="label">${esc(label)} :</span><span class="value">${valueHtml}</span></div>`;

/**
 * Formate un résultat { v, s } où v est une chaîne, un tableau de chaînes ou
 * un tableau de { t, s }. Affiche l'icône d'erreur si rien n'est trouvé.
 */
export const value = (r) => {
  const items = r && (Array.isArray(r.v) ? r.v : [r.v]).filter((x) => x && (x.t ?? x));
  if (!items || !items.length) return icon('error', 'Absent');
  const one = (m) => (typeof m === 'object' ? `${esc(m.t)} ${src(m.s)}` : esc(m));
  const body = items.length > 1 ? list(items.map(one)) : one(items[0]);
  return `${body}${r.s ? ' ' + src(r.s) : ''}`;
};
