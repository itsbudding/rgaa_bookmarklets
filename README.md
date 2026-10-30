# Bookmarklets RGAA

Trois bookmarklets pour aider à auditer une page web selon le
[RGAA 4.1](https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/).
Ils s'installent comme des favoris et fonctionnent sur n'importe quelle page,
sans extension ni compte.

Ce sont des **aides à l'audit**, pas des outils de test automatique : ils
rendent visibles les informations utiles (nom accessible, titre, étiquette…)
et signalent les problèmes probables. La pertinence d'une alternative ou d'un
intitulé reste à juger par l'auditeur.

| Bookmarklet | Thématique RGAA | Utilisation |
| --- | --- | --- |
| **RGAA 1 – Images** | 1. Images | Survoler une image (ou lui donner le focus au clavier) |
| **RGAA 2 – Cadres** | 2. Cadres | Liste de tous les cadres de la page |
| **RGAA 11 – Formulaires** | 11. Formulaires | Survoler un champ, un bouton, un groupe ou un label |

## Installation

1. Téléchargez le dépôt (bouton **Code › Download ZIP** sur GitHub) et décompressez-le.
2. Ouvrez `dist/index.html` dans votre navigateur.
3. Glissez chacun des trois liens dans votre barre de favoris.

Autre méthode : créez un favori et collez comme adresse le contenu d'un des
fichiers `dist/rgaa-1-images.js`, `dist/rgaa-2-cadres.js` ou
`dist/rgaa-11-formulaires.js`.

## Utilisation

- **Lancer** : ouvrez la page à auditer, puis cliquez sur le favori.
- **Arrêter** : cliquez une seconde fois sur le favori, ou appuyez sur **Échap**.
- Les trois bookmarklets sont indépendants et peuvent tourner en même temps.
- Ils inspectent aussi le contenu des Shadow DOM ouverts et des iframes de
  même origine. Une iframe chargée après le lancement n'est prise en compte
  qu'en relançant le bookmarklet.
- Ils ne modifient pas la page, à part des contours temporaires autour des
  éléments inspectés.

### Lire le panneau

| Icône | Signification |
| --- | --- |
| ✓ vert | Conforme, ou image décorative correctement balisée |
| ! orange | À vérifier par l'auditeur |
| × rouge | Erreur probable |
| ∅ gris | Élément masqué, non restitué (non concerné) |

Chaque valeur est suivie de sa source en italique, par exemple `(alt)`,
`(aria-label)` ou `(label)`, pour savoir d'où vient le nom accessible.

Sur la page, l'élément inspecté est entouré d'un **trait bleu continu**, et
les éléments liés (label, description, élément survolé) d'un **trait orange
pointillé**.

### RGAA 1 – Images

Au survol d'une image (`img`, `svg`, `canvas`, `object`, `embed`, `area`,
`input type="image"`, `role="img"`, image CSS), le panneau affiche :

- en tête, le compteur de la page : images, sans alternative, à vérifier, décoratives ;
- le **statut** : décorative (`alt=""`, `aria-hidden`, `role="presentation"`) ou le **nom accessible** ;
- le **fichier** source, pour juger la pertinence de l'alternative ;
- la **description détaillée** (`aria-describedby`, lien adjacent, `longdesc`) ;
- la **légende** (`figure` / `figcaption`) ;
- si l'image est dans un lien, le **nom accessible du lien**.

Constats signalés : image décorative avec `title` ou `aria-label` (1.2),
SVG sans `role="img"` (1.1.5), alternative qui reprend le nom du fichier,
générique ou trop longue (1.3), `longdesc` obsolète (1.6), `figure` sans
`role` ni `aria-label` (1.9).

**Maj+I** estompe toutes les images de la page : un texte qui disparaît est
une image texte (critère 1.8).

### RGAA 2 – Cadres

Un panneau en haut à droite liste les `iframe` et `frame` de la page, avec :

- le compteur : cadres restitués, sans titre, non concernés ;
- pour chaque cadre, son **titre**, son **domaine** et son niveau d'imbrication ;
- les cadres masqués, marqués « non concernés » par le critère 2.1 ;
- les titres génériques ou identiques à un autre cadre (2.2).

Un clic sur une ligne fait défiler jusqu'au cadre et l'entoure 3 secondes.
Le panneau se déplace à la souris ou au clavier (flèches sur l'en-tête).

### RGAA 11 – Formulaires

Au survol d'un champ (natif, ARIA ou `contenteditable`), d'un bouton, d'un
groupe, d'un label ou d'un texte d'aide, le panneau affiche :

- en tête, le compteur de la page : champs, sans étiquette, placeholder seul, autocomplete invalide ;
- le **nom accessible** (ou la légende d'un groupe, l'intitulé d'un bouton) ;
- la **description**, le **type**, le caractère **obligatoire** et **invalide** ;
- le **groupe** du champ et les **groupes d'options** d'une liste ;
- l'attribut **autocomplete**, avec la validité de sa valeur.

Constats signalés : placeholder utilisé comme seule étiquette (11.1), label
masqué, `aria-labelledby` vers un id absent, nom accessible qui ne contient
pas l'intitulé visible (11.2.5, 11.9.2), cases ou boutons radio non groupés
(11.5), `optgroup` sans label (11.8), indication visuelle d'obligation à
vérifier (11.10), `autocomplete` absent ou invalide (11.13).

## Développement

### Structure

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

### Base commune

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

### Template « panneau flottant »

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

### Template « panneau fixe »

Pour les bookmarklets qui listent des éléments (comme 2) :

```js
import { dialog } from '../lib/dialog-panel.js';

const dlg = dialog({ id: 'rgaa-x-liste', title: 'Éléments trouvés : 3' });
if (dlg) dlg.body.innerHTML = '<ul class="items">…</ul>';
```

Boîte de dialogue non modale, déplaçable à la souris ou au clavier (flèches
sur l'en-tête), focus placé sur « Fermer » à l'ouverture et rendu à la
fermeture, Échap pour fermer.
