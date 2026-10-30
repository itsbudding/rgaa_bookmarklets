# Bookmarklets RGAA

Collection de bookmarklets pour aider à vérifier les critères du
[RGAA](https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/) sur une page web.

| Bookmarklet | Thématique | Type de panneau | Ce qu'il vérifie |
| --- | --- | --- | --- |
| `rgaa-1-images` | 1. Images | flottant (survol / focus) | nom accessible, images décoratives (1.2), `role="img"` des SVG, contenu de repli d'`object`/`canvas`, alternative suspecte (1.3), description (1.6), légende `figure` (1.9), images CSS, nom du lien. Maj+I estompe les images pour repérer les images texte (1.8). |
| `rgaa-2-cadres` | 2. Cadres | fixe (liste) | `iframe` et `frame`, titre (2.1), titre générique ou en double (2.2), domaine, cadres masqués non concernés, cadres imbriqués. |
| `rgaa-11-formulaires` | 11. Formulaires | flottant (survol / focus) | champs natifs, ARIA et `contenteditable`, nom accessible, placeholder seul, intitulé visible contenu dans le nom (11.2.5, 11.9.2), regroupement (11.5), `optgroup` (11.8), obligatoire et invalide (11.10), validité d'`autocomplete` (11.13). |

Les bookmarklets à panneau flottant affichent en tête un compteur pour toute
la page. Tous parcourent aussi les Shadow DOM ouverts et les iframes de même
origine.

## Installation

Ouvrez `dist/index.html` dans le navigateur et glissez les liens dans la barre
de favoris, ou copiez le contenu d'un fichier `dist/*.js` dans l'URL d'un favori.

Un second clic sur le bookmarklet (ou la touche Échap) le désactive.

## Structure

```
src/
  lib/                  base commune
    theme.js            tokens (police, tailles, couleurs) + CSS de base
    dom.js              rendu : esc(), icon(), row(), value(), list(), src(),
                        flag(), checks()
    a11y.js             helpers : idrefs(), textOf(), norm(), isNotExposed(),
                        deepAll() (Shadow DOM + iframes), allDocuments()
    panel.js            hôte Shadow DOM + activation/désactivation
    highlight.js        contours sur la page, styles d'origine restaurés
    floating-panel.js   TEMPLATE panneau flottant  → inspector()
    dialog-panel.js     TEMPLATE panneau fixe      → dialog()
  bookmarklets/         un fichier par bookmarklet
dist/                   versions installables générées (ne pas modifier à la main)
```

```sh
npm install
npm run build   # génère dist/
npm test        # test de fumée (nécessite Playwright)
```

## Base commune

Tous les panneaux sont rendus dans un **Shadow DOM** : les styles de la page
auditée ne s'appliquent pas au panneau (plus besoin de `all:revert` et de
`!important` partout), et le panneau n'ajoute aucun style à la page.

`theme.js` définit les valeurs partagées :

- police `system-ui`, taille **13px** (11px pour les sources et légendes), interligne 1.4 ;
- couleurs de texte contrastées (≥ 4.5:1 sur blanc), dont `error` `#c40000`
  (le `#f00` d'origine n'atteint que 4:1) ;
- classes utilitaires : `.row`, `.label`, `.value`, `.src`, `.list`, `.muted`,
  `.text-error`, `.small`, `.sr-only`, `.legend`.

Icônes de statut (pictogramme masqué aux lecteurs d'écran + texte invisible) :

```js
icon('error')             // × rouge   « Erreur »
icon('error', 'Absent')   // libellé personnalisé
icon('warning')           // !          « Attention »
icon('ok')                // ✓ vert     « Conforme »
icon('hidden')            // ∅ gris     « Masqué »
```

Tout texte provenant de la page doit passer par `esc()` (ou `value()`, qui
échappe déjà) avant d'être injecté dans le panneau.

## Template « panneau flottant »

Pour les bookmarklets d'inspection au survol (comme 1 et 11) :

```js
import { inspector } from '../lib/floating-panel.js';
import { row, value } from '../lib/dom.js';

inspector({
  id: 'rgaa-x-exemple',
  summary: () => '<strong>Page :</strong> 12 liens', // compteur optionnel, en tête
  inspect(target) {                 // élément survolé ou focalisé
    const el = target.closest('a');
    if (!el) return null;           // null : panneau masqué
    return {
      html: row('Nom accessible', value({ v: [el.textContent], s: 'contenu' })),
      highlight: [[el, 'primary']], // 'primary' | 'secondary' | 'locate'
    };
  },
});
```

`summary()` (optionnel) affiche un compteur de page en tête du panneau,
recalculé au plus une fois par seconde. Le template gère aussi : suivi de la souris, inspection au focus clavier (le panneau
se place sous l'élément), repositionnement dans la fenêtre, masquage au
défilement, contours sur la page, arrêt par Échap ou second clic.

## Template « panneau fixe »

Pour les bookmarklets qui listent des éléments (comme 2) :

```js
import { dialog } from '../lib/dialog-panel.js';

const dlg = dialog({ id: 'rgaa-x-liste', title: 'Éléments trouvés : 3' });
if (dlg) dlg.body.innerHTML = '<ul class="items">…</ul>';
```

Boîte de dialogue non modale, déplaçable à la souris ou au clavier (flèches
sur l'en-tête), focus placé sur « Fermer » à l'ouverture et rendu à la
fermeture, Échap pour fermer.
