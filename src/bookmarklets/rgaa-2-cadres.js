/**
 * RGAA 2 – Cadres : liste les iframes et frames de la page (iframes de même
 * origine et Shadow DOM ouverts compris) avec leur titre et leur domaine.
 *  - 2.1 : titre manquant = erreur, sauf cadre non restitué (non concerné) ;
 *  - 2.2 : titre générique ou identique pour plusieurs cadres = à vérifier.
 * Un clic sur une ligne fait défiler jusqu'au cadre et le met en évidence.
 */
import { dialog } from '../lib/dialog-panel.js';
import { icon, esc, src, flag } from '../lib/dom.js';
import { isNotExposed, deepAll, norm } from '../lib/a11y.js';
import { createHighlighter } from '../lib/highlight.js';

const GENERIC = ['iframe', 'frame', 'cadre', 'sans titre', 'untitled', 'title', 'titre', 'contenu', 'content', 'embed', 'widget'];

const frames = deepAll('iframe,frame');

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

const data = frames.map((f) => {
  const title = (f.getAttribute('title') || '').trim();
  return {
    f,
    title,
    hidden: isNotExposed(f),
    host: origin(f),
    depth: depth(f),
    aria: f.getAttribute('aria-label') || (f.getAttribute('aria-labelledby') ? 'aria-labelledby' : ''),
  };
});

// Titres identiques entre cadres restitués (2.2).
const count = {};
data.forEach((d) => {
  if (d.title && !d.hidden) count[norm(d.title)] = (count[norm(d.title)] || 0) + 1;
});

const concerned = data.filter((d) => !d.hidden);
const missing = concerned.filter((d) => !d.title).length;
const dlg = dialog({
  id: 'rgaa-2-cadres',
  title: `Cadres trouvés : ${frames.length}`,
  css: `.item{align-items:flex-start}.item .icon{margin-top:2px}.meta{display:block;margin-top:2px}
.nested{padding-left:16px}.summary{margin:0 0 8px}`,
});

if (dlg) {
  if (!frames.length) {
    dlg.body.innerHTML = '<p class="muted" style="margin:0;font-style:italic">Aucun cadre détecté.</p>';
  } else {
    const items = data
      .map((d, i) => {
        const warn = [];
        if (!d.hidden && d.title) {
          if (GENERIC.includes(norm(d.title))) warn.push('titre générique');
          if (count[norm(d.title)] > 1) warn.push('titre identique à un autre cadre');
        }
        const status = d.hidden
          ? icon('hidden', 'Non restitué')
          : !d.title
            ? icon('error', 'Titre manquant')
            : warn.length
              ? icon('warning', 'À vérifier')
              : icon('ok', 'Titre présent');
        const label = d.title
          ? `${esc(d.title)} ${src('title')}`
          : d.hidden
            ? '<span class="muted">Sans titre (non concerné)</span>'
            : '<span class="text-error">Sans titre</span>';
        return (
          `<li${d.depth ? ` class="nested" style="padding-left:${16 * d.depth}px"` : ''}>` +
          `<button type="button" class="item" data-idx="${i}">${status}<span>` +
          `<strong>${d.f.tagName === 'FRAME' ? 'Frame' : 'Iframe'} ${i + 1} :</strong> ${label}` +
          `<span class="meta small muted">${esc(d.host)}${d.hidden ? ` · masqué (${esc(d.hidden)})` : ''}` +
          `${d.aria ? ` · ${esc(d.aria === 'aria-labelledby' ? 'aria-labelledby' : `aria-label « ${d.aria} »`)} (non pris en compte par le RGAA)` : ''}` +
          `${d.depth ? ` · imbriqué niveau ${d.depth}` : ''}</span>` +
          (warn.length ? `<span class="meta">${flag('warning', `${warn.join(', ')} (2.2)`)}</span>` : '') +
          `</span></button></li>`
        );
      })
      .join('');

    dlg.body.innerHTML =
      `<p class="summary small">${concerned.length} restitué${concerned.length > 1 ? 's' : ''} · ` +
      `${missing ? icon('error') + ' ' : ''}${missing} sans titre (2.1) · ${data.length - concerned.length} non concerné${data.length - concerned.length > 1 ? 's' : ''}</p>` +
      `<ul class="items">${items}</ul>` +
      `<div class="footer small"><strong>Légende :</strong>` +
      `<ul class="legend muted" aria-hidden="true" style="margin:4px 0 8px">` +
      `<li><span class="icon icon--ok">✓</span> Titre présent</li>` +
      `<li><span class="icon icon--warning">!</span> À vérifier</li>` +
      `<li><span class="icon icon--error">×</span> Titre manquant</li>` +
      `<li><span class="icon icon--hidden">∅</span> Non restitué</li></ul>` +
      `<p class="muted" style="margin:0;font-style:italic">Les cadres masqués ou en aria-hidden ne sont pas concernés par le critère 2.1. ` +
      `Cliquer sur une ligne pour accéder au cadre.</p></div>`;

    const hl = createHighlighter();
    let timer;
    let restore = null;
    dlg.body.addEventListener('click', (e) => {
      const btn = e.target.closest('.item');
      if (!btn) return;
      const f = frames[btn.dataset.idx];
      clearTimeout(timer);
      if (restore) restore();
      const css = f.style.cssText;
      if (isNotExposed(f) && isNotExposed(f) !== 'aria-hidden') {
        f.style.setProperty('display', 'block', 'important');
        f.style.setProperty('visibility', 'visible', 'important');
        f.style.setProperty('min-width', '100px', 'important');
        f.style.setProperty('min-height', '50px', 'important');
      }
      f.scrollIntoView({ behavior: 'smooth', block: 'center' });
      hl.set([[f, 'locate']]);
      restore = () => {
        hl.clear();
        f.style.cssText = css;
        restore = null;
      };
      timer = setTimeout(restore, 3000);
    });
  }
}
