/**
 * Mise en évidence d'éléments de la page par un contour, en restaurant
 * exactement les styles inline d'origine.
 */
import { THEME } from './theme.js';

const STYLES = {
  primary: { outline: `3px solid ${THEME.color.focus}`, offset: '2px' },
  secondary: { outline: `2px dashed ${THEME.color.highlight}`, offset: '2px' },
  locate: { outline: `5px solid ${THEME.color.highlight}`, offset: '4px' },
};

export const createHighlighter = () => {
  const saved = new Map();
  const clear = () => {
    saved.forEach((s, el) => {
      el.style.setProperty('outline', s.o, s.op);
      el.style.setProperty('outline-offset', s.f, s.fp);
    });
    saved.clear();
  };
  /** @param {Array<[Element, 'primary'|'secondary'|'locate']>} items */
  const set = (items = []) => {
    clear();
    items.forEach(([el, kind]) => {
      if (!el || saved.has(el)) return;
      const st = el.style;
      saved.set(el, {
        o: st.getPropertyValue('outline'),
        op: st.getPropertyPriority('outline'),
        f: st.getPropertyValue('outline-offset'),
        fp: st.getPropertyPriority('outline-offset'),
      });
      st.setProperty('outline', STYLES[kind].outline, 'important');
      st.setProperty('outline-offset', STYLES[kind].offset, 'important');
    });
  };
  return { set, clear };
};
