/**
 * Socle commun aux panneaux : un hôte isolé par Shadow DOM (les styles de la
 * page ne s'appliquent pas au panneau, et inversement) et un registre global
 * qui permet de désactiver un bookmarklet en cliquant une seconde fois dessus.
 */
import { BASE_CSS } from './theme.js';

const REGISTRY = (window.__rgaaBookmarklets = window.__rgaaBookmarklets || {});

/**
 * Si le bookmarklet `id` tourne déjà, l'arrête et renvoie true.
 * À appeler en tout début de bookmarklet : `if (toggleOff(ID)) return;`
 */
export const toggleOff = (id) => {
  if (!REGISTRY[id]) return false;
  REGISTRY[id]();
  return true;
};

/** Enregistre la fonction d'arrêt d'un bookmarklet. */
export const register = (id, destroy) => {
  REGISTRY[id] = () => {
    delete REGISTRY[id];
    destroy();
  };
  return REGISTRY[id];
};

/**
 * Crée l'hôte Shadow DOM et le conteneur .panel.
 * @param {string} id identifiant de l'hôte
 * @param {string} [css] CSS spécifique au bookmarklet
 * @returns {{host: HTMLElement, root: ShadowRoot, panel: HTMLElement}}
 */
export const mount = (id, css = '') => {
  document.getElementById(id)?.remove();
  const host = document.createElement('div');
  host.id = id;
  host.setAttribute('data-rgaa-bookmarklet', '');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${BASE_CSS}${css}</style><div class="panel"></div>`;
  (document.body || document.documentElement).appendChild(host);
  return { host, root, panel: root.querySelector('.panel') };
};

/** Vrai si l'élément appartient à l'un de nos panneaux. */
export const isOwn = (el) => !!el?.closest?.('[data-rgaa-bookmarklet]');
