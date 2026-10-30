/**
 * RGAA 1 – Images : au survol (ou au focus), affiche pour l'image :
 *  - son statut (porteuse d'information ou décorative) et son nom accessible ;
 *  - le fichier source, pour juger la pertinence de l'alternative (1.3) ;
 *  - la description détaillée (1.6) et la légende (1.9) ;
 *  - l'éventuelle image CSS et, dans un lien, le nom accessible du lien ;
 *  - les constats : SVG sans role="img", alt suspect, longdesc obsolète...
 * En tête : le compteur des images de la page.
 * Maj+I : estompe toutes les images pour repérer les images texte (1.8).
 */
import { inspector } from '../lib/floating-panel.js';
import { row, value, src, esc, flag, checks, icon, roleValue } from '../lib/dom.js';
import { idrefs, textOf, norm, deepAll, isOwn, ariaHiddenAncestor, presentational, allDocuments, roleInfo } from '../lib/a11y.js';

const IMG = 'img,area,input[type="image"],svg,object[type^="image/"],embed[type^="image/"],canvas,[role="img"]';
const GENERIC = ['image', 'img', 'photo', 'picture', 'icone', 'icon', 'logo', 'visuel', 'illustration', 'graphique', 'spacer', 'blank'];

const tagOf = (e) => e.tagName.toLowerCase();
const isAltElement = (e) => ['img', 'area'].includes(tagOf(e)) || (tagOf(e) === 'input' && e.type === 'image');

/** Attributs qui donnent un nom accessible, en plus de alt. */
const namingAttrs = (e) => ['aria-label', 'aria-labelledby', 'title'].filter((a) => (e.getAttribute(a) || '').trim());

/**
 * Raison pour laquelle l'image est décorative (non restituée), ou null.
 * RGAA 1.2 : alt="" sur img/area, aria-hidden="true", role="presentation"/"none".
 */
const decorative = (e) => {
  if (ariaHiddenAncestor(e)) return 'aria-hidden="true"';
  const p = presentational(e);
  if (p) return p;
  if (['img', 'area'].includes(tagOf(e)) && e.getAttribute('alt') === '') return 'alt=""';
  return null;
};

/** Nom accessible d'une image. isCss : image de fond (pas de alt). */
const imgName = (e, isCss) => {
  let n = idrefs(e, 'aria-labelledby');
  if (n && n.v.length) return n;
  if ((n = e.getAttribute('aria-label')) !== null && n.trim()) return { v: [n], s: 'aria-label' };
  if (!isCss && isAltElement(e)) {
    const a = e.getAttribute('alt');
    if (a && a.trim()) return { v: [a], s: 'alt' };
  }
  if (tagOf(e) === 'svg') {
    const t = e.querySelector(':scope > title');
    if (t && textOf(t)) return { v: [textOf(t)], s: '<title>' };
  }
  // object et canvas : contenu de repli entre les balises.
  if (['object', 'canvas'].includes(tagOf(e))) {
    const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
    if (t) return { v: [t], s: 'contenu alternatif' };
  }
  if ((n = e.getAttribute('title')) !== null && n.trim()) return { v: [n], s: 'title' };
  return null;
};

/** Propriété CSS qui porte une image (les dégradés sont ignorés). */
const cssImage = (e) => {
  const view = e.ownerDocument.defaultView;
  const gcs = (el, pseudo) => view.getComputedStyle(el, pseudo);
  const check = (cs) => {
    const has = (prop) => {
      const v = cs.getPropertyValue(prop);
      return v && v !== 'none' && v.includes('url(');
    };
    if (has('background-image')) return 'background-image';
    if (has('content')) return 'content (CSS)';
    if (has('mask-image') || has('-webkit-mask-image')) return 'mask-image';
    if (has('list-style-image')) return 'list-style-image';
    if (has('border-image-source')) return 'border-image-source';
    return null;
  };
  let p = check(gcs(e));
  if (p) return { prop: p };
  if ((p = check(gcs(e, '::before')))) return { prop: `::before ${p}` };
  if ((p = check(gcs(e, '::after')))) return { prop: `::after ${p}` };
  return null;
};

/** Nom du fichier de l'image (pour juger la pertinence de l'alternative). */
const fileOf = (e) => {
  const url =
    e.currentSrc || e.getAttribute('src') || e.getAttribute('data') || e.getAttribute('href') ||
    e.querySelector?.('image')?.getAttribute('href') || '';
  if (!url || url.startsWith('data:')) return url ? 'image embarquée (data:)' : '';
  try {
    return decodeURIComponent(new URL(url, e.ownerDocument.baseURI).pathname.split('/').pop()) || url;
  } catch (err) {
    return url;
  }
};

/** Alternative qui semble non pertinente (1.3). */
const suspiciousAlt = (alt, file) => {
  const a = norm(alt);
  if (/\.(png|jpe?g|gif|svg|webp|avif|bmp)$/i.test(alt.trim()) || (file && a && a === norm(file.replace(/\.\w+$/, ''))))
    return 'Alternative = nom de fichier';
  if (GENERIC.includes(a)) return `Alternative générique (« ${alt.trim()} »)`;
  if (alt.trim().length > 80) return `Alternative longue (${alt.trim().length} caractères) : une description détaillée serait-elle plus adaptée ?`;
  return null;
};

/** Morceaux du nom d'un lien : textes + noms des images qu'il contient. */
const linkParts = (el) => {
  const parts = [];
  el.childNodes.forEach((c) => {
    if (c.nodeType === 3) {
      const t = c.textContent.trim();
      if (t) parts.push({ t, s: 'texte du lien' });
    } else if (c.nodeType === 1) {
      if (ariaHiddenAncestor(c)) return;
      const css = cssImage(c);
      if (c.matches(IMG) || css) {
        if (decorative(c)) return;
        const i = imgName(c, !!css);
        if (i) i.v.forEach((v) => parts.push({ t: v, s: `${i.s} (${css ? css.prop : tagOf(c)})` }));
      } else parts.push(...linkParts(c));
    }
  });
  return parts;
};

const linkName = (l) => {
  let n = idrefs(l, 'aria-labelledby');
  if (n && n.v.length) return n;
  if ((n = l.getAttribute('aria-label')) !== null && n.trim()) return { v: [n], s: 'aria-label (lien)' };
  const p = linkParts(l);
  if (p.length) return { v: p, s: '' };
  if ((n = l.getAttribute('title')) !== null && n.trim()) return { v: [n], s: 'title (lien)' };
  return null;
};

/** Description détaillée (1.6) : aria-describedby, longdesc, lien adjacent. */
const description = (t) => {
  const d = idrefs(t, 'aria-describedby');
  if (d && d.v.length) return { r: d };
  const ld = t.getAttribute('longdesc');
  if (ld) return { r: { v: [ld], s: 'longdesc' }, warn: 'longdesc est obsolète : préférer un lien adjacent ou aria-describedby' };
  const sib = [t.nextElementSibling, t.parentElement?.nextElementSibling].find((s) => s && s.matches('a[href]'));
  if (sib && /descri|transcri|d[ée]tail|texte/i.test(textOf(sib))) return { r: { v: [textOf(sib)], s: 'lien adjacent' } };
  return { r: null };
};

/** Légende (1.9) : figure + figcaption, role et aria-label attendus. */
const caption = (t) => {
  const fig = t.closest('figure,[role="figure"],[role="group"]');
  const cap = fig && fig.querySelector('figcaption');
  if (!cap) return { r: null, warns: [] };
  const text = textOf(cap);
  const warns = [];
  const role = fig.getAttribute('role');
  if (!['figure', 'group'].includes(role)) warns.push(['warning', 'figure sans role="figure" ou role="group" (1.9.1)']);
  const label = fig.getAttribute('aria-label');
  if (!label) warns.push(['warning', 'figure sans aria-label reprenant la légende (1.9.1)']);
  else if (norm(label) !== norm(text)) warns.push(['warning', 'aria-label de figure différent de la légende (1.9.1)']);
  return { r: { v: [text], s: 'figcaption' }, warns };
};

/* ---- Maj+I : estomper les images (1.8 images texte) ---- */
const DIM_ID = 'rgaa-1-images-dim';
const DIM_CSS = `img,svg,canvas,object,embed,input[type="image"],[role="img"]{opacity:.12!important}
*{background-image:none!important}`;
let dimmed = false;
const setDim = (on) => {
  dimmed = on;
  allDocuments().forEach((d) => {
    d.getElementById(DIM_ID)?.remove();
    if (on) {
      const s = d.createElement('style');
      s.id = DIM_ID;
      s.textContent = DIM_CSS;
      (d.head || d.documentElement).appendChild(s);
    }
  });
};

/** Statut d'une image pour la liste et le compteur. */
const status = (e) => {
  if (decorative(e)) return { status: 'hidden', label: 'Décorative' };
  const n = imgName(e, false);
  if (!n) return { status: 'error', label: 'Sans alternative' };
  const label = n.v.map((x) => (typeof x === 'object' ? x.t : x)).join(' ');
  if ((tagOf(e) === 'svg' && e.getAttribute('role') !== 'img') || (n.s === 'alt' && suspiciousAlt(n.v[0], fileOf(e))))
    return { status: 'warning', label };
  return { status: 'ok', label };
};

/** Panneau liste : compteur de page et images balisées. */
const collect = () => {
  const imgs = deepAll(IMG).filter((e) => !isOwn(e) && !(tagOf(e) !== 'svg' && e.closest('svg')));
  const items = imgs.map((el) => ({ el, meta: tagOf(el), ...status(el) }));
  const n = (st) => items.filter((i) => i.status === st).length;
  const missing = n('error');
  const toCheck = n('warning');
  const deco = n('hidden');
  return {
    items,
    summary:
      `${missing ? icon('error') + ' ' : ''}${missing} sans alternative · ` +
      `${toCheck ? icon('warning') + ' ' : ''}${toCheck} à vérifier · ${deco} décorative${deco > 1 ? 's' : ''}`,
  };
};

inspector({
  id: 'rgaa-1-images',
  list: {
    title: 'Images',
    collect,
    footer: 'Maj+I : estomper / rétablir les images (1.8). Les images CSS ne sont pas listées.',
  },
  onKey(e) {
    const tag = e.target && e.target.tagName;
    if (!(e.shiftKey && e.key.toLowerCase() === 'i') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target.isContentEditable) return false;
    setDim(!dimmed);
    return true;
  },
  onStop: () => setDim(false),
  inspect(target) {
    let t = target.closest(IMG);
    if (t && tagOf(t) !== 'svg' && t.closest('svg')) t = t.closest('svg');
    let css = null;
    if (!t) {
      for (let cur = target; cur && cur.nodeType === 1 && cur !== cur.ownerDocument.body; cur = cur.parentElement) {
        if ((css = cssImage(cur))) {
          t = cur;
          break;
        }
      }
    } else css = cssImage(t);
    if (!t) return null;

    const deco = decorative(t);
    const name = imgName(t, !!css);
    const file = fileOf(t);
    const desc = description(t);
    const cap = caption(t);
    const link = t.closest('a[href],[role="link"]');
    const found = [];

    let html = '';
    if (deco) {
      html += row('Statut', `${flag('ok', 'Décorative')} ${src(deco)}`);
      const named = namingAttrs(t);
      if (named.length) found.push(['error', `Image décorative avec ${named.join(', ')} : à retirer (1.2)`]);
    } else {
      html += row('Nom accessible', css && !name ? flag('warning', 'Aucun : vérifier que l’image CSS est décorative') : value(name));
    }
    if (!css || t.matches(IMG)) html += row('Rôle', roleValue(roleInfo(t)));
    if (file) html += row('Fichier', `<span class="muted">${esc(file)}</span>`);
    if (!deco) {
      html += row('Description', desc.r ? value(desc.r) : '<span class="muted">aucune</span>');
      if (desc.warn) found.push(['warning', desc.warn]);
    }
    if (cap.r) html += row('Légende', value(cap.r));
    found.push(...cap.warns);
    if (css) html += row('Image CSS', `Oui ${src(css.prop)}`);
    html += row('Image dans un lien', link ? 'Oui' : 'Non');
    if (link) html += row('Nom accessible du lien', value(linkName(link)));

    if (!deco && tagOf(t) === 'svg' && t.getAttribute('role') !== 'img')
      found.push(['warning', 'svg porteur d’information sans role="img" (1.1.5)']);
    if (!deco && name && name.s === 'alt') {
      const sus = suspiciousAlt(name.v[0], file);
      if (sus) found.push(['warning', `${sus} (1.3)`]);
    }
    if (!deco && tagOf(t) === 'embed' && !name) found.push(['error', 'embed sans alternative : ajouter aria-label ou un texte adjacent (1.1.7)']);
    const lb = idrefs(t, 'aria-labelledby');
    if (lb && lb.missing.length) found.push(['error', `aria-labelledby : id introuvable (${lb.missing.join(', ')})`]);

    html += checks(found);
    return { html, highlight: [[t, 'primary'], ...(desc.r && desc.r.els ? desc.r.els.map((d) => [d, 'secondary']) : [])] };
  },
});
