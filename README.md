# Bookmarklets RGAA

Huit bookmarklets pour aider à auditer une page web selon le
[RGAA 4.1](https://accessibilite.numerique.gouv.fr/methode/criteres-et-tests/).
Ils s'installent comme des favoris et fonctionnent sur n'importe quelle page,
sans extension ni compte.

Ce sont des **aides à l'audit**, pas des outils de test automatique : ils
rendent visibles les informations utiles (nom accessible, titre, étiquette…)
et signalent les problèmes probables. La pertinence d'une alternative ou d'un
intitulé reste à juger par l'auditeur.

| Bookmarklet | Thématique RGAA | Utilisation |
| --- | --- | --- |
| **RGAA 1 – Images** | 1. Images | Liste des images + détail au survol (ou au focus clavier) |
| **RGAA 2 – Cadres** | 2. Cadres | Liste de tous les cadres de la page |
| **RGAA 3 – Couleurs** | 3. Couleurs | Contrastes des textes, composants et icônes + détail au survol (ou au focus) |
| **RGAA 4 – Multimédia** | 4. Multimédia | Inventaire des médias, une pastille par critère + détail au survol ou épinglé |
| **RGAA 5 – Tableaux** | 5. Tableaux | Liste des tableaux, type choisi par l'auditeur, une pastille par critère + en-têtes de chaque cellule au survol |
| **RGAA 6 – Liens** | 6. Liens | Liste des liens et de leur intitulé, intitulés vagues à juger avec leur contexte, une pastille par critère |
| **RGAA 7 – Composants ARIA** | 7. Scripts | Code ARIA des composants (rôle, états, structure, nom, focus) et zones de messages, une pastille par critère + annonces des messages |
| **RGAA 11 – Formulaires** | 11. Formulaires | Liste des champs et boutons + détail au survol (ou au focus) |

## Installation

1. Téléchargez le dépôt (bouton **Code › Download ZIP** sur GitHub) et décompressez-le.
2. Ouvrez `dist/index.html` dans votre navigateur.
3. Glissez chacun des huit liens dans votre barre de favoris.

Autre méthode : créez un favori et collez comme adresse le contenu d'un des
fichiers `dist/rgaa-1-images.js`, `dist/rgaa-2-cadres.js`, `dist/rgaa-3-couleurs.js`,
`dist/rgaa-4-multimedia.js`, `dist/rgaa-5-tableaux.js`, `dist/rgaa-6-liens.js`, `dist/rgaa-7-composants.js` ou
`dist/rgaa-11-formulaires.js`.

### Pages de démo

Pour essayer les bookmarklets sans chercher une page à auditer, ouvrez
`dist/demo/index.html` (lien aussi depuis `dist/index.html`). Il y a une page
par bookmarklet, avec des cas conformes et non conformes regroupés par
critère RGAA. Chaque cas indique le verdict attendu (badge) et ce que doit
afficher le panneau. Un bouton « Lancer » en haut de chaque page exécute le
bookmarklet sans l'installer.

## Utilisation

- **Lancer** : ouvrez la page à auditer, puis cliquez sur le favori.
- **Arrêter** : cliquez une seconde fois sur le favori, ou appuyez sur **Échap**.
- Les huit bookmarklets sont indépendants et peuvent tourner en même temps.
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

### Deux panneaux : l'aperçu et le détail

Les bookmarklets 1, 3, 4, 5, 6 et 11 ouvrent deux panneaux :

- **le panneau liste**, en haut à droite : le compteur de la page et la liste
  des éléments concernés, avec un statut et un libellé court. Un clic sur une
  ligne fait défiler jusqu'à l'élément et l'entoure ; un champ de formulaire
  reçoit aussi le focus, ce qui ouvre son détail. Le bouton « Actualiser »
  recalcule la liste après un changement de la page. Ce panneau se déplace
  et se ferme indépendamment ;
- **le panneau de détail**, qui suit la souris : toutes les informations de
  l'élément survolé ou focalisé.

Le panneau de détail affiche le **rôle** de l'élément et sa source :
`(attribut role)` quand il est donné par un attribut `role`, ou
`(implicite, <input type="checkbox">)` quand il vient de la balise HTML.

### RGAA 1 – Images

La liste donne le compteur (sans alternative, à vérifier, décoratives) et
chaque image balisée ; les images CSS n'y figurent pas, mais sont détectées
au survol.

Au survol d'une image (`img`, `svg`, `canvas`, `object`, `embed`, `area`,
`input type="image"`, `role="img"`, image CSS), le panneau affiche :

- le **statut** : décorative (`alt=""`, `aria-hidden`, `role="presentation"`) ou le **nom accessible** ;
- le **rôle** et sa source ;
- le **fichier** source, pour juger la pertinence de l'alternative ;
- la **description détaillée** (`aria-describedby`, lien adjacent, `longdesc`) ;
- la **légende** (`figure` / `figcaption`) ;
- si l'image est dans un lien, le **nom accessible du lien**.

Constats signalés : image décorative avec `title` ou `aria-label` (1.2),
SVG sans `role="img"` (1.1.5), alternative qui reprend le nom du fichier,
générique ou trop longue (1.3), `longdesc` obsolète (1.6), `figure` sans
`role` ni `aria-label` (1.9).

Le bouton **« Estomper les images »** du panneau liste, ou **Maj+I**, estompe
toutes les images de la page : un texte qui disparaît est
une image texte (critère 1.8).

### RGAA 2 – Cadres

Un panneau en haut à droite liste les `iframe` et `frame` de la page, avec :

- le compteur : cadres restitués, sans titre, non concernés ;
- pour chaque cadre, son **titre**, son **domaine** et son niveau d'imbrication ;
- les cadres masqués, marqués « non concernés » par le critère 2.1 ;
- les titres génériques ou identiques à un autre cadre (2.2).

Un clic sur une ligne fait défiler jusqu'au cadre et l'entoure 3 secondes.
Le panneau se déplace à la souris ou au clavier (flèches sur l'en-tête).

### RGAA 3 – Couleurs

La liste donne le compteur (textes, puis composants et graphiques, en erreur
et à vérifier) et les paires de couleurs de la page, du pire ratio au
meilleur. Les éléments qui ont les mêmes couleurs et le même résultat sont
regroupés (« 23 éléments ») : chaque clic sur la ligne passe au suivant. Deux
filtres séparent les **textes (3.2)** et les **composants et graphiques (3.3)**.

Ce qui est vérifié :

- **3.2, textes** : chaque texte visible, y compris la valeur et le
  `placeholder` des champs. Seuil de 4,5:1, ou de 3:1 pour le grand texte
  (24px, ou 18,5px en gras) ;
- **3.3, composants** : la limite visible des champs, listes, cases à cocher
  et boutons (bordure, fond, ombre, bordure ou fond d'un `::before` /
  `::after`) par rapport au fond qui les entoure, seuil de 3:1. Au focus,
  le contour de focus est mesuré aussi ;
- **3.3, éléments graphiques** : les SVG avec `role="img"` ou seuls dans un
  lien ou un bouton, et les icônes de police, seuil de 3:1.

Sont marqués non concernés : les composants désactivés, les cases à cocher,
boutons radio et curseurs à l'apparence native du navigateur, et les boutons
sans limite visible (ils sont identifiés par leur texte, qui relève du 3.2).
Un logo probable est signalé « à vérifier ».

Le ratio est **tronqué** au centième, jamais arrondi : 4,48:1 ne devient pas
4,5:1.

**Calcul du fond.** Le bookmarklet prend la pile réelle des éléments affichés
sous le texte (`elementsFromPoint`), en plusieurs points de chaque bloc, et
garde le plus mauvais ratio. Il tient compte de la transparence des couleurs
et de l'`opacity` des éléments et de leurs parents. Un fond posé par un
calque positionné est donc bien trouvé ; l'élément qui donne le fond est
entouré en orange pointillé. Pour un élément hors de l'écran, la page défile
un instant jusqu'à lui pendant le calcul, puis revient à sa position.

**État mesuré.** Le détail calcule les couleurs au moment du survol ou du
focus, et indique l'état mesuré (repos, survol, focus) : pour vérifier un
état, il suffit de le déclencher.

**Outils** (boutons du panneau liste, ou raccourcis) :

- **Niveaux de gris** (Maj+G) : passe la page en gris pour repérer une
  information donnée par la couleur seule, comme la page active d'un menu
  (critère 3.1, à juger par l'auditeur : le bookmarklet ne rend pas de verdict
  sur ce critère) ;
- **Pipette** (Maj+C) : ratio entre deux couleurs choisies à la main, pour un
  texte sur une image. Le bouton « Prélever à l'écran » utilise la pipette du
  navigateur (Chrome et Edge) ; ailleurs, on saisit les couleurs.

Limites, signalées « à vérifier » ou « calcul incertain » dans le détail :

- texte sur une image, une vidéo ou un canvas : ratio indicatif, calculé sur la
  couleur de fond de secours (utiliser la pipette) ;
- dégradé : fourchette de ratios entre les couleurs du dégradé ;
- `mix-blend-mode`, `filter`, `backdrop-filter`, pseudo-éléments avec fond,
  `text-shadow` : non reproduits par le calcul ;
- éléments avec `pointer-events: none` : absents de la pile mesurée ;
- texte dans une zone défilante ou une iframe hors de l'écran : fond déduit
  des seuls éléments parents (« calcul approché ») ;
- texte des SVG (`<text>`) et options d'une liste déroulante : non analysés ;
- images texte (1.8) et graphiques en image : à juger à l'œil.

### RGAA 4 – Multimédia

Ce bookmarklet fait l'**inventaire des médias** de la page et prépare
l'audit. La plupart des critères de la thématique 4 demandent de regarder ou
d'écouter le média : il donne donc surtout des statuts « à vérifier », et une
erreur (×) seulement dans les cas visibles dans le code.

Médias repérés : `video` et `audio` (et le lecteur personnalisé qui les
entoure), lecteurs en iframe (YouTube, Vimeo, Dailymotion, PeerTube,
SoundCloud, Spotify, Deezer, Ausha, Facebook, Twitch, Wistia, Brightcove,
Kaltura, TED), façades de lecteur (`lite-youtube`…), `object` et `embed` de
médias ou Flash, cartes (iframe Google Maps ou OpenStreetMap, Leaflet,
Mapbox), `canvas` interactif, et pour information les liens vers un fichier
média (filtre « Liens »). Les médias masqués sont marqués non concernés.

La liste donne un média par ligne, avec une pastille par critère
(`4.1 !`, `4.3 ✓`, `4.11 ×`…), les erreurs en premier. Un clic sur une ligne
fait défiler jusqu'au média et **épingle son détail** à côté de lui ; un clic
ailleurs ou Échap le libère (un second Échap arrête le bookmarklet). C'est le
seul moyen d'afficher le détail d'un lecteur tiers : le survol ne traverse pas
leur iframe.

Ce qui est vérifié :

- **4.1** : lien, bouton ou `<details>` « transcription », « version texte »…
  près du média (même `figure`, parent proche, cible d'`aria-describedby`) ;
  la transcription trouvée est entourée en orange, et le bouton « Aller à la
  transcription » y mène (pertinence à juger, 4.2) ;
- **4.3** : pistes `<track>` ; une piste `kind="subtitles"` à la place de
  `captions` est une erreur (test 4.3.2). « Charger les sous-titres » affiche
  le nombre de lignes et les premières (4.4), puis remet la piste dans son
  état d'origine ;
- **4.5** : piste audio de description, lien « version audiodécrite », piste
  `kind="descriptions"` (signalée : les navigateurs ne la lisent pas) ;
- **4.7** : nom accessible, `title` de l'iframe, `figcaption` ou texte qui
  précède le média ; un nom générique (« YouTube video player ») est signalé ;
- **4.8** : alternative d'une carte ou d'un objet (contenu de repli, adresse
  ou texte proche) ;
- **4.10** : `autoplay` sans `muted`, média qui joue avec le son au lancement,
  iframe avec `autoplay=1` sans `mute=1` : erreur s'il n'y a aucun contrôle ;
- **4.11 et 4.12** : attribut `controls` (conforme), contrôles d'un lecteur
  personnalisé (au moins lecture/pause et son, tous atteignables au clavier),
  `controls=0` ou `disablekb=1` dans l'URL d'un lecteur tiers (erreur) ;
- **4.13** : rôle, nom et état de chaque contrôle personnalisé (tableau dans
  le détail) ; un `<div>` cliquable sans rôle ni nom est une erreur.

Une vidéo `autoplay muted loop` sans contrôles est signalée « vidéo
d'arrière-plan probable » : non concernée si elle est décorative, mais le
critère 13.8 demande alors un moyen de la mettre en pause.

**Outils** (boutons du panneau liste, ou raccourcis) :

- **Couper tous les médias** (Maj+M) : met en pause et coupe le son de tous
  les `video` et `audio`, et de ceux qui démarrent ensuite. Le son d'origine
  est rétabli à l'arrêt, mais la lecture ne reprend pas. Les lecteurs tiers en
  iframe ne peuvent pas être coupés ;
- **Ordre de tabulation** (Maj+T) : numérote sur la page les contrôles du
  média épinglé (ou de tous les médias) dans l'ordre du clavier ; un contrôle
  hors clavier porte « × hors clavier ».

Limites :

- le bookmarklet ne sait pas si une vidéo contient de la parole ou des
  informations visuelles : c'est l'auditeur qui décide si 4.1, 4.3 et 4.5
  s'appliquent ;
- lecteurs tiers : seuls l'URL et le titre de l'iframe sont analysés ;
  sous-titres et contrôles sont à vérifier dans le lecteur ;
- sous-titres incrustés dans l'image : non détectables ;
- transcription sur une autre page : repérée seulement par le texte d'un lien
  proche ;
- son produit en JavaScript (Web Audio) : non détecté ;
- clavier : le bookmarklet vérifie que les contrôles sont focalisables et
  nommés, pas qu'ils fonctionnent ;
- média chargé après le lancement (façade cliquée, onglet) : « Actualiser ».

### RGAA 5 – Tableaux

La liste donne chaque `table` et chaque élément `role="table"`, `grid` ou
`treegrid`, avec son type, sa taille et une pastille par critère
(`5.4 ✓`, `5.6 ×`…), les erreurs en premier. Les tableaux faits de `div`
sans rôle ne sont pas détectés : **un tableau visible absent de la liste**
n'est pas restitué comme un tableau (5.6, 5.7), c'est à l'auditeur de le
constater. Les tableaux masqués sont marqués non concernés.

**Type de tableau : c'est l'auditeur qui décide.** Un clic sur une ligne
épingle le détail du tableau, avec le choix **Données / Présentation** et la
case **Tableau complexe**. Ils sont pré-remplis par une supposition, dont la
raison est affichée (« contient 2 th, 1 caption », « role="presentation" »,
« une seule ligne »…). Tant que l'auditeur n'a pas confirmé, la liste affiche
« Données ? » et le compteur « types à confirmer ». Le choix met les verdicts
à jour aussitôt ; il est gardé tant que le bookmarklet tourne (« Actualiser »
compris) et perdu à l'arrêt.

Un tableau est supposé complexe quand des en-têtes ne sont pas sur la première
ligne ou la première colonne, ou quand un en-tête est fusionné (`colspan`,
`rowspan`).

Ce qui est vérifié pour un **tableau de données** :

- **5.1** (tableau complexe) : résumé dans `aria-describedby` ou dans un
  `caption` détaillé ; l'attribut `summary`, obsolète, est signalé ;
- **5.2 et 5.5** : le résumé et le titre sont affichés, leur pertinence est à
  juger (un titre générique comme « Tableau » est signalé) ;
- **5.4** : titre par `caption`, `aria-labelledby`, `aria-label` ou `title`.
  Sans titre, un titre visible probable juste avant le tableau (`h1`–`h6`,
  texte court en gras, `figcaption`) est signalé « non associé » ;
- **5.6** : en-têtes `th`, `columnheader`, `rowheader` ; tableau sans
  en-tête, en-tête vide, `td` en gras sur la première ligne ou colonne
  (en-têtes probables), structure ARIA cassée (cellule hors d'un
  `role="row"`) ;
- **5.7** : `scope` invalide, `headers` vers un id inexistant ou vers un `td`,
  id en double, cellules sans en-tête, tableau complexe sans `headers`. Un
  tableau simple dont les `th` sont sur la première ligne ou colonne n'a pas
  besoin de `scope` (portée déduite).

Pour un **tableau de mise en forme** :

- **5.3** : `role="presentation"` présent (exigé par le test 5.3.1), et pas
  annulé par un attribut ARIA global (`aria-label`…) ou un `tabindex` ; le
  contenu linéarisé reste à lire (bouton « Linéariser ») ;
- **5.8** : aucun `caption`, `th`, `thead`, `tfoot`, `colgroup`, rôle
  d'en-tête, ni attribut `scope`, `headers`, `axis` ou `summary`.

Comme la pertinence (5.2, 5.3, 5.5) reste à juger, un tableau sans erreur
dans le code garde le statut « à vérifier ».

**Au survol d'une cellule** d'un tableau de données, le détail donne sa
nature (en-tête de colonne, de ligne, cellule), sa position, et les
**en-têtes qui lui sont associés** avec leur source (`headers`, `scope`,
position), entourés en orange sur la page. Le calcul suit la logique des
lecteurs d'écran (`headers` d'abord, puis `scope`, puis la position), sans
garantir le rendu exact de chacun.

**Outils** (boutons du panneau liste, ou raccourcis) :

- **Structure** (Maj+S) : encadre les cellules de tous les tableaux, les
  en-têtes en bleu, et affiche une étiquette dans chaque cellule
  (`th col`, `td #id → h1 h2`). Une étiquette rouge signale une erreur
  (`scope` invalide, `headers` cassé) ;
- **Linéariser** (Maj+L) : affiche les tableaux de mise en forme (ou le
  seul tableau épinglé) dans l'ordre de lecture, en passant le tableau, ses
  lignes et ses cellules en `display:block`. La page est rétablie au second
  appui ou à l'arrêt.

Limites :

- tableaux en `div` sans rôle : non détectés ;
- le type n'est qu'une supposition tant qu'il n'est pas confirmé ;
- en-têtes probables en `td` et titre visible proche : simples indices ;
- tableau trié, paginé ou modifié après le lancement : « Actualiser ».

### RGAA 6 – Liens

La liste donne chaque `a[href]`, `area[href]` et élément `role="link"`, avec
son **intitulé** (nom accessible) tel qu'une aide technique le restitue hors
contexte, sa **nature** (texte, image, composite, SVG, icône masquée…), la
source de l'intitulé et une pastille par critère (`6.1 !`, `6.2 ×`), les
erreurs en premier. Les liens masqués sont marqués non concernés, sauf un lien
masqué par `aria-hidden` mais visible et focalisable, signalé « à vérifier ».

L'intitulé est calculé comme le nom accessible : `aria-labelledby`, puis
`aria-label`, puis le contenu (textes, `alt` des images, `title` ou
`aria-label` des SVG, contenu CSS `::before` / `::after`, sans ce qui est
masqué par `aria-hidden`), et enfin `title`. Pour un lien composite, le
détail montre chaque morceau et sa source.

Ce qui est vérifié :

- **6.2** : lien sans intitulé, avec la cause probable (image sans `alt`,
  image seule avec `alt=""`, SVG sans `title` ni `aria-label`, icône masquée
  par `aria-hidden` sans autre texte, `aria-labelledby` vers un id
  introuvable). Un intitulé donné par le seul `title` est signalé « à vérifier » ;
- **6.1, intitulé explicite** : un intitulé générique (« lire la suite »,
  « cliquez ici », « en savoir plus », « voir »…), très court, sans lettre ni
  chiffre ou qui est une adresse web est **à juger en contexte**, de même
  qu'un intitulé partagé par des liens vers des destinations différentes. Les
  autres intitulés sont supposés explicites (✓, pertinence à juger) ;
- **6.1, intitulé visible** (test 6.1.5) : quand `aria-label`,
  `aria-labelledby` ou `title` remplace le contenu, le nom accessible doit
  contenir le texte visible du lien. Un écart est une erreur.

**Contexte.** Le détail donne le contexte du lien au
sens du RGAA : la phrase et le paragraphe, l'item de liste (et l'item parent
d'une liste imbriquée), la cellule de tableau et ses en-têtes, sinon le texte
de l'élément parent, et le titre qui précède. Ces éléments sont entourés en
orange. Un clic sur une ligne de la liste épingle le détail à côté du lien.
C'est à l'auditeur de juger si l'intitulé est explicite dans ce contexte.

**Doublons.** Le détail liste les autres destinations d'un même intitulé, et
les autres intitulés d'une même destination (filtre « Doublons »).

**Autres constats**, signalés « à vérifier » sans verdict sur la
thématique 6 : `title` qui ne reprend pas l'intitulé, lien qui ouvre une
nouvelle fenêtre (`target`) sans le dire dans l'intitulé ou le `title`,
`href="#"` ou `javascript:` (bouton déguisé probable, 7.1), ancre
introuvable, lien vers un fichier (PDF, DOC…) sans format ni poids,
`role="link"` sans `tabindex` (erreur, 7.3).

**Outil** : **Intitulés** (Maj+N) affiche l'intitulé de chaque lien au-dessus
de lui sur la page, en rouge s'il manque ou est en erreur, en brun s'il est à
juger.

Limites :

- le calcul du nom accessible suit les cas courants, sans garantir le rendu
  exact de chaque lecteur d'écran ;
- le texte visible exclut le texte masqué visuellement (classe `sr-only`,
  `clip`) ; une image texte n'est pas lue ;
- un `div` ou un `span` cliquable sans rôle n'est pas détecté ;
- les liens ajoutés après le lancement : « Actualiser ».

### RGAA 7 – Composants ARIA

Ce bookmarklet ne couvre que ce qui se **lit dans le code** de la
thématique 7 (Scripts). Le comportement des composants ne se vérifie qu'en
les utilisant : activation au clavier, mise à jour des états, changements
de contexte (7.4) et alternatives (7.2) restent à tester à la main. Un
composant sans erreur n'est donc **jamais ✓** : il reste ! « à tester à la
main ».

La liste a deux filtres :

- **Composants** : éléments avec un rôle de composant ARIA (`button`,
  `checkbox`, `tab`, `listbox`, `slider`, `dialog`…), `<dialog>`, éléments
  qui portent un état ou une relation ARIA (`aria-expanded`,
  `aria-pressed`, `aria-controls`…), et éléments non natifs avec un
  attribut `onclick` (sauf un conteneur qui contient déjà des éléments
  focalisables) ;
- **Messages** : `role="status"`, `alert`, `log`, `progressbar`, `timer`,
  `marquee`, `<output>` et `aria-live`.

Ce qui est vérifié, avec une pastille par critère (`7.1 ×`, `7.3 !`,
`7.5 !`) :

- **7.1.1, code ARIA** : rôle inconnu ou abstrait (`role="buton"`,
  `role="widget"`) ; état obligatoire absent (`aria-checked` pour
  `checkbox`, `switch`, `radio`…, `aria-expanded` pour `combobox`,
  `aria-valuenow` pour `slider`) ; valeur invalide (`aria-expanded="oui"`)
  ou hors limites (`aria-valuenow`) ; attribut non permis sur le rôle
  (`aria-checked` sur un `button`, `aria-pressed` sur un lien) ; structure
  (`tab` hors d'un `tablist`, `option` hors d'une `listbox`, `menuitem`
  hors d'un `menu`, `tablist` ou `listbox` vide) ; `aria-controls`,
  `aria-labelledby`, `aria-describedby`, `aria-activedescendant`… vers un
  id introuvable ou en double (un `aria-controls` introuvable sur un bouton
  fermé est « à vérifier » : le contenu peut être créé à l'ouverture) ;
  élément focalisable dans un `aria-hidden="true"` ; élément cliquable
  (`onclick`) sans rôle. Un lien transformé en bouton (ou l'inverse) est
  signalé « à vérifier » ;
- **7.1.3, nom** : composant sans nom accessible ; nom (`aria-label`,
  `aria-labelledby`, `title`) qui ne contient pas le texte visible. Le nom
  et le rôle sont affichés pour que l'auditeur juge leur pertinence ;
- **7.3, focus** : rôle interactif sans `tabindex` (ne peut pas recevoir le
  focus) ou avec `tabindex="-1"` hors d'un groupe ; groupe à focus
  itinérant (`tablist`, `listbox`, `tree`, `radiogroup`, `toolbar`…) dont
  aucun élément n'est atteignable avec Tab (le focus géré par
  `aria-activedescendant` est accepté) ; élément cliquable non
  focalisable ; `onmouseover` sans équivalent au focus (à vérifier) ;
  `blur()` dans `onfocus` (test 7.3.2) ;
- **7.5, zones de messages** : `aria-live` invalide ou `off`, zone trop
  large (`body`, `main`, plus de 50 éléments), `aria-live` sans
  `aria-atomic="true"`, `progressbar` hors limites. Le détail rappelle le
  test qui s'applique selon le type de message (7.5.1 succès ou résultat,
  7.5.2 erreur, 7.5.3 progression), à juger par l'auditeur.

**Détail.** Rôle et source, nom et source, attributs ARIA lus au moment du
survol (après avoir ouvert un menu, survoler à nouveau le bouton montre si
`aria-expanded` a changé), éléments référencés (entourés en orange), focus
(`tabindex`), gestionnaires `on…` présents.

**Outils** :

- **Rôles** (Maj+R) : affiche au-dessus de chaque composant son rôle, son
  nom et ses états (`tab « Livraison » selected=true`), en rouge s'il est en
  erreur ;
- **Annonces** (Maj+A) : affiche en bas de l'écran le texte annoncé par les
  zones de messages quand leur contenu change (poli ou immédiat). Une zone
  ajoutée à la page en même temps que son texte est signalée : elle est
  souvent non annoncée. Seules les zones déclarées sont surveillées : un
  message visible à l'écran mais absent de la bande n'est pas restitué.

Limites :

- les éléments rendus cliquables par `addEventListener` (cas le plus
  courant) ne sont pas détectés, seuls les attributs `onclick`… le sont ;
- les messages affichés hors d'une zone de messages ne sont pas détectés ;
- règles ARIA limitées aux rôles courants (ARIA 1.2) ; la restitution réelle
  par chaque lecteur d'écran n'est pas garantie ;
- composants ajoutés après le lancement : « Actualiser » (la bande
  d'annonces, elle, suit la page en direct).

### RGAA 11 – Formulaires

La liste donne le compteur (champs, sans étiquette, placeholder seul,
autocomplete invalide) et chaque champ, groupe et bouton.

Au survol d'un champ (natif, ARIA ou `contenteditable`), d'un bouton, d'un
groupe, d'un label ou d'un texte d'aide, le panneau affiche :

- le **nom accessible** (ou la légende d'un groupe, l'intitulé d'un bouton) ;
- la **description**, le **rôle** et sa source, le caractère **obligatoire** et **invalide** ;
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
                        flag(), checks(), roleValue()
    a11y.js             helpers : idrefs(), textOf(), norm(), isNotExposed(), roleInfo(),
                        implicitRole(), deepAll() (Shadow DOM + iframes), allDocuments()
    name.js             nom accessible et texte visible : nameOf(), visibleText()
    panel.js            hôte Shadow DOM + activation/désactivation
    highlight.js        contours sur la page, styles d'origine restaurés
    color.js            couleurs : lecture, transparence, ratio de contraste
    floating-panel.js   TEMPLATE panneau flottant  → inspector()
    dialog-panel.js     TEMPLATE panneau fixe      → dialog()
    list-panel.js       TEMPLATE panneau liste (aperçu des panneaux flottants)
  bookmarklets/         un fichier par bookmarklet
demo/                   sources des pages de démo ({{BOOKMARKLET}} remplacé au build)
dist/                   versions installables générées (ne pas modifier à la main)
```

```sh
npm install
npm run build   # génère dist/
npm test        # test de fumée + pages de démo (nécessite Playwright)
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
  list: {                           // panneau liste (optionnel)
    title: 'Liens',
    collect: () => ({
      summary: '12 liens · 1 sans intitulé',          // compteur de page
      items: [{ el, status: 'error', label: 'Sans intitulé', meta: 'link' }],
    }),
  },
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

`list` (optionnel) ouvre le panneau liste (`list-panel.js`) : compteur,
éléments cliquables, bouton « Actualiser ». Il se ferme avec le bookmarklet.
Il accepte aussi `tools` (boutons à bascule à côté d'« Actualiser », comme
« Estomper les images » : `{ label, pressed(), toggle() }`) et `filters`
(boutons de filtre, chaque élément portant alors `filter`). Un élément peut
regrouper plusieurs éléments de la page (`els`) : chaque clic passe au suivant.
`pinOnLocate: true` épingle le détail à côté de l'élément quand on clique sa
ligne dans la liste (clic ailleurs ou Échap pour le libérer) ; `onAction(name,
target, btn)` reçoit alors les clics sur les boutons `[data-action]` du détail.
Le template gère aussi : suivi de la souris, inspection au focus clavier (le panneau
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
