/**
 * Démo RGAA 9 – Titres : chaque exemple (.case .demo) est placé dans une
 * iframe srcdoc, pour que ses titres forment leur propre plan et ne se mêlent
 * pas à ceux de la page de démo. Chargé avec defer après demo.js, qui a déjà
 * affiché le code HTML de l'exemple.
 */
(() => {
  const css = (document.getElementById('styles-cas') || { textContent: '' }).textContent;
  const base =
    'body{margin:.5rem;font:16px/1.4 system-ui,sans-serif;color:#1a1a1a;background:#fff}' +
    '.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}' +
    'h1,h2,h3,h4,h5,h6,p,ul{margin:.3rem 0}';
  document.querySelectorAll('.case .demo').forEach((demo) => {
    const title = demo.closest('.case').querySelector('h3').lastChild.textContent.trim();
    const f = document.createElement('iframe');
    f.title = `Exemple : ${title}`;
    f.srcdoc = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${base}${css}</style></head><body>${demo.innerHTML}</body></html>`;
    f.addEventListener('load', () => {
      const d = f.contentDocument;
      if (d && d.body) f.style.height = `${Math.min(d.documentElement.scrollHeight + 4, 420)}px`;
    });
    demo.replaceChildren(f);
  });
})();
