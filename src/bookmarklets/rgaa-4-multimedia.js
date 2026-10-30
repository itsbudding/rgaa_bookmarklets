/**
 * RGAA 4 – Multimédia : inventaire des médias de la page et aide à l'audit.
 *
 * Le panneau liste donne un média par ligne (vidéo, audio, lecteur YouTube ou
 * Vimeo, façade de lecteur, carte, objet interactif, lien vers un fichier
 * média), avec une pastille par critère. Le détail (au survol, ou épinglé au
 * clic sur une ligne) reprend chaque critère :
 *  - 4.1 transcription ou version audiodécrite repérée à proximité ;
 *  - 4.3 pistes <track> (kind="captions" attendu, test 4.3.2) ;
 *  - 4.5 piste ou version audiodécrite ;
 *  - 4.7 ce qui identifie le média (nom accessible, légende, texte adjacent) ;
 *  - 4.8 alternative d'un média non temporel (carte, objet) ;
 *  - 4.10 lecture automatique avec le son ;
 *  - 4.11 / 4.12 contrôles : natifs, lecteur personnalisé (focalisables ?),
 *    paramètres d'URL des lecteurs tiers (controls=0, disablekb=1) ;
 *  - 4.13 rôle, nom et état des contrôles d'un lecteur personnalisé.
 * La pertinence (4.2, 4.4, 4.6, 4.9) reste à juger : le détail montre où
 * regarder. Les lecteurs tiers en iframe ne sont pas lisibles : seuls leur
 * URL et leur titre sont analysés.
 *
 * Boutons : « Couper tous les médias » (Maj+M), « Ordre de tabulation »
 * (Maj+T) ; dans le détail épinglé : « Charger les sous-titres ».
 */
import { inspector } from '../lib/floating-panel.js';
import { row, esc, src, icon, list } from '../lib/dom.js';
import { idrefs, textOf, norm, deepAll, isOwn, isNotExposed, roleInfo, toTopCoords, allDocuments } from '../lib/a11y.js';
import { THEME } from '../lib/theme.js';

const ID = 'rgaa-4-multimedia';

/** Constat avec icône ; ∅ se lit « Non concerné » (et non « Masqué »). */
const flag = (type, text) =>
  `<span class="flag flag--${type}">${icon(type, type === 'hidden' ? 'Non concerné' : undefined)}<span>${esc(text)}</span></span>`;

/* ---------- Repérage des médias ---------- */

const MEDIA_EXT = /\.(mp4|m4v|webm|ogv|mov|avi|wmv|flv|mkv|mp3|m4a|aac|oga|ogg|opus|wav|flac)(?:[?#]|$)/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|oga|ogg|opus|wav|flac)(?:[?#]|$)/i;

/* Lecteurs tiers en iframe : domaine (et chemin) → nom et type. */
const PROVIDERS = [
  { host: /(^|\.)(youtube\.com|youtube-nocookie\.com)$/, path: /\/embed\//, name: 'YouTube', type: 'video' },
  { host: /(^|\.)player\.vimeo\.com$/, name: 'Vimeo', type: 'video' },
  { host: /(^|\.)dailymotion\.com$/, path: /\/(embed|player)/, name: 'Dailymotion', type: 'video' },
  { host: /(^|\.)w\.soundcloud\.com$/, name: 'SoundCloud', type: 'audio' },
  { host: /(^|\.)open\.spotify\.com$/, path: /\/embed/, name: 'Spotify', type: 'audio' },
  { host: /(^|\.)widget\.deezer\.com$/, name: 'Deezer', type: 'audio' },
  { host: /(^|\.)player\.ausha\.co$/, name: 'Ausha', type: 'audio' },
  { host: /(^|\.)facebook\.com$/, path: /\/plugins\/video/, name: 'Facebook', type: 'video' },
  { host: /(^|\.)player\.twitch\.tv$/, name: 'Twitch', type: 'video' },
  { host: /(^|\.)wistia\.(net|com)$/, name: 'Wistia', type: 'video' },
  { host: /(^|\.)players\.brightcove\.net$/, name: 'Brightcove', type: 'video' },
  { host: /(^|\.)kaltura\.com$/, name: 'Kaltura', type: 'video' },
  { host: /(^|\.)embed\.ted\.com$/, name: 'TED', type: 'video' },
  { host: /./, path: /\/videos\/embed\//, name: 'PeerTube', type: 'video' },
];
/* Cartes en iframe (médias non temporels). */
const MAP_FRAMES = [
  { host: /(^|\.)google\.[a-z.]+$/, path: /\/maps/ },
  { host: /^maps\.google\./ },
  { host: /(^|\.)openstreetmap\.org$/, path: /\/export\/embed/ },
  { host: /^umap\./ },
  { host: /(^|\.)framacarte\.org$/ },
];
const FACADE = 'lite-youtube,lite-vimeo,[data-youtube-id],[data-ytid],[data-vimeo-id]';
const MAP_SEL = '.leaflet-container,.mapboxgl-map,.maplibregl-map,gmp-map';
const PLAYER_SEL = '.video-js,.plyr,.jwplayer,.mejs__container,.mejs-container,.able-wrapper,media-controller,[data-player]';

/* Contrôles d'un lecteur personnalisé. */
const CTRL_SEL = 'button,[role="button"],[role="slider"],[role="switch"],[role="checkbox"],[role="menuitem"],input[type="range"],input[type="checkbox"],select';
const CLICKY_SEL =
  '[onclick],[class*="play" i],[class*="pause" i],[class*="volume" i],[class*="mute" i],[class*="progress" i],[class*="seek" i],[class*="fullscreen" i],[class*="caption" i],[class*="subtitle" i]';

/* Textes recherchés à proximité du média. */
const RE_TRANSCRIPT = /transcri|version (texte|textuelle|ecrite)|texte (integral|complet)|contenu textuel/;
const RE_AD = /audio ?descri|audiodecri|version (audio)?decrite/;
const RE_ALT_NT = /adresse|itineraire|plan d acces|version (texte|textuelle|accessible)|alternative|coordonnees|liste des (lieux|points|etapes)/;
const GENERIC = /^(video|audio|media|lecteur|lecteur (video|audio|multimedia)|player|video player|(youtube|vimeo|dailymotion|soundcloud|spotify) (video )?player|youtube|vimeo|iframe|embed|untitled|sans titre)$/;

const tagOf = (e) => e.tagName.toLowerCase();
const truthy = (v) => v === '1' || v === 'true';
const has = (e, a) => e.hasAttribute(a);

/** URL d'un élément (iframe, object, embed) ou null. */
const urlOf = (e, attr) => {
  const v = (e.getAttribute(attr) || '').trim();
  if (!v || /^(about|javascript|data):/i.test(v)) return null;
  try {
    return new URL(v, e.ownerDocument.baseURI);
  } catch (err) {
    return null;
  }
};
const matchHost = (table, u) => table.find((p) => p.host.test(u.hostname) && (!p.path || p.path.test(u.pathname)));

/** Nom de fichier ou domaine, pour la ligne « Source ». */
const shortUrl = (u) => {
  if (!u) return '';
  try {
    const url = typeof u === 'string' ? new URL(u, document.baseURI) : u;
    if (url.protocol === 'blob:') return 'flux (blob)';
    const file = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
    return url.protocol === 'file:' ? file : `${url.hostname}${file ? ` · ${file}` : ''}`;
  } catch (err) {
    return String(u);
  }
};
const mediaSrc = (m) => m.currentSrc || m.getAttribute('src') || (m.querySelector('source[src]') || { src: '' }).src;

/**
 * Inventaire : un objet par média.
 * { el (élément entouré et cible du clic), media (élément média), kind, type,
 *   temporal, audioOnly, provider, url }
 */
const findMedia = () => {
  const out = [];
  const seen = new Set();
  const add = (e) => {
    if (seen.has(e.el) || seen.has(e.media) || isOwn(e.el)) return;
    seen.add(e.el);
    seen.add(e.media);
    out.push(e);
  };
  deepAll('video,audio').forEach((m) => {
    const audio = tagOf(m) === 'audio';
    const player = m.controls ? null : findPlayer(m);
    add({ el: player || m, media: m, player, kind: 'native', type: audio ? 'Audio' : 'Vidéo', temporal: true, audioOnly: audio, url: mediaSrc(m) });
  });
  deepAll(FACADE).forEach((f) => {
    const vimeo = /vimeo/i.test(tagOf(f) + (f.getAttribute('data-vimeo-id') ? ' vimeo' : ''));
    add({ el: f, media: f, kind: 'facade', type: `Façade ${vimeo ? 'Vimeo' : 'YouTube'}`, temporal: true, audioOnly: false });
  });
  deepAll('iframe,frame').forEach((f) => {
    const u = urlOf(f, 'src');
    if (!u) return;
    const p = matchHost(PROVIDERS, u);
    if (p) return add({ el: f, media: f, kind: 'iframe', type: p.name, provider: p.name, temporal: true, audioOnly: p.type === 'audio', url: u });
    if (matchHost(MAP_FRAMES, u)) add({ el: f, media: f, kind: 'map', type: 'Carte (iframe)', temporal: false, url: u });
  });
  deepAll('object,embed').forEach((o) => {
    if (o.parentElement && o.parentElement.closest('object')) return;
    const u = urlOf(o, tagOf(o) === 'object' ? 'data' : 'src');
    const type = (o.getAttribute('type') || '').toLowerCase();
    if (type.startsWith('image/') || type === 'text/html' || type === 'application/pdf') return;
    const media = /^(video|audio)\//.test(type) || (u && MEDIA_EXT.test(u.pathname));
    const flash = type === 'application/x-shockwave-flash' || (u && /\.swf$/i.test(u.pathname));
    if (media) {
      const audio = type.startsWith('audio/') || (u && AUDIO_EXT.test(u.pathname));
      add({ el: o, media: o, kind: 'object', type: `${audio ? 'Audio' : 'Vidéo'} (${tagOf(o)})`, temporal: true, audioOnly: audio, url: u });
    } else if (flash) add({ el: o, media: o, kind: 'object', type: `Objet Flash (${tagOf(o)})`, temporal: false, url: u });
  });
  deepAll(MAP_SEL).forEach((m) => add({ el: m, media: m, kind: 'map', type: 'Carte interactive', temporal: false }));
  deepAll('.gm-style').forEach((g) => g.parentElement && add({ el: g.parentElement, media: g.parentElement, kind: 'map', type: 'Carte Google Maps', temporal: false }));
  deepAll('canvas').forEach((c) => {
    const r = (c.getAttribute('role') || '').trim();
    if (['img', 'presentation', 'none'].includes(r)) return;
    if (c.tabIndex >= 0 || r) add({ el: c, media: c, kind: 'canvas', type: 'Canvas interactif', temporal: false });
  });
  deepAll('a[href]').forEach((a) => {
    const u = urlOf(a, 'href');
    if (u && MEDIA_EXT.test(u.pathname)) add({ el: a, media: a, kind: 'link', type: `Lien vers un fichier ${AUDIO_EXT.test(u.pathname) ? 'audio' : 'vidéo'}`, temporal: true, url: u });
  });
  // Ordre du document.
  return out.sort((a, b) => (a.el.ownerDocument !== b.el.ownerDocument ? 0 : a.el.compareDocumentPosition(b.el) & 2 ? 1 : -1));
};

/** Vrai si el contient un autre média que m (ou en est un). */
const otherMedia = (el, m) => {
  const all = el.querySelectorAll('video,audio,iframe,object,embed,lite-youtube,lite-vimeo');
  return [...all].some((x) => x !== m && !m.contains(x));
};

/** Lecteur personnalisé autour d'un média sans attribut controls. */
const findPlayer = (m) => {
  const known = m.closest(PLAYER_SEL);
  if (known) return known;
  let cur = m;
  for (let i = 0; i < 4; i++) {
    const p = cur.parentElement;
    if (!p || p === p.ownerDocument.body || p.tagName === 'FIGURE' || otherMedia(p, m)) break;
    if (controlsIn(p, m).length) return p;
    cur = p;
  }
  return null;
};

/* ---------- Contrôles d'un lecteur personnalisé ---------- */

/** Nom accessible simplifié d'un contrôle. */
const nameOf = (e) => {
  const lb = idrefs(e, 'aria-labelledby');
  if (lb && lb.v.length) return { v: lb.v.join(' '), s: 'aria-labelledby' };
  const al = (e.getAttribute('aria-label') || '').trim();
  if (al) return { v: al, s: 'aria-label' };
  if (tagOf(e) === 'input' || tagOf(e) === 'select') {
    const l = e.labels && [...e.labels].map(textOf).join(' ');
    if (l) return { v: l, s: 'label' };
    if (['button', 'submit'].includes(e.type) && e.value) return { v: e.value, s: 'value' };
  } else {
    const t = textOf(e);
    if (t) return { v: t, s: 'contenu' };
    const img = e.querySelector('img[alt]:not([alt=""])');
    if (img) return { v: img.getAttribute('alt'), s: 'alt de l’image' };
  }
  const title = (e.getAttribute('title') || '').trim();
  if (title) return { v: title, s: 'title' };
  return { v: '', s: '' };
};

const KINDS = [
  ['play', /lecture|lire|play|pause|demarrer/],
  ['volume', /volume|son|mute|muet|sourdine/],
  ['captions', /sous titre|caption|subtitle|\bcc\b/],
  ['fullscreen', /plein ecran|fullscreen/],
  ['seek', /progress|seek|position|avance|recul|temps|time/],
  ['stop', /\bstop\b|arret/],
];
const kindOf = (e, name) => {
  const s = norm(`${name} ${typeof e.className === 'string' ? e.className : ''}`);
  const k = KINDS.find(([, re]) => re.test(s));
  return k ? k[0] : '';
};

/** Contrôles (et faux contrôles cliquables) d'un lecteur, hors média lui-même. */
const controlsIn = (container, m) => {
  const real = deepAll(CTRL_SEL, container).filter((c) => !m.contains(c) && !isNotExposed(c) && !RE_TRANSCRIPT.test(norm(textOf(c))));
  const fake = deepAll(CLICKY_SEL, container).filter((c) => {
    if (m.contains(c) || c.contains(m) || isNotExposed(c) || c.matches(CTRL_SEL) || c.closest(CTRL_SEL)) return false;
    if (c.querySelector(`${CTRL_SEL},${CLICKY_SEL}`)) return false; // conteneur, pas un contrôle
    const cs = c.ownerDocument.defaultView.getComputedStyle(c);
    return has(c, 'onclick') || cs.cursor === 'pointer';
  });
  return [...real, ...fake];
};

/** Analyse d'un contrôle : rôle, nom, état, focalisable, type. */
const analyzeControl = (c) => {
  const ri = roleInfo(c);
  const n = nameOf(c);
  const focusable = !c.disabled && c.tabIndex >= 0;
  let state = '';
  if (has(c, 'aria-pressed')) state = `aria-pressed="${c.getAttribute('aria-pressed')}"`;
  else if (has(c, 'aria-checked')) state = `aria-checked="${c.getAttribute('aria-checked')}"`;
  else if (has(c, 'aria-valuetext')) state = `aria-valuetext="${c.getAttribute('aria-valuetext')}"`;
  else if (has(c, 'aria-valuenow')) state = `aria-valuenow="${c.getAttribute('aria-valuenow')}"`;
  else if (tagOf(c) === 'input' && c.type === 'range') state = `valeur ${c.value}`;
  else if (tagOf(c) === 'input' && c.type === 'checkbox') state = c.checked ? 'cochée' : 'non cochée';
  const slider = ri.role === 'slider';
  const sliderNoValue = slider && !(tagOf(c) === 'input') && !has(c, 'aria-valuenow') && !has(c, 'aria-valuetext');
  return { el: c, role: ri.role, roleSrc: ri.source, name: n, focusable, state, kind: kindOf(c, n.v), sliderNoValue };
};

/* ---------- Voisinage du média ---------- */

/** Zone où chercher transcription et identification autour du média. */
const scopeOf = (e) => {
  const fig = e.el.closest('figure');
  if (fig) return fig;
  let s = e.el;
  for (let i = 0; i < 3; i++) {
    const p = s.parentElement;
    if (!p || p === p.ownerDocument.body || otherMedia(p, e.media)) break;
    s = p;
  }
  return s;
};

/** Éléments de la zone + deux éléments suivants (sans autre média) + cibles aria-describedby / aria-details. */
const zoneOf = (e) => {
  const scope = scopeOf(e);
  const zone = [scope];
  let n = scope.nextElementSibling;
  for (let i = 0; n && i < 2; i++, n = n.nextElementSibling) {
    if (otherMedia(n, e.media) || /^H[1-6]$/.test(n.tagName)) break;
    zone.push(n);
  }
  ['aria-describedby', 'aria-details'].forEach((a) => {
    const r = idrefs(e.media, a);
    if (r) zone.push(...r.els);
  });
  return zone;
};

/** Premier lien, bouton ou résumé de la zone dont le texte correspond. */
const findNear = (e, re) => {
  for (const z of zoneOf(e)) {
    const cands = [z, ...z.querySelectorAll('a[href],button,summary,[role="button"],[role="link"]')];
    const hit = cands.find((c) => c.matches('a[href],button,summary,[role="button"],[role="link"]') && !isOwn(c) && re.test(norm(`${textOf(c)} ${c.getAttribute('aria-label') || ''} ${c.getAttribute('title') || ''}`)));
    if (hit) return hit;
  }
  return null;
};

/** Texte qui identifie le média : nom accessible, légende, texte adjacent. */
const identify = (e) => {
  const m = e.media;
  const items = [];
  const lb = idrefs(m, 'aria-labelledby');
  if (lb && lb.v.length) items.push({ t: lb.v.join(' '), s: 'aria-labelledby', el: lb.els[0] });
  const al = (m.getAttribute('aria-label') || '').trim();
  if (al) items.push({ t: al, s: 'aria-label' });
  const title = (m.getAttribute('title') || m.getAttribute('playlabel') || '').trim();
  if (title) items.push({ t: title, s: m.hasAttribute('title') ? 'title' : 'playlabel' });
  const fig = e.el.closest('figure');
  const cap = fig && fig.querySelector('figcaption');
  if (cap && textOf(cap)) items.push({ t: textOf(cap), s: 'figcaption', el: cap });
  if (!cap) {
    // Texte qui précède le média : frère précédent du média ou de ses parents proches.
    const scope = scopeOf(e);
    const stop = scope.parentElement;
    let found = null;
    for (let cur = e.el; cur && cur !== stop && !found; cur = cur.parentElement) {
      for (let s = cur.previousElementSibling; s && !found; s = s.previousElementSibling) {
        if (!otherMedia(s, m) && !isNotExposed(s) && textOf(s)) found = s;
      }
    }
    if (found) items.push({ t: textOf(found), s: `texte adjacent, <${tagOf(found)}>`, el: found });
  }
  const generic = items.length > 0 && items.filter((i) => !['figcaption'].includes(i.s) && !i.s.startsWith('texte')).every((i) => GENERIC.test(norm(i.t)));
  return { items, generic: generic && !items.some((i) => i.s === 'figcaption' || i.s.startsWith('texte')) };
};

/* ---------- Critères ---------- */

const RANK = { error: 3, warning: 2, ok: 1, hidden: 0 };
const worst = (list) => list.reduce((w, s) => (RANK[s] > RANK[w] ? s : w), 'hidden');

/** État d'origine (avant « Couper tous les médias ») et lecture constatée au lancement. */
const muteState = new Map();
const playedWithSound = new WeakSet();
const isMuted = (m) => (muteState.has(m) ? muteState.get(m).muted : m.muted);

/** Paramètres d'URL d'un lecteur tiers. */
const params = (e) => {
  const q = e.url && e.url.searchParams ? e.url.searchParams : new URLSearchParams();
  const get = (...k) => k.map((x) => q.get(x)).find((v) => v !== null);
  return {
    autoplay: truthy(get('autoplay', 'autostart', 'auto_play')),
    muted: truthy(get('mute', 'muted')) || truthy(get('background')),
    noControls: ['0', 'false'].includes(get('controls')) || truthy(get('background')),
    noKeyboard: truthy(get('disablekb')),
    captions: truthy(get('cc_load_policy')) || !!get('texttrack', 'subtitles-default'),
    shown: [...q.keys()].filter((k) => /^(autoplay|autostart|mute|muted|controls|disablekb|cc_load_policy|cc_lang_pref|texttrack|background|loop)$/.test(k)).map((k) => `${k}=${q.get(k)}`),
  };
};

/** Pistes <track> d'une vidéo. */
const tracksOf = (m) => (tagOf(m) === 'video' ? [...m.querySelectorAll('track')] : []);
const trackKind = (t) => (t.getAttribute('kind') || 'subtitles').toLowerCase();
const cueCache = new WeakMap();

/**
 * Analyse complète d'un média : chaque critère donne { status, text, more }.
 * more : HTML déjà échappé affiché sous le constat.
 */
const analyze = (e) => {
  const c = {};
  const hidden = e.kind === 'link' ? null : isNotExposed(e.el);
  e.hidden = hidden;
  if (e.kind === 'link' || hidden) return Object.assign(e, { crit: c, status: 'hidden' });
  const m = e.media;
  const p = e.kind === 'iframe' || e.kind === 'object' ? params(e) : null;
  e.params = p;

  // Contrôles d'un lecteur personnalisé.
  const native = e.kind === 'native' && m.controls;
  const ctrls = e.player ? controlsIn(e.player, m).map(analyzeControl) : [];
  e.controls = ctrls;
  const autoplay = e.kind === 'native' && (m.autoplay || playedWithSound.has(m) || (!m.paused && !m.ended));
  e.background = e.kind === 'native' && !e.audioOnly && !native && !ctrls.length && m.autoplay && isMuted(m) && m.loop;

  if (e.temporal) {
    // 4.1 Transcription (ou audiodescription pour une vidéo).
    const tr = findNear(e, RE_TRANSCRIPT);
    const ad = findNear(e, RE_AD);
    e.transcript = tr;
    e.adLink = ad;
    if (tr) c['4.1'] = { status: 'warning', text: `Transcription repérée : « ${textOf(tr) || tr.getAttribute('aria-label')} » (pertinence à juger, 4.2)`, el: tr, action: 'transcript' };
    else if (ad && !e.audioOnly) c['4.1'] = { status: 'warning', text: `Pas de transcription, mais une version audiodécrite : « ${textOf(ad)} » (à juger)`, el: ad };
    else c['4.1'] = { status: 'warning', text: 'Aucune transcription repérée à proximité : vérifier si le média en a besoin' };

    // 4.3 Sous-titres synchronisés (vidéo seulement).
    if (e.audioOnly) c['4.3'] = { status: 'hidden', text: 'Non concerné : média audio seul' };
    else if (e.kind === 'native') {
      const tr3 = tracksOf(m).filter((t) => ['captions', 'subtitles'].includes(trackKind(t)));
      e.tracks = tracksOf(m);
      if (tr3.some((t) => trackKind(t) === 'captions')) c['4.3'] = { status: 'ok', text: 'Piste de sous-titres kind="captions" (pertinence à juger, 4.4)' };
      else if (tr3.length) c['4.3'] = { status: 'error', text: `Piste kind="${trackKind(tr3[0])}" : kind="captions" attendu pour des sous-titres synchronisés (4.3.2)` };
      else c['4.3'] = { status: 'warning', text: 'Aucune piste <track> : vérifier si des sous-titres sont incrustés dans l’image' };
    } else if (e.kind === 'iframe' && p.captions) c['4.3'] = { status: 'warning', text: 'Sous-titres affichés par défaut (paramètre d’URL) : vérifier dans le lecteur qu’ils existent' };
    else c['4.3'] = { status: 'warning', text: e.kind === 'facade' ? 'Lecteur pas encore chargé : vérifier après le clic' : 'Lecteur tiers : vérifier les sous-titres dans le lecteur' };

    // 4.5 Audiodescription (vidéo seulement).
    if (e.audioOnly) c['4.5'] = { status: 'hidden', text: 'Non concerné : média audio seul' };
    else {
      const desc = e.kind === 'native' && tracksOf(m).find((t) => trackKind(t) === 'descriptions');
      const audioDesc = e.kind === 'native' && m.audioTracks && [...m.audioTracks].find((t) => /desc/.test(t.kind));
      if (audioDesc) c['4.5'] = { status: 'warning', text: `Piste audio de description (« ${audioDesc.label || audioDesc.kind} ») : à écouter (4.6)` };
      else if (ad) c['4.5'] = { status: 'warning', text: `Version audiodécrite repérée : « ${textOf(ad)} » (à écouter, 4.6)`, el: ad };
      else if (desc) c['4.5'] = { status: 'warning', text: 'Piste kind="descriptions" : elle n’est pas lue par les navigateurs, ne vaut audiodescription que si elle est restituée' };
      else c['4.5'] = { status: 'warning', text: 'Aucune audiodescription repérée : vérifier si la vidéo en a besoin' };
    }

    // 4.7 Identification.
    const id = identify(e);
    e.ident = id;
    if (!id.items.length) c['4.7'] = { status: 'warning', text: 'Rien n’identifie le média (ni nom, ni légende, ni texte adjacent) : à vérifier en priorité' };
    else if (id.generic) c['4.7'] = { status: 'warning', text: `Nom générique « ${id.items[0].t} » : ne permet pas d’identifier le média` };
    else {
      const gen = id.items.find((i) => ['aria-label', 'aria-labelledby', 'title', 'playlabel'].includes(i.s) && GENERIC.test(norm(i.t)));
      c['4.7'] = { status: 'warning', text: 'Texte d’identification trouvé (à juger)', extra: gen ? [['warning', `Nom générique « ${gen.t} » (${gen.s}) : à remplacer par le titre du média`]] : [] };
    }

    // 4.10 Son déclenché automatiquement.
    if (e.kind === 'native') {
      const sound = !isMuted(m) && m.volume > 0;
      const canStop = native || ctrls.some((x) => x.kind === 'play' || x.kind === 'volume' || x.kind === 'stop');
      if (!autoplay) c['4.10'] = { status: 'ok', text: 'Pas de lecture automatique' };
      else if (!sound) c['4.10'] = { status: 'ok', text: 'Lecture automatique sans le son (muted)' };
      else if (Number.isFinite(m.duration) && m.duration <= 3) c['4.10'] = { status: 'ok', text: 'Lecture automatique, mais son de 3 secondes ou moins' };
      else if (canStop) c['4.10'] = { status: 'warning', text: 'Lecture automatique avec le son : vérifier qu’on peut l’arrêter ou couper le son dès le début de la page' };
      else c['4.10'] = { status: 'error', text: 'Lecture automatique avec le son, sans contrôle pour l’arrêter' };
    } else if (p) {
      if (!p.autoplay) c['4.10'] = { status: 'ok', text: 'Pas de lecture automatique dans l’URL' };
      else if (p.muted) c['4.10'] = { status: 'ok', text: 'Lecture automatique sans le son (paramètre d’URL)' };
      else if (p.noControls) c['4.10'] = { status: 'error', text: 'Lecture automatique avec le son et lecteur sans contrôles' };
      else c['4.10'] = { status: 'warning', text: 'Lecture automatique avec le son (paramètre d’URL) : vérifier qu’on peut l’arrêter dès le début de la page' };
    } else c['4.10'] = { status: 'ok', text: 'Pas de lecture automatique' };

    // 4.11 Contrôle au clavier et à la souris, 4.13 compatibilité.
    Object.assign(c, controlCriteria(e, native, ctrls, p));
  } else {
    // Média non temporel : 4.8, 4.12, 4.13.
    let alt = null;
    if (e.kind === 'object') {
      const t = [...m.childNodes].map((n) => (n.nodeType === 3 ? n.textContent : n.nodeType === 1 && !n.matches('param,object,embed') ? textOf(n) : '')).join(' ').trim();
      if (t) alt = { t, s: 'contenu de repli' };
    }
    if (!alt) {
      for (const z of zoneOf(e)) {
        const hit = [z, ...z.querySelectorAll('p,a[href],address,button,summary,li,dd')].find((x) => x !== m && !m.contains(x) && !isOwn(x) && (x.tagName === 'ADDRESS' || RE_ALT_NT.test(norm(textOf(x)))) && textOf(x).length < 400);
        if (hit) {
          alt = { t: textOf(hit), s: `<${tagOf(hit)}>`, el: hit };
          break;
        }
      }
    }
    e.alt = alt;
    c['4.8'] = alt
      ? { status: 'warning', text: `Alternative possible : « ${alt.t} » (pertinence à juger, 4.9)`, el: alt.el }
      : { status: 'warning', text: 'Aucune alternative repérée à proximité : vérifier si le média en a besoin' };
    const focusIn = deepAll('a[href],button,input,select,textarea,[tabindex]', m).some((x) => x.tabIndex >= 0 && !isNotExposed(x));
    if (e.kind === 'map' && tagOf(m) === 'iframe') c['4.12'] = { status: 'warning', text: 'Carte tierce : tester au clavier (déplacement, zoom) et à la souris' };
    else if (m.tabIndex >= 0 || focusIn) c['4.12'] = { status: 'warning', text: 'Atteignable au clavier : tester les fonctions (déplacement, zoom, activation)' };
    else c['4.12'] = { status: 'error', text: 'Aucun élément atteignable au clavier dans le média' };
    const named = nameOf(m).v;
    c['4.13'] = { status: 'warning', text: named ? 'À tester avec un lecteur d’écran' : 'Pas de nom accessible : à tester avec un lecteur d’écran' };
  }
  e.crit = c;
  e.status = worst(Object.values(c).map((x) => x.status));
  return e;
};

/** 4.11 et 4.13 pour un média temporel. */
const controlCriteria = (e, native, ctrls, p) => {
  const m = e.media;
  const c = {};
  if (native) {
    c['4.11'] = { status: 'ok', text: 'Contrôles natifs du navigateur (attribut controls)' };
    c['4.13'] = { status: 'ok', text: 'Contrôles natifs : compatibles avec les technologies d’assistance' };
    return c;
  }
  if (e.kind === 'iframe') {
    if (p.noControls) c['4.11'] = { status: 'error', text: 'Lecteur sans contrôles (paramètre controls=0 ou background=1)' };
    else if (p.noKeyboard) c['4.11'] = { status: 'error', text: 'Raccourcis clavier désactivés (paramètre disablekb=1)' };
    else c['4.11'] = { status: 'warning', text: 'Lecteur tiers : tester au clavier (Tab, Entrée, Espace) et à la souris' };
    c['4.13'] = { status: 'warning', text: 'Lecteur tiers : tester avec un lecteur d’écran' };
    return c;
  }
  if (e.kind === 'facade') {
    const btn = m.matches('button,[role="button"]') ? m : m.querySelector('button,[role="button"],a[href]');
    const target = btn || (m.tabIndex >= 0 ? m : null);
    if (!target) c['4.11'] = { status: 'error', text: 'Façade non activable au clavier : aucun bouton ni élément focalisable' };
    else c['4.11'] = { status: 'warning', text: 'Façade activable au clavier : charger le lecteur, puis Actualiser pour l’analyser' };
    const n = target ? nameOf(target).v || (m.getAttribute('playlabel') || '') : '';
    c['4.13'] = target && !n ? { status: 'error', text: 'Bouton de la façade sans nom accessible' } : { status: 'warning', text: 'Tester le lecteur avec un lecteur d’écran une fois chargé' };
    e.controls = target ? [analyzeControl(target)] : [];
    return c;
  }
  if (e.kind === 'object') {
    c['4.11'] = { status: 'warning', text: 'Lecteur du navigateur ou d’un plugin : tester au clavier et à la souris' };
    c['4.13'] = { status: 'warning', text: 'À tester avec un lecteur d’écran' };
    return c;
  }
  // Média natif sans attribut controls.
  if (!ctrls.length) {
    if (e.background) {
      c['4.11'] = { status: 'warning', text: 'Vidéo d’arrière-plan probable (autoplay muted loop) : si elle est décorative, la thématique 4 ne s’applique pas, mais un moyen de la mettre en pause est requis au-delà de 5 s (13.8)' };
      c['4.13'] = { status: 'hidden', text: 'Non concerné si la vidéo est décorative' };
    } else {
      c['4.11'] = { status: 'error', text: 'Aucun contrôle : ni attribut controls, ni lecteur personnalisé repéré' };
      c['4.13'] = { status: 'error', text: 'Aucun contrôle restitué aux technologies d’assistance' };
    }
    return c;
  }
  const notFocusable = ctrls.filter((x) => !x.focusable);
  const msgs = [];
  if (notFocusable.length) msgs.push(['error', `${notFocusable.length} contrôle${notFocusable.length > 1 ? 's' : ''} non atteignable${notFocusable.length > 1 ? 's' : ''} au clavier`]);
  if (!ctrls.some((x) => x.kind === 'play')) msgs.push(['warning', 'Aucun bouton lecture / pause repéré']);
  if (!ctrls.some((x) => x.kind === 'volume')) msgs.push(['warning', 'Aucun réglage du son repéré']);
  msgs.push(['warning', 'Lecteur personnalisé : tester au clavier (Tab, Entrée, Espace) et à la souris']);
  c['4.11'] = { status: worst(msgs.map((x) => x[0])), text: msgs[0][1], extra: msgs.slice(1) };
  const noName = ctrls.filter((x) => !x.name.v);
  const noRole = ctrls.filter((x) => !x.role);
  const noValue = ctrls.filter((x) => x.sliderNoValue);
  const m13 = [];
  if (noName.length) m13.push(['error', `${noName.length} contrôle${noName.length > 1 ? 's' : ''} sans nom accessible`]);
  if (noRole.length) m13.push(['error', `${noRole.length} contrôle${noRole.length > 1 ? 's' : ''} sans rôle (ex. <div> cliquable)`]);
  if (noValue.length) m13.push(['error', 'Curseur sans aria-valuenow ni aria-valuetext']);
  m13.push(['warning', 'À tester avec un lecteur d’écran : nom et état (lecture, pause, son coupé) restitués ?']);
  c['4.13'] = { status: worst(m13.map((x) => x[0])), text: m13[0][1], extra: m13.slice(1) };
  return c;
};

/* ---------- Affichage ---------- */

const TEMPORAL_CRIT = ['4.1', '4.3', '4.5', '4.7', '4.10', '4.11', '4.13'];
const NT_CRIT = ['4.8', '4.12', '4.13'];
const PILL_LABEL = { error: 'erreur', warning: 'à vérifier', ok: 'conforme', hidden: 'non concerné' };
const GLYPH = { error: '×', warning: '!', ok: '✓', hidden: '∅' };

const pills = (e) => {
  if (!e.crit || e.status === 'hidden') return '';
  return `<span class="pills">${(e.temporal ? TEMPORAL_CRIT : NT_CRIT)
    .filter((k) => e.crit[k])
    .map((k) => {
      const s = e.crit[k].status;
      return `<span class="pill pill--${s}"><span aria-hidden="true">${k} ${GLYPH[s]}</span><span class="sr-only">${k} ${PILL_LABEL[s]},</span></span>`;
    })
    .join('')}</span>`;
};

/** Libellé court d'un média pour la liste. */
const labelOf = (e) => {
  if (e.kind === 'link') return textOf(e.el) || shortUrl(e.url);
  const id = e.ident && e.ident.items.find((i) => !GENERIC.test(norm(i.t)));
  if (id) return id.t;
  return shortUrl(e.url) || e.type;
};

const fmtTime = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s` : '');

let entries = [];

const collect = () => {
  entries = findMedia().map(analyze);
  entries.forEach((e) => {
    if (e.kind === 'native' && !e.media.paused && !isMuted(e.media) && e.media.volume > 0) playedWithSound.add(e.media);
  });
  const order = (e) => -RANK[e.status];
  const sorted = [...entries].sort((a, b) => order(a) - order(b));
  const media = entries.filter((e) => e.kind !== 'link' && !e.hidden);
  const sound = media.filter((e) => e.crit['4.10'] && e.crit['4.10'].status !== 'ok').length;
  const noCtrl = media.filter((e) => ['4.11', '4.12', '4.13'].some((k) => e.crit[k] && e.crit[k].status === 'error')).length;
  const toCheck = media.filter((e) => e.status === 'warning').length;
  const links = entries.filter((e) => e.kind === 'link').length;
  const errSound = media.some((e) => e.crit['4.10'] && e.crit['4.10'].status === 'error');
  return {
    items: sorted.map((e) => ({
      el: e.el,
      status: e.status,
      label: e.hidden ? `${labelOf(e)} (masqué : ${e.hidden})` : labelOf(e),
      meta: e.type,
      prefix: pills(e),
      filter: e.kind === 'link' ? 'lien' : e.temporal ? 'temporel' : 'nontemporel',
    })),
    summary:
      `${media.length} média${media.length > 1 ? 's' : ''} · ` +
      `${sound ? icon(errSound ? 'error' : 'warning') + ' ' : ''}${sound} son${sound > 1 ? 's' : ''} automatique${sound > 1 ? 's' : ''} · ` +
      `${noCtrl ? icon('error') + ' ' : ''}${noCtrl} sans contrôle accessible · ` +
      `${toCheck ? icon('warning') + ' ' : ''}${toCheck} à vérifier` +
      (links ? ` · ${links} lien${links > 1 ? 's' : ''} vers un fichier média` : ''),
  };
};

/** Média qui contient l'élément survolé (y compris depuis une iframe de même origine). */
const findEntry = (target) => {
  for (let el = target; el; ) {
    const hit = entries.find((e) => e.el === el || e.media === el);
    if (hit) return hit;
    if (el.parentElement) el = el.parentElement;
    else if (el.getRootNode && el.getRootNode().host) el = el.getRootNode().host;
    else {
      const win = el.ownerDocument && el.ownerDocument.defaultView;
      try {
        el = win && win.frameElement;
      } catch (err) {
        el = null;
      }
    }
  }
  return null;
};

const critBlock = (num, r, more = '') =>
  `<div class="crit"><span class="crit-num">${num}</span><div class="crit-body">${flag(r.status, r.text)}` +
  `${(r.extra || []).map(([t, txt]) => `<div>${flag(t, txt)}</div>`).join('')}${more}</div></div>`;

const controlsTable = (ctrls) =>
  ctrls.length
    ? `<table class="ctrls"><thead><tr><th scope="col">Rôle</th><th scope="col">Nom</th><th scope="col">État</th><th scope="col">Clavier</th></tr></thead><tbody>${ctrls
        .map(
          (x) =>
            `<tr><td>${x.role ? esc(x.role) : flag('error', 'aucun')}</td>` +
            `<td>${x.name.v ? `${esc(x.name.v)} ${src(x.name.s)}` : flag('error', 'aucun')}</td>` +
            `<td>${x.state ? esc(x.state) : '<span class="muted">—</span>'}</td>` +
            `<td>${x.focusable ? flag('ok', 'oui') : flag('error', 'non')}</td></tr>`,
        )
        .join('')}</tbody></table>`
    : '';

const tracksHtml = (e) => {
  const tracks = e.tracks || [];
  if (!tracks.length) return '';
  const pageLang = (document.documentElement.lang || '').toLowerCase().split('-')[0];
  const items = tracks.map((t) => {
    const lang = (t.getAttribute('srclang') || '').toLowerCase();
    const bits = [`kind="${trackKind(t)}"${has(t, 'kind') ? '' : ' (par défaut)'}`, lang ? `srclang="${lang}"` : 'sans srclang', t.getAttribute('label') ? `« ${t.getAttribute('label')} »` : 'sans label'];
    let h = esc(bits.join(' · '));
    if (lang && pageLang && lang.split('-')[0] !== pageLang) h += ` ${flag('warning', `langue différente de la page (${pageLang})`)}`;
    const cues = cueCache.get(t);
    if (cues) {
      h += cues.error
        ? `<div>${flag('warning', 'Piste impossible à charger (fichier absent ou bloqué)')}</div>`
        : `<div class="small">${cues.n} ligne${cues.n > 1 ? 's' : ''}${cues.cues.length ? ' : ' : ''}${cues.cues.map((x) => `« ${esc(x)} »`).join(' ')}</div>`;
    }
    return h;
  });
  return `<div class="more">${list(items)}${tracks.some((t) => !cueCache.has(t)) ? '<button type="button" class="act" data-action="cues">Charger les sous-titres</button>' : ''}</div>`;
};

const identHtml = (e) =>
  e.ident && e.ident.items.length ? `<div class="more">${list(e.ident.items.map((i) => `${esc(i.t.length > 140 ? `${i.t.slice(0, 139)}…` : i.t)} ${src(i.s)}`))}</div>` : '';

/** Contenu du panneau de détail. */
const detail = (e) => {
  const m = e.media;
  let html = row('Type', esc(e.type));
  if (e.url || e.kind === 'native') html += row('Source', `<span class="muted">${esc(shortUrl(e.url) || 'aucune')}</span>`);
  if (e.kind === 'link') {
    html += row('Lien', esc(textOf(e.el) || '(sans texte)'));
    return html + `<p class="note">${flag('hidden', 'Pour information')} Si ce fichier fait partie du contenu, la thématique 4 s’applique à son contenu (transcription, sous-titres…).</p>`;
  }
  if (e.kind === 'native') {
    if (Number.isFinite(m.duration)) html += row('Durée', esc(fmtTime(m.duration)));
    const attrs = ['controls', 'autoplay', 'muted', 'loop'].filter((a) => has(m, a));
    html += row('Attributs', attrs.length ? esc(attrs.join(', ')) : '<span class="muted">aucun</span>');
    if (e.player) html += row('Lecteur', `personnalisé ${src(`<${tagOf(e.player)}${e.player.className && typeof e.player.className === 'string' ? ` class="${e.player.className}"` : ''}>`)}`);
  }
  if (e.params && e.params.shown.length) html += row('Paramètres', esc(e.params.shown.join(' · ')));
  if (e.hidden) return html + `<p class="note">${flag('hidden', `Masqué (${e.hidden}) : non concerné`)}</p>`;
  const c = e.crit;
  const keys = e.temporal ? TEMPORAL_CRIT : NT_CRIT;
  html += '<div class="crits">';
  keys.forEach((k) => {
    if (!c[k]) return;
    let more = '';
    if (k === '4.1' && c[k].action === 'transcript') more = '<button type="button" class="act" data-action="transcript">Aller à la transcription</button>';
    if (k === '4.3') more = tracksHtml(e);
    if (k === '4.7') more = identHtml(e);
    if ((k === '4.11' && e.controls && e.controls.length)) more = controlsTable(e.controls);
    html += critBlock(k, c[k], more);
  });
  html += '</div>';
  if (e.temporal) html += '<p class="note small muted">4.2, 4.4, 4.6 : pertinence de la transcription, des sous-titres et de l’audiodescription, à juger en consultant le média.</p>';
  return html;
};

/* ---------- Outils ---------- */

/** « Couper tous les médias » : pause et son coupé, état d'origine mémorisé. */
let mutedAll = false;
const onPlay = (ev) => {
  const m = ev.target;
  if (mutedAll && m && m.pause && !isOwn(m)) {
    if (!muteState.has(m)) muteState.set(m, { muted: m.muted });
    m.muted = true;
    m.pause();
  }
};
const setMuteAll = (on) => {
  mutedAll = on;
  const docs = allDocuments();
  if (on) {
    deepAll('video,audio').forEach((m) => {
      if (!muteState.has(m)) muteState.set(m, { muted: m.muted });
      if (!m.paused && !m.muted && m.volume > 0) playedWithSound.add(m);
      m.muted = true;
      m.pause();
    });
    docs.forEach((d) => d.addEventListener('play', onPlay, true));
  } else {
    muteState.forEach((s, m) => (m.muted = s.muted));
    muteState.clear();
    docs.forEach((d) => d.removeEventListener('play', onPlay, true));
  }
};

/** « Ordre de tabulation » : numérote les contrôles du lecteur choisi. */
let orderHost = null;
let orderItems = [];
const ORDER_CSS = `
:host{all:initial}
.b{position:fixed;z-index:${THEME.zIndex};pointer-events:none;font:700 12px/1 ${THEME.font};color:#fff;background:${THEME.color.focus};
  border:2px solid #fff;border-radius:10px;padding:2px 6px;box-shadow:0 1px 3px rgba(0,0,0,.5)}
.b--ko{background:${THEME.color.error}}
`;
const focusOrder = (els) => {
  const pos = els.filter((x) => x.tabIndex > 0).sort((a, b) => a.tabIndex - b.tabIndex);
  return [...pos, ...els.filter((x) => x.tabIndex === 0)];
};
const placeOrder = () => {
  if (!orderHost) return;
  orderItems.forEach(({ el, badge }) => {
    const r = el.getBoundingClientRect();
    const [x, y] = toTopCoords(el.ownerDocument.defaultView, r.left, r.top);
    badge.hidden = !el.isConnected || r.width === 0;
    badge.style.left = `${Math.max(0, x - 6)}px`;
    badge.style.top = `${Math.max(0, y - 10)}px`;
  });
};
const setOrder = (on, chosen) => {
  if (orderHost) {
    orderHost.remove();
    orderHost = null;
    orderItems = [];
    allDocuments().forEach((d) => d.removeEventListener('scroll', placeOrder, true));
    window.removeEventListener('resize', placeOrder);
  }
  if (!on) return;
  const targets = chosen ? [chosen] : entries.filter((e) => e.controls && e.controls.length || (e.kind === 'native' && e.media.controls));
  orderHost = document.createElement('div');
  orderHost.setAttribute('data-rgaa-bookmarklet', '');
  const root = orderHost.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${ORDER_CSS}</style>`;
  targets.forEach((e) => {
    const ctrls = e.controls && e.controls.length ? e.controls.map((x) => x.el) : e.kind === 'native' && e.media.controls ? [e.media] : [];
    const ok = focusOrder(ctrls.filter((x) => !x.disabled && x.tabIndex >= 0));
    const ko = ctrls.filter((x) => !ok.includes(x));
    ok.forEach((el, i) => orderItems.push({ el, text: String(i + 1), ko: false }));
    ko.forEach((el) => orderItems.push({ el, text: '× hors clavier', ko: true }));
  });
  orderItems.forEach((it) => {
    const b = document.createElement('span');
    b.className = `b${it.ko ? ' b--ko' : ''}`;
    b.textContent = it.text;
    root.appendChild(b);
    it.badge = b;
  });
  (document.body || document.documentElement).appendChild(orderHost);
  placeOrder();
  allDocuments().forEach((d) => d.addEventListener('scroll', placeOrder, true));
  window.addEventListener('resize', placeOrder);
};

/** Charge les lignes des pistes (mode « hidden » le temps de la lecture, puis mode d'origine). */
const loadCues = (t) =>
  new Promise((resolve) => {
    const tt = t.track;
    const prev = tt.mode;
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      const cues = !error && tt.cues ? [...tt.cues] : null;
      const res = cues ? { n: cues.length, cues: cues.slice(0, 3).map((c) => c.text.replace(/\s+/g, ' ').trim()) } : { error: true };
      if (prev === 'disabled') tt.mode = prev;
      cueCache.set(t, res);
      resolve();
    };
    if (prev === 'disabled') tt.mode = 'hidden';
    if (t.readyState === 2) return finish(false);
    if (t.readyState === 3) return finish(true);
    t.addEventListener('load', () => finish(false), { once: true });
    t.addEventListener('error', () => finish(true), { once: true });
    setTimeout(() => finish(!tt.cues || !tt.cues.length), 3000);
  });

/* ---------- Lancement ---------- */

const DETAIL_CSS = `
.crits{margin-top:8px;border-top:1px solid var(--rgaa-sep)}
.crit{display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--rgaa-sep)}
.crit-num{flex:0 0 2.6em;font-weight:700}
.crit-body{min-width:0;display:flex;flex-direction:column;gap:3px}
.more .list{margin-top:2px}
.act{align-self:flex-start;cursor:pointer;background:none;border:1px solid var(--rgaa-border);border-radius:3px;padding:2px 8px;margin-top:4px}
.ctrls{border-collapse:collapse;margin-top:4px;font-size:var(--rgaa-fs-sm);width:100%}
.ctrls th,.ctrls td{border:1px solid var(--rgaa-sep);padding:2px 4px;text-align:left;vertical-align:top}
.note{margin:8px 0 0}
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
const toggleOrder = () => setOrder(!orderHost, ui && ui.current() ? findEntry(ui.current()) : null);

const ui = inspector({
  id: ID,
  css: DETAIL_CSS,
  maxWidth: 480,
  pinOnLocate: true,
  list: {
    title: 'Médias',
    collect,
    filters: [
      { id: 'temporel', label: 'Temporels' },
      { id: 'nontemporel', label: 'Non temporels' },
      { id: 'lien', label: 'Liens' },
    ],
    tools: [
      { label: 'Couper tous les médias', pressed: () => mutedAll, toggle: () => setMuteAll(!mutedAll) },
      { label: 'Ordre de tabulation', pressed: () => !!orderHost, toggle: toggleOrder },
    ],
    footer:
      'Couper tous les médias (Maj+M) : pause et son coupé. Ordre de tabulation (Maj+T) : numérote les contrôles du média épinglé (ou de tous). ' +
      'Lecteurs tiers (YouTube…) : cliquer leur ligne, le survol ne traverse pas l’iframe.',
  },
  onKey(e) {
    if (!keyOk(e)) return false;
    const k = e.key.toLowerCase();
    if (k === 'm') setMuteAll(!mutedAll);
    else if (k === 't') toggleOrder();
    else return false;
    return true;
  },
  async onAction(name, target) {
    const e = findEntry(target);
    if (!e) return;
    if (name === 'cues') await Promise.all((e.tracks || []).map(loadCues));
    if (name === 'transcript' && e.transcript) {
      const t = e.transcript;
      t.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (typeof t.focus === 'function') t.focus({ preventScroll: true });
    }
  },
  onStop: () => {
    setMuteAll(false);
    setOrder(false);
  },
  inspect(target) {
    const e = findEntry(target);
    if (!e) return null;
    const hl = [[e.el, 'primary']];
    if (e.crit) Object.values(e.crit).forEach((r) => r.el && hl.push([r.el, 'secondary']));
    if (e.ident) e.ident.items.forEach((i) => i.el && hl.push([i.el, 'secondary']));
    if (e.alt && e.alt.el) hl.push([e.alt.el, 'secondary']);
    return { html: detail(e), highlight: hl };
  },
});

// Pastilles de la liste : ajoutées au Shadow DOM du panneau liste.
const listHost = document.getElementById(`${ID}-liste`);
if (listHost && listHost.shadowRoot) {
  const st = document.createElement('style');
  st.textContent = LIST_CSS;
  listHost.shadowRoot.appendChild(st);
}
