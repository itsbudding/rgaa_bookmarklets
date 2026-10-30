/**
 * Base commune à tous les bookmarklets : tokens de style (police, tailles,
 * couleurs) et feuille de style injectée dans le Shadow DOM de chaque panneau.
 *
 * Les couleurs de texte respectent un contraste d'au moins 4.5:1 sur fond blanc
 * (critère RGAA 3.2), et les couleurs d'icônes au moins 3:1 (critère 3.3).
 */
export const THEME = {
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  fontSize: '13px',
  fontSizeSmall: '11px',
  lineHeight: '1.4',
  radius: '4px',
  zIndex: '2147483647',
  color: {
    text: '#1a1a1a',
    bg: '#ffffff',
    border: '#333333',
    separator: '#e5e5e5',
    muted: '#595959', // 7:1 sur blanc
    error: '#c40000', // 6.4:1 sur blanc
    warning: '#8a5300', // 6.2:1 sur blanc
    ok: '#1e7b34', // 5.4:1 sur blanc
    focus: '#005a9c', // contour de l'élément inspecté
    highlight: '#e65100', // contour d'un élément lié (label, description...)
  },
};

const c = THEME.color;

export const BASE_CSS = `
:host{all:initial}
.panel{
  --rgaa-font:${THEME.font};
  --rgaa-fs:${THEME.fontSize};
  --rgaa-fs-sm:${THEME.fontSizeSmall};
  --rgaa-text:${c.text};
  --rgaa-bg:${c.bg};
  --rgaa-border:${c.border};
  --rgaa-sep:${c.separator};
  --rgaa-muted:${c.muted};
  --rgaa-error:${c.error};
  --rgaa-warning:${c.warning};
  --rgaa-ok:${c.ok};
  --rgaa-focus:${c.focus};
  position:fixed;z-index:${THEME.zIndex};
  box-sizing:border-box;
  font:400 var(--rgaa-fs)/${THEME.lineHeight} var(--rgaa-font);
  color:var(--rgaa-text);background:var(--rgaa-bg);
  border:2px solid var(--rgaa-border);border-radius:${THEME.radius};
  box-shadow:0 4px 12px rgba(0,0,0,.35);
  padding:12px;text-align:left;letter-spacing:normal;word-spacing:normal;
  overflow-wrap:anywhere;
}
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
.title{margin:0;font-size:var(--rgaa-fs);font-weight:700}
.row{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;margin:0 0 6px}
.row:last-child{margin-bottom:0}
.label{font-weight:700;flex-shrink:0}
.value{display:inline-flex;flex-wrap:wrap;align-items:baseline;gap:4px;min-width:0}
.src{color:var(--rgaa-muted);font-size:var(--rgaa-fs-sm);font-style:italic;white-space:nowrap}
.list{width:100%;margin:4px 0 4px 20px;padding:0;list-style:disc}
.muted{color:var(--rgaa-muted)}
.text-error{color:var(--rgaa-error);font-style:italic}
.small{font-size:var(--rgaa-fs-sm)}
.icon{
  display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;
  width:14px;height:14px;border-radius:50%;
  font:700 9px/1 var(--rgaa-font);color:#fff;vertical-align:middle;
}
.icon--error{background:var(--rgaa-error)}
.icon--warning{background:var(--rgaa-warning)}
.icon--ok{background:var(--rgaa-ok)}
.icon--hidden{background:var(--rgaa-muted);border-radius:2px}
.legend{display:flex;flex-wrap:wrap;gap:12px;margin:0;padding:0;list-style:none}
.legend li{display:inline-flex;align-items:center;gap:4px}
.sr-only{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
button{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--rgaa-focus);outline-offset:2px}
`;
