/**
 * RGAA 7 – Composants ARIA : vérifie dans le code ce qui est fiable pour la
 * thématique 7 (Scripts). Le comportement (activation au clavier, mise à jour
 * des états, changements de contexte) reste à tester à la main : un
 * composant sans erreur n'est donc jamais « conforme », il est « à tester ».
 *
 * Le panneau liste donne :
 *  - les composants : rôle de composant ARIA, <dialog>, élément qui porte un
 *    état ou une relation ARIA (aria-expanded, aria-controls…), élément non
 *    natif avec un attribut onclick ;
 *  - les zones de messages : role status, alert, log, progressbar, timer,
 *    marquee, <output>, aria-live.
 * Une pastille par critère :
 *  - 7.1 : rôle valide, états obligatoires, valeurs permises, structure
 *    (tab dans tablist…), références d'id, focalisable masqué par
 *    aria-hidden (7.1.1) ; nom accessible et texte visible (7.1.3) ;
 *  - 7.3 : le composant peut-il recevoir le focus (7.3.1) ; blur() au focus
 *    (7.3.2) ;
 *  - 7.5 : validité des zones de messages.
 *
 * Outils : « Rôles » (Maj+R) affiche le rôle et le nom de chaque composant
 * sur la page ; « Annonces » (Maj+A) affiche ce qu'annoncent les zones de
 * messages quand leur contenu change.
 */
import { inspector } from '../lib/floating-panel.js';
import { row, esc, src, icon, list } from '../lib/dom.js';
import { idrefs, textOf, norm, deepAll, isNotExposed, toTopCoords, allDocuments, implicitRole, isOwn } from '../lib/a11y.js';
import { THEME } from '../lib/theme.js';
import { nameOf, visibleText, clean } from '../lib/name.js';

const ID = 'rgaa-7-composants';

/** Constat avec icône ; ∅ se lit « Non concerné ». */
const flag = (type, text) =>
  `<span class="flag flag--${type}">${icon(type, type === 'hidden' ? 'Non concerné' : undefined)}<span>${esc(text)}</span></span>`;

const RANK = { error: 3, warning: 2, ok: 1, hidden: 0 };
const worst = (l) => l.reduce((w, s) => (RANK[s] > RANK[w] ? s : w), 'hidden');
const tagOf = (e) => e.tagName.toLowerCase();
const plural = (n, s, p = `${s}s`) => `${n} ${n > 1 ? p : s}`;
const cut = (t, n = 120) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const set = (s) => new Set(s.split(' '));

/* ---------- Règles ARIA 1.2 (rôles courants) ---------- */

const VALID = set(
  'alert alertdialog application article banner blockquote button caption cell checkbox code columnheader combobox ' +
    'complementary contentinfo definition deletion dialog directory document emphasis feed figure form generic grid ' +
    'gridcell group heading img insertion link list listbox listitem log main mark marquee math menu menubar menuitem ' +
    'menuitemcheckbox menuitemradio meter navigation none note option paragraph presentation progressbar radio ' +
    'radiogroup region row rowgroup rowheader scrollbar search searchbox separator slider spinbutton status strong ' +
    'subscript superscript switch tab table tablist tabpanel term textbox time timer toolbar tooltip tree treegrid treeitem',
);
const ABSTRACT = set('command composite input landmark range roletype section sectionhead select structure widget window');
const validRole = (r) => VALID.has(r) || /^(doc|graphics)-[a-z]+$/.test(r);

/** Rôles listés comme composants (gridcell exclu : trop nombreux, voir RGAA 5). */
const WIDGET = set(
  'button link checkbox switch radio radiogroup tab tablist tabpanel menu menubar menuitem menuitemcheckbox menuitemradio ' +
    'listbox option combobox slider spinbutton scrollbar searchbox textbox tree treeitem treegrid grid dialog alertdialog tooltip toolbar',
);
const MESSAGE = set('status alert log progressbar timer marquee');
/** Rôles qui doivent pouvoir recevoir le focus. */
const FOCUS = set('button link checkbox switch radio slider spinbutton combobox searchbox textbox tab option menuitem menuitemcheckbox menuitemradio treeitem');
/** Éléments d'un composant composé et leur conteneur obligatoire. */
const CONTEXT = {
  tab: ['tablist'],
  option: ['listbox'],
  menuitem: ['menu', 'menubar'],
  menuitemcheckbox: ['menu', 'menubar'],
  menuitemradio: ['menu', 'menubar'],
  treeitem: ['tree'],
};
/** Conteneurs et éléments qu'ils doivent contenir. */
const OWNED = {
  tablist: ['tab'],
  listbox: ['option'],
  menu: ['menuitem', 'menuitemcheckbox', 'menuitemradio'],
  menubar: ['menuitem', 'menuitemcheckbox', 'menuitemradio'],
  tree: ['treeitem'],
  radiogroup: ['radio'],
};
/** Groupes à focus itinérant : un seul élément atteignable avec Tab suffit. */
const ROVING = set('tablist menubar listbox tree treegrid grid radiogroup toolbar');
/** Conteneurs où un élément focalisable par script (tabindex="-1") suffit. */
const ITEM_OF = { tab: 'tablist', option: 'listbox', menuitem: 'menu menubar', menuitemcheckbox: 'menu menubar', menuitemradio: 'menu menubar', treeitem: 'tree', radio: 'radiogroup', button: 'toolbar', checkbox: 'toolbar' };

const REQUIRED = {
  checkbox: ['aria-checked'],
  switch: ['aria-checked'],
  radio: ['aria-checked'],
  menuitemcheckbox: ['aria-checked'],
  menuitemradio: ['aria-checked'],
  combobox: ['aria-expanded'],
  slider: ['aria-valuenow'],
  scrollbar: ['aria-controls', 'aria-valuenow'],
};
/** Attributs d'état permis seulement sur certains rôles. */
const ALLOWED_ON = {
  'aria-pressed': ['button'],
  'aria-checked': ['checkbox', 'menuitemcheckbox', 'menuitemradio', 'option', 'radio', 'switch', 'treeitem'],
  'aria-selected': ['gridcell', 'option', 'row', 'tab', 'columnheader', 'rowheader', 'treeitem'],
};
const BOOL = ['true', 'false'];
const TOKENS = {
  'aria-expanded': [...BOOL, 'undefined'],
  'aria-pressed': [...BOOL, 'mixed', 'undefined'],
  'aria-checked': [...BOOL, 'mixed', 'undefined'],
  'aria-selected': [...BOOL, 'undefined'],
  'aria-hidden': [...BOOL, 'undefined'],
  'aria-disabled': BOOL,
  'aria-modal': BOOL,
  'aria-atomic': BOOL,
  'aria-busy': BOOL,
  'aria-required': BOOL,
  'aria-readonly': BOOL,
  'aria-multiselectable': BOOL,
  'aria-multiline': BOOL,
  'aria-haspopup': [...BOOL, 'menu', 'listbox', 'tree', 'grid', 'dialog'],
  'aria-live': ['off', 'polite', 'assertive'],
  'aria-current': [...BOOL, 'page', 'step', 'location', 'date', 'time'],
  'aria-orientation': ['horizontal', 'vertical', 'undefined'],
  'aria-autocomplete': ['inline', 'list', 'both', 'none'],
  'aria-invalid': [...BOOL, 'grammar', 'spelling'],
  'aria-sort': ['ascending', 'descending', 'none', 'other'],
};
const NUMBERS = ['aria-valuenow', 'aria-valuemin', 'aria-valuemax', 'aria-level', 'aria-posinset', 'aria-setsize'];
const RANGE_DEFAULT = { slider: [0, 100], progressbar: [0, 100], scrollbar: [0, 100] };
const IDREFS = ['aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-owns', 'aria-activedescendant', 'aria-details', 'aria-errormessage', 'aria-flowto'];
const STATES = ['aria-expanded', 'aria-pressed', 'aria-selected', 'aria-checked', 'aria-haspopup', 'aria-controls', 'aria-activedescendant'];
const CLICK = ['onclick', 'onmousedown', 'onmouseup', 'ondblclick'];
const HOVER = ['onmouseover', 'onmouseenter'];

/** Nom obligatoire ; nom calculé depuis le contenu. */
const NAME_REQUIRED = set(
  'button link checkbox switch radio tab menuitem menuitemcheckbox menuitemradio option treeitem combobox slider spinbutton ' +
    'searchbox textbox listbox tree treegrid grid dialog alertdialog radiogroup progressbar',
);
const NAME_FROM_CONTENT = set('button link checkbox switch radio tab menuitem menuitemcheckbox menuitemradio option treeitem tooltip');

/* ---------- Rôle, focus ---------- */

const implicitOf = (el) => {
  const t = tagOf(el);
  if (t === 'dialog') return 'dialog';
  if (t === 'output') return 'status';
  if (t === 'summary' && el.parentElement && tagOf(el.parentElement) === 'details') return 'button';
  const r = implicitRole(el);
  return r === 'presentation' ? null : r;
};

const nativeFocus = (el) => {
  const t = tagOf(el);
  if ((t === 'a' || t === 'area') && el.hasAttribute('href')) return true;
  if (['button', 'select', 'textarea', 'iframe'].includes(t)) return true;
  if (t === 'input') return el.type !== 'hidden';
  if (t === 'summary') return !!el.parentElement && tagOf(el.parentElement) === 'details';
  if ((t === 'audio' || t === 'video') && el.hasAttribute('controls')) return true;
  return !!el.isContentEditable;
};

/** Rôle effectif et problèmes de l'attribut role. */
const roleData = (el) => {
  const raw = (el.getAttribute('role') || '').trim().toLowerCase();
  const tokens = raw ? raw.split(/\s+/) : [];
  const implicit = implicitOf(el);
  const out = { raw, implicit, role: implicit, source: implicit ? `implicite, <${tagOf(el)}>` : '', problems: [] };
  if (!tokens.length) return out;
  const valid = tokens.find(validRole);
  if (!validRole(tokens[0])) {
    const why = ABSTRACT.has(tokens[0]) ? `rôle abstrait « ${tokens[0]} », interdit dans le code` : `rôle « ${tokens[0]} » inconnu`;
    out.problems.push(valid ? ['warning', `${why} : le navigateur utilise « ${valid} »`] : ['error', `${why} : le rôle est ignoré`]);
  }
  if (!valid) return out;
  if ((valid === 'none' || valid === 'presentation') && nativeFocus(el)) {
    out.problems.push(['warning', `role="${valid}" ignoré : l’élément reste focalisable, son rôle natif est gardé`]);
    return out;
  }
  out.role = valid;
  out.source = 'attribut role';
  // Lien transformé en autre chose, ou bouton transformé en lien : comportement clavier différent.
  if ((implicit === 'link' && valid !== 'link' && !['none', 'presentation'].includes(valid)) || (implicit === 'button' && valid === 'link')) {
    out.problems.push(['warning', `Le rôle natif (${implicit}, <${tagOf(el)}>) est remplacé par « ${valid} » : vérifier le comportement attendu`]);
  }
  return out;
};

const focusInfo = (el) => {
  const native = nativeFocus(el);
  const ti = el.getAttribute('tabindex');
  const n = ti === null || !ti.trim() || Number.isNaN(parseInt(ti, 10)) ? null : parseInt(ti, 10);
  const disabled = !!el.disabled || el.getAttribute('aria-disabled') === 'true';
  return { native, n, disabled, prog: native || n !== null, tab: !el.disabled && (n !== null ? n >= 0 : native) };
};

const FOCUSABLE_SEL = 'a[href],area[href],button,input:not([type="hidden"]),select,textarea,summary,iframe,[tabindex],[contenteditable=""],[contenteditable="true"]';

/** Parent, en traversant les Shadow DOM, ou propriétaire aria-owns. */
const parentOf = (el) => {
  if (el.id) {
    const root = el.getRootNode();
    const owner = root.querySelector && root.querySelector(`[aria-owns~="${CSS.escape(el.id)}"]`);
    if (owner) return owner;
  }
  return el.parentElement || (el.getRootNode().host || null);
};

/** Conteneur ARIA le plus proche (en sautant les éléments sans rôle, generic et group). */
const containerOf = (el) => {
  for (let p = parentOf(el), n = 0; p && n < 100; p = parentOf(p), n++) {
    const r = roleData(p).role;
    if (!r || ['generic', 'group', 'none', 'presentation'].includes(r)) continue;
    return { el: p, role: r };
  }
  return null;
};

/** Le conteneur est piloté par un autre élément (combobox) via aria-controls / aria-owns / aria-activedescendant. */
const controlledBy = (el) => {
  if (!el.id) return null;
  const root = el.getRootNode();
  const id = CSS.escape(el.id);
  return (root.querySelector && root.querySelector(`[aria-controls~="${id}"][aria-activedescendant],[role="combobox"][aria-controls~="${id}"],[role="combobox"][aria-owns~="${id}"]`)) || null;
};

const descendantsWithRole = (el, roles) => {
  const out = [...el.querySelectorAll('*')].filter((d) => roles.includes(roleData(d).role));
  idrefs(el, 'aria-owns')?.els.forEach((o) => roles.includes(roleData(o).role) && out.push(o));
  return out;
};

/* ---------- Contrôles ---------- */

const ariaAttrs = (el) => [...el.attributes].filter((a) => a.name.startsWith('aria-'));

/** Valeurs et attributs ARIA (7.1.1, ou 7.5 pour une zone de messages). */
const ariaChecks = (e) => {
  const { el, role } = e;
  const x = [...e.rd.problems];
  ariaAttrs(el).forEach(({ name, value }) => {
    const v = value.trim().toLowerCase();
    if (TOKENS[name] && v && !TOKENS[name].includes(v)) x.push(['error', `${name}="${value}" : valeur invalide (${TOKENS[name].join(', ')})`]);
    if (NUMBERS.includes(name) && v && !Number.isFinite(Number(v))) x.push(['error', `${name}="${value}" : nombre attendu`]);
    if (ALLOWED_ON[name] && !ALLOWED_ON[name].includes(role)) {
      x.push(['error', `${name} n’est pas permis ${role ? `sur le rôle ${role}` : 'sur un élément sans rôle'} : il est ignoré`]);
    }
  });
  if (!role && (el.hasAttribute('aria-expanded') || el.hasAttribute('aria-haspopup'))) {
    x.push(['warning', `${el.hasAttribute('aria-expanded') ? 'aria-expanded' : 'aria-haspopup'} sur un élément sans rôle interactif : souvent ignoré`]);
  }
  // États obligatoires (sauf état fourni par l'élément natif).
  const nativeState = (tagOf(el) === 'input' && ['checkbox', 'radio', 'range'].includes(el.type)) || tagOf(el) === 'select';
  if (e.rd.source === 'attribut role' && !nativeState) {
    (REQUIRED[role] || []).forEach((a) => !el.getAttribute(a) && x.push(['error', `${a} obligatoire pour le rôle ${role}, absent`]));
  }
  // Valeur dans les limites.
  const now = el.getAttribute('aria-valuenow');
  if (now !== null && now.trim() && Number.isFinite(Number(now)) && (RANGE_DEFAULT[role] || el.hasAttribute('aria-valuemin') || el.hasAttribute('aria-valuemax'))) {
    const [dmin, dmax] = RANGE_DEFAULT[role] || [-Infinity, Infinity];
    const min = Number(el.getAttribute('aria-valuemin') ?? dmin);
    const max = Number(el.getAttribute('aria-valuemax') ?? dmax);
    if (Number(now) < min || Number(now) > max) x.push(['error', `aria-valuenow="${now}" hors des limites (${min} à ${max})`]);
  }
  // Références d'id.
  IDREFS.forEach((a) => {
    const r = idrefs(el, a);
    if (!r) return;
    if (r.missing.length) {
      const later = a === 'aria-controls' && el.getAttribute('aria-expanded') !== 'true' && (el.hasAttribute('aria-expanded') || el.hasAttribute('aria-haspopup'));
      x.push(
        later
          ? ['warning', `${a} : id introuvable (${r.missing.join(', ')}), peut-être créé à l’ouverture : vérifier une fois ouvert`]
          : ['error', `${a} : id introuvable (${r.missing.join(', ')})`],
      );
    }
    r.els.forEach((t) => {
      const root = t.getRootNode();
      if (root.querySelectorAll && root.querySelectorAll(`[id="${CSS.escape(t.id)}"]`).length > 1) x.push(['error', `${a} : l’id « ${t.id} » est en double dans la page`]);
    });
  });
  return x;
};

/** Structure des composants composés (7.1.1). */
const structureChecks = (e) => {
  const { el, role } = e;
  const x = [];
  if (CONTEXT[role] && e.rd.source === 'attribut role') {
    const c = containerOf(el);
    if (!c || !CONTEXT[role].includes(c.role)) {
      x.push(['error', `role="${role}" doit être dans un ${CONTEXT[role].join(' ou un ')}${c ? ` (trouvé : ${c.role})` : ''}`]);
    }
  }
  if (OWNED[role] && !isNotExposed(el) && el.getAttribute('aria-busy') !== 'true') {
    const items = descendantsWithRole(el, OWNED[role]);
    e.items = items;
    if (!items.length) x.push(['error', `role="${role}" ne contient aucun élément ${OWNED[role].join(' / ')}`]);
    if (role === 'tablist' && items.length && !items.some((t) => t.getAttribute('aria-selected') === 'true')) {
      x.push(['warning', 'Aucun onglet n’a aria-selected="true" : l’onglet actif n’est pas restitué']);
    }
  }
  return x;
};

/** Nom accessible et texte visible (7.1.3). */
const nameChecks = (e) => {
  const { role } = e;
  const x = [];
  if (!role || !WIDGET.has(role)) return x;
  const n = e.n;
  if (!e.name) {
    if (NAME_REQUIRED.has(role)) x.push(['error', `Composant ${role} sans nom accessible`]);
    else if (role === 'tabpanel') x.push(['warning', 'Panneau d’onglet sans nom (recommandé : aria-labelledby vers son onglet)']);
    if (n.lb && n.lb.missing.length) x.push(['error', `aria-labelledby : id introuvable (${n.lb.missing.join(', ')})`]);
    return x;
  }
  if (n.s === 'title') x.push(['warning', 'Nom donné par le seul attribut title : restitution inégale selon les aides techniques']);
  if (NAME_FROM_CONTENT.has(role) && ['aria-labelledby', 'aria-label', 'title'].includes(n.s)) {
    const vt = visibleText(e.el);
    if (vt && norm(vt)) {
      if (!norm(e.name).includes(norm(vt))) x.push(['error', `Le nom accessible ne contient pas le texte visible « ${cut(vt, 60)} »`]);
      else x.push(['ok', 'Le texte visible est repris dans le nom accessible']);
    }
  }
  return x;
};

/** Focus (7.3.1) et suppression du focus (7.3.2). */
const focusChecks = (e) => {
  const { el, role, f } = e;
  const x = [];
  const clickable = CLICK.some((a) => el.hasAttribute(a));
  if (/\bblur\s*\(/.test(`${el.getAttribute('onfocus') || ''} ${el.getAttribute('onfocusin') || ''}`)) x.push(['error', 'Le focus est retiré dès qu’il arrive (blur() dans onfocus, test 7.3.2)']);
  if (HOVER.some((a) => el.hasAttribute(a)) && !['onfocus', 'onfocusin'].some((a) => el.hasAttribute(a)) && !f.native) {
    x.push(['warning', 'Réagit au survol de la souris (onmouseover) sans équivalent au focus']);
  }
  if (f.disabled && (role && FOCUS.has(role))) {
    x.push(['hidden', 'Composant désactivé : focus non exigé']);
    return x;
  }
  // Groupe à focus itinérant : atteignable avec Tab ?
  if (ROVING.has(role) && !controlledBy(el)) {
    const items = el.matches('[aria-activedescendant]') ? [] : [...el.querySelectorAll(FOCUSABLE_SEL)];
    if (!f.tab && !items.some((i) => focusInfo(i).tab)) x.push(['error', `Aucun élément du groupe ${role} n’est atteignable avec Tab`]);
    else x.push(['ok', `Groupe ${role} atteignable avec Tab`]);
  }
  if (role && FOCUS.has(role)) {
    const c = ITEM_OF[role] ? containerOf(el) : null;
    const inGroup = c && ITEM_OF[role].split(' ').includes(c.role);
    if (inGroup && (c.el.hasAttribute('aria-activedescendant') || controlledBy(c.el))) {
      x.push(['ok', `Focus géré par aria-activedescendant (${c.el.hasAttribute('aria-activedescendant') ? c.role : 'combobox'})`]);
    } else if (f.native) {
      if (f.n !== null && f.n < 0 && !inGroup) x.push(['warning', 'tabindex="-1" : retiré de l’ordre de tabulation, à justifier']);
    } else if (f.n === null) {
      x.push(['error', `role="${role}" sans tabindex : ne peut pas recevoir le focus`]);
    } else if (f.n < 0 && !inGroup) {
      x.push(['error', 'tabindex="-1" : pas atteignable avec Tab']);
    } else if (f.n < 0) {
      x.push(['ok', `tabindex="-1" dans un ${c.role} : focus itinérant (focus déplacé par script)`]);
    }
  } else if (clickable && !f.prog && !el.querySelector(FOCUSABLE_SEL)) {
    x.push(['error', `Cliquable (${CLICK.filter((a) => el.hasAttribute(a)).join(', ')}) mais ne peut pas recevoir le focus : souris seulement`]);
  }
  return x;
};

/** Zone de messages (7.5). */
const LIVE_OF = { alert: 'assertive', status: 'polite', log: 'polite', timer: 'off', marquee: 'off', progressbar: '' };
const politeness = (el, role) => {
  const a = (el.getAttribute('aria-live') || '').trim().toLowerCase();
  if (TOKENS['aria-live'].includes(a)) return a;
  return LIVE_OF[role] || '';
};
const TEST_OF = {
  status: '7.5.1 (succès, résultat d’une action, état) ou 7.5.3 (progression)',
  alert: '7.5.2 (erreur, avertissement)',
  log: '7.5.3 (progression)',
  progressbar: '7.5.3 (progression)',
};

const messageChecks = (e) => {
  const { el, role } = e;
  const x = [];
  const live = (el.getAttribute('aria-live') || '').trim().toLowerCase();
  if (live === 'off') x.push(['warning', 'aria-live="off" : les changements ne sont pas annoncés']);
  if (live && LIVE_OF[role] && TOKENS['aria-live'].includes(live) && live !== LIVE_OF[role]) {
    x.push(['warning', `aria-live="${live}" remplace le comportement du rôle ${role} (${LIVE_OF[role]})`]);
  }
  const big = ['body', 'main', 'html'].includes(tagOf(el)) || role === 'main' || el.querySelectorAll('*').length > 50;
  if (big && politeness(el, role) && politeness(el, role) !== 'off') x.push(['warning', 'Zone trop large : tout changement dans cette zone sera lu']);
  const atomic = el.getAttribute('aria-atomic');
  const test = TEST_OF[role] || (live === 'assertive' ? TEST_OF.alert : TEST_OF.status);
  if (!role && live === 'polite' && atomic !== 'true') x.push(['warning', 'aria-live="polite" sans aria-atomic="true" : seul role="status" (ou son équivalent avec aria-atomic) est attendu par le RGAA']);
  if (!role && live === 'assertive' && atomic !== 'true') x.push(['warning', 'aria-live="assertive" sans aria-atomic="true" : seul role="alert" (ou son équivalent avec aria-atomic) est attendu par le RGAA']);
  if (role === 'timer' || role === 'marquee') x.push(['warning', `role="${role}" : pas annoncé par défaut, pas un message de statut au sens du RGAA`]);
  return { x, test };
};

/* ---------- Inventaire ---------- */

let entries = [];
let byEl = new Map();

const SEL = ['[role]', 'dialog', 'output', '[aria-live]', '[onfocus]', ...STATES.map((a) => `[${a}]`), ...CLICK.map((a) => `[${a}]`), ...HOVER.map((a) => `[${a}]`)].join(',');

/** Type d'entrée : 'composant', 'message', ou null (non listé). */
const kindOf = (el, rd) => {
  if (['html', 'body', 'label'].includes(tagOf(el))) return null;
  if (MESSAGE.has(rd.role) || el.hasAttribute('aria-live')) return 'message';
  if (rd.problems.length) return 'composant';
  if (rd.role && WIDGET.has(rd.role) && (rd.source === 'attribut role' || tagOf(el) === 'dialog')) return 'composant';
  if (STATES.some((a) => el.hasAttribute(a))) return 'composant';
  if (/\bblur\s*\(/.test(el.getAttribute('onfocus') || '')) return 'composant';
  const handler = [...CLICK, ...HOVER].some((a) => el.hasAttribute(a));
  if (handler && !nativeFocus(el) && !(rd.role && WIDGET.has(rd.role)) && !el.querySelector(FOCUSABLE_SEL)) return 'composant';
  return null;
};

const analyse = (el, idx) => {
  const rd = roleData(el);
  const kind = kindOf(el, rd);
  if (!kind) return null;
  const e = { el, idx, rd, role: rd.role, kind, f: focusInfo(el) };
  e.n = nameOf(el, { fromContent: NAME_FROM_CONTENT.has(rd.role) || !rd.role });
  e.name = rd.role && WIDGET.has(rd.role) ? e.n.name : '';
  e.hidden = isNotExposed(el);
  // Focalisable et visible, mais masqué par aria-hidden.
  e.trap = e.hidden === 'aria-hidden' && el.getClientRects().length > 0 && (e.f.tab || !!el.querySelector(FOCUSABLE_SEL));
  e.crit = {};
  if (e.hidden && !e.trap) {
    e.status = 'hidden';
    return e;
  }
  if (kind === 'message') {
    const m = messageChecks(e);
    const aria = ariaChecks(e);
    e.test = m.test;
    e.crit['7.5'] = { status: worst(['warning', ...m.x.map((a) => a[0]), ...aria.map((a) => a[0])]), text: `Zone de messages : type à juger, ${m.test}`, extra: [...aria, ...m.x] };
  } else {
    const a1 = [...ariaChecks(e), ...structureChecks(e)];
    if (e.trap) a1.unshift(['error', 'Focalisable mais masqué par aria-hidden="true" : atteint au clavier sans être restitué']);
    const a3 = nameChecks(e);
    const f = focusChecks(e);
    const bare = !rd.role && CLICK.some((a) => el.hasAttribute(a));
    if (bare) a1.push(['error', 'Élément cliquable (onclick) sans rôle : sa fonction n’est pas restituée']);
    e.crit['7.1.1'] = { status: worst(['warning', ...a1.map((a) => a[0])]), text: 'Code ARIA : vérifier les changements d’état en utilisant le composant', extra: a1 };
    if (rd.role && WIDGET.has(rd.role)) {
      e.crit['7.1.3'] = { status: worst(['warning', ...a3.map((a) => a[0])]), text: 'Nom et rôle à juger', quote: e.name, s: e.n.s, extra: a3 };
    }
    const needsFocus = (rd.role && (FOCUS.has(rd.role) || ROVING.has(rd.role))) || CLICK.some((a) => el.hasAttribute(a)) || f.length;
    if (needsFocus) {
      const real = f.filter((a) => a[0] !== 'hidden');
      e.crit['7.3'] = {
        status: f.some((a) => a[0] === 'hidden') && !real.length ? 'hidden' : worst(['warning', ...real.map((a) => a[0])]),
        text: f.some((a) => a[0] === 'hidden') && !real.length ? 'Désactivé' : 'Activation au clavier (Entrée, Espace, flèches) à tester',
        extra: f,
        na: f.some((a) => a[0] === 'hidden') && !real.length,
      };
    }
  }
  e.status = worst(Object.values(e.crit).filter((c) => !c.na).map((c) => c.status));
  return e;
};

const PILLS = [
  ['7.1', ['7.1.1', '7.1.3']],
  ['7.3', ['7.3']],
  ['7.5', ['7.5']],
];
const PILL_LABEL = { error: 'erreur', warning: 'à vérifier', ok: 'conforme', hidden: 'non concerné' };
const GLYPH = { error: '×', warning: '!', ok: '✓', hidden: '∅' };

function pills(e) {
  if (e.status === 'hidden') return '';
  return `<span class="pills">${PILLS.map(([k, keys]) => {
    const l = keys.map((x) => e.crit[x]).filter((c) => c && !c.na);
    if (!l.length) return '';
    const s = worst(l.map((c) => c.status));
    return `<span class="pill pill--${s}"><span aria-hidden="true">${k} ${GLYPH[s]}</span><span class="sr-only">${k} ${PILL_LABEL[s]},</span></span>`;
  }).join('')}</span>`;
}

const labelOf = (e) => {
  const r = e.role || `<${tagOf(e.el)}>`;
  if (e.kind === 'message') {
    const live = e.el.getAttribute('aria-live');
    const t = clean(textOf(e.el));
    return `${e.role ? r : `aria-live="${live}"`} : ${t ? cut(t, 40) : '(vide)'}`;
  }
  return `${r} « ${e.name || (e.role && WIDGET.has(e.role) ? 'sans nom' : cut(clean(textOf(e.el)), 30) || '…')} »`;
};

const collect = () => {
  const found = [...new Set(deepAll(SEL))].filter((el) => !isOwn(el));
  entries = found.map(analyse).filter(Boolean);
  byEl = new Map(entries.map((e) => [e.el, e]));
  const shown = entries.filter((e) => e.status !== 'hidden');
  const comps = shown.filter((e) => e.kind === 'composant');
  const msgs = shown.filter((e) => e.kind === 'message');
  const err = shown.filter((e) => e.status === 'error').length;
  const toTest = comps.filter((e) => e.status === 'warning').length;
  const hidden = entries.length - shown.length;
  const sorted = [...entries].sort((a, b) => RANK[b.status] - RANK[a.status] || a.idx - b.idx);
  return {
    items: sorted.map((e) => ({
      el: e.el,
      status: e.status,
      label: e.status === 'hidden' ? `${labelOf(e)} (masqué : ${e.hidden})` : labelOf(e),
      meta: e.status === 'hidden' ? 'non concerné' : e.rd.raw ? `role="${e.rd.raw}"` : `<${tagOf(e.el)}>`,
      prefix: pills(e),
      filter: e.status === 'hidden' ? [] : [e.kind],
    })),
    summary:
      `${plural(comps.length, 'composant')} · ${err ? icon('error') + ' ' : ''}${err} en erreur · ` +
      `${toTest ? icon('warning') + ' ' : ''}${toTest} à tester à la main · ${plural(msgs.length, 'zone')} de messages` +
      (hidden ? ` · ${hidden} masqué${hidden > 1 ? 's' : ''}` : ''),
  };
};

/** Entrée qui contient l'élément survolé (iframes et Shadow DOM compris). */
const findEntry = (target) => {
  for (let el = target; el; ) {
    const e = byEl.get(el);
    if (e) return e;
    if (el.parentElement) el = el.parentElement;
    else if (el.getRootNode && el.getRootNode().host) el = el.getRootNode().host;
    else el = null;
  }
  return null;
};

/* ---------- Détail ---------- */

const critBlock = (num, r) =>
  `<div class="crit"><span class="crit-num">${num}</span><div class="crit-body">${flag(r.status, r.text)}` +
  `${r.quote ? `<div class="quote">« ${esc(cut(r.quote, 200))} » ${src(r.s)}</div>` : ''}` +
  `${(r.extra || []).map(([t, txt]) => `<div>${flag(t, txt)}</div>`).join('')}</div></div>`;

const focusText = (f) => {
  if (f.native) return f.n !== null && f.n < 0 ? 'natif, retiré de la tabulation (tabindex="-1")' : `natif${f.n !== null ? ` (tabindex="${f.n}")` : ''}`;
  if (f.n === null) return 'non focalisable';
  return f.n < 0 ? 'par script seulement (tabindex="-1")' : `oui (tabindex="${f.n}")`;
};

const detail = (e) => {
  const el = e.el;
  const refs = [];
  let html = row('Élément', `&lt;${esc(tagOf(el))}&gt;${e.rd.raw ? ` ${src(`role="${e.rd.raw}"`)}` : ''}`);
  html += row('Rôle', e.role ? `${esc(e.role)} ${src(e.rd.source)}` : '<span class="muted">aucun</span>');
  if (e.kind === 'composant' && e.role && WIDGET.has(e.role)) {
    html += row('Nom', e.name ? `${esc(cut(e.name, 200))} ${src(e.n.s)}` : `${icon('error', 'Absent')} <span class="text-error">aucun</span>`);
  }
  const attrs = ariaAttrs(el).filter((a) => !['aria-label'].includes(a.name));
  if (attrs.length) html += row('ARIA', list(attrs.map((a) => `<code>${esc(a.name)}="${esc(cut(a.value, 60))}"</code>`)));
  IDREFS.forEach((a) => {
    const r = idrefs(el, a);
    if (!r) return;
    r.els.forEach((t) => refs.push(t));
    html += row(
      a,
      list([
        ...r.els.map((t) => `#${esc(t.id)} → &lt;${esc(tagOf(t))}&gt;${t.getAttribute('role') ? ` ${src(`role="${t.getAttribute('role')}"`)}` : ''}`),
        ...r.missing.map((m) => `#${esc(m)} ${icon('error', 'Introuvable')} <span class="text-error">introuvable</span>`),
      ]),
    );
  });
  if (e.kind === 'message') {
    const p = politeness(el, e.role);
    html += row('Annonce', p === 'assertive' ? 'immédiate (assertive)' : p === 'polite' ? 'polie (polite)' : p === 'off' ? 'aucune (off)' : '<span class="muted">aucune</span>');
    html += row('Contenu', clean(textOf(el)) ? esc(cut(clean(textOf(el)), 200)) : '<span class="muted">vide (attend son message)</span>');
  } else {
    html += row('Focus', esc(focusText(e.f)) + (e.f.disabled ? ' <span class="muted">· désactivé</span>' : ''));
  }
  const handlers = [...CLICK, ...HOVER, 'onfocus', 'onkeydown', 'onkeyup', 'onkeypress'].filter((a) => el.hasAttribute(a));
  if (handlers.length) html += row('Gestionnaires', handlers.map((h) => `<code>${esc(h)}</code>`).join(' '));
  if (e.status === 'hidden') {
    html += `<p class="note">${flag('hidden', `Masqué (${e.hidden}) : non concerné`)}</p>`;
    return { html, refs };
  }
  html += '<div class="crits">';
  ['7.1.1', '7.1.3', '7.3', '7.5'].forEach((k) => e.crit[k] && (html += critBlock(k, e.crit[k])));
  html += '</div>';
  return { html, refs };
};

/* ---------- Surcouches : étiquettes de rôle et bande d'annonces ---------- */

const OVERLAY_CSS = `
:host{all:initial}
.tag{position:fixed;z-index:${Number(THEME.zIndex) - 1};pointer-events:none;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
font:700 10px/1.3 ${THEME.font};color:#fff;background:${THEME.color.focus};padding:1px 4px;border-radius:2px;opacity:.92}
.tag--error{background:${THEME.color.error}}
.band{position:fixed;left:8px;bottom:8px;z-index:${Number(THEME.zIndex) - 1};width:min(560px,calc(100vw - 16px));
font:${THEME.fontSize}/1.4 ${THEME.font};color:${THEME.color.text};background:#fff;border:2px solid ${THEME.color.border};border-radius:4px;
box-shadow:0 2px 8px rgba(0,0,0,.3);padding:6px 8px;pointer-events:none}
.band strong{display:block;margin-bottom:2px}
.band ol{margin:0;padding:0;list-style:none}
.band li{padding:2px 0;border-top:1px solid ${THEME.color.separator}}
.band .kind{font-weight:700;margin-right:4px}
.band .assertive{color:${THEME.color.error}}
.band .muted{color:${THEME.color.muted};font-style:italic}
`;

const makeHost = (name) => {
  const h = document.createElement('div');
  h.id = `${ID}-${name}`;
  h.setAttribute('data-rgaa-bookmarklet', '');
  const root = h.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${OVERLAY_CSS}</style>`;
  (document.body || document.documentElement).appendChild(h);
  return { h, root };
};

let rolesHost = null;
let rolesItems = [];

const placeRoles = () => {
  rolesItems.forEach(({ el, tag }) => {
    const r = el.getBoundingClientRect();
    const [x, y] = toTopCoords(el.ownerDocument.defaultView, r.left, r.top);
    tag.hidden = !el.isConnected || r.width === 0;
    tag.style.left = `${Math.max(0, x)}px`;
    tag.style.top = `${Math.max(0, y - 14)}px`;
  });
};

const STATE_SHORT = ['aria-expanded', 'aria-selected', 'aria-checked', 'aria-pressed'];
const setRoles = (on) => {
  if (rolesHost) {
    rolesHost.remove();
    rolesHost = null;
    rolesItems = [];
    allDocuments().forEach((d) => d.removeEventListener('scroll', placeRoles, true));
    window.removeEventListener('resize', placeRoles);
  }
  if (!on) return;
  const { h, root } = makeHost('roles');
  rolesHost = h;
  entries
    .filter((e) => e.status !== 'hidden' && e.kind === 'composant')
    .slice(0, 2000)
    .forEach((e) => {
      const tag = document.createElement('span');
      tag.className = `tag${e.status === 'error' ? ' tag--error' : ''}`;
      const states = STATE_SHORT.filter((a) => e.el.hasAttribute(a)).map((a) => `${a.slice(5)}=${e.el.getAttribute(a)}`);
      tag.textContent = `${e.role || (e.rd.raw ? `role="${e.rd.raw}"` : `<${tagOf(e.el)}>`)}${e.role && WIDGET.has(e.role) ? ` « ${e.name ? cut(e.name, 40) : '∅ sans nom'} »` : ''}${states.length ? ` ${states.join(' ')}` : ''}`;
      root.appendChild(tag);
      rolesItems.push({ el: e.el, tag });
    });
  placeRoles();
  allDocuments().forEach((d) => d.addEventListener('scroll', placeRoles, true));
  window.addEventListener('resize', placeRoles);
};

/* Bande d'annonces : surveille seulement les zones de messages déclarées. */
const LIVE_ROLES = ['status', 'alert', 'log'];
const liveOf = (el) => {
  const live = (el.getAttribute('aria-live') || '').trim().toLowerCase();
  if (TOKENS['aria-live'].includes(live)) return live;
  const r = roleData(el).role;
  return LIVE_ROLES.includes(r) ? LIVE_OF[r] : '';
};
/** Zone de messages qui contient le nœud, avec sa politesse ; null si aucune. */
const regionOf = (node) => {
  for (let el = node.nodeType === 1 ? node : node.parentElement; el; el = el.parentElement || (el.getRootNode().host || null)) {
    const p = liveOf(el);
    if (p) return p === 'off' ? null : { el, p };
  }
  return null;
};

let band = null;
let observers = [];
let pending = new Map();
let flushTimer;
let log = [];

const drawBand = () => {
  if (!band) return;
  band.ol.innerHTML = log.length
    ? log
        .slice(-6)
        .map(
          (m) =>
            `<li><span class="kind${m.p === 'assertive' ? ' assertive' : ''}">[${m.p === 'assertive' ? 'immédiat' : 'poli'}]</span>${esc(cut(m.text, 160))}` +
            ` <span class="muted">${esc(m.from)}${m.note ? ` · ${esc(m.note)}` : ''}</span></li>`,
        )
        .join('')
    : '<li class="muted">En attente : déclenchez une action qui affiche un message.</li>';
};

const flush = () => {
  pending.forEach((v, region) => {
    const atomic = region.getAttribute('aria-atomic') === 'true' || (!region.hasAttribute('aria-atomic') && ['status', 'alert'].includes(roleData(region).role));
    const text = clean(atomic ? textOf(region) : v.added.join(' '));
    if (!text) return;
    const r = roleData(region).role;
    log.push({ p: v.p, text, from: r ? `role="${r}"` : `aria-live="${region.getAttribute('aria-live')}"`, note: v.created ? 'zone créée avec son message : souvent non annoncée' : '' });
  });
  pending = new Map();
  drawBand();
};

const onMutations = (muts) => {
  muts.forEach((m) => {
    if (isOwn(m.target.nodeType === 1 ? m.target : m.target.parentElement)) return;
    const reg = regionOf(m.target);
    if (reg) {
      const v = pending.get(reg.el) || { p: reg.p, added: [] };
      if (m.type === 'characterData') v.added.push(m.target.textContent);
      m.addedNodes.forEach((n) => v.added.push(n.nodeType === 1 ? textOf(n) : n.textContent));
      pending.set(reg.el, v);
      return;
    }
    // Zone de messages ajoutée à la page avec son texte.
    m.addedNodes.forEach((n) => {
      if (n.nodeType !== 1 || isOwn(n)) return;
      const zones = [n, ...n.querySelectorAll('[aria-live],[role],output')].filter((z) => liveOf(z) && liveOf(z) !== 'off');
      zones.forEach((z) => {
        if (!clean(textOf(z))) return;
        pending.set(z, { p: liveOf(z), added: [textOf(z)], created: roleData(z).role !== 'alert' });
      });
    });
  });
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 150);
};

const setBand = (on) => {
  if (band) {
    observers.forEach((o) => o.disconnect());
    observers = [];
    clearTimeout(flushTimer);
    pending = new Map();
    band.h.remove();
    band = null;
  }
  if (!on) return;
  const { h, root } = makeHost('annonces');
  const box = document.createElement('div');
  box.className = 'band';
  box.innerHTML = '<strong>Annonces des zones de messages</strong><ol></ol>';
  root.appendChild(box);
  band = { h, ol: box.querySelector('ol') };
  const roots = [...allDocuments(), ...deepAll('*').filter((el) => el.shadowRoot && !isOwn(el)).map((el) => el.shadowRoot)];
  roots.forEach((r) => {
    const o = new MutationObserver(onMutations);
    o.observe(r, { childList: true, subtree: true, characterData: true });
    observers.push(o);
  });
  drawBand();
};

/* ---------- Lancement ---------- */

const DETAIL_CSS = `
.crits{margin-top:8px;border-top:1px solid var(--rgaa-sep)}
.crit{display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--rgaa-sep)}
.crit-num{flex:0 0 3.2em;font-weight:700}
.crit-body{min-width:0;display:flex;flex-direction:column;gap:3px}
.quote{font-style:italic}
.note{margin:8px 0 0}
code{font-size:var(--rgaa-fs-sm)}
`;
const LIST_CSS = `
.item > span:last-child{display:flex;flex-direction:column;gap:2px}
.pills{order:2;display:flex;flex-wrap:wrap;gap:3px;margin-top:2px}
.pill{font-size:var(--rgaa-fs-sm);border:1px solid currentColor;border-radius:3px;padding:0 3px;white-space:nowrap}
.pill--error{color:var(--rgaa-error)}
.pill--warning{color:var(--rgaa-warning)}
.pill--ok{color:var(--rgaa-ok)}
.pill--hidden{color:var(--rgaa-muted)}
`;

const keyOk = (e) => {
  const tag = e.target && e.target.tagName;
  return e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !e.target.isContentEditable;
};
const toggleRoles = () => setRoles(!rolesHost);
const toggleBand = () => setBand(!band);

const ui = inspector({
  id: ID,
  css: DETAIL_CSS,
  maxWidth: 500,
  pinOnLocate: true,
  list: {
    title: 'Composants ARIA',
    collect,
    filters: [
      { id: 'composant', label: 'Composants' },
      { id: 'message', label: 'Messages' },
    ],
    tools: [
      { label: 'Rôles', pressed: () => !!rolesHost, toggle: toggleRoles },
      { label: 'Annonces', pressed: () => !!band, toggle: toggleBand },
    ],
    footer:
      'Vérifie le code, pas le comportement : activation au clavier, mise à jour des états, 7.2 et 7.4 se testent à la main. ' +
      'Les éléments rendus cliquables par addEventListener (sans rôle ni onclick) ne sont pas détectés. ' +
      'Rôles (Maj+R) : rôle et nom de chaque composant sur la page. Annonces (Maj+A) : ce qu’annoncent les zones de messages.',
  },
  onKey(e) {
    if (!keyOk(e)) return false;
    const k = e.key.toLowerCase();
    if (k === 'r') toggleRoles();
    else if (k === 'a') toggleBand();
    else return false;
    return true;
  },
  onStop: () => {
    setRoles(false);
    setBand(false);
  },
  inspect(target) {
    const e = findEntry(target);
    if (!e) return null;
    const d = detail(e);
    return { html: d.html, highlight: [[e.el, 'primary'], ...d.refs.map((r) => [r, 'secondary'])] };
  },
});

// Pastilles de la liste : ajoutées au Shadow DOM du panneau liste.
const listHost = document.getElementById(`${ID}-liste`);
if (ui && listHost && listHost.shadowRoot) {
  const st = document.createElement('style');
  st.textContent = LIST_CSS;
  listHost.shadowRoot.appendChild(st);
}
