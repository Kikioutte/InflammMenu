# Corrections de l'audit du 28 septembre 2026

Base : `eb9a54efbce565d36cde48f8362153673ccaa803`, branche
`fix/audit-2026-09-28`. Aucun changement de format des sauvegardes personnelles.
Les recettes, associations et fichiers du runtime protégé restent inchangés.

## Ordre et portes de validation

Chaque point est terminé, testé et relu avant de commencer le suivant. Un commit
séparé matérialise la fermeture du point. Les tests ne constituent pas une
garantie absolue sur tous les appareils ; les limites réelles restent indiquées.

1. C1 : catalogue hors ligne conservé entre éditions.
2. C3 : retour du focus des fenêtres WebSheet.
3. C4 : focus et annonces du mode magasin.
4. C5 : retiré du périmètre à la demande de l'utilisateur le 28 septembre ;
   aucune annonce ajoutée et mode cuisine laissé inchangé.
5. C2 : téléchargement du planificateur sur le chemin de démarrage.
6. Défauts fonctionnels restants : favoris de la fiche catalogue, puis durées
   de l'éditeur, puis pas des quantités, traités séparément.
7. C8 : retiré du périmètre à la demande de l'utilisateur le 28 septembre ;
   icônes, polices et leur préchargement restent inchangés.
8. C6 : variantes d'images adaptées à l'affichage.
9. C10 : demande de stockage persistant, sans garantie trompeuse.
10. C9 : benchmark du moteur ; optimisation seulement si démontrée utile et
    compatible avec des résultats déterministes inchangés.
11. C12 : référencement et métadonnées retirés à la demande de l'utilisateur
    le 28 septembre ; réglages actuels conservés.
12. C13 : contrôles de qualité et de typage, entretien du code affecté.
13. C7/C11 : changement d'origine et travaux dépendant d'un autre hébergement
    retirés à la demande de l'utilisateur le 28 septembre. L'adresse GitHub Pages
    actuelle est conservée ; aucune migration, configuration DNS ou publication.

## C1 — Catalogue hors ligne

- Clé stable, récupération des anciennes clés et validation par empreinte de
  l'édition relue, puis validation complète de son contenu.
- Ancienne édition de 1 087 recettes signalée ; elle n'est pas rejetée au seul
  motif que le catalogue actuel contient 1 207 recettes.
- Écriture validée avant purge ; quota, contenu altéré, réseau coupé et refus de
  nettoyage couverts par les tests.
- Préservation des éditions inconnues potentiellement plus récentes d'un autre
  onglet. Verrou interonglets, ou repli conservateur sans suppression.
- Mise à jour immédiate de la liste déjà ouverte après téléchargement réussi.
- Aucun changement des favoris, collections, courses ou sauvegardes.

Vérification manuelle reproductible : ancien build `7a11e85` installé avec son
vrai service worker, téléchargement du catalogue, remplacement par le build
correctif, arrêt réel du serveur, rechargement hors ligne, mise à jour ratée puis
réussie, second arrêt et rechargement. Chromium et WebKit passent : 60 cartes
affichées avant et après, 1 081 puis 1 201 résultats, et une seule copie actuelle
après remplacement des éditions reconnues. Les images jamais consultées ne sont
pas promises hors ligne.

Le nouveau test `catalogue-offline-updates.spec.ts` vérifie aussi l'actualisation
sans rechargement et la conservation des données. La suite PWA et les tests
unitaires couvrent les autres garde-fous. Le serveur de test utilise `no-cache`,
pas `no-store`, pour ne pas empêcher l'installation du service worker historique.

Les éditions autorisées et leur entretien sont décrits dans
[offline-catalogue.md](offline-catalogue.md).

Clôture C1 : tests catalogue 30/30, `test:release`, TypeScript, contrôle des 28
fichiers protégés et relecture du diff réussis ; navigateur complet 161/161,
PWA 10/10, Worker/Sites 5/5, builds Pages et Worker réussis. Le scénario entre
deux vrais builds et les captures ont été revalidés sur le build final C1,
service worker `a136e25066fd`. Les autres points n'avaient pas encore été commencés
à ce jalon.

## C3 — Retour du focus des fenêtres

- Les neuf usages de WebSheet fournissent leur déclencheur explicitement, y
  compris sur Safari où le clic ne focalise pas toujours les boutons.
- Échap, fermeture, clic extérieur et validation rendent le focus au bon
  contrôle. Un déclencheur supprimé laisse un repli sur le titre de l'écran.
- Le résumé du constructeur revient à son bouton stable ; « Changer » revient
  à l'onglet de catégorie. Un nouvel écran ou dialogue conserve son propre focus.
- Les fenêtres et leur contenu visuel sont conservés ; aucun fichier du runtime
  protégé ni aucune donnée personnelle n'est modifié.

Clôture C3 : 12/12 tests ciblés Chromium/WebKit, 28/28 parcours existants de
non-régression, `test:release`, TypeScript, contrôle du runtime et relecture du
diff réussis. Une fixture indépendante a aussi vérifié la réouverture immédiate,
le passage à une autre fenêtre et le déclencheur retiré dans les deux moteurs.
Captures mobiles ouvertes/fermées relues. Pas de validation avec un lecteur
d'écran physique : les assertions portent sur le focus DOM et le clavier.

## C4 — Mode magasin

- Entrée sur le titre du rayon contextualisé ; sortie vers le bouton d'entrée
  recréé. Le cochage conserve le focus sur l'article.
- Une région polie annonce le rayon et les articles restants ; elle reste vide
  lorsque le titre focalisé fournit déjà cette information.
- Repli vers le titre lorsqu'un contrôle disparaît ou devient désactivé.
  Navigation corrigée après suppression externe d'un rayon ; liste vide sortie
  réellement du mode magasin, même depuis un inventaire entièrement couvert.
- Les articles cochés restent dans leur rayon ; calculs, prix, stocks, données
  personnelles et formats de sauvegarde sont conservés.

Clôture C4 : 10/10 tests ciblés et les deux exécutions du parcours existant
génération → courses réussis sur Chromium/WebKit. Les tests couvrent aussi un
second onglet réel, export/restauration et rechargement. `test:release`,
TypeScript, runtime protégé et relecture indépendante réussis ; captures mobile
et bureau relues. Deux sélecteurs du test existant ont été limités au repère
visible pour le distinguer de l'annonce accessible, sans retirer d'assertion.

## C5 — Retiré à la demande de l'utilisateur

Le 28 septembre, l'utilisateur a demandé de ne pas ajouter d'annonce en mode
cuisine. Le travail a été arrêté avant toute modification ; aucun fichier du
mode cuisine ni test associé n'a été changé pour ce point. Le point suivant est
C2, le chargement initial du planificateur.

## C2 — Découverte anticipée du planificateur

- Les builds Pages et Worker utilisent le manifeste Vite pour précharger les
  modules du planificateur et du validateur, ainsi que leur dépendance commune,
  avant l'entrée HTML. Le registre synchrone et la validation restent inchangés.
- Le garde-fou compte les scripts d'entrée, les préchargements et leurs imports
  statiques transitifs, plus les deux imports dynamiques bloquants connus. Un
  nouvel import bloquant devra être déclaré ; un test navigateur confronte aussi
  ce graphe aux requêtes réelles. Catalogue complet et écrans secondaires exclus.
- Budget JavaScript critique fixe : 2 400 000 octets bruts et 425 000 gzip,
  contre 2 260 576 et 406 225 mesurés sur les sept fichiers avant et après.
  Aucune réduction du poids JavaScript ni amélioration CPU n'est revendiquée.

Comparaison de cinq navigateurs Chromium 149 neufs par version, vue 390 × 844,
cache froid, service worker bloqué, gzip niveau 6, réseau à 1,6 Mbit/s avec
150 ms de latence et CPU ralenti ×4 :

| Mesure | Avant `83caa0d` | Après C2 |
| --- | --- | --- |
| Premier affichage, médiane | 2 768 ms | 2 608 ms |
| Étendue des cinq essais | 2 748–2 792 ms | 2 600–2 724 ms |
| Début requête planificateur, médiane | 1 680,1 ms | 171,4 ms |
| Fin requête planificateur, médiane | 2 644,8 ms | 2 479,5 ms |

Premier affichage brut avant : 2792, 2768, 2772, 2748, 2760 ms ; après :
2724, 2600, 2600, 2612, 2608 ms. Le gain médian observé est de 160 ms (5,8 %),
pas une promesse pour tous les appareils. Les captures mobiles avant/après sont
identiques, empreinte `bd40eedcd808a106083ca64af5f307aad00464e3e152263fc5166a8490122ee6`.

Clôture C2 : 17/17 nouveaux tests de graphe/préparation ; suite performance
26/26 via `test:release` ; PWA complète 12/12, incluant le démarrage réel
Chromium/WebKit (chaque script une seule fois, catalogue toujours différé) ;
Worker/Sites 5/5 ; builds Pages/Worker, TypeScript, runtime protégé et relecture
indépendante réussis. Build Pages final : service worker `6e4db8ba4b2f`.

Ordre impératif de validation : Worker/Sites, puis reconstruction Pages, puis
PWA. Le préparateur Sites existant retire `dist/pages` pour éviter de publier
deux fois les assets ; un premier lancement PWA en parallèle a donc été arrêté
par l'absence de cette sortie, puis intégralement relancé dans le bon ordre.

## C8 — Retiré à la demande de l'utilisateur

Après explication des poids des icônes et des formats de polices, l'utilisateur
a demandé de ne pas faire cette optimisation. Aucune modification n'avait été
commencée : icônes, polices et leur préchargement sont conservés. Cette décision
ne retire pas le point distinct C6 sur les images des recettes.

## 6a — Favoris de la fiche catalogue

- Le cœur, le libellé et l'état accessible suivent désormais directement le
  favori partagé ; aucune copie locale ne peut rester périmée.
- Un changement dans un autre onglet actualise la fiche déjà ouverte, même
  sous un écran empilé, sans rechargement ni remise à zéro des portions.
- Les clics suivants, y compris rapides, utilisent l'état courant ; les autres
  données et les deux semaines sont conservées après rechargement.

Clôture 6a : 4/4 nouveaux tests interonglets Chromium/WebKit, 6/6 parcours
existants favoris/collections, `test:release`, TypeScript, runtime protégé et
relecture indépendante réussis. Deux captures mobiles relues. Les durées et
quantités n'avaient pas encore été modifiées à ce jalon.

## 6b — Durées de l'éditeur

- L'éditeur accepte de 1 à 1 440 minutes actives, comme la persistance existante,
  au lieu de bloquer au-delà de 600. Les bornes et le message sont partagés.
- L'éditeur exige toujours un entier ; la restauration conserve son arrondi
  historique, après contrôle des bornes. Les valeurs non finies restent refusées.
- Le repos reste indépendant. Une recette longue n'obtient aucune dérogation
  aux critères du profil pour entrer dans un menu.

Clôture 6b : 5/5 nouveaux tests unitaires, 10/10 tests Chromium/WebKit,
6/6 parcours existants de l'éditeur, `test:release`, TypeScript, runtime protégé
et relecture indépendante réussis. Les tests couvrent 600/601/1 440 minutes,
les refus hors borne ou invalides, l'édition d'une recette déjà à 1 440 minutes,
un export/restauration réel avec 2 880 minutes de repos distinctes, les deux
semaines compatibles et les autres données conservées. Le format des sauvegardes
et les quantités restent inchangés.

## C7/C11 — Changement d'adresse retiré à la demande de l'utilisateur

L'utilisateur ne dispose pas d'un autre hébergement et demande de conserver
l'adresse actuelle. La migration vers une origine dédiée et les travaux qui
nécessiteraient un autre hébergement sont retirés du plan. Les protections
existantes sont conservées ; les limites de l'origine GitHub Pages partagée
et des en-têtes HTTP configurables ne sont pas présentées comme corrigées.

## C12 — Référencement retiré à la demande de l'utilisateur

Après distinction entre moteurs de recherche et aperçus de partage,
l'utilisateur demande de retirer également ce point. Aucun chantier SEO,
nouvelle page indexable ni changement des métadonnées n'est entrepris.
