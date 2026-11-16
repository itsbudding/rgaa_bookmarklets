/**
 * Démo RGAA 8 – Page : chaque exemple .demo-doc contient le code source d'un
 * document entier (doctype, html, head…) dans un <script type="text/plain">.
 * Il est écrit dans une iframe de même origine (document.write), pour que le
 * bookmarklet le lise comme une page à part (doctype, langue par défaut), et
 * son code est affiché sous l'exemple.
 */
(() => {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  document.querySelectorAll('.case .demo-doc').forEach((demo) => {
    const source = demo.querySelector('script[type="text/plain"]').textContent.replace(/^\n/, '').replace(/\s+$/, '');
    const title = demo.closest('.case').querySelector('h3').lastChild.textContent.trim();
    const f = document.createElement('iframe');
    f.title = `Exemple : ${title}`;
    demo.replaceChildren(f);
    const d = f.contentDocument;
    d.open();
    d.write(source);
    d.close();
    const details = document.createElement('details');
    details.className = 'code';
    details.open = true;
    details.innerHTML = `<summary>Code source du document</summary><pre><code>${esc(source)}</code></pre>`;
    demo.closest('.case').append(details);
  });
})();
