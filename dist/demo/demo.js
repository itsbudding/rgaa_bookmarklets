/**
 * Pages de démo : affiche sous chaque exemple (.case .demo) son code HTML,
 * pour comprendre le résultat du bookmarklet sans ouvrir l'inspecteur.
 *  - les attributs qui comptent pour les vérifications RGAA sont surlignés ;
 *  - le contenu d'un Shadow DOM ouvert est montré dans un <template shadowrootmode> ;
 *  - les règles CSS de la page qui visent une classe de l'exemple sont reprises.
 * Chargé avec defer : il s'exécute après les scripts de la page (Shadow DOM créé).
 */
(() => {
  const KEY = /^(alt|title|role|aria-.+|for|id|name|type|autocomplete|required|placeholder|longdesc|hidden|contenteditable|usemap|label|srcdoc|src|data|href|value|tabindex)$/;
  const VOID = new Set(['area', 'br', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'wbr']);
  const INDENT = '  ';
  const MAX = 90;

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escAttr = (s) => esc(s).replace(/"/g, '&quot;');
  /* Longueur du texte affiché (balises de coloration retirées). */
  const plainLen = (html) => html.replace(/<[^>]+>/g, '').replace(/&\w+;/g, ' ').length;

  const attrs = (el) =>
    [...el.attributes]
      .map((a) => {
        const html = `<span class="tok-attr">${esc(a.name)}</span>` + (a.value === '' && a.name !== 'alt' ? '' : `=<span class="tok-val">"${escAttr(a.value)}"</span>`);
        return ' ' + (KEY.test(a.name) ? `<mark>${html}</mark>` : html);
      })
      .join('');

  const open = (el) => `<span class="tok-tag">&lt;${el.localName}</span>${attrs(el)}<span class="tok-tag">&gt;</span>`;
  const close = (el) => `<span class="tok-tag">&lt;/${el.localName}&gt;</span>`;

  /** Enfants à afficher : éléments, textes non vides, et racine Shadow DOM. */
  const kids = (el) => {
    const out = [];
    if (el.shadowRoot) out.push({ shadow: el.shadowRoot });
    (el.localName === 'template' ? el.content : el).childNodes.forEach((n) => {
      if (n.nodeType === 1) out.push(n);
      else if (n.nodeType === 3 && n.textContent.trim()) out.push(n);
    });
    return out;
  };

  /** Rendu sur une ligne (ou null si trop long / imbriqué). */
  const inline = (n) => {
    if (n.nodeType === 3) return esc(n.textContent.replace(/\s+/g, ' ').trim());
    if (n.shadow) return null;
    if (VOID.has(n.localName)) return open(n);
    const parts = kids(n).map(inline);
    if (parts.includes(null)) return null;
    const html = open(n) + parts.join(' ') + close(n);
    return plainLen(html) <= MAX ? html : null;
  };

  /** Rendu indenté, une balise par ligne quand l'élément ne tient pas sur une ligne. */
  const block = (n, depth) => {
    const pad = INDENT.repeat(depth);
    if (n.shadow) {
      const inner = [...n.shadow.childNodes]
        .filter((c) => c.nodeType === 1 || (c.nodeType === 3 && c.textContent.trim()))
        .map((c) => block(c, depth + 1));
      return [
        `${pad}<span class="tok-tag">&lt;template</span> <mark><span class="tok-attr">shadowrootmode</span>=<span class="tok-val">"open"</span></mark><span class="tok-tag">&gt;</span>`,
        ...inner,
        `${pad}<span class="tok-tag">&lt;/template&gt;</span>`,
      ].join('\n');
    }
    const one = inline(n);
    if (one !== null) return pad + one;
    if (n.nodeType === 3) return pad + esc(n.textContent.replace(/\s+/g, ' ').trim());
    return [pad + open(n), ...kids(n).map((k) => block(k, depth + 1)), pad + close(n)].join('\n');
  };

  /** Règles des <style> de la page qui visent une classe présente dans l'exemple. */
  const cssFor = (demo) => {
    const classes = new Set([...demo.querySelectorAll('[class]')].flatMap((e) => [...e.classList]));
    const rules = [];
    document.querySelectorAll('head style').forEach((s) => {
      [...s.sheet.cssRules].forEach((r) => {
        if (r.selectorText && [...classes].some((c) => new RegExp(`\\.${c}(?![\\w-])`).test(r.selectorText))) rules.push(r.cssText);
      });
    });
    return rules;
  };

  document.querySelectorAll('.case .demo').forEach((demo) => {
    const lines = [];
    const css = cssFor(demo);
    if (css.length) {
      lines.push('<span class="tok-tag">&lt;style&gt;</span>', ...css.map((r) => INDENT + esc(r)), '<span class="tok-tag">&lt;/style&gt;</span>');
    }
    kids(demo).forEach((k) => lines.push(block(k, 0)));
    const details = document.createElement('details');
    details.className = 'code';
    details.open = true;
    details.innerHTML = `<summary>Code HTML</summary><pre><code>${lines.join('\n')}</code></pre>`;
    demo.closest(".case").append(details);
  });
})();
