/**
 * RGAA 11 – Formulaires : au survol (ou au focus) d'un champ, d'un bouton,
 * d'un groupe ou d'un élément qui les étiquette, affiche le nom accessible,
 * la description, le type et l'attribut autocomplete du champ.
 */
import { inspector } from '../lib/floating-panel.js';
import { row, value, icon, esc, src } from '../lib/dom.js';
import { idrefs, textOf } from '../lib/a11y.js';
import { isOwn } from '../lib/panel.js';

const FIELD = 'input,select,textarea,button,fieldset,[role="group"],[role="radiogroup"]';

const accName = (e) => {
  const tag = e.tagName.toLowerCase();
  let n = idrefs(e, 'aria-labelledby');
  if (n) return n;
  const al = e.getAttribute('aria-label');
  if (al) return { v: al, s: 'aria-label' };
  if (e.matches('fieldset,[role="group"],[role="radiogroup"]')) {
    const l = e.querySelector('legend');
    if (l) return { v: textOf(l), s: 'legend' };
  }
  if (tag === 'input' && e.type === 'image') return { v: e.getAttribute('alt'), s: 'alt' };
  if (tag === 'button' || (tag === 'input' && ['submit', 'button', 'reset'].includes(e.type))) {
    const t = textOf(e);
    return { v: t || e.value, s: t ? 'contenu' : 'value' };
  }
  const lbl = (e.labels && e.labels[0]) || e.closest('label');
  if (lbl) return { v: textOf(lbl), s: 'label' };
  return { v: e.getAttribute('title'), s: 'title' };
};

/** Retrouve le champ concerné à partir de l'élément survolé. */
const resolveField = (target) => {
  const t = target.closest(`${FIELD},label,[id]`);
  if (!t) return null;
  let f = null;
  if (t.tagName === 'LABEL') {
    f = t.control || t.querySelector('input,select,textarea');
  } else if (t.id && !t.matches(FIELD)) {
    const id = CSS.escape(t.id);
    f = document.querySelector(`[aria-labelledby~="${id}"],[aria-describedby~="${id}"]`);
  }
  if (f && f.matches(FIELD)) return { field: f, linked: f !== t ? t : null };
  return t.matches(FIELD) ? { field: t, linked: null } : null;
};

/** Compteur de page : champs de saisie et champs sans nom accessible. */
const summary = () => {
  const fields = [...document.querySelectorAll('input:not([type="hidden"]),select,textarea')].filter(
    (e) => !isOwn(e) && !['submit', 'button', 'reset', 'image'].includes(e.type),
  );
  const noName = fields.filter((e) => {
    const n = accName(e);
    return !n.v || !String(Array.isArray(n.v) ? n.v.join('') : n.v).trim();
  }).length;
  return (
    `<strong>Page :</strong> ${fields.length} champ${fields.length > 1 ? 's' : ''} · ` +
    `${noName ? icon('error') + ' ' : ''}${noName} sans étiquette`
  );
};

inspector({
  id: 'rgaa-11-formulaires',
  summary,
  inspect(target) {
    const r = resolveField(target);
    if (!r) return null;
    const f = r.field;
    const isGroup = f.tagName === 'FIELDSET' || ['group', 'radiogroup'].includes(f.getAttribute('role'));
    const n = accName(f);
    const d = idrefs(f, 'aria-describedby');
    const ac = f.getAttribute('autocomplete');

    let html = row(isGroup ? 'Légende' : 'Nom', value(n)) +
      row('Description', value(d));
    if (!isGroup) {
      html +=
        row('Type', esc(f.tagName === 'INPUT' ? f.type : f.tagName.toLowerCase())) +
        row('Autocomplete', ac ? `${esc(ac)} ${src('autocomplete')}` : icon('error', 'Absent'));
    }
    return {
      html,
      highlight: [
        [f, 'primary'],
        [r.linked, 'secondary'],
      ],
    };
  },
});
