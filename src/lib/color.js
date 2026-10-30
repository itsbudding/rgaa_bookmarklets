/**
 * Couleurs : lecture des valeurs CSS calculées, mélange (transparence) et
 * ratio de contraste WCAG utilisé par le RGAA.
 * Une couleur est un objet { r, g, b, a } : r, g, b de 0 à 255, a de 0 à 1.
 */

export const TRANSPARENT = { r: 0, g: 0, b: 0, a: 0 };
export const WHITE = { r: 255, g: 255, b: 255, a: 1 };

const cache = new Map();
let ctx = null;

/** Couleur CSS calculée → { r, g, b, a }, ou null si illisible. */
export const parseColor = (s) => {
  s = String(s || '').trim();
  if (!s || s === 'none') return null;
  if (cache.has(s)) return cache.get(s);
  let c = null;
  let m = /^rgba?\(([^)]*)\)$/i.exec(s);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean);
    const n = (v, max) => (v.endsWith('%') ? (parseFloat(v) / 100) * max : parseFloat(v));
    c = { r: n(p[0], 255), g: n(p[1], 255), b: n(p[2], 255), a: p[3] === undefined ? 1 : n(p[3], 1) };
  } else if ((m = /^color\(srgb\s+([^)]*)\)$/i.exec(s))) {
    const p = m[1].split(/[\s/]+/).filter(Boolean).map(parseFloat);
    c = { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p[3] === undefined ? 1 : p[3] };
  } else {
    // Autres espaces (oklch, lab...) : le navigateur fait la conversion.
    try {
      if (!ctx) {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 1;
        ctx = cv.getContext('2d', { willReadFrequently: true });
      }
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fillStyle = s;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      c = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    } catch (e) {
      c = null;
    }
  }
  if (c && [c.r, c.g, c.b, c.a].some((v) => Number.isNaN(v))) c = null;
  cache.set(s, c);
  return c;
};

/** Couleurs contenues dans une valeur CSS (arrêts d'un dégradé, ombres...). */
export const colorsIn = (s) =>
  (String(s || '').match(/(?:rgba?|color|oklch|oklab|lab|lch|hwb|hsla?)\([^()]*\)/gi) || []).map(parseColor).filter(Boolean);

/** Même couleur avec une opacité multipliée par k. */
export const fade = (c, k) => ({ ...c, a: c.a * k });

/** Composition « source par-dessus destination » (alpha non prémultiplié). */
export const over = (s, d) => {
  const a = s.a + d.a * (1 - s.a);
  if (a <= 0) return { ...TRANSPARENT };
  const mix = (x, y) => (x * s.a + y * d.a * (1 - s.a)) / a;
  return { r: mix(s.r, d.r), g: mix(s.g, d.g), b: mix(s.b, d.b), a };
};

const lin = (v) => {
  v /= 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** Luminance relative (WCAG). */
export const luminance = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);

/** Ratio de contraste entre deux couleurs opaques, tronqué au centième. */
export const ratio = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.floor(((l1 + 0.05) / (l2 + 0.05)) * 100 + 1e-9) / 100;
};

/** « 4,48:1 » (le ratio est tronqué, jamais arrondi au-dessus). */
export const fmtRatio = (r) => `${r.toFixed(2).replace('.', ',')}:1`;

/** #rrggbb (l'opacité n'est pas incluse). */
export const hex = (c) =>
  '#' + [c.r, c.g, c.b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/** Texte d'une couleur pour le panneau : « #767676 » ou « #000000 à 60 % ». */
export const label = (c) => (c.a < 1 ? `${hex(c)} à ${Math.round(c.a * 100)} %` : hex(c));
