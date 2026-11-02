/**
 * RGAA 2 – Cadres : liste les iframes et frames de la page (iframes de même
 * origine et Shadow DOM ouverts compris), une pastille par critère :
 *  - 2.1 titre présent : title absent ou vide (×) ;
 *  - 2.2 pertinence du titre : toujours à juger (!), constats si titre
 *    générique ou identique à un autre cadre.
 * Cadre masqué ou en aria-hidden : non concerné (∅).
 * Détail au survol (cadre de même origine) ou épinglé au clic sur une ligne :
 * titre, domaine, src, aria-label (non pris en compte par le RGAA), imbrication.
 */
import { inspector } from '../lib/floating-panel.js';
import { row, esc, src, flag, icon } from '../lib/dom.js';
import { isNotExposed, deepAll, norm, isOwn } from '../lib/a11y.js';
import { pills, critBlocks, lineStatus, fromChecks, CRIT_CSS, PILL_CSS } from '../lib/criteria.js';

const ID = 'rgaa-2-cadres';
const CRIT = ['2.1', '2.2'];
const GENERIC = ['iframe', 'frame', 'cadre', 'sans titre', 'untitled', 'title', 'titre', 'contenu', 'content', 'embed', 'widget'];

const plural = (n, s, p = `${s}s`) => `${n} ${n > 1 ? p : s}`;
const cut = (t, n = 120) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** Domaine du src, ou description du contenu inline. */
const origin = (f) => {
  const s = f.getAttribute('src');
  if (!s) return f.hasAttribute('srcdoc') ? 'contenu srcdoc' : 'sans src';
  if (/^(about|javascript):/i.test(s)) return s.split(/[?#]/)[0];
  try {
    return new URL(s, f.ownerDocument.baseURI).host || s;
  } catch (e) {
    return s;
  }
};

/** Profondeur d'imbrication (cadre dans un cadre de même origine). */
const depth = (f) => {
  let d = 0;
  for (let w = f.ownerDocument.defaultView; w && w !== window; w = w.parent) d++;
  return d;
};

let entries = [];
let byEl = new Map();

const collect = () => {
  const frames = deepAll('iframe,frame').filter((f) => !isOwn(f));
  entries = frames.map((f, i) => {
    const title = (f.getAttribute('title') || '').trim();
    return {
      el: f,
      n: i + 1,
      kind: f.tagName === 'FRAME' ? 'Frame' : 'Iframe',
      title,
      hidden: isNotExposed(f),
      host: origin(f),
      src: f.getAttribute('src') || '',
      depth: depth(f),
      aria: (f.getAttribute('aria-label') || '').trim(),
      labelledby: f.hasAttribute('aria-labelledby'),
    };
  });
  // Titres identiques entre cadres restitués (2.2).
  const count = {};
  entries.forEach((d) => {
    if (d.title && !d.hidden) count[norm(d.title)] = (count[norm(d.title)] || 0) + 1;
  });
  entries.forEach((d) => {
    d.crit = {};
    if (d.hidden) {
      d.status = 'hidden';
      return;
    }
    d.crit['2.1'] = fromChecks(d.title ? [] : [['error', 'Attribut title absent ou vide']], { ok: 'Titre présent (title)' });
    if (d.title) {
      const x = [];
      if (GENERIC.includes(norm(d.title))) x.push(['warning', `Titre générique (« ${d.title} »)`]);
      if (count[norm(d.title)] > 1) x.push(['warning', `Titre identique à ${plural(count[norm(d.title)] - 1, 'autre cadre')}`]);
      d.crit['2.2'] = fromChecks(x, { judge: 'Pertinence du titre à juger' });
    }
    d.status = lineStatus(d.crit);
  });
  byEl = new Map(entries.map((d) => [d.el, d]));

  const concerned = entries.filter((d) => !d.hidden);
  const err = concerned.filter((d) => d.status === 'error').length;
  const warn = concerned.filter((d) => d.status === 'warning').length;
  const hidden = entries.length - concerned.length;
  return {
    items: entries.map((d) => ({
      el: d.el,
      status: d.status,
      indent: d.depth,
      label: `${d.kind} ${d.n} : ${d.title || 'sans titre'}`,
      meta: [d.host, d.hidden ? `masqué : ${d.hidden}` : '', d.depth ? `imbriqué niveau ${d.depth}` : ''].filter(Boolean).join(' · '),
      prefix: d.hidden ? '' : pills(d.crit, CRIT),
      filter: [...(d.status === 'error' ? ['erreurs'] : []), ...(['error', 'warning'].includes(d.status) ? ['verifier'] : [])],
    })),
    summary:
      `${plural(concerned.length, 'cadre restitué', 'cadres restitués')} · ${err ? icon('error') + ' ' : ''}${err} non conforme${err > 1 ? 's' : ''} · ` +
      `${warn ? icon('warning') + ' ' : ''}${warn} à vérifier` +
      (hidden ? ` · ${plural(hidden, 'non concerné')}` : ''),
  };
};

/** Cadre concerné par l'élément survolé (le cadre lui-même, ou son contenu de même origine). */
const findEntry = (target) => {
  for (let el = target; el; ) {
    const d = byEl.get(el);
    if (d) return d;
    if (el.parentElement) el = el.parentElement;
    else if (el.getRootNode && el.getRootNode().host) el = el.getRootNode().host;
    else el = (el.ownerDocument && el.ownerDocument.defaultView && el.ownerDocument.defaultView.frameElement) || null;
  }
  return null;
};

const detail = (d) => {
  let html = row('Élément', `${esc(d.kind)} ${d.n}`);
  const none = d.hidden ? '<span class="muted">aucun</span>' : `${icon('error', 'Absent')} <span class="text-error">aucun</span>`;
  html += row('Titre', d.title ? `${esc(cut(d.title, 200))} ${src('title')}` : none);
  if (d.aria) html += row('aria-label', `${esc(cut(d.aria))} <span class="muted small">(non pris en compte par le RGAA)</span>`);
  if (d.labelledby) html += row('aria-labelledby', '<span class="muted small">présent (non pris en compte par le RGAA)</span>');
  html += row('Domaine', esc(d.host));
  if (d.src) html += row('src', `<span class="muted">${esc(cut(d.src, 150))}</span>`);
  if (d.depth) html += row('Imbrication', `niveau ${d.depth}`);
  if (d.hidden) return html + `<p class="note">${flag('hidden', `Masqué (${d.hidden}) : non restitué, non concerné`)}</p>`;
  return html + critBlocks(d.crit, CRIT);
};

/* Un cadre masqué est affiché un instant quand on clique sa ligne. */
let restore = null;
let restoreTimer;
const reveal = (f) => {
  clearTimeout(restoreTimer);
  if (restore) restore();
  const why = isNotExposed(f);
  if (!why || why === 'aria-hidden') return;
  const css = f.style.cssText;
  f.style.setProperty('display', 'block', 'important');
  f.style.setProperty('visibility', 'visible', 'important');
  f.style.setProperty('min-width', '100px', 'important');
  f.style.setProperty('min-height', '50px', 'important');
  restore = () => {
    f.style.cssText = css;
    restore = null;
  };
  restoreTimer = setTimeout(() => restore && restore(), 3000);
};

inspector({
  id: ID,
  css: CRIT_CSS,
  pinOnLocate: true,
  list: {
    title: 'Cadres',
    collect,
    css: PILL_CSS,
    beforeLocate: reveal,
    filters: [
      { id: 'erreurs', label: 'Non conformes' },
      { id: 'verifier', label: 'À vérifier' },
    ],
    footer:
      'Seul l’attribut title compte pour le RGAA (aria-label est signalé mais ignoré). La pertinence du titre reste à juger (pastille 2.2 « ! »). ' +
      'Un cadre masqué est affiché un instant au clic sur sa ligne.',
  },
  onStop: () => {
    clearTimeout(restoreTimer);
    if (restore) restore();
  },
  inspect(target) {
    const d = findEntry(target);
    if (!d) return null;
    return { html: detail(d), highlight: [[d.el, 'primary']] };
  },
});
