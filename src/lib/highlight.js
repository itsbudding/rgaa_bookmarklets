/**
 * Mise en évidence d'éléments de la page par un contour, en restaurant
 * exactement les styles inline d'origine.
 *
 * Plusieurs surligneurs peuvent viser le même élément (panneau flottant et
 * panneau liste) : le style d'origine est mémorisé une seule fois, et restauré
 * quand plus aucun surligneur ne vise l'élément.
 */
import { THEME } from './theme.js';

const STYLES = {
  primary: { outline: `3px solid ${THEME.color.focus}`, offset: '2px' },
  secondary: { outline: `2px dashed ${THEME.color.highlight}`, offset: '2px' },
  locate: { outline: `5px solid ${THEME.color.highlight}`, offset: '4px' },
};

/** el → { orig, layers: Map(surligneur → type) } */
const STATE = (window.__rgaaHighlight = window.__rgaaHighlight || new Map());

const apply = (el) => {
  const s = STATE.get(el);
  const st = el.style;
  if (!s.layers.size) {
    st.setProperty('outline', s.orig.o, s.orig.op);
    st.setProperty('outline-offset', s.orig.f, s.orig.fp);
    STATE.delete(el);
    return;
  }
  const kind = [...s.layers.values()].pop();
  st.setProperty('outline', STYLES[kind].outline, 'important');
  st.setProperty('outline-offset', STYLES[kind].offset, 'important');
};

export const createHighlighter = () => {
  const owner = {};
  const mine = new Set();

  const clear = () => {
    mine.forEach((el) => {
      const s = STATE.get(el);
      if (!s) return;
      s.layers.delete(owner);
      apply(el);
    });
    mine.clear();
  };

  /** @param {Array<[Element, 'primary'|'secondary'|'locate']>} items */
  const set = (items = []) => {
    clear();
    items.forEach(([el, kind]) => {
      if (!el || mine.has(el)) return;
      if (!STATE.has(el)) {
        const st = el.style;
        STATE.set(el, {
          orig: {
            o: st.getPropertyValue('outline'),
            op: st.getPropertyPriority('outline'),
            f: st.getPropertyValue('outline-offset'),
            fp: st.getPropertyPriority('outline-offset'),
          },
          layers: new Map(),
        });
      }
      STATE.get(el).layers.set(owner, kind);
      mine.add(el);
      apply(el);
    });
  };

  return { set, clear };
};

/**
 * Exécute fn() pendant que le contour posé par les surligneurs sur el est
 * retiré, pour lire le vrai contour de l'élément (indicateur de focus).
 */
export const withoutHighlight = (el, fn) => {
  const s = STATE.get(el);
  if (!s) return fn();
  const st = el.style;
  const cur = [st.getPropertyValue('outline'), st.getPropertyPriority('outline'), st.getPropertyValue('outline-offset'), st.getPropertyPriority('outline-offset')];
  st.setProperty('outline', s.orig.o, s.orig.op);
  st.setProperty('outline-offset', s.orig.f, s.orig.fp);
  try {
    return fn();
  } finally {
    st.setProperty('outline', cur[0], cur[1]);
    st.setProperty('outline-offset', cur[2], cur[3]);
  }
};
