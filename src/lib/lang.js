/**
 * Langues et alphabets (RGAA 8) : validité d'un code de langue, nom de la
 * langue, alphabet attendu, alphabets présents dans un texte, langue et sens
 * de lecture qui s'appliquent à un élément.
 *
 * Tout se lit dans le code : le code de langue (glossaire « Code de langue » :
 * 2 lettres ISO 639-1 ou 3 lettres ISO 639-2 et suivants, seule la partie
 * avant le tiret compte) et les caractères du texte (propriété Unicode
 * Script). Aucune reconnaissance de langue.
 */

/** Codes ISO 639-1 en vigueur. */
const ISO1 = new Set(
  ('aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu ' +
    'fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko ' +
    'kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi ' +
    'pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ' +
    'ur uz ve vi vo wa wo xh yi yo za zh zu').split(' '),
);
/** Codes ISO 639-1 retirés, et leur remplaçant. */
const RETIRED = { iw: 'he', in: 'id', ji: 'yi', jw: 'jv', mo: 'ro' };

let names = null;
/** Nom de la langue en français (« français (Canada) »), ou '' si le navigateur ne la connaît pas. */
export const langName = (code) => {
  try {
    names = names || new Intl.DisplayNames(['fr'], { type: 'language', fallback: 'none' });
    return names.of(code) || '';
  } catch (e) {
    return '';
  }
};

/**
 * Analyse un code de langue (valeur d'un attribut lang).
 * @returns {{ code, primary, status: 'ok'|'warning'|'error'|'empty', why, name }}
 *   status ok : code valide (sa pertinence reste à juger) ; error : invalide
 *   (fait lisible) ; warning : à vérifier ; empty : lang="" (langue inconnue).
 */
export const checkCode = (raw) => {
  const code = String(raw ?? '').trim();
  if (!code) return { code, primary: '', status: 'empty', why: 'lang vide : langue non précisée', name: '' };
  const primary = code.split('-')[0].toLowerCase();
  const res = (status, why) => ({ code, primary, status, why, name: status === 'error' ? '' : langName(code) || langName(primary) });
  if (/_/.test(code)) return res('error', `« ${code} » : séparateur _ au lieu du tiret (${code.replace(/_/g, '-')})`);
  if (!/^[a-z]+$/i.test(primary)) return res('error', `« ${code} » : la partie avant le tiret doit être faite de lettres`);
  if (primary.length < 2 || primary.length > 3) return res('error', `« ${code} » : code de ${primary.length} lettre${primary.length > 1 ? 's' : ''}, 2 ou 3 attendues (ISO 639)`);
  try {
    Intl.getCanonicalLocales(code);
  } catch (e) {
    return res('error', `« ${code} » : code mal formé (BCP 47)`);
  }
  if (primary.length === 2) {
    if (RETIRED[primary]) return res('warning', `« ${primary} » : code ISO 639-1 retiré, remplacé par « ${RETIRED[primary]} »`);
    if (!ISO1.has(primary)) return res('error', `« ${primary} » : code inconnu dans l’ISO 639-1`);
    return res('ok', '');
  }
  // 3 lettres : l'ISO 639-2/3 compte des milliers de codes, on s'appuie sur le navigateur.
  if (!langName(primary)) return res('warning', `« ${primary} » : code de 3 lettres inconnu du navigateur, vérifier qu’il existe (ISO 639-2 ou 639-3)`);
  return res('ok', '');
};

/* ---------- Alphabets ---------- */

/** [code ISO 15924, nom, expression] — Latin en premier (le plus fréquent). */
const SCRIPTS = [
  ['Latn', 'latin', /\p{Script=Latin}/u],
  ['Cyrl', 'cyrillique', /\p{Script=Cyrillic}/u],
  ['Grek', 'grec', /\p{Script=Greek}/u],
  ['Arab', 'arabe', /\p{Script=Arabic}/u],
  ['Hebr', 'hébreu', /\p{Script=Hebrew}/u],
  ['Hani', 'chinois (sinogrammes)', /\p{Script=Han}/u],
  ['Hira', 'japonais (hiragana)', /\p{Script=Hiragana}/u],
  ['Kana', 'japonais (katakana)', /\p{Script=Katakana}/u],
  ['Hang', 'coréen (hangeul)', /\p{Script=Hangul}/u],
  ['Deva', 'devanagari', /\p{Script=Devanagari}/u],
  ['Beng', 'bengali', /\p{Script=Bengali}/u],
  ['Guru', 'gurmukhi', /\p{Script=Gurmukhi}/u],
  ['Gujr', 'gujarati', /\p{Script=Gujarati}/u],
  ['Taml', 'tamoul', /\p{Script=Tamil}/u],
  ['Telu', 'télougou', /\p{Script=Telugu}/u],
  ['Knda', 'kannada', /\p{Script=Kannada}/u],
  ['Mlym', 'malayalam', /\p{Script=Malayalam}/u],
  ['Sinh', 'cingalais', /\p{Script=Sinhala}/u],
  ['Thai', 'thaï', /\p{Script=Thai}/u],
  ['Laoo', 'lao', /\p{Script=Lao}/u],
  ['Khmr', 'khmer', /\p{Script=Khmer}/u],
  ['Mymr', 'birman', /\p{Script=Myanmar}/u],
  ['Tibt', 'tibétain', /\p{Script=Tibetan}/u],
  ['Geor', 'géorgien', /\p{Script=Georgian}/u],
  ['Armn', 'arménien', /\p{Script=Armenian}/u],
  ['Ethi', 'éthiopien', /\p{Script=Ethiopic}/u],
  ['Syrc', 'syriaque', /\p{Script=Syriac}/u],
  ['Thaa', 'thaana', /\p{Script=Thaana}/u],
  ['Mong', 'mongol', /\p{Script=Mongolian}/u],
];
const NAME = Object.fromEntries(SCRIPTS.map(([c, n]) => [c, n]));
/** Alphabets qui s'écrivent de droite à gauche. */
export const RTL_SCRIPTS = new Set(['Arab', 'Hebr', 'Syrc', 'Thaa']);
const RTL_CHAR = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;
/** Écritures composées de plusieurs alphabets Unicode. */
const COMPOSED = { Jpan: ['Hani', 'Hira', 'Kana'], Kore: ['Hang', 'Hani'], Hans: ['Hani'], Hant: ['Hani'], Hanb: ['Hani'] };

export const scriptName = (c) => NAME[c] || c;

/** Nombre de lettres de chaque alphabet dans le texte : Map(code → n). */
export const scriptCounts = (text) => {
  const out = new Map();
  const letters = String(text || '').match(/\p{L}/gu);
  if (!letters) return out;
  letters.forEach((ch) => {
    const s = SCRIPTS.find(([, , re]) => re.test(ch));
    const k = s ? s[0] : 'Zyyy';
    out.set(k, (out.get(k) || 0) + 1);
  });
  return out;
};

/** Le texte contient-il des lettres d'un alphabet de droite à gauche ? */
export const hasRtl = (text) => RTL_CHAR.test(text);

/** Nombre de lettres de droite à gauche et des autres lettres. */
export const dirCounts = (text) => {
  const letters = String(text || '').match(/\p{L}/gu) || [];
  const rtl = letters.filter((ch) => RTL_CHAR.test(ch)).length;
  return { rtl, ltr: letters.length - rtl };
};

/** Alphabets attendus pour une langue (Set de codes ISO 15924), ou null si inconnus. */
export const expectedScripts = (code) => {
  try {
    const s = new Intl.Locale(code).maximize().script;
    if (!s) return null;
    return new Set(COMPOSED[s] || [s]);
  } catch (e) {
    return null;
  }
};

/** Alphabet majoritaire d'un texte (au moins 60 % de ses lettres et 20 lettres), ou ''. */
export const mainScript = (text) => {
  const c = scriptCounts(text);
  const total = [...c.values()].reduce((a, b) => a + b, 0);
  if (total < 20) return '';
  const [k, n] = [...c.entries()].sort((a, b) => b[1] - a[1])[0];
  return n / total >= 0.6 ? k : '';
};

/* ---------- Attributs lang et dir hérités ---------- */

const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const up = (e) => e.parentElement || (e.parentNode && e.parentNode.host) || null;

/** Valeur de lang (sinon xml:lang) portée par l'élément lui-même, ou null. */
export const ownLang = (e) => {
  if (e.hasAttribute('lang')) return e.getAttribute('lang');
  if (e.hasAttribute('xml:lang')) return e.getAttribute('xml:lang');
  if (e.hasAttributeNS && e.hasAttributeNS(XML_NS, 'lang')) return e.getAttributeNS(XML_NS, 'lang');
  return null;
};

/** Langue qui s'applique à l'élément : { value, el } du plus proche parent qui la porte (Shadow DOM compris), ou null. */
export const langOf = (el) => {
  for (let e = el; e; e = up(e)) {
    const v = ownLang(e);
    if (v !== null) return { value: v.trim(), el: e };
  }
  return null;
};

/** Plus proche parent (Shadow DOM compris) qui porte un attribut dir, ou null. */
export const dirOf = (el) => {
  for (let e = el; e; e = up(e)) if (e.hasAttribute('dir')) return { value: e.getAttribute('dir').trim().toLowerCase(), el: e };
  return null;
};
