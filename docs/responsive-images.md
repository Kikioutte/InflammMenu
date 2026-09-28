# Photos adaptées à l'affichage

Les JPEG relus restent les originaux et les URL enregistrées dans les recettes
et sauvegardes restent inchangées. Le build produit des dérivés WebP, sans
recadrage ni agrandissement, pour les seules photographies locales prises en
charge. Ce traitement ne régénère pas les illustrations et ne touche ni aux
icônes ni aux polices.

- Recettes : 160, 320, 640 et 900 pixels de large.
- Photo d'accueil : 640, 960 et 1 200 pixels de large.
- Sharp est verrouillé dans les dépendances de développement ; réglages et
  versions d'encodage sont inclus dans l'empreinte avec les SHA des originaux.
- `RecipeImage` conserve une balise `img` directe pour ne pas changer les règles
  de mise en page. `sizes` décrit la place réelle, `srcset` permet au navigateur
  de choisir selon l'écran et sa densité. Dimensions, textes alternatifs et
  chargement différé existants sont préservés.

## Génération et vérification

`npm ci` puis `npm run generate:images:responsive` suffisent sur un clone propre.
La génération est aussi exécutée avant le serveur de développement, les builds
Worker et Pages et la validation de publication. Aucune image produite sur le
poste de travail n'est nécessaire pour construire le site en CI.

`public/assets/recipes/responsive/<empreinte>/` est ignoré par Git. Son manifeste
complet contient les dimensions et SHA de chaque sortie, mais n'est jamais
importé par l'application. Seul le petit fichier
`src/data/responsive-images-version.json` est suivi et embarqué. Après une
modification des photos ou de l'encodeur, relancer la génération et inclure ce
fichier de version dans le commit.

`npm run validate:images:responsive` refuse une sortie absente, altérée ou de
mauvaises dimensions. La génération répare ces sorties ; elle ne réécrit aucun
original. Les empreintes des sources sont vérifiées à nouveau avant publication
du manifeste. Les anciennes éditions reconnues du seul dossier des dérivés
sont supprimées après succès, pour ne pas grossir les builds suivants ; elles
sont reproductibles à partir des sources. Aucun dossier non reconnu n'est effacé.

`npm run test:images:responsive` vérifie les ratios, l'intégrité, la régénération
depuis zéro, la détection des sorties échangées/corrompues et les URL prises en
charge. Les validateurs historiques des JPEG et de leur provenance restent
obligatoires et inchangés.

## Replis et hors-ligne

Une variante indisponible retombe sur le JPEG original, puis sur l'illustration
neutre si l'original échoue également. Une nouvelle source repart de zéro et
aucun échec ne doit former de boucle.

Les photos de recettes ne sont pas ajoutées au précache. La seule photo d'accueil
précachée devient sa variante WebP de 1 200 pixels, à la place du JPEG plus lourd :
pas de double exemplaire imposé à l'installation. Le cache d'images
existant est conservé et reste borné à 120 entrées. En cas de coupure ou de
variante manquante, le service worker peut servir une autre taille de la même
photo déjà consultée, y compris une ancienne édition ou un JPEG. Il ne substitue
jamais une autre recette. La meilleure taille d'une édition remplace ses petites
variantes seulement après une écriture réussie ; un ancien JPEG de grande taille
reste disponible tant qu'il est utile. Le précache de la photo d'accueil peut
aussi servir ses autres tailles hors ligne. Une photo de recette jamais
consultée n'est pas promise hors connexion.

Si seule une miniature a été consultée avant la coupure, elle reste affichable
sur la grande fiche mais sera moins nette. La grande version est conservée dès
qu'elle a effectivement été chargée. Les grandes photos de recettes ne sont pas
téléchargées automatiquement en arrière-plan.

Une petite image économise du transfert réseau, pas nécessairement de l'espace
dans l'artefact publié : les JPEG de repli sont conservés et plusieurs tailles
sont produites. La qualité et la sélection réelle sont vérifiées sur les
parcours navigateur et sur le build PWA, en complément des contrôles de fichiers.
