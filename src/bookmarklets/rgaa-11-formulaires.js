/**
 * RGAA 11 – Formulaires : liste des champs, boutons et groupes de la page,
 * une pastille par critère selon la nature de l'élément :
 *  - champs : 11.1 étiquette (× absente, placeholder seul), 11.2 pertinence
 *    (! à juger, × nom sans l'intitulé visible), 11.5 regroupement des radios
 *    et cases, 11.8 optgroup, 11.10 obligatoire (! indication visuelle),
 *    11.13 autocomplete (valeur valide) ;
 *  - groupes : 11.6 légende, 11.7 pertinence de la légende ;
 *  - boutons : 11.9 intitulé (× absent ou sans l'intitulé visible, ! à juger).
 * Détail au survol (ou au focus) d'un champ, d'un label ou d'un élément qui
 * l'étiquette, épinglé au clic sur une ligne. Les champs ARIA (role="textbox",
 * "checkbox"...) et contenteditable sont pris en compte. Le label et la
 * description du champ sont entourés (11.4).
 */
import { inspector } from '../lib/floating-panel.js';
import { row, value, icon, esc, src, list, checks, flag, roleValue } from '../lib/dom.js';
import { idrefs, textOf, norm, deepAll, isOwn, isNotExposed, roleInfo } from '../lib/a11y.js';
import { labelText } from '../lib/name.js';
import { pills, critBlocks, lineStatus, fromChecks, CRIT_CSS, PILL_CSS } from '../lib/criteria.js';

const ID = 'rgaa-11-formulaires';
const CRIT = ['11.1', '11.2', '11.5', '11.6', '11.7', '11.8', '11.9', '11.10', '11.13'];
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
    .map((l) => labelText(l, e))
    .join(' ');
};

/**
 * Nom accessible, dans l'ordre du calcul des navigateurs.
 * @returns {{v, s, insufficient?: boolean}}
 */
const accName = (e) => {
  const lb = idrefs(e, 'aria-labelledby', (t) => labelText(t, e));
  if (lb && lb.v.length) return lb;
  const al = (e.getAttribute('aria-label') || '').trim();
  if (al) return { v: al, s: 'aria-label' };
  if (e.tagName === 'FIELDSET') {
    const l = e.querySelector(':scope > legend');
    if (l) return { v: labelText(l, e), s: 'legend' };
  }
  if (tagOf(e) === 'input' && e.type === 'image') return { v: e.getAttribute('alt'), s: 'alt' };
  if (isButton(e)) {
    const t = textOf(e);
    return { v: t || e.value, s: t ? 'contenu' : 'value' };
  }
  const labels = labelsOf(e);
  if (labels.length) {
    const t = labels.map((l) => labelText(l, e)).filter(Boolean);
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

const plural = (n, s, p = `${s}s`) => `${n} ${n > 1 ? p : s}`;
const nameStr = (n) => (Array.isArray(n.v) ? n.v.join(' ') : n.v || '');
const typeOfTag = (e) => (e.isContentEditable ? 'contenteditable' : e.tagName.toLowerCase());

/** Analyse d'un champ, bouton ou groupe : critères et constats hors critère. */
const analyse = (f) => {
  const kind = isGroup(f) ? 'groupe' : isButton(f) ? 'bouton' : 'champ';
  const n = accName(f);
  const named = !!hasName(n);
  const lb = idrefs(f, 'aria-labelledby');
  const d = idrefs(f, 'aria-describedby');
  const labels = labelsOf(f);
  const c = {};
  const other = [];
  const lbMissing = lb && lb.missing.length ? [['error', `aria-labelledby : id introuvable (${lb.missing.join(', ')})`]] : [];
  if (d && d.missing.length) other.push(['error', `aria-describedby : id introuvable (${d.missing.join(', ')})`]);

  // Intitulé visible contenu dans le nom (11.2.5, 11.2.6, 11.9.2).
  const visible = visibleLabel(f);
  const visibleMissing =
    named && visible && !['label', 'contenu', 'value', 'legend'].includes(n.s) && !n.s.endsWith('labels') && !norm(nameStr(n)).includes(norm(visible));

  if (kind === 'groupe') {
    c['11.6'] = fromChecks([...(named ? [] : [['error', 'Groupe sans légende (legend, aria-label ou aria-labelledby)']]), ...lbMissing], {
      ok: `Légende présente (${n.s})`,
    });
    if (named) c['11.7'] = fromChecks([], { judge: 'Pertinence de la légende à juger' });
  } else if (kind === 'bouton') {
    const x = [...lbMissing];
    if (!named) x.push(['error', 'Bouton sans intitulé']);
    else if (visibleMissing) x.push(['error', `Le nom ne contient pas l’intitulé visible « ${visible} » (11.9.2)`]);
    c['11.9'] = fromChecks(x, { judge: 'Pertinence de l’intitulé à juger' });
  } else {
    const x = [...lbMissing];
    if (n.insufficient) x.push(['error', 'Placeholder seul : ce n’est pas une étiquette']);
    else if (!named) x.push(['error', 'Aucune étiquette']);
    if (!roleInfo(f).role && f.isContentEditable) x.push(['error', 'Zone contenteditable sans role (ex. role="textbox") : non identifiée comme champ']);
    if (labels.length && labels.every((l) => isNotExposed(l)) && n.s.includes('label')) x.push(['warning', 'Label masqué : vérifier qu’une étiquette visible existe']);
    c['11.1'] = fromChecks(x, { ok: `Étiquette présente (${n.s})` });
    if (named) {
      const y = [];
      if (labels.length > 1) y.push(['warning', `${labels.length} labels associés au champ : vérifier la cohérence`]);
      if (visibleMissing) y.push(['error', `Le nom ne contient pas l’intitulé visible « ${visible} » (11.2.5)`]);
      c['11.2'] = fromChecks(y, { judge: 'Pertinence de l’étiquette à juger' });
    }
    // Regroupement (11.5) : radios et cases natives de même name.
    if (tagOf(f) === 'input' && ['radio', 'checkbox'].includes(f.type)) {
      if (ungrouped(f)) c['11.5'] = fromChecks([['warning', `Plusieurs ${f.type === 'radio' ? 'boutons radio' : 'cases'} « ${f.name} » hors fieldset ou role="group"`]], {});
      else if (f.closest(GROUP)) c['11.5'] = fromChecks([], { ok: 'Dans un groupe (fieldset ou role="group")' });
    }
    // optgroup (11.8)
    if (tagOf(f) === 'select' && f.querySelector('optgroup')) {
      const bad = [...f.querySelectorAll('optgroup')].filter((o) => !o.label).length;
      c['11.8'] = fromChecks(bad ? [['error', `${plural(bad, 'optgroup')} sans label`]] : [], { ok: 'Groupes d’options avec label' });
    }
    // Obligatoire (11.10)
    const req = f.required ? 'required' : f.getAttribute('aria-required') === 'true' ? 'aria-required' : '';
    if (req) c['11.10'] = fromChecks([], { judge: `Obligatoire (${req}) : vérifier que c’est aussi indiqué visuellement` });
    // autocomplete (11.13)
    const ac = f.getAttribute('autocomplete');
    if (ac && !checkAutocomplete(ac).neutral) {
      const r = checkAutocomplete(ac);
      c['11.13'] = fromChecks(r.ok ? [] : [['error', `autocomplete="${ac}" : ${r.why}`]], { ok: `autocomplete="${ac}" valide` });
    }
  }
  const status = lineStatus(c);
  return { el: f, kind, n, named, lb, d, labels, crit: c, other, status: other.some((o) => o[0] === 'error') ? 'error' : status };
};

/* ---- Panneau liste ---- */

const collect = () => {
  const els = deepAll(`${FIELD},${GROUP}`).filter((e) => !isOwn(e) && !isNotExposed(e));
  const all = els.map(analyse);
  const items = all.map((a) => {
    const fallback = a.kind === 'bouton' ? 'Bouton sans intitulé' : a.kind === 'groupe' ? 'Groupe sans légende' : 'Sans étiquette';
    return {
      el: a.el,
      status: a.status,
      label: a.n.insufficient ? `Placeholder seul : ${a.n.v}` : a.named ? nameStr(a.n) : fallback,
      meta: roleInfo(a.el).role || typeOfTag(a.el),
      prefix: pills(a.crit, CRIT),
      filter: [
        ...(a.status === 'error' ? ['erreurs'] : []),
        ...(['error', 'warning'].includes(a.status) ? ['verifier'] : []),
        { champ: 'champs', bouton: 'boutons', groupe: 'groupes' }[a.kind],
      ],
    };
  });
  const count = (k) => all.filter((a) => a.kind === k).length;
  const err = all.filter((a) => a.status === 'error').length;
  const warn = all.filter((a) => a.status === 'warning').length;
  return {
    items,
    summary:
      `${plural(count('champ'), 'champ')} · ${plural(count('bouton'), 'bouton')} · ${plural(count('groupe'), 'groupe')} · ` +
      `${err ? icon('error') + ' ' : ''}${err} non conforme${err > 1 ? 's' : ''} · ${warn ? icon('warning') + ' ' : ''}${warn} à vérifier`,
  };
};

/* ---- Détail ---- */

const detail = (a) => {
  const f = a.el;
  const n = a.n;
  const nameHtml = n.insufficient ? `${esc(n.v)} ${src('placeholder')}` : value(a.named ? { v: n.v, s: n.s } : null);
  let html = row(a.kind === 'groupe' ? 'Légende' : a.kind === 'bouton' ? 'Intitulé' : 'Nom', nameHtml);
  html += row('Description', a.d && a.d.v.length ? value(a.d) : '<span class="muted">aucune</span>');
  html += row('Rôle', roleValue(roleInfo(f)));
  if (a.kind === 'champ') {
    const req = f.required ? 'required' : f.getAttribute('aria-required') === 'true' ? 'aria-required' : '';
    html += row('Obligatoire', req ? `Oui ${src(req)}` : 'Non');
    const inv = f.getAttribute('aria-invalid');
    if (inv && inv !== 'false') html += row('Invalide', `${esc(inv)} ${src('aria-invalid')}`);
    const g = f.closest(GROUP);
    if (g && g !== f) {
      const gn = accName(g);
      html += row('Groupe', value(hasName(gn) ? gn : null));
    }
    if (tagOf(f) === 'select') {
      const og = [...f.querySelectorAll('optgroup')];
      html += row(
        'Groupes d’options',
        og.length ? list(og.map((o) => (o.label ? `${esc(o.label)} ${src('label')}` : flag('error', 'optgroup sans label')))) : '<span class="muted">aucun</span>',
      );
    }
    const ac = f.getAttribute('autocomplete');
    if (ac) html += row('Autocomplete', `${esc(ac)} ${src('autocomplete')}`);
    else if (needsAutocomplete(f))
      html += row('Autocomplete', '<span class="muted">absent : requis seulement si le champ concerne l’utilisateur (11.13)</span>');
  }
  return html + critBlocks(a.crit, CRIT) + checks(a.other);
};

inspector({
  id: ID,
  css: CRIT_CSS,
  pinOnLocate: true,
  list: {
    title: 'Champs et boutons',
    collect,
    css: PILL_CSS,
    filters: [
      { id: 'erreurs', label: 'Non conformes' },
      { id: 'verifier', label: 'À vérifier' },
      { id: 'champs', label: 'Champs' },
      { id: 'boutons', label: 'Boutons' },
      { id: 'groupes', label: 'Groupes' },
    ],
    footer:
      'La pertinence d’une étiquette, d’une légende ou d’un intitulé reste à juger (pastille « ! ») : la ligne reste ✓ si rien d’autre n’est signalé. ' +
      'Le label et la description du champ inspecté sont entourés (11.4).',
  },
  inspect(target) {
    const r = resolveField(target);
    if (!r) return null;
    const a = analyse(r.field);
    const hl = [
      [a.el, 'primary'],
      [r.linked, 'secondary'],
    ];
    if (a.lb) a.lb.els.forEach((el) => hl.push([el, 'secondary']));
    a.labels.forEach((l) => hl.push([l, 'secondary']));
    if (a.d) a.d.els.forEach((el) => hl.push([el, 'secondary']));
    return { html: detail(a), highlight: hl };
  },
});
