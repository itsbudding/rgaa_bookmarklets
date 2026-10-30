/**
 * RGAA 11 – Formulaires : au survol (ou au focus) d'un champ, d'un bouton,
 * d'un groupe, d'un label ou d'un élément qui les étiquette, affiche :
 *  - le nom accessible et sa source, la description (11.1, 11.2, 11.9) ;
 *  - les constats : placeholder seul, label masqué, id absent, intitulé
 *    visible absent du nom (11.2.5/11.2.6, 11.9.2), boutons radio non groupés
 *    (11.5) ;
 *  - le caractère obligatoire et l'état invalide (11.10) ;
 *  - les optgroup d'une liste (11.8) ;
 *  - l'attribut autocomplete et la validité de sa valeur (11.13).
 * Les champs ARIA (role="textbox", "checkbox"...) et contenteditable sont pris
 * en compte. Le label et la description du champ sont entourés (11.4).
 */
import { inspector } from '../lib/floating-panel.js';
import { row, value, icon, esc, src, list, checks, flag } from '../lib/dom.js';
import { idrefs, textOf, norm, deepAll, isOwn, isNotExposed, byId } from '../lib/a11y.js';

const ARIA_FIELDS = ['textbox', 'searchbox', 'combobox', 'listbox', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'button'];
const FIELD =
  'input:not([type="hidden"]),select,textarea,button,[contenteditable=""],[contenteditable="true"],' +
  ARIA_FIELDS.map((r) => `[role="${r}"]`).join(',');
const GROUP = 'fieldset,[role="group"],[role="radiogroup"]';
const ANY = `${FIELD},${GROUP}`;
const BUTTON_TYPES = ['submit', 'button', 'reset', 'image'];

/* Valeurs autorisées de autocomplete (WCAG 2.1, critère 1.3.5). */
const AC_FIELDS = new Set(
  ('name honorific-prefix given-name additional-name family-name honorific-suffix nickname username new-password ' +
    'current-password one-time-code organization-title organization street-address address-line1 address-line2 ' +
    'address-line3 address-level4 address-level3 address-level2 address-level1 country country-name postal-code ' +
    'cc-name cc-given-name cc-additional-name cc-family-name cc-number cc-exp cc-exp-month cc-exp-year cc-csc cc-type ' +
    'transaction-currency transaction-amount language bday bday-day bday-month bday-year sex url photo tel ' +
    'tel-country-code tel-national tel-area-code tel-local tel-local-prefix tel-local-suffix tel-extension email impp').split(' '),
);
const AC_CONTACT = new Set(['tel', 'tel-country-code', 'tel-national', 'tel-area-code', 'tel-local', 'tel-local-prefix', 'tel-local-suffix', 'tel-extension', 'email', 'impp']);
const AC_TYPES = ['text', 'email', 'tel', 'url', 'password', 'search', 'number', 'date', 'month'];

const roleOf = (e) => (e.getAttribute('role') || '').trim().split(/\s+/)[0];
const tagOf = (e) => e.tagName.toLowerCase();
const isGroup = (e) => e.tagName === 'FIELDSET' || ['group', 'radiogroup'].includes(roleOf(e));
/* Rôles dont le nom accessible peut venir du contenu (ARIA, « name from content »). */
const NAME_FROM_CONTENT = ['checkbox', 'radio', 'switch', 'option', 'menuitemcheckbox', 'menuitemradio', 'treeitem'];
const nameFromContent = (e) => NAME_FROM_CONTENT.includes(roleOf(e)) && !['input', 'select', 'textarea'].includes(tagOf(e));
const isButton = (e) => tagOf(e) === 'button' || roleOf(e) === 'button' || (tagOf(e) === 'input' && BUTTON_TYPES.includes(e.type));

/** Type affiché : type d'input, rôle ARIA, contenteditable ou balise. */
const typeOf = (e) => {
  if (roleOf(e) && (ARIA_FIELDS.includes(roleOf(e)) || isGroup(e))) return `role="${roleOf(e)}"`;
  if (tagOf(e) === 'input') return e.type;
  if (e.isContentEditable && !['input', 'textarea'].includes(tagOf(e))) return 'contenteditable';
  return tagOf(e);
};

/** Labels natifs, ou label englobant pour les champs ARIA. */
const labelsOf = (e) => {
  const l = e.labels ? [...e.labels] : [];
  if (!l.length && e.closest('label')) l.push(e.closest('label'));
  return l;
};

/** Intitulé visible : texte des labels (ou contenu pour un bouton). */
const visibleLabel = (e) => {
  if (isButton(e)) return textOf(e) || e.value || '';
  if (nameFromContent(e) && !labelsOf(e).length) return textOf(e);
  return labelsOf(e)
    .filter((l) => !isNotExposed(l))
    .map(textOf)
    .join(' ');
};

/**
 * Nom accessible, dans l'ordre du calcul des navigateurs.
 * @returns {{v, s, insufficient?: boolean}}
 */
const accName = (e) => {
  const lb = idrefs(e, 'aria-labelledby');
  if (lb && lb.v.length) return lb;
  const al = (e.getAttribute('aria-label') || '').trim();
  if (al) return { v: al, s: 'aria-label' };
  if (e.tagName === 'FIELDSET') {
    const l = e.querySelector(':scope > legend');
    if (l) return { v: textOf(l), s: 'legend' };
  }
  if (tagOf(e) === 'input' && e.type === 'image') return { v: e.getAttribute('alt'), s: 'alt' };
  if (isButton(e)) {
    const t = textOf(e);
    return { v: t || e.value, s: t ? 'contenu' : 'value' };
  }
  const labels = labelsOf(e);
  if (labels.length) {
    const t = labels.map(textOf).filter(Boolean);
    if (t.length) return { v: t, s: labels.length > 1 ? `${labels.length} labels` : 'label' };
  }
  if (nameFromContent(e)) {
    const t = textOf(e);
    if (t) return { v: t, s: 'contenu' };
  }
  const title = (e.getAttribute('title') || '').trim();
  if (title) return { v: title, s: 'title' };
  const ph = (e.getAttribute('placeholder') || e.getAttribute('aria-placeholder') || '').trim();
  if (ph) return { v: ph, s: 'placeholder', insufficient: true };
  return { v: null, s: '' };
};

const hasName = (n) => !n.insufficient && n.v && String(Array.isArray(n.v) ? n.v.join('') : n.v).trim();

/** Validation de autocomplete (11.13). */
const checkAutocomplete = (v) => {
  let tokens = v.trim().toLowerCase().split(/\s+/);
  if (tokens.length === 1 && ['on', 'off'].includes(tokens[0])) return { ok: true, neutral: true };
  if (tokens[tokens.length - 1] === 'webauthn') tokens = tokens.slice(0, -1);
  const field = tokens.pop();
  if (!AC_FIELDS.has(field)) return { ok: false, why: `« ${field} » n'est pas une valeur autorisée` };
  if (tokens.length && ['home', 'work', 'mobile', 'fax', 'pager'].includes(tokens[tokens.length - 1])) {
    if (!AC_CONTACT.has(field)) return { ok: false, why: `« ${tokens[tokens.length - 1]} » ne s'applique qu'aux téléphones et e-mails` };
    tokens.pop();
  }
  if (tokens.length && ['shipping', 'billing'].includes(tokens[tokens.length - 1])) tokens.pop();
  if (tokens.length && tokens[tokens.length - 1].startsWith('section-')) tokens.pop();
  if (tokens.length) return { ok: false, why: `jeton inattendu « ${tokens.join(' ')} »` };
  return { ok: true };
};
const needsAutocomplete = (e) =>
  (tagOf(e) === 'input' && AC_TYPES.includes(e.type)) || ['select', 'textarea'].includes(tagOf(e));

/** Retrouve le champ concerné à partir de l'élément survolé. */
const resolveField = (target) => {
  const t = target.closest(`${ANY},label,[id]`);
  if (!t) return null;
  let f = null;
  if (t.tagName === 'LABEL') {
    f = t.control || t.querySelector(FIELD);
  } else if (t.id && !t.matches(ANY)) {
    const root = t.getRootNode();
    const id = CSS.escape(t.id);
    f = root.querySelector(`[aria-labelledby~="${id}"],[aria-describedby~="${id}"]`);
  }
  if (f && f.matches(ANY)) return { field: f, linked: f !== t ? t : null };
  if (t.matches(ANY)) return { field: t, linked: null };
  // Élément à l'intérieur d'un champ ARIA (ex. texte d'un role="checkbox").
  const inner = t.closest(ANY);
  return inner ? { field: inner, linked: null } : null;
};

/** Boutons radio / cases de même name hors groupe (11.5). */
const ungrouped = (f) => {
  if (tagOf(f) !== 'input' || !['radio', 'checkbox'].includes(f.type) || !f.name) return false;
  if (f.closest(GROUP)) return false;
  const root = f.form || f.getRootNode();
  const same = root.querySelectorAll(`input[type="${f.type}"][name="${CSS.escape(f.name)}"]`);
  return same.length > 1;
};

const summary = () => {
  const fields = deepAll(FIELD).filter((e) => !isOwn(e) && !isNotExposed(e) && !isButton(e));
  let noName = 0;
  let placeholder = 0;
  let badAc = 0;
  fields.forEach((e) => {
    const n = accName(e);
    if (n.insufficient) placeholder++;
    else if (!hasName(n)) noName++;
    const ac = e.getAttribute('autocomplete');
    if (ac && !checkAutocomplete(ac).ok) badAc++;
  });
  return (
    `<strong>Page :</strong> ${fields.length} champ${fields.length > 1 ? 's' : ''} · ` +
    `${noName ? icon('error') + ' ' : ''}${noName} sans étiquette · ` +
    `${placeholder ? icon('warning') + ' ' : ''}${placeholder} placeholder seul · ` +
    `${badAc ? icon('error') + ' ' : ''}${badAc} autocomplete invalide`
  );
};

inspector({
  id: 'rgaa-11-formulaires',
  summary,
  inspect(target) {
    const r = resolveField(target);
    if (!r) return null;
    const f = r.field;
    const group = isGroup(f);
    const n = accName(f);
    const d = idrefs(f, 'aria-describedby');
    const found = [];
    const hl = [
      [f, 'primary'],
      [r.linked, 'secondary'],
    ];

    // Nom
    let nameHtml;
    if (n.insufficient) nameHtml = `${esc(n.v)} ${src('placeholder')}`;
    else nameHtml = value(hasName(n) ? { v: n.v, s: n.s } : null);
    let html = row(group ? 'Légende' : isButton(f) ? 'Intitulé' : 'Nom', nameHtml);
    if (n.insufficient) found.push(['error', 'Placeholder seul : ce n’est pas une étiquette (11.1)']);

    // Constats sur l'étiquette
    const lb = idrefs(f, 'aria-labelledby');
    if (lb && lb.missing.length) found.push(['error', `aria-labelledby : id introuvable (${lb.missing.join(', ')})`]);
    if (lb) lb.els.forEach((el) => hl.push([el, 'secondary']));
    const labels = labelsOf(f);
    labels.forEach((l) => hl.push([l, 'secondary']));
    if (labels.length && labels.every((l) => isNotExposed(l)) && n.s.includes('label'))
      found.push(['warning', 'Label masqué : vérifier qu’une étiquette visible existe (11.1)']);
    if (labels.length > 1) found.push(['warning', `${labels.length} labels associés au champ : vérifier la cohérence`]);

    // Intitulé visible contenu dans le nom (11.2.5, 11.2.6, 11.9.2)
    const visible = visibleLabel(f);
    if (hasName(n) && visible && !['label', 'contenu', 'value', 'legend'].includes(n.s) && !n.s.endsWith('labels')) {
      const name = Array.isArray(n.v) ? n.v.join(' ') : n.v;
      if (!norm(name).includes(norm(visible)))
        found.push(['error', `Le nom ne contient pas l’intitulé visible « ${visible} » (${isButton(f) ? '11.9.2' : '11.2.5'})`]);
    }

    // Description
    html += row('Description', d && d.v.length ? value(d) : '<span class="muted">aucune</span>');
    if (d && d.missing.length) found.push(['error', `aria-describedby : id introuvable (${d.missing.join(', ')})`]);
    if (d) d.els.forEach((el) => hl.push([el, 'secondary']));

    if (!group) {
      html += row('Type', esc(typeOf(f)));

      // Obligatoire et invalide (11.10)
      if (!isButton(f)) {
        const req = f.required ? 'required' : f.getAttribute('aria-required') === 'true' ? 'aria-required' : '';
        html += row('Obligatoire', req ? `Oui ${src(req)}` : 'Non');
        const inv = f.getAttribute('aria-invalid');
        if (inv && inv !== 'false') html += row('Invalide', `${esc(inv)} ${src('aria-invalid')}`);
        if (req) found.push(['warning', 'Vérifier que le caractère obligatoire est aussi indiqué visuellement (11.10)']);
      }

      // Groupe (11.5)
      const g = f.closest(GROUP);
      if (g && g !== f) {
        const gn = accName(g);
        html += row('Groupe', value(hasName(gn) ? gn : null));
      }
      if (ungrouped(f)) found.push(['warning', `Plusieurs ${f.type === 'radio' ? 'boutons radio' : 'cases'} « ${f.name} » hors fieldset ou role="group" (11.5)`]);

      // optgroup (11.8)
      if (tagOf(f) === 'select') {
        const og = [...f.querySelectorAll('optgroup')];
        html += row(
          'Groupes d’options',
          og.length
            ? list(og.map((o) => (o.label ? `${esc(o.label)} ${src('label')}` : flag('error', 'optgroup sans label'))))
            : '<span class="muted">aucun</span>',
        );
      }

      // autocomplete (11.13)
      const ac = f.getAttribute('autocomplete');
      if (ac) {
        const c = checkAutocomplete(ac);
        html += row('Autocomplete', c.ok ? `${esc(ac)} ${src('autocomplete')}` : flag('error', `${ac} : ${c.why}`));
      } else if (needsAutocomplete(f)) {
        html += row('Autocomplete', flag('warning', 'Absent : requis si le champ concerne l’utilisateur (11.13)'));
      }
    }

    html += checks(found);
    return { html, highlight: hl };
  },
});
