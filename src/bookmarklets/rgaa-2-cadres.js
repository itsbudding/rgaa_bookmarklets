/**
 * RGAA 2 – Cadres : liste les iframes de la page avec leur titre.
 * Un clic sur une iframe de la liste la fait défiler et la met en évidence.
 */
import { dialog } from '../lib/dialog-panel.js';
import { icon, esc, src } from '../lib/dom.js';
import { isHidden } from '../lib/a11y.js';
import { createHighlighter } from '../lib/highlight.js';

const frames = [...document.querySelectorAll('iframe')];
const dlg = dialog({ id: 'rgaa-2-cadres', title: `Iframes trouvées : ${frames.length}` });

if (dlg) {
  if (!frames.length) {
    dlg.body.innerHTML = '<p class="muted" style="margin:0;font-style:italic">Aucune iframe détectée.</p>';
  } else {
    const items = frames
      .map((f, i) => {
        const title = (f.getAttribute('title') || '').trim();
        const hidden = isHidden(f);
        return (
          `<li><button type="button" class="item" data-idx="${i}">` +
          (title ? '' : icon('error', 'Titre manquant')) +
          (hidden ? icon('hidden', 'Masquée') : '') +
          `<span><strong>Iframe ${i + 1} :</strong> ` +
          (title ? `${esc(title)} ${src('title')}` : '<span class="text-error">Sans titre</span>') +
          `</span></button></li>`
        );
      })
      .join('');

    dlg.body.innerHTML =
      `<ul class="items">${items}</ul>` +
      `<div class="footer small"><strong>Légende :</strong>` +
      `<ul class="legend muted" aria-hidden="true" style="margin:4px 0 8px">` +
      `<li><span class="icon icon--error">×</span> Titre manquant</li>` +
      `<li><span class="icon icon--hidden">∅</span> Masquée</li></ul>` +
      `<p class="muted" style="margin:0;font-style:italic">Cliquer sur un élément de la liste pour y accéder sur la page.</p></div>`;

    const hl = createHighlighter();
    let timer;
    dlg.body.addEventListener('click', (e) => {
      const btn = e.target.closest('.item');
      if (!btn) return;
      const f = frames[btn.dataset.idx];
      const css = f.style.cssText;
      clearTimeout(timer);
      if (isHidden(f)) {
        f.style.setProperty('display', 'block', 'important');
        f.style.setProperty('visibility', 'visible', 'important');
        f.style.setProperty('min-width', '100px', 'important');
        f.style.setProperty('min-height', '50px', 'important');
      }
      f.scrollIntoView({ behavior: 'smooth', block: 'center' });
      hl.set([[f, 'locate']]);
      timer = setTimeout(() => {
        hl.clear();
        f.style.cssText = css;
      }, 3000);
    });
  }
}
